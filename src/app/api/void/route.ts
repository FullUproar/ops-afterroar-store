import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { formatCents } from "@/lib/types";
import { opLog } from "@/lib/op-log";

/* ------------------------------------------------------------------ */
/*  POST /api/void — void a recent transaction                         */
/*  Creates a reversing ledger entry and restores inventory.           */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    const { staff, storeId } = await requirePermission("checkout");

    let body: { ledger_entry_id: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.ledger_entry_id) {
      return NextResponse.json(
        { error: "ledger_entry_id is required" },
        { status: 400 }
      );
    }

    // Find the original transaction
    const original = await prisma.posLedgerEntry.findFirst({
      where: {
        id: body.ledger_entry_id,
        store_id: storeId,
        type: "sale",
      },
    });

    if (!original) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    // Check if already voided
    const existingVoid = await prisma.posLedgerEntry.findFirst({
      where: {
        store_id: storeId,
        type: "void",
        metadata: {
          path: ["original_ledger_entry_id"],
          equals: original.id,
        },
      },
    });

    if (existingVoid) {
      return NextResponse.json(
        { error: "Transaction has already been voided" },
        { status: 400 }
      );
    }

    // Check void window (default 30 minutes)
    const voidWindowMinutes = 30;
    const createdAt = new Date(original.created_at).getTime();
    const now = Date.now();
    const minutesElapsed = (now - createdAt) / 60000;

    if (minutesElapsed > voidWindowMinutes) {
      return NextResponse.json(
        {
          error: `Transaction is too old to void. Void window is ${voidWindowMinutes} minutes. Use a return instead.`,
        },
        { status: 400 }
      );
    }

    const metadata = (original.metadata as Record<string, unknown>) ?? {};
    const items = (metadata.items as Array<{
      inventory_item_id: string;
      quantity: number;
      price_cents: number;
    }>) ?? [];

    // Process the void in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create reversing ledger entry
      const voidEntry = await tx.posLedgerEntry.create({
        data: {
          store_id: storeId,
          type: "void",
          staff_id: staff.id,
          customer_id: original.customer_id,
          amount_cents: -original.amount_cents,
          description: `Void of sale ${formatCents(original.amount_cents)} by ${staff.name}`,
          metadata: {
            original_ledger_entry_id: original.id,
            original_amount_cents: original.amount_cents,
            voided_by: staff.name,
            original_items: items,
          },
        },
      });

      // Restore inventory quantities
      for (const item of items) {
        if (item.inventory_item_id) {
          await tx.posInventoryItem.updateMany({
            where: {
              id: item.inventory_item_id,
              store_id: storeId,
            },
            data: { quantity: { increment: item.quantity } },
          });
        }
      }

      // If customer had credit applied, reverse it
      const creditApplied = (metadata.credit_applied_cents as number) ?? 0;
      if (creditApplied > 0 && original.customer_id) {
        await tx.posCustomer.updateMany({
          where: {
            id: original.customer_id,
            store_id: storeId,
          },
          data: {
            credit_balance_cents: { increment: creditApplied },
          },
        });
      }

      // TODO: If card payment, initiate Stripe refund here

      return voidEntry;
    });

    opLog({
      storeId,
      eventType: "checkout.void",
      severity: "warn",
      message: `Voided sale ${formatCents(original.amount_cents)} · ${items.length} item(s) · ${staff.name}`,
      metadata: {
        void_entry_id: result.id,
        original_ledger_entry_id: original.id,
        amount_voided_cents: original.amount_cents,
        items_restored: items.length,
      },
      staffName: staff.name,
      userId: staff.user_id,
    });

    return NextResponse.json({
      success: true,
      void_entry_id: result.id,
      amount_voided_cents: original.amount_cents,
      items_restored: items.length,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  GET /api/void — get the last voidable transaction                  */
/* ------------------------------------------------------------------ */
export async function GET() {
  try {
    const { storeId } = await requirePermission("checkout");

    const voidWindowMinutes = 30;
    const cutoff = new Date(Date.now() - voidWindowMinutes * 60000);

    const lastSale = await prisma.posLedgerEntry.findFirst({
      where: {
        store_id: storeId,
        type: "sale",
        created_at: { gte: cutoff },
      },
      orderBy: { created_at: "desc" },
    });

    if (!lastSale) {
      return NextResponse.json({ transaction: null });
    }

    // Check if already voided
    const existingVoid = await prisma.posLedgerEntry.findFirst({
      where: {
        store_id: storeId,
        type: "void",
        metadata: {
          path: ["original_ledger_entry_id"],
          equals: lastSale.id,
        },
      },
    });

    if (existingVoid) {
      return NextResponse.json({ transaction: null });
    }

    return NextResponse.json({
      transaction: lastSale,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
