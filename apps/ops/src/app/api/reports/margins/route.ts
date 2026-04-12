import { NextRequest, NextResponse } from "next/server";
import { requirePermissionAndFeature, handleAuthError } from "@/lib/require-staff";

export async function GET(req: NextRequest) {
  try {
    const { db } = await requirePermissionAndFeature("reports", "advanced_reports");

    const url = new URL(req.url);
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");

    const now = new Date();
    const to = toParam ? new Date(toParam) : now;
    const from = fromParam
      ? new Date(fromParam)
      : new Date(now.getTime() - 30 * 86400000);

    // Ensure 'to' covers the full day
    const toEnd = new Date(to);
    toEnd.setHours(23, 59, 59, 999);

    // Pull sale ledger entries with COGS metadata in period
    const entries = await db.posLedgerEntry.findMany({
      where: {
        type: "sale",
        created_at: { gte: from, lte: toEnd },
      },
      select: {
        id: true,
        amount_cents: true,
        metadata: true,
        created_at: true,
      },
    });

    // Aggregate summary + by-category
    let totalRevenue = 0;
    let totalCogs = 0;
    let txCount = 0;

    // category -> { revenue, cogs, itemIds }
    const catMap = new Map<
      string,
      { revenue: number; cogs: number; itemIds: Set<string> }
    >();

    // item -> { name, category, revenue, cogs, units }
    const itemMap = new Map<
      string,
      { name: string; category: string; price_cents: number; cost_cents: number; revenue: number; cogs: number; units: number }
    >();

    for (const entry of entries) {
      const meta = entry.metadata as Record<string, unknown> | null;
      if (!meta) continue;

      // Top-level COGS data on the ledger entry
      const entryCogs = typeof meta.cogs_cents === "number" ? meta.cogs_cents : 0;
      const entryRevenue = entry.amount_cents;

      totalRevenue += entryRevenue;
      totalCogs += entryCogs;
      txCount++;

      // Per-item breakdown from metadata.items
      const items = Array.isArray(meta.items) ? meta.items as Array<Record<string, unknown>> : [];
      for (const item of items) {
        const itemId = (item.inventory_item_id as string) || "unknown";
        const itemName = (item.name as string) || "Unknown Item";
        const qty = typeof item.quantity === "number" ? item.quantity : 1;
        const itemPrice = typeof item.price_cents === "number" ? item.price_cents : 0;
        const itemCost = typeof item.cost_cents === "number" ? item.cost_cents : 0;
        const category = (item.category as string) || "other";

        const lineRevenue = itemPrice * qty;
        const lineCogs = itemCost * qty;

        // Category aggregation
        const cat = catMap.get(category) ?? { revenue: 0, cogs: 0, itemIds: new Set<string>() };
        cat.revenue += lineRevenue;
        cat.cogs += lineCogs;
        cat.itemIds.add(itemId);
        catMap.set(category, cat);

        // Item aggregation
        const existing = itemMap.get(itemId);
        if (existing) {
          existing.revenue += lineRevenue;
          existing.cogs += lineCogs;
          existing.units += qty;
        } else {
          itemMap.set(itemId, {
            name: itemName,
            category,
            price_cents: itemPrice,
            cost_cents: itemCost,
            revenue: lineRevenue,
            cogs: lineCogs,
            units: qty,
          });
        }
      }
    }

    const marginCents = totalRevenue - totalCogs;
    const marginPercent = totalRevenue > 0
      ? Math.round((marginCents / totalRevenue) * 10000) / 100
      : 0;

    // by_category
    const byCategory = [...catMap.entries()]
      .map(([category, data]) => ({
        category,
        revenue_cents: data.revenue,
        cogs_cents: data.cogs,
        margin_percent:
          data.revenue > 0
            ? Math.round(((data.revenue - data.cogs) / data.revenue) * 10000) / 100
            : 0,
        item_count: data.itemIds.size,
      }))
      .sort((a, b) => b.revenue_cents - a.revenue_cents);

    // Top margin items (by margin %, min 1 unit sold)
    const allItems = [...itemMap.values()];
    const withMargin = allItems.map((item) => ({
      name: item.name,
      category: item.category,
      price_cents: item.price_cents,
      cost_cents: item.cost_cents,
      margin_percent:
        item.revenue > 0
          ? Math.round(((item.revenue - item.cogs) / item.revenue) * 10000) / 100
          : 0,
      profit_cents: item.revenue - item.cogs,
      units_sold: item.units,
    }));

    const topMargin = [...withMargin]
      .sort((a, b) => b.profit_cents - a.profit_cents)
      .slice(0, 10);

    const lowMargin = [...withMargin]
      .sort((a, b) => a.margin_percent - b.margin_percent)
      .slice(0, 10);

    return NextResponse.json({
      period: { from: from.toISOString(), to: toEnd.toISOString() },
      summary: {
        revenue_cents: totalRevenue,
        cogs_cents: totalCogs,
        margin_cents: marginCents,
        margin_percent: marginPercent,
        transaction_count: txCount,
      },
      by_category: byCategory,
      top_margin: topMargin,
      low_margin: lowMargin,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
