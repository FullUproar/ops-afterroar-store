import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/reports/cash-flow — Cash Flow Intelligence data           */
/* ------------------------------------------------------------------ */
export async function GET() {
  try {
    const { db, storeId } = await requirePermission("cash_flow");

    const now = new Date();

    // Time boundaries
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // Run all queries in parallel
    const [
      allInventory,
      allLedger,
      todayLedger,
      weekLedger,
      monthLedger,
      prevMonthLedger,
      last30DaysLedger,
      tradeInsMonth,
      tradeInsAllTime,
      returnsMonth,
      customerCount,
      customersWithCredit,
    ] = await Promise.all([
      // All inventory for capital analysis
      db.posInventoryItem.findMany({
        where: { active: true },
        select: {
          id: true,
          name: true,
          category: true,
          price_cents: true,
          cost_cents: true,
          quantity: true,
          created_at: true,
        },
      }),

      // All-time ledger for totals
      db.posLedgerEntry.findMany({
        select: { type: true, amount_cents: true, credit_amount_cents: true, metadata: true, created_at: true },
      }),

      // Today's ledger
      db.posLedgerEntry.findMany({
        where: { created_at: { gte: todayStart } },
        select: { type: true, amount_cents: true, credit_amount_cents: true },
      }),

      // This week's ledger
      db.posLedgerEntry.findMany({
        where: { created_at: { gte: weekStart } },
        select: { type: true, amount_cents: true, credit_amount_cents: true },
      }),

      // This month's ledger
      db.posLedgerEntry.findMany({
        where: { created_at: { gte: monthStart } },
        select: { type: true, amount_cents: true, credit_amount_cents: true },
      }),

      // Previous month's ledger (for trend comparison)
      db.posLedgerEntry.findMany({
        where: {
          created_at: { gte: prevMonthStart, lte: prevMonthEnd },
        },
        select: { type: true, amount_cents: true, credit_amount_cents: true },
      }),

      // Last 30 days ledger — for daily chart + velocity
      db.posLedgerEntry.findMany({
        where: { created_at: { gte: thirtyDaysAgo } },
        select: { type: true, amount_cents: true, credit_amount_cents: true, metadata: true, created_at: true },
      }),

      // Trade-ins this month
      db.posTradeIn.findMany({
        where: { created_at: { gte: monthStart } },
        select: {
          payout_type: true,
          total_offer_cents: true,
          total_payout_cents: true,
        },
      }),

      // All-time trade-ins for ROI
      db.posTradeIn.findMany({
        where: { status: "completed" },
        select: {
          total_offer_cents: true,
          total_payout_cents: true,
          payout_type: true,
          items: {
            select: {
              inventory_item_id: true,
              name: true,
              category: true,
              quantity: true,
              offer_price_cents: true,
            },
          },
        },
      }),

      // Returns this month
      db.posReturn.findMany({
        where: { created_at: { gte: monthStart } },
        select: {
          refund_method: true,
          total_refund_cents: true,
          subtotal_cents: true,
          restocking_fee_cents: true,
        },
      }),

      // Customer counts
      db.posCustomer.count(),

      // Customers with credit balance
      db.posCustomer.aggregate({
        where: { credit_balance_cents: { gt: 0 } },
        _sum: { credit_balance_cents: true },
        _count: true,
      }),
    ]);

    // ---- Inventory Capital Analysis ----
    const inventoryByCategory = new Map<string, {
      category: string;
      item_count: number;
      total_units: number;
      cost_basis_cents: number;
      retail_value_cents: number;
      zero_stock_items: number;
    }>();

    // Build an item lookup for velocity analysis
    const itemMap = new Map<string, { id: string; name: string; category: string; cost_cents: number; price_cents: number; quantity: number }>();

    let totalCostBasis = 0;
    let totalRetailValue = 0;
    let totalUnits = 0;
    let zeroStockCount = 0;

    for (const item of allInventory) {
      const costBasis = item.cost_cents * item.quantity;
      const retailValue = item.price_cents * item.quantity;

      totalCostBasis += costBasis;
      totalRetailValue += retailValue;
      totalUnits += item.quantity;

      if (item.quantity === 0) zeroStockCount++;

      itemMap.set(item.id, {
        id: item.id,
        name: item.name,
        category: item.category,
        cost_cents: item.cost_cents,
        price_cents: item.price_cents,
        quantity: item.quantity,
      });

      const cat = item.category;
      const existing = inventoryByCategory.get(cat);
      if (existing) {
        existing.item_count++;
        existing.total_units += item.quantity;
        existing.cost_basis_cents += costBasis;
        existing.retail_value_cents += retailValue;
        if (item.quantity === 0) existing.zero_stock_items++;
      } else {
        inventoryByCategory.set(cat, {
          category: cat,
          item_count: 1,
          total_units: item.quantity,
          cost_basis_cents: costBasis,
          retail_value_cents: retailValue,
          zero_stock_items: item.quantity === 0 ? 1 : 0,
        });
      }
    }

    // ---- Ledger Aggregation Helper ----
    function aggregateLedger(entries: Array<{ type: string; amount_cents: number; credit_amount_cents: number }>) {
      let salesRevenue = 0;
      let eventFees = 0;
      let tradeInPayouts = 0;
      let refunds = 0;
      let creditIssued = 0;
      let creditRedeemed = 0;

      for (const e of entries) {
        switch (e.type) {
          case "sale":
            salesRevenue += e.amount_cents;
            break;
          case "event_fee":
            eventFees += e.amount_cents;
            break;
          case "trade_in":
            tradeInPayouts += Math.abs(e.amount_cents);
            break;
          case "refund":
            refunds += Math.abs(e.amount_cents);
            break;
          case "credit_issue":
            creditIssued += e.credit_amount_cents;
            break;
          case "credit_redeem":
            creditRedeemed += Math.abs(e.credit_amount_cents);
            break;
        }
      }

      const grossRevenue = salesRevenue + eventFees;
      const totalPayouts = tradeInPayouts + refunds;
      const netCashFlow = grossRevenue - totalPayouts;

      return {
        sales_revenue_cents: salesRevenue,
        event_fees_cents: eventFees,
        gross_revenue_cents: grossRevenue,
        trade_in_payouts_cents: tradeInPayouts,
        refunds_cents: refunds,
        total_payouts_cents: totalPayouts,
        net_cash_flow_cents: netCashFlow,
        credit_issued_cents: creditIssued,
        credit_redeemed_cents: creditRedeemed,
      };
    }

    const todayAgg = aggregateLedger(todayLedger);
    const weekAgg = aggregateLedger(weekLedger);
    const monthAgg = aggregateLedger(monthLedger);
    const prevMonthAgg = aggregateLedger(prevMonthLedger);
    const allTimeAgg = aggregateLedger(allLedger);

    // ---- Daily Revenue for Last 30 Days (Chart Data) ----
    const dailyRevenue: Array<{ date: string; revenue_cents: number; payout_cents: number; net_cents: number; day_of_week: number }> = [];
    const dailyMap = new Map<string, { revenue: number; payouts: number }>();

    // Initialize all 30 days
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dailyMap.set(key, { revenue: 0, payouts: 0 });
    }

    for (const entry of last30DaysLedger) {
      const key = entry.created_at.toISOString().slice(0, 10);
      const day = dailyMap.get(key);
      if (!day) continue;
      if (entry.type === "sale" || entry.type === "event_fee") {
        day.revenue += entry.amount_cents;
      } else if (entry.type === "trade_in" || entry.type === "refund") {
        day.payouts += Math.abs(entry.amount_cents);
      }
    }

    for (const [dateStr, vals] of dailyMap) {
      const d = new Date(dateStr + "T12:00:00Z");
      dailyRevenue.push({
        date: dateStr,
        revenue_cents: vals.revenue,
        payout_cents: vals.payouts,
        net_cents: vals.revenue - vals.payouts,
        day_of_week: d.getUTCDay(),
      });
    }

    // Sort by date ascending
    dailyRevenue.sort((a, b) => a.date.localeCompare(b.date));

    // ---- Inventory Velocity (from last 30 days sale metadata) ----
    // Track how many units of each item were sold in the last 30 days
    const itemSalesCount = new Map<string, number>();
    const categorySales = new Map<string, { revenue_cents: number; cost_cents: number; units_sold: number }>();

    for (const entry of last30DaysLedger) {
      if (entry.type !== "sale") continue;
      const meta = entry.metadata as Record<string, unknown> | null;
      if (!meta?.items) continue;
      const items = meta.items as Array<{ inventory_item_id: string; quantity: number; price_cents: number }>;
      for (const item of items) {
        const prevCount = itemSalesCount.get(item.inventory_item_id) || 0;
        itemSalesCount.set(item.inventory_item_id, prevCount + item.quantity);

        // Category margin tracking from actual sales
        const invItem = itemMap.get(item.inventory_item_id);
        if (invItem) {
          const cat = invItem.category;
          const existing = categorySales.get(cat);
          const revForItem = item.price_cents * item.quantity;
          const costForItem = invItem.cost_cents * item.quantity;
          if (existing) {
            existing.revenue_cents += revForItem;
            existing.cost_cents += costForItem;
            existing.units_sold += item.quantity;
          } else {
            categorySales.set(cat, {
              revenue_cents: revForItem,
              cost_cents: costForItem,
              units_sold: item.quantity,
            });
          }
        }
      }
    }

    // Fast movers: top 10 by sales in last 30 days
    const fastMovers: Array<{
      id: string;
      name: string;
      category: string;
      units_sold_30d: number;
      sales_per_week: number;
      current_stock: number;
      days_of_stock: number | null;
    }> = [];

    for (const [itemId, unitsSold] of itemSalesCount) {
      const inv = itemMap.get(itemId);
      if (!inv) continue;
      const salesPerWeek = Math.round((unitsSold / 30) * 7 * 10) / 10;
      const daysOfStock = salesPerWeek > 0 ? Math.round((inv.quantity / (unitsSold / 30))) : null;
      fastMovers.push({
        id: itemId,
        name: inv.name,
        category: inv.category,
        units_sold_30d: unitsSold,
        sales_per_week: salesPerWeek,
        current_stock: inv.quantity,
        days_of_stock: daysOfStock,
      });
    }
    fastMovers.sort((a, b) => b.units_sold_30d - a.units_sold_30d);
    const topFastMovers = fastMovers.slice(0, 10);

    // Dead stock: items with quantity > 0 that had zero or few sales in 30 days
    // Also compute last sale date from all-time ledger
    const itemLastSale = new Map<string, string>();
    for (const entry of allLedger) {
      if (entry.type !== "sale") continue;
      const meta = entry.metadata as Record<string, unknown> | null;
      if (!meta?.items) continue;
      const items = meta.items as Array<{ inventory_item_id: string }>;
      const dateStr = entry.created_at.toISOString().slice(0, 10);
      for (const item of items) {
        const existing = itemLastSale.get(item.inventory_item_id);
        if (!existing || dateStr > existing) {
          itemLastSale.set(item.inventory_item_id, dateStr);
        }
      }
    }

    const deadStock: Array<{
      id: string;
      name: string;
      category: string;
      quantity: number;
      cost_trapped_cents: number;
      retail_value_cents: number;
      last_sale_date: string | null;
      days_since_sale: number | null;
    }> = [];

    const todayStr = now.toISOString().slice(0, 10);
    for (const item of allInventory) {
      if (item.quantity <= 0) continue;
      // Exclude perpetual/service items (qty >= 900, e.g. cafe drinks at 999)
      if (item.quantity >= 900) continue;
      // Exclude food & drink category from dead stock analysis
      if (item.category === "food_drink") continue;
      const salesIn30d = itemSalesCount.get(item.id) || 0;
      if (salesIn30d > 0) continue; // Not dead if sold recently

      const lastSale = itemLastSale.get(item.id) || null;
      let daysSinceSale: number | null = null;
      if (lastSale) {
        daysSinceSale = Math.floor(
          (new Date(todayStr).getTime() - new Date(lastSale).getTime()) / (1000 * 60 * 60 * 24)
        );
      } else {
        // Never sold — use created_at as baseline
        daysSinceSale = Math.floor(
          (now.getTime() - item.created_at.getTime()) / (1000 * 60 * 60 * 24)
        );
      }

      const costTrapped = item.cost_cents * item.quantity;
      deadStock.push({
        id: item.id,
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        cost_trapped_cents: costTrapped,
        retail_value_cents: item.price_cents * item.quantity,
        last_sale_date: lastSale,
        days_since_sale: daysSinceSale,
      });
    }

    // Sort dead stock by cost trapped (highest first), take top 10
    deadStock.sort((a, b) => b.cost_trapped_cents - a.cost_trapped_cents);
    const topDeadStock = deadStock.slice(0, 10);

    // Summary dead stock stats by age bracket
    const deadStockSummary = {
      count_30d: 0,
      value_30d: 0,
      count_60d: 0,
      value_60d: 0,
      count_90d: 0,
      value_90d: 0,
    };
    for (const item of deadStock) {
      if (item.days_since_sale !== null) {
        if (item.days_since_sale >= 30) {
          deadStockSummary.count_30d++;
          deadStockSummary.value_30d += item.cost_trapped_cents;
        }
        if (item.days_since_sale >= 60) {
          deadStockSummary.count_60d++;
          deadStockSummary.value_60d += item.cost_trapped_cents;
        }
        if (item.days_since_sale >= 90) {
          deadStockSummary.count_90d++;
          deadStockSummary.value_90d += item.cost_trapped_cents;
        }
      }
    }

    // ---- Margin Analysis by Category (from actual 30-day sales) ----
    const marginAnalysis: Array<{
      category: string;
      revenue_cents: number;
      cost_cents: number;
      profit_cents: number;
      margin_percent: number;
      units_sold: number;
    }> = [];

    for (const [cat, sales] of categorySales) {
      const profit = sales.revenue_cents - sales.cost_cents;
      marginAnalysis.push({
        category: cat,
        revenue_cents: sales.revenue_cents,
        cost_cents: sales.cost_cents,
        profit_cents: profit,
        margin_percent: sales.revenue_cents > 0 ? Math.round((profit / sales.revenue_cents) * 100) : 0,
        units_sold: sales.units_sold,
      });
    }
    marginAnalysis.sort((a, b) => b.revenue_cents - a.revenue_cents);

    // ---- Trade-In ROI (all time) ----
    let tradeInTotalCost = 0;
    let tradeInTotalItems = 0;
    const tradeInItemIds = new Set<string>();

    for (const ti of tradeInsAllTime) {
      tradeInTotalCost += ti.total_payout_cents;
      for (const item of ti.items) {
        tradeInTotalItems += item.quantity;
        if (item.inventory_item_id) {
          tradeInItemIds.add(item.inventory_item_id);
        }
      }
    }

    // Estimate revenue from trade-in items that were later sold
    let tradeInRevenue = 0;
    let tradeInOutstandingValue = 0;
    for (const itemId of tradeInItemIds) {
      const salesCount = itemSalesCount.get(itemId) || 0;
      const inv = itemMap.get(itemId);
      if (inv) {
        // Approximate: any sales of trade-in items count as trade-in revenue
        tradeInRevenue += salesCount * inv.price_cents;
        // Outstanding: current stock of trade-in items
        if (inv.quantity > 0) {
          tradeInOutstandingValue += inv.quantity * inv.cost_cents;
        }
      }
    }

    // Per-category trade-in ROI
    const tradeInByCategory = new Map<string, { cost: number; revenue: number; items: number }>();
    for (const ti of tradeInsAllTime) {
      for (const item of ti.items) {
        const cat = item.category || "other";
        const existing = tradeInByCategory.get(cat) || { cost: 0, revenue: 0, items: 0 };
        existing.cost += item.offer_price_cents * item.quantity;
        existing.items += item.quantity;
        if (item.inventory_item_id) {
          const salesCount = itemSalesCount.get(item.inventory_item_id) || 0;
          const inv = itemMap.get(item.inventory_item_id);
          if (inv) existing.revenue += salesCount * inv.price_cents;
        }
        tradeInByCategory.set(cat, existing);
      }
    }

    const tradeInROI = {
      total_cost_cents: tradeInTotalCost,
      total_items_received: tradeInTotalItems,
      estimated_revenue_cents: tradeInRevenue,
      outstanding_value_cents: tradeInOutstandingValue,
      roi_percent: tradeInTotalCost > 0
        ? Math.round(((tradeInRevenue - tradeInTotalCost) / tradeInTotalCost) * 100)
        : 0,
      by_category: [...tradeInByCategory.entries()].map(([cat, data]) => ({
        category: cat,
        cost_cents: data.cost,
        revenue_cents: data.revenue,
        items: data.items,
        roi_percent: data.cost > 0 ? Math.round(((data.revenue - data.cost) / data.cost) * 100) : 0,
      })).sort((a, b) => b.revenue_cents - a.revenue_cents),
    };

    // ---- Trade-In Summary This Month ----
    const tradeInSummary = {
      count: tradeInsMonth.length,
      total_offer_cents: tradeInsMonth.reduce((s, t) => s + t.total_offer_cents, 0),
      total_payout_cents: tradeInsMonth.reduce((s, t) => s + t.total_payout_cents, 0),
      cash_payouts: tradeInsMonth.filter((t) => t.payout_type === "cash").length,
      credit_payouts: tradeInsMonth.filter((t) => t.payout_type === "credit").length,
    };

    // ---- Return Summary This Month ----
    const returnSummary = {
      count: returnsMonth.length,
      total_refunded_cents: returnsMonth.reduce((s, r) => s + r.total_refund_cents, 0),
      restocking_fees_collected_cents: returnsMonth.reduce(
        (s, r) => s + r.restocking_fee_cents,
        0
      ),
      cash_refunds: returnsMonth.filter((r) => r.refund_method === "cash").length,
      credit_refunds: returnsMonth.filter((r) => r.refund_method === "store_credit").length,
    };

    // ---- Outstanding Store Credit (liability) ----
    const outstandingCredit = {
      total_cents: customersWithCredit._sum.credit_balance_cents ?? 0,
      customer_count: customersWithCredit._count,
    };

    // ---- Month-over-month trend ----
    const monthTrend = {
      revenue_change_cents: monthAgg.gross_revenue_cents - prevMonthAgg.gross_revenue_cents,
      revenue_change_percent:
        prevMonthAgg.gross_revenue_cents > 0
          ? Math.round(
              ((monthAgg.gross_revenue_cents - prevMonthAgg.gross_revenue_cents) /
                prevMonthAgg.gross_revenue_cents) *
                100
            )
          : null,
      payout_change_cents: monthAgg.total_payouts_cents - prevMonthAgg.total_payouts_cents,
    };

    // ---- Category breakdown (sorted by cost basis) ----
    const categoryBreakdown = [...inventoryByCategory.values()].sort(
      (a, b) => b.cost_basis_cents - a.cost_basis_cents
    );

    // ---- Potential margin by category ----
    const categoryMargins = categoryBreakdown.map((cat) => ({
      ...cat,
      potential_margin_cents: cat.retail_value_cents - cat.cost_basis_cents,
      margin_percent:
        cat.retail_value_cents > 0
          ? Math.round(
              ((cat.retail_value_cents - cat.cost_basis_cents) / cat.retail_value_cents) * 100
            )
          : 0,
    }));

    // ---- Average days to sell per category ----
    const avgDaysToSellByCategory: Record<string, number | null> = {};
    for (const [cat, sales] of categorySales) {
      const catInv = inventoryByCategory.get(cat);
      if (catInv && sales.units_sold > 0) {
        // Rough estimate: (current stock / daily sales rate)
        // Cap perpetual-stock categories (food_drink uses qty 999 for always-available items)
        const effectiveUnits = cat === "food_drink"
          ? Math.min(catInv.total_units, sales.units_sold * 2)
          : catInv.total_units;
        const dailySalesRate = sales.units_sold / 30;
        avgDaysToSellByCategory[cat] = dailySalesRate > 0
          ? Math.round(effectiveUnits / dailySalesRate)
          : null;
      } else {
        avgDaysToSellByCategory[cat] = null;
      }
    }

    return NextResponse.json({
      // Time-based summaries
      today: todayAgg,
      this_week: weekAgg,
      this_month: monthAgg,
      all_time: allTimeAgg,
      month_trend: monthTrend,

      // Daily chart data
      daily_revenue: dailyRevenue,

      // Inventory capital
      inventory: {
        total_skus: allInventory.length,
        total_units: totalUnits,
        cost_basis_cents: totalCostBasis,
        retail_value_cents: totalRetailValue,
        potential_margin_cents: totalRetailValue - totalCostBasis,
        zero_stock_count: zeroStockCount,
      },

      // Where the money is trapped
      category_breakdown: categoryMargins,
      dead_stock: topDeadStock,
      dead_stock_summary: deadStockSummary,

      // Velocity
      fast_movers: topFastMovers,
      avg_days_to_sell: avgDaysToSellByCategory,

      // Margin analysis from actual sales
      margin_analysis: marginAnalysis,

      // Trade-in ROI
      trade_in_roi: tradeInROI,

      // Trade-ins & returns this month
      trade_ins: tradeInSummary,
      returns: returnSummary,

      // Liability
      outstanding_credit: outstandingCredit,
      total_customers: customerCount,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
