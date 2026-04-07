import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

export async function GET(req: NextRequest) {
  try {
    const { db, storeId } = await requirePermission("reports");

    const url = new URL(req.url);
    const periodKey = url.searchParams.get("period") || "30d";
    const customFrom = url.searchParams.get("from");
    const customTo = url.searchParams.get("to");

    const now = new Date();
    let from: Date;
    let to: Date = now;

    if (periodKey === "custom" && customFrom && customTo) {
      from = new Date(customFrom);
      to = new Date(customTo);
      to.setHours(23, 59, 59, 999);
    } else if (periodKey === "today") {
      from = new Date(now);
      from.setHours(0, 0, 0, 0);
    } else if (periodKey === "7d") {
      from = new Date(now.getTime() - 7 * 86400000);
    } else if (periodKey === "90d") {
      from = new Date(now.getTime() - 90 * 86400000);
    } else {
      // 30d default
      from = new Date(now.getTime() - 30 * 86400000);
    }

    const toEnd = new Date(to);
    if (periodKey !== "custom") {
      toEnd.setHours(23, 59, 59, 999);
    }

    // Fetch all sale entries in period
    const entries = await db.posLedgerEntry.findMany({
      where: {
        store_id: storeId,
        type: "sale",
        created_at: { gte: from, lte: toEnd },
      },
      select: {
        id: true,
        amount_cents: true,
        tip_cents: true,
        credit_amount_cents: true,
        metadata: true,
        staff_id: true,
        created_at: true,
      },
    });

    // Summary
    let totalRevenue = 0;
    let totalItems = 0;
    let totalTips = 0;

    // Payment breakdown
    const paymentTotals: Record<string, number> = {
      card: 0,
      cash: 0,
      credit: 0,
      gift_card: 0,
      other: 0,
    };

    // Daily revenue
    const dailyMap = new Map<string, number>();

    // Peak hours (0-23)
    const hourCounts = new Array(24).fill(0);

    // Top items by revenue and units
    const itemRevMap = new Map<string, { name: string; category: string; revenue: number; units: number }>();

    // Category revenue
    const catRevMap = new Map<string, number>();

    // Best day tracking
    let bestDayDate = "";
    let bestDayRevenue = 0;

    for (const entry of entries) {
      totalRevenue += entry.amount_cents;
      totalTips += entry.tip_cents;

      const meta = entry.metadata as Record<string, unknown> | null;

      // Payment method
      const method = (meta?.payment_method as string) || "card";
      if (entry.credit_amount_cents > 0) {
        paymentTotals.credit += entry.credit_amount_cents;
        paymentTotals[method === "credit" ? "card" : method] += entry.amount_cents - entry.credit_amount_cents;
      } else {
        const bucket = method in paymentTotals ? method : "other";
        paymentTotals[bucket] += entry.amount_cents;
      }

      // Daily
      const dateKey = entry.created_at.toISOString().slice(0, 10);
      dailyMap.set(dateKey, (dailyMap.get(dateKey) || 0) + entry.amount_cents);

      // Peak hours
      const hour = entry.created_at.getHours();
      hourCounts[hour]++;

      // Items
      const items = Array.isArray(meta?.items) ? meta.items as Array<Record<string, unknown>> : [];
      let entryItemCount = 0;
      for (const item of items) {
        const itemId = (item.inventory_item_id as string) || (item.name as string) || "unknown";
        const name = (item.name as string) || "Unknown";
        const category = (item.category as string) || "other";
        const qty = typeof item.quantity === "number" ? item.quantity : 1;
        const price = typeof item.price_cents === "number" ? item.price_cents : 0;
        const lineRevenue = price * qty;
        entryItemCount += qty;

        const existing = itemRevMap.get(itemId);
        if (existing) {
          existing.revenue += lineRevenue;
          existing.units += qty;
        } else {
          itemRevMap.set(itemId, { name, category, revenue: lineRevenue, units: qty });
        }

        catRevMap.set(category, (catRevMap.get(category) || 0) + lineRevenue);
      }
      if (entryItemCount === 0) entryItemCount = 1;
      totalItems += entryItemCount;
    }

    // Daily revenue array sorted by date
    const dailyRevenue = [...dailyMap.entries()]
      .map(([date, cents]) => ({ date, revenue_cents: cents }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Find best day
    for (const day of dailyRevenue) {
      if (day.revenue_cents > bestDayRevenue) {
        bestDayRevenue = day.revenue_cents;
        bestDayDate = day.date;
      }
    }

    // Daily average
    const uniqueDays = dailyRevenue.length || 1;
    const dailyAvgCents = Math.round(totalRevenue / uniqueDays);

    const txCount = entries.length;
    const avgTxCents = txCount > 0 ? Math.round(totalRevenue / txCount) : 0;
    const itemsPerTx = txCount > 0 ? Math.round((totalItems / txCount) * 10) / 10 : 0;

    // Top selling by revenue
    const allItems = [...itemRevMap.values()];
    const topByRevenue = [...allItems]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((i) => ({ name: i.name, category: i.category, revenue_cents: i.revenue, units: i.units }));

    const topByUnits = [...allItems]
      .sort((a, b) => b.units - a.units)
      .slice(0, 10)
      .map((i) => ({ name: i.name, category: i.category, revenue_cents: i.revenue, units: i.units }));

    // Category breakdown
    const categoryBreakdown = [...catRevMap.entries()]
      .map(([category, revenue]) => ({
        category,
        revenue_cents: revenue,
        pct: totalRevenue > 0 ? Math.round((revenue / totalRevenue) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.revenue_cents - a.revenue_cents);

    // Payment breakdown with percentages
    const totalPayments = Object.values(paymentTotals).reduce((a, b) => a + b, 0) || 1;
    const paymentBreakdown = Object.entries(paymentTotals)
      .filter(([, v]) => v > 0)
      .map(([method, cents]) => ({
        method,
        amount_cents: cents,
        pct: Math.round((cents / totalPayments) * 1000) / 10,
      }))
      .sort((a, b) => b.amount_cents - a.amount_cents);

    // Peak hours
    const maxHourCount = Math.max(...hourCounts, 1);
    const peakHours = hourCounts.map((count: number, hour: number) => ({
      hour,
      count,
      intensity: Math.round((count / maxHourCount) * 100),
    }));

    return NextResponse.json({
      period: { from: from.toISOString(), to: toEnd.toISOString() },
      summary: {
        revenue_cents: totalRevenue,
        transaction_count: txCount,
        avg_transaction_cents: avgTxCents,
        items_per_transaction: itemsPerTx,
        tips_cents: totalTips,
      },
      daily_revenue: dailyRevenue,
      daily_avg_cents: dailyAvgCents,
      best_day: { date: bestDayDate, revenue_cents: bestDayRevenue },
      payment_breakdown: paymentBreakdown,
      top_by_revenue: topByRevenue,
      top_by_units: topByUnits,
      category_breakdown: categoryBreakdown,
      peak_hours: peakHours,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
