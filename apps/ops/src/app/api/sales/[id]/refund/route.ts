/**
 * POST /api/sales/[id]/refund
 *
 * Refund a single sale ledger entry — the action behind the "Refund"
 * button in /dashboard/sales row drill-down.
 *
 * Differences from /api/returns POST (the legacy wizard endpoint):
 *   - Path-bound to the originating ledger entry (no need to pass it in body)
 *   - Card refunds call Stripe Refunds API automatically when the original
 *     sale's metadata.paymentIntentId is present
 *   - Writes both the canonical PosReturn row AND a 'refund' PosLedgerEntry
 *     so /dashboard/sales naturally shows refunds inline
 *   - Idempotency via clientTxId
 *
 * Auth: session-based (requires `returns` permission).
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { getStripe } from "@/lib/stripe";

interface RefundItemInput {
  inventory_item_id: string;
  quantity: number;
  /** True if items go back into stock; false for damaged/lost. */
  restock?: boolean;
}

interface RefundBody {
  items: RefundItemInput[];
  /** "cash" | "store_credit" | "card" — must match original payment for "card". */
  refund_method: "cash" | "store_credit" | "card";
  reason: string;
  reason_notes?: string | null;
  client_tx_id?: string;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: saleId } = await ctx.params;
  try {
    const { staff, storeId, db } = await requirePermission("returns");

    let body: RefundBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { items, refund_method, reason, reason_notes, client_tx_id } = body;
    if (!items?.length) {
      return NextResponse.json({ error: "items is required" }, { status: 400 });
    }
    if (!["cash", "store_credit", "card"].includes(refund_method)) {
      return NextResponse.json({ error: "Invalid refund_method" }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ error: "reason is required" }, { status: 400 });
    }

    // Idempotency
    if (client_tx_id) {
      const existing = await db.posLedgerEntry.findFirst({
        where: {
          store_id: storeId,
          type: "refund",
          metadata: { path: ["client_tx_id"], equals: client_tx_id },
        },
      });
      if (existing) {
        return NextResponse.json({ refund_ledger_entry_id: existing.id, deduplicated: true });
      }
    }

    // 1. Load the original sale
    const sale = await db.posLedgerEntry.findFirst({
      where: { id: saleId, type: "sale" },
    });
    if (!sale) {
      return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    }

    const meta = (sale.metadata ?? {}) as Record<string, unknown>;
    const saleItemsRaw = (meta.items as Array<Record<string, unknown>>) ?? [];
    // Tolerant parser — accept either snake_case (canonical) or legacy camelCase.
    const saleItems = saleItemsRaw.map((i) => ({
      inventory_item_id: (i.inventory_item_id ?? i.inventoryItemId) as string,
      name: i.name as string,
      quantity: (i.quantity ?? i.qty) as number,
      price_cents: (i.price_cents ?? i.priceCents) as number,
    }));
    const saleItemMap = new Map(saleItems.map((si) => [si.inventory_item_id, si]));
    const paymentMethodOnSale = (meta.paymentMethod ?? meta.payment_method) as string | undefined;
    const paymentIntentId = meta.paymentIntentId as string | undefined;

    if (refund_method === "card" && !paymentIntentId) {
      return NextResponse.json(
        { error: "Card refund unavailable — original sale has no PaymentIntent." },
        { status: 400 },
      );
    }
    if (refund_method === "card" && paymentMethodOnSale !== "card") {
      return NextResponse.json(
        { error: "Card refund only available for card sales." },
        { status: 400 },
      );
    }

    // 2. Double-return prevention
    const existingReturns = await db.posReturn.findMany({
      where: { original_ledger_entry_id: saleId },
      include: { items: true },
    });
    const alreadyReturned = new Map<string, number>();
    for (const ret of existingReturns) {
      for (const item of ret.items) {
        const key = item.inventory_item_id ?? item.name;
        alreadyReturned.set(key, (alreadyReturned.get(key) ?? 0) + item.quantity);
      }
    }

    let refundSubtotalCents = 0;
    for (const want of items) {
      const orig = saleItemMap.get(want.inventory_item_id);
      if (!orig) {
        return NextResponse.json(
          { error: `Item ${want.inventory_item_id} was not in the original sale` },
          { status: 400 },
        );
      }
      const left = orig.quantity - (alreadyReturned.get(want.inventory_item_id) ?? 0);
      if (want.quantity > left) {
        return NextResponse.json(
          { error: `Cannot refund ${want.quantity} of "${orig.name}". Max returnable: ${left}` },
          { status: 400 },
        );
      }
      refundSubtotalCents += want.quantity * orig.price_cents;
    }

    if (refundSubtotalCents <= 0) {
      return NextResponse.json({ error: "Nothing to refund" }, { status: 400 });
    }

    // 3. Card refund (Stripe). Do this BEFORE the local transaction so we
    //    don't write a refund row for a charge that didn't move.
    let stripeRefundId: string | null = null;
    if (refund_method === "card") {
      const stripe = getStripe();
      if (!stripe) {
        return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
      }
      try {
        const refund = await stripe.refunds.create(
          {
            payment_intent: paymentIntentId!,
            amount: refundSubtotalCents,
            metadata: {
              afterroar_store_id: storeId,
              original_ledger_entry_id: saleId,
              ...(client_tx_id ? { client_tx_id } : {}),
            },
          },
          { idempotencyKey: client_tx_id ? `refund:${client_tx_id}` : undefined },
        );
        stripeRefundId = refund.id;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stripe refund failed";
        return NextResponse.json({ error: `Stripe refund failed: ${msg}` }, { status: 502 });
      }
    }

    // 4. Local atomic write
    const result = await prisma.$transaction(async (tx) => {
      const ret = await tx.posReturn.create({
        data: {
          store_id: storeId,
          staff_id: staff.id,
          customer_id: sale.customer_id,
          original_ledger_entry_id: saleId,
          subtotal_cents: refundSubtotalCents,
          restocking_fee_cents: 0,
          refund_amount_cents: refundSubtotalCents,
          total_refund_cents: refundSubtotalCents,
          refund_method, // 'cash' | 'store_credit' | 'card' — column is freeform string
          reason,
          reason_notes: reason_notes ?? null,
          status: "completed",
          items: {
            create: items.map((want) => {
              const orig = saleItemMap.get(want.inventory_item_id)!;
              return {
                inventory_item_id: want.inventory_item_id,
                name: orig.name,
                quantity: want.quantity,
                price_cents: orig.price_cents,
                total_cents: want.quantity * orig.price_cents,
                restock: want.restock !== false,
              };
            }),
          },
        },
      });

      // Inventory restock
      for (const want of items) {
        if (want.restock === false) continue;
        await tx.posInventoryItem.update({
          where: { id: want.inventory_item_id },
          data: { quantity: { increment: want.quantity } },
        }).catch(() => {
          // Item may have been deleted since the sale — ignore, but the refund still goes through
        });
      }

      // Mirror the refund as a ledger entry so /dashboard/sales surfaces it inline
      const refundLedger = await tx.posLedgerEntry.create({
        data: {
          store_id: storeId,
          type: "refund",
          amount_cents: refundSubtotalCents,
          staff_id: staff.id,
          customer_id: sale.customer_id,
          description: `Refund · ${items.length} item${items.length === 1 ? "" : "s"} · ${reason}`,
          metadata: {
            source: "register_offline",
            original_ledger_entry_id: saleId,
            return_id: ret.id,
            refund_method,
            paymentMethod: refund_method,
            ...(stripeRefundId ? { stripeRefundId } : {}),
            ...(client_tx_id ? { client_tx_id } : {}),
            items: items.map((want) => {
              const orig = saleItemMap.get(want.inventory_item_id)!;
              return {
                inventory_item_id: want.inventory_item_id,
                name: orig.name,
                quantity: want.quantity,
                price_cents: orig.price_cents,
              };
            }),
          } as Prisma.InputJsonValue,
        },
      });

      // Store credit issuance
      if (refund_method === "store_credit" && sale.customer_id) {
        await tx.posCustomer.update({
          where: { id: sale.customer_id },
          data: { credit_balance_cents: { increment: refundSubtotalCents } },
        });
      }

      return { return_id: ret.id, refund_ledger_entry_id: refundLedger.id };
    });

    return NextResponse.json({ ...result, stripeRefundId });
  } catch (error) {
    return handleAuthError(error);
  }
}
