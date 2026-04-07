import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { prisma } from "@/lib/prisma";
import { calculatePurchasePoints, earnPoints } from "@/lib/loyalty";
import { getStoreSettings } from "@/lib/store-settings-shared";

/* ------------------------------------------------------------------ */
/*  POST /api/loyalty/claim — retroactive points award                 */
/*  After a sale completes without a customer, the customer can claim  */
/*  points if they sign up within 24 hours.                            */
/*                                                                     */
/*  Security:                                                          */
/*  - Transaction must exist and belong to this store                  */
/*  - Transaction must be a "sale" type                                */
/*  - Points not already claimed on this transaction                   */
/*  - Transaction must be < 24 hours old                               */
/*  - One-time use: metadata.points_claimed = true after claim         */
/*  - Staff auth required (cashier can trigger, not a public endpoint) */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const { db, storeId, staff } = await requireStaff();

    const body = await request.json();
    const { ledger_entry_id, customer_id } = body as {
      ledger_entry_id: string;
      customer_id: string;
    };

    if (!ledger_entry_id || !customer_id) {
      return NextResponse.json({ error: "ledger_entry_id and customer_id required" }, { status: 400 });
    }

    // Validate the transaction
    const entry = await db.posLedgerEntry.findFirst({
      where: { id: ledger_entry_id, store_id: storeId },
    });

    if (!entry) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    if (entry.type !== "sale") {
      return NextResponse.json({ error: "Points can only be claimed on sales" }, { status: 400 });
    }

    // Check if points already claimed
    const meta = (entry.metadata ?? {}) as Record<string, unknown>;
    if (meta.points_claimed) {
      return NextResponse.json({ error: "Points already claimed on this transaction" }, { status: 400 });
    }

    // Check 24-hour window
    const hoursSince = (Date.now() - new Date(entry.created_at).getTime()) / 3600000;
    if (hoursSince > 24) {
      return NextResponse.json({ error: "Points can only be claimed within 24 hours of purchase" }, { status: 400 });
    }

    // Validate customer exists
    const customer = await db.posCustomer.findFirst({
      where: { id: customer_id, store_id: storeId },
    });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    // Calculate points
    const store = await db.posStore.findFirst({ where: { id: storeId }, select: { settings: true } });
    const settings = getStoreSettings((store?.settings ?? {}) as Record<string, unknown>);
    const points = calculatePurchasePoints(entry.amount_cents, settings as unknown as Record<string, unknown>);

    if (points <= 0) {
      return NextResponse.json({ error: "No points to claim (loyalty may not be enabled)" }, { status: 400 });
    }

    // Award points
    await prisma.$transaction(async (tx) => {
      // Earn POS-local points
      await earnPoints(tx, {
        storeId,
        customerId: customer_id,
        type: "earn_purchase",
        points,
        description: `Retroactive claim on purchase of $${(entry.amount_cents / 100).toFixed(2)}`,
        referenceId: ledger_entry_id,
      });

      // Link the customer to this transaction
      await tx.posLedgerEntry.updateMany({
        where: { id: ledger_entry_id, store_id: storeId },
        data: {
          customer_id,
          metadata: JSON.parse(JSON.stringify({
            ...meta,
            points_claimed: true,
            points_claimed_by: customer_id,
            points_claimed_at: new Date().toISOString(),
            points_claimed_by_staff: staff.name,
          })),
        },
      });
    });

    // Sync to HQ if customer is linked
    if (customer.afterroar_user_id) {
      try {
        const { enqueueHQ } = await import("@/lib/hq-outbox");
        await enqueueHQ(storeId, "points_earned", {
          userId: customer.afterroar_user_id,
          storeId,
          points,
          category: "purchase",
          transactionId: ledger_entry_id,
        });
      } catch {}
    }

    return NextResponse.json({
      success: true,
      points_awarded: points,
      customer_name: customer.name,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
