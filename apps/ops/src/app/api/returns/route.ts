import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/returns — list returns for store                          */
/* ------------------------------------------------------------------ */
export async function GET() {
  try {
    const { db } = await requirePermission("returns");

    const data = await db.posReturn.findMany({
      orderBy: { created_at: "desc" },
      take: 100,
      include: {
        customer: { select: { name: true } },
        _count: { select: { items: true } },
      },
    });

    const rows = data.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      customer_name: r.customer?.name ?? "Guest",
      item_count: r._count.items,
      total_refund_cents: r.total_refund_cents,
      refund_method: r.refund_method,
      reason: r.reason,
      status: r.status,
    }));

    return NextResponse.json(rows);
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/returns — process a return                               */
/* ------------------------------------------------------------------ */

interface ReturnItemInput {
  inventory_item_id: string;
  name: string;
  category: string | null;
  quantity: number;
  price_cents: number;
  restock: boolean;
}

interface CreateReturnBody {
  original_ledger_entry_id: string;
  items: ReturnItemInput[];
  refund_method: "cash" | "store_credit";
  credit_bonus_percent: number;
  reason: string;
  reason_notes: string | null;
  restocking_fee_percent: number;
  client_tx_id?: string; // Idempotency key for offline queue
}

export async function POST(request: NextRequest) {
  try {
    const { staff, storeId, db } = await requirePermission("returns");

    let body: CreateReturnBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const {
      original_ledger_entry_id,
      items,
      refund_method,
      credit_bonus_percent,
      reason,
      reason_notes,
      restocking_fee_percent,
      client_tx_id,
    } = body;

    // Idempotency: if this transaction was already processed, return the existing result
    if (client_tx_id) {
      const existing = await db.posLedgerEntry.findFirst({
        where: {
          store_id: storeId, // Explicit defense-in-depth
          type: "refund",
          metadata: { path: ["client_tx_id"], equals: client_tx_id },
        },
      });
      if (existing) {
        return NextResponse.json({ id: existing.id, deduplicated: true });
      }
    }

    if (!original_ledger_entry_id || !items?.length || !reason) {
      return NextResponse.json(
        { error: "original_ledger_entry_id, items, and reason are required" },
        { status: 400 }
      );
    }

    // 1. Validate original sale exists and belongs to this store
    const originalSale = await db.posLedgerEntry.findFirst({
      where: {
        id: original_ledger_entry_id,
        type: "sale",
      },
    });
    if (!originalSale) {
      return NextResponse.json(
        { error: "Original sale not found" },
        { status: 400 }
      );
    }

    // 2. Double-return prevention: check already-returned quantities
    // SECURITY: scope to store_id via tenant client
    const existingReturns = await db.posReturn.findMany({
      where: { original_ledger_entry_id },
      include: { items: true },
    });

    const alreadyReturnedMap = new Map<string, number>();
    for (const ret of existingReturns) {
      for (const item of ret.items) {
        const key = item.inventory_item_id ?? item.name;
        alreadyReturnedMap.set(key, (alreadyReturnedMap.get(key) ?? 0) + item.quantity);
      }
    }

    // Validate against original sale items
    const saleMeta = originalSale.metadata as Record<string, unknown>;
    const saleItems = (saleMeta?.items as Array<{
      inventory_item_id: string;
      quantity: number;
      price_cents: number;
    }>) ?? [];
    const saleItemMap = new Map(saleItems.map((si) => [si.inventory_item_id, si]));

    for (const item of items) {
      const originalItem = saleItemMap.get(item.inventory_item_id);
      if (!originalItem) {
        return NextResponse.json(
          { error: `Item "${item.name}" was not part of the original sale` },
          { status: 400 }
        );
      }
      const alreadyReturned = alreadyReturnedMap.get(item.inventory_item_id) ?? 0;
      const maxReturnable = originalItem.quantity - alreadyReturned;
      if (item.quantity > maxReturnable) {
        return NextResponse.json(
          {
            error: `Cannot return ${item.quantity} of "${item.name}". Max returnable: ${maxReturnable}`,
          },
          { status: 400 }
        );
      }
    }

    // 3. Calculate amounts
    const subtotal_cents = items.reduce(
      (sum, i) => sum + i.price_cents * i.quantity,
      0
    );
    const restocking_fee_cents = Math.round(
      subtotal_cents * (restocking_fee_percent || 0) / 100
    );
    const refund_amount_cents = subtotal_cents - restocking_fee_cents;
    const effectiveBonusPercent =
      refund_method === "store_credit" ? (credit_bonus_percent || 0) : 0;
    const total_refund_cents =
      refund_method === "store_credit"
        ? Math.round(refund_amount_cents * (1 + effectiveBonusPercent / 100))
        : refund_amount_cents;

    // 4. Atomic transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create return record
      const posReturn = await tx.posReturn.create({
        data: {
          store_id: storeId,
          customer_id: originalSale.customer_id,
          staff_id: staff.id,
          original_ledger_entry_id,
          status: "completed",
          refund_method,
          reason,
          reason_notes: reason_notes || null,
          subtotal_cents,
          restocking_fee_cents,
          refund_amount_cents,
          credit_bonus_percent: effectiveBonusPercent,
          total_refund_cents,
        },
      });

      // Create return items
      await tx.posReturnItem.createMany({
        data: items.map((i) => ({
          return_id: posReturn.id,
          inventory_item_id: i.inventory_item_id,
          name: i.name,
          category: i.category,
          quantity: i.quantity,
          price_cents: i.price_cents,
          total_cents: i.price_cents * i.quantity,
          restock: i.restock,
        })),
      });

      // Create refund ledger entry (negative = money going out)
      const ledgerEntry = await tx.posLedgerEntry.create({
        data: {
          store_id: storeId,
          type: "refund",
          customer_id: originalSale.customer_id,
          staff_id: staff.id,
          amount_cents: -total_refund_cents,
          description: `Return: ${items.length} item(s) — ${refund_method === "store_credit" ? "store credit" : "cash"}`,
          metadata: JSON.parse(JSON.stringify({
            original_ledger_entry_id,
            return_id: posReturn.id,
            refund_method,
            reason,
            items: items.map((i) => ({
              inventory_item_id: i.inventory_item_id,
              name: i.name,
              quantity: i.quantity,
              price_cents: i.price_cents,
              restock: i.restock,
            })),
            restocking_fee_cents,
            credit_bonus_percent: effectiveBonusPercent,
            ...(client_tx_id ? { client_tx_id } : {}),
          })),
        },
      });

      // Update return with ledger entry ID
      await tx.posReturn.update({
        where: { id: posReturn.id },
        data: { ledger_entry_id: ledgerEntry.id },
      });

      // If store credit refund, increment customer balance (scoped by store)
      if (refund_method === "store_credit" && originalSale.customer_id) {
        await tx.posCustomer.update({
          where: { id: originalSale.customer_id, store_id: storeId },
          data: {
            credit_balance_cents: { increment: total_refund_cents },
          },
        });
      }

      // Restock inventory for items marked for restock
      for (const item of items) {
        if (item.restock && item.inventory_item_id) {
          await tx.posInventoryItem.update({
            where: { id: item.inventory_item_id },
            data: { quantity: { increment: item.quantity } },
          });
        }
      }

      return { posReturn, ledgerEntry };
    });

    // Deduct loyalty points earned on the original sale (min 0)
    if (originalSale.customer_id) {
      try {
        const originalMeta = (originalSale.metadata ?? {}) as Record<string, unknown>;
        // Check if points were earned on the original transaction
        // SECURITY: scope to store_id via tenant client
        const originalPoints = await db.posLoyaltyEntry.findFirst({
          where: {
            customer_id: originalSale.customer_id,
            reference_id: original_ledger_entry_id,
            type: "earn_purchase",
          },
          select: { points: true },
        });

        if (originalPoints && originalPoints.points > 0) {
          // Get current balance
          const cust = await db.posCustomer.findFirst({
            where: { id: originalSale.customer_id },
            select: { loyalty_points: true, afterroar_user_id: true },
          });

          const deduction = Math.min(originalPoints.points, cust?.loyalty_points ?? 0);

          if (deduction > 0) {
            await prisma.$transaction(async (tx) => {
              const updated = await tx.posCustomer.update({
                where: { id: originalSale.customer_id!, store_id: storeId },
                data: { loyalty_points: { decrement: deduction } },
                select: { loyalty_points: true },
              });

              await tx.posLoyaltyEntry.create({
                data: {
                  store_id: storeId,
                  customer_id: originalSale.customer_id!,
                  type: "adjust",
                  points: -deduction,
                  balance_after: updated.loyalty_points,
                  description: `Points reversed: return of ${items.length} item(s)`,
                  reference_id: result.ledgerEntry.id,
                },
              });
            });

            // Sync deduction to HQ
            if (cust?.afterroar_user_id) {
              const { enqueueHQ } = await import("@/lib/hq-outbox");
              await enqueueHQ(storeId, "points_reversed", {
                userId: cust.afterroar_user_id,
                storeId,
                points: deduction,
                reason: "return",
                transactionId: result.ledgerEntry.id,
              });
            }
          }
        }

        // Check return frequency — flag frequent returners
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
        const recentReturns = await db.posReturn.count({
          where: {
            customer_id: originalSale.customer_id,
            created_at: { gte: thirtyDaysAgo },
          },
        });

        if (recentReturns >= 3) {
          // Flag the customer
          await db.posCustomer.update({
            where: { id: originalSale.customer_id },
            data: {
              tags: {
                push: "frequent_returner",
              },
            },
          });
        }
      } catch (err) {
        console.error("[Returns] Points deduction failed (non-fatal):", err);
      }
    }

    // Marketplace inventory sync handled by cron (/api/marketplace/sync every 5 min)

    return NextResponse.json(
      {
        id: result.posReturn.id,
        total_refund_cents,
        refund_method,
        ledger_entry_id: result.ledgerEntry.id,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleAuthError(error);
  }
}
