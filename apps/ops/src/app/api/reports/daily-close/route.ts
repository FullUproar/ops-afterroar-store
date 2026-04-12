import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

export async function GET() {
  try {
    const { db, storeId } = await requirePermission("reports");

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [ledger, tradeIns, events, newCustomers] = await Promise.all([
      db.posLedgerEntry.findMany({
        where: { created_at: { gte: todayStart } },
        select: { type: true, amount_cents: true, metadata: true },
      }),
      db.posTradeIn.count({
        where: { created_at: { gte: todayStart } },
      }),
      db.posEvent.count({
        where: { starts_at: { gte: todayStart, lt: new Date(todayStart.getTime() + 86400000) } },
      }),
      db.posCustomer.count({
        where: { created_at: { gte: todayStart } },
      }),
    ]);

    let salesCount = 0;
    let revenueCents = 0;
    let payoutsCents = 0;
    const itemSales = new Map<string, { name: string; count: number }>();

    for (const entry of ledger) {
      if (entry.type === "sale" || entry.type === "event_fee") {
        salesCount++;
        revenueCents += entry.amount_cents;

        // Track top seller
        const meta = entry.metadata as Record<string, unknown> | null;
        if (meta?.items && Array.isArray(meta.items)) {
          for (const item of meta.items as Array<{ inventory_item_id: string; quantity: number }>) {
            const existing = itemSales.get(item.inventory_item_id);
            if (existing) {
              existing.count += item.quantity;
            } else {
              itemSales.set(item.inventory_item_id, { name: "", count: item.quantity });
            }
          }
        }
      }
      if (entry.type === "trade_in" || entry.type === "refund") {
        payoutsCents += Math.abs(entry.amount_cents);
      }
    }

    // Find top seller name
    let topSeller: string | null = null;
    if (itemSales.size > 0) {
      const topId = [...itemSales.entries()].sort((a, b) => b[1].count - a[1].count)[0]?.[0];
      if (topId) {
        const item = await db.posInventoryItem.findFirst({
          where: { id: topId },
          select: { name: true },
        });
        topSeller = item?.name ?? null;
      }
    }

    return NextResponse.json({
      sales_count: salesCount,
      revenue_cents: revenueCents,
      payouts_cents: payoutsCents,
      net_cents: revenueCents - payoutsCents,
      trade_ins: tradeIns,
      events_today: events,
      new_customers: newCustomers,
      top_seller: topSeller,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
