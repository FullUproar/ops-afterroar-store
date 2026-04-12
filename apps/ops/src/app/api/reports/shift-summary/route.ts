import { NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/reports/shift-summary — today's activity for current staff */
/*  Shows: sales count, revenue, trade-ins, returns, events checked in */
/*  Motivating for the cashier. Useful for shift handoff.              */
/* ------------------------------------------------------------------ */
export async function GET() {
  try {
    const { staff, db } = await requireStaff();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Get today's ledger entries for this staff member
    const todayEntries = await db.posLedgerEntry.findMany({
      where: {
        staff_id: staff.id,
        created_at: { gte: todayStart },
      },
      select: { type: true, amount_cents: true },
    });

    // Also get store-wide today totals (for context)
    const storeEntries = await db.posLedgerEntry.findMany({
      where: {
        created_at: { gte: todayStart },
      },
      select: { type: true, amount_cents: true },
    });

    function summarize(entries: Array<{ type: string; amount_cents: number }>) {
      let salesCount = 0;
      let salesRevenue = 0;
      let eventFees = 0;
      let tradeIns = 0;
      let refunds = 0;

      for (const e of entries) {
        switch (e.type) {
          case "sale":
            salesCount++;
            salesRevenue += e.amount_cents;
            break;
          case "event_fee":
            eventFees += e.amount_cents;
            break;
          case "trade_in":
            tradeIns++;
            break;
          case "refund":
            refunds++;
            break;
        }
      }

      return { salesCount, salesRevenue, eventFees, tradeIns, refunds, totalEntries: entries.length };
    }

    return NextResponse.json({
      staff_name: staff.name,
      staff_role: staff.role,
      my_shift: summarize(todayEntries),
      store_today: summarize(storeEntries),
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
