import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

export async function GET(req: NextRequest) {
  try {
    const { db, storeId } = await requirePermission("reports");

    const url = new URL(req.url);
    const periodDays = parseInt(url.searchParams.get("days") || "90", 10);

    const now = new Date();
    const periodStart = new Date(now.getTime() - periodDays * 86400000);

    // Fetch all active inventory items
    const items = await db.posInventoryItem.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        category: true,
        price_cents: true,
        cost_cents: true,
        quantity: true,
        low_stock_threshold: true,
        reorder_point: true,
        created_at: true,
      },
    });

    // Fetch sale ledger entries in the period with item metadata
    const sales = await db.posLedgerEntry.findMany({
      where: {
        type: "sale",
        created_at: { gte: periodStart, lte: now },
      },
      select: {
        metadata: true,
        created_at: true,
      },
    });

    // Build per-item sales data
    const itemSales = new Map<string, { units: number; lastSaleDate: Date | null }>();

    for (const sale of sales) {
      const meta = sale.metadata as Record<string, unknown> | null;
      if (!meta) continue;
      const saleItems = Array.isArray(meta.items) ? meta.items as Array<Record<string, unknown>> : [];
      for (const si of saleItems) {
        const itemId = si.inventory_item_id as string;
        if (!itemId) continue;
        const qty = typeof si.quantity === "number" ? si.quantity : 1;
        const existing = itemSales.get(itemId) ?? { units: 0, lastSaleDate: null };
        existing.units += qty;
        const saleDate = sale.created_at;
        if (!existing.lastSaleDate || saleDate > existing.lastSaleDate) {
          existing.lastSaleDate = saleDate;
        }
        itemSales.set(itemId, existing);
      }
    }

    // Summary stats
    let totalSkus = 0;
    let totalCostCents = 0;
    let totalRetailCents = 0;
    let totalCostForMargin = 0;
    let totalRetailForMargin = 0;

    // Dead stock (configurable threshold, default 60 days)
    const deadStockDays = periodDays >= 90 ? 90 : periodDays >= 60 ? 60 : 30;
    const deadStockCutoff = new Date(now.getTime() - deadStockDays * 86400000);
    const deadStock: Array<{
      id: string;
      name: string;
      category: string;
      quantity: number;
      cost_trapped_cents: number;
      retail_value_cents: number;
      days_since_sale: number | null;
    }> = [];
    let deadStockTotalCents = 0;

    // Velocity data
    const velocityData: Array<{
      id: string;
      name: string;
      category: string;
      units_sold: number;
      units_per_week: number;
      current_stock: number;
      weeks_of_supply: number | null;
    }> = [];

    // Reorder alerts
    const reorderAlerts: Array<{
      id: string;
      name: string;
      category: string;
      quantity: number;
      threshold: number;
      reorder_point: number | null;
    }> = [];

    // Category mix
    const categoryMix = new Map<string, { cost_cents: number; retail_cents: number; count: number; units_sold: number; cost_of_sold: number }>();

    // Overstock warnings
    const overstockItems: Array<{
      id: string;
      name: string;
      category: string;
      quantity: number;
      units_per_week: number;
      months_of_supply: number;
      retail_value_cents: number;
    }> = [];

    const weeksInPeriod = periodDays / 7;

    for (const item of items) {
      const costValue = item.cost_cents * item.quantity;
      const retailValue = item.price_cents * item.quantity;

      totalSkus++;
      totalCostCents += costValue;
      totalRetailCents += retailValue;

      if (item.cost_cents > 0 && item.price_cents > 0) {
        totalCostForMargin += item.cost_cents;
        totalRetailForMargin += item.price_cents;
      }

      const sales = itemSales.get(item.id);
      const unitsSold = sales?.units ?? 0;
      const unitsPerWeek = weeksInPeriod > 0 ? unitsSold / weeksInPeriod : 0;

      // Category mix
      const cat = categoryMix.get(item.category) ?? { cost_cents: 0, retail_cents: 0, count: 0, units_sold: 0, cost_of_sold: 0 };
      cat.cost_cents += costValue;
      cat.retail_cents += retailValue;
      cat.count++;
      cat.units_sold += unitsSold;
      cat.cost_of_sold += item.cost_cents * unitsSold;
      categoryMix.set(item.category, cat);

      // Velocity
      if (unitsSold > 0) {
        velocityData.push({
          id: item.id,
          name: item.name,
          category: item.category,
          units_sold: unitsSold,
          units_per_week: Math.round(unitsPerWeek * 100) / 100,
          current_stock: item.quantity,
          weeks_of_supply: unitsPerWeek > 0 ? Math.round((item.quantity / unitsPerWeek) * 10) / 10 : null,
        });
      }

      // Dead stock: items with stock but no sales in the period, or last sale before cutoff
      if (item.quantity > 0) {
        const lastSale = sales?.lastSaleDate;
        const isDead = !lastSale || lastSale < deadStockCutoff;
        if (isDead) {
          const daysSince = lastSale
            ? Math.floor((now.getTime() - lastSale.getTime()) / 86400000)
            : null;
          deadStock.push({
            id: item.id,
            name: item.name,
            category: item.category,
            quantity: item.quantity,
            cost_trapped_cents: costValue,
            retail_value_cents: retailValue,
            days_since_sale: daysSince,
          });
          deadStockTotalCents += costValue;
        }
      }

      // Reorder alerts
      const threshold = item.reorder_point ?? item.low_stock_threshold;
      if (item.quantity <= threshold && item.quantity >= 0) {
        reorderAlerts.push({
          id: item.id,
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          threshold: item.low_stock_threshold,
          reorder_point: item.reorder_point,
        });
      }

      // Overstock: 6+ months of supply
      if (item.quantity > 0 && unitsPerWeek > 0) {
        const monthsOfSupply = (item.quantity / unitsPerWeek) / 4.33;
        if (monthsOfSupply >= 6) {
          overstockItems.push({
            id: item.id,
            name: item.name,
            category: item.category,
            quantity: item.quantity,
            units_per_week: Math.round(unitsPerWeek * 100) / 100,
            months_of_supply: Math.round(monthsOfSupply * 10) / 10,
            retail_value_cents: retailValue,
          });
        }
      }
    }

    // Velocity rankings
    const fastestMovers = [...velocityData]
      .sort((a, b) => b.units_per_week - a.units_per_week)
      .slice(0, 10);

    const slowestMovers = [...velocityData]
      .filter((v) => v.units_sold > 0)
      .sort((a, b) => a.units_per_week - b.units_per_week)
      .slice(0, 10);

    // Dead stock sorted by trapped capital
    deadStock.sort((a, b) => b.cost_trapped_cents - a.cost_trapped_cents);

    // Overstock sorted by months of supply
    overstockItems.sort((a, b) => b.months_of_supply - a.months_of_supply);

    // Reorder alerts sorted by how far below threshold
    reorderAlerts.sort((a, b) => a.quantity - b.quantity);

    // Category mix with turn rate
    const categoryData = [...categoryMix.entries()]
      .map(([category, data]) => {
        const avgInventoryCost = data.cost_cents; // current snapshot
        const turnRate = avgInventoryCost > 0
          ? Math.round((data.cost_of_sold / avgInventoryCost) * (365 / periodDays) * 10) / 10
          : 0;
        return {
          category,
          cost_cents: data.cost_cents,
          retail_cents: data.retail_cents,
          count: data.count,
          units_sold: data.units_sold,
          pct_of_value: totalRetailCents > 0
            ? Math.round((data.retail_cents / totalRetailCents) * 1000) / 10
            : 0,
          turn_rate: turnRate,
        };
      })
      .sort((a, b) => b.retail_cents - a.retail_cents);

    const avgMarginPct =
      totalRetailForMargin > 0
        ? Math.round(((totalRetailForMargin - totalCostForMargin) / totalRetailForMargin) * 1000) / 10
        : 0;

    return NextResponse.json({
      period_days: periodDays,
      summary: {
        total_skus: totalSkus,
        total_cost_cents: totalCostCents,
        total_retail_cents: totalRetailCents,
        avg_margin_pct: avgMarginPct,
      },
      dead_stock: deadStock.slice(0, 25),
      dead_stock_total_cents: deadStockTotalCents,
      dead_stock_count: deadStock.length,
      dead_stock_days: deadStockDays,
      fastest_movers: fastestMovers,
      slowest_movers: slowestMovers,
      reorder_alerts: reorderAlerts.slice(0, 25),
      reorder_count: reorderAlerts.length,
      category_mix: categoryData,
      overstock: overstockItems.slice(0, 25),
      overstock_count: overstockItems.length,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
