import { type TenantPrismaClient } from "./tenant-prisma";
import { prisma } from "./prisma";
import { formatCents } from "./types";
import { getStoreSettings, type StoreSettings } from "./store-settings-shared";

/* ------------------------------------------------------------------ */
/*  Store Intelligence Engine                                          */
/*  Analyzes store data and generates actionable insights.             */
/*  Philosophy: sentences not charts, actions not data, gamer not MBA. */
/*                                                                     */
/*  FLGS Vocabulary:                                                   */
/*    "Cards on the Bench"     = Dead stock / slow movers              */
/*    "Your Buying Power"      = Open-to-buy / available cash          */
/*    "Cash Runway"            = Days until you need to make a move    */
/*    "The Bench"              = Inventory not pulling its weight      */
/*    "Hot Sellers"            = Fast movers / high velocity           */
/*    "Regulars Going MIA"     = At-risk customers                    */
/*    "Credit on the Books"    = Outstanding store credit liability    */
/*    "Event Halo"             = Post-event purchase lift              */
/* ------------------------------------------------------------------ */

export interface Insight {
  id: string;
  type: "action" | "warning" | "opportunity" | "celebration";
  priority: "high" | "medium" | "low";
  icon: string;
  title: string;
  message: string;
  metric?: string;
  action?: { label: string; href: string };
  category: "inventory" | "customers" | "events" | "cash_flow" | "pricing" | "staff" | "operations";
  /** Raw data backing this insight — for drill-down / evidence display */
  data?: Record<string, unknown>;
}

const CATEGORY_LABELS: Record<string, string> = {
  tcg_single: "TCG Singles",
  sealed: "Sealed Product",
  board_game: "Board Games",
  miniature: "Miniatures",
  accessory: "Accessories",
  food_drink: "Cafe / Food",
  other: "Other",
};

function catLabel(cat: string) {
  return CATEGORY_LABELS[cat] ?? cat;
}

/** Get the current month (0-indexed) */
function currentMonth() {
  return new Date().getMonth();
}

/** Check if we're in Q4 holiday ramp (Oct-Dec) */
function isQ4() {
  const m = currentMonth();
  return m >= 9 && m <= 11;
}

/** Check if we're in the January cliff zone (Jan-Feb) */
function isJanuaryCliff() {
  const m = currentMonth();
  return m === 0 || m === 1;
}

/** Check if it's prerelease season (typically every ~3 months for MTG) */
function isPrereleaseSeason() {
  const m = currentMonth();
  // MTG sets typically release in Feb, Apr, Jun, Sep, Nov
  return [1, 3, 5, 8, 10].includes(m);
}

export async function generateInsights(
  db: TenantPrismaClient,
  storeId: string,
): Promise<Insight[]> {
  const insights: Insight[] = [];
  const now = new Date();

  // Load store settings for configurable thresholds
  const store = await db.posStore.findUnique({
    where: { id: storeId },
    select: { settings: true },
  });
  const settings = getStoreSettings(
    (store?.settings ?? {}) as Record<string, unknown>,
  );

  const deadStockDays = settings.intel_dead_stock_days || 30;
  const atRiskDays = settings.intel_at_risk_days || 14;
  const cashComfortDays = settings.intel_buylist_cash_comfort_days || 14;
  const creditLiabilityWarnPct = settings.intel_credit_liability_warn_percent || 50;

  const deadStockAgo = new Date(now);
  deadStockAgo.setDate(deadStockAgo.getDate() - deadStockDays);

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const atRiskAgo = new Date(now);
  atRiskAgo.setDate(atRiskAgo.getDate() - atRiskDays);

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const yesterdayStart = new Date(now);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  yesterdayStart.setHours(0, 0, 0, 0);
  const yesterdayEnd = new Date(now);
  yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
  yesterdayEnd.setHours(23, 59, 59, 999);

  const lastWeekSameDayStart = new Date(now);
  lastWeekSameDayStart.setDate(lastWeekSameDayStart.getDate() - 8);
  lastWeekSameDayStart.setHours(0, 0, 0, 0);
  const lastWeekSameDayEnd = new Date(now);
  lastWeekSameDayEnd.setDate(lastWeekSameDayEnd.getDate() - 8);
  lastWeekSameDayEnd.setHours(23, 59, 59, 999);

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
  thisWeekStart.setHours(0, 0, 0, 0);

  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  // ---- Run all queries in parallel ----
  const [
    allInventory,
    last30dLedger,
    yesterdayLedger,
    lastWeekSameDayLedger,
    thisWeekLedger,
    lastWeekLedger,
    allCustomers,
    upcomingEvents,
    pastEvents,
    todayTimeEntries,
    customersWithCredit,
    newCustomers,
    totalCreditBalance,
    tradeInsLast30d,
  ] = await Promise.all([
    db.posInventoryItem.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        category: true,
        price_cents: true,
        cost_cents: true,
        quantity: true,
        low_stock_threshold: true,
        created_at: true,
      },
    }),

    db.posLedgerEntry.findMany({
      where: { created_at: { gte: thirtyDaysAgo } },
      select: {
        type: true,
        amount_cents: true,
        credit_amount_cents: true,
        metadata: true,
        created_at: true,
        customer_id: true,
        event_id: true,
      },
    }),

    db.posLedgerEntry.findMany({
      where: { created_at: { gte: yesterdayStart, lte: yesterdayEnd } },
      select: { type: true, amount_cents: true },
    }),

    db.posLedgerEntry.findMany({
      where: { created_at: { gte: lastWeekSameDayStart, lte: lastWeekSameDayEnd } },
      select: { type: true, amount_cents: true },
    }),

    db.posLedgerEntry.findMany({
      where: { created_at: { gte: thisWeekStart } },
      select: { type: true, amount_cents: true },
    }),

    db.posLedgerEntry.findMany({
      where: { created_at: { gte: lastWeekStart, lt: thisWeekStart } },
      select: { type: true, amount_cents: true },
    }),

    db.posCustomer.findMany({
      select: {
        id: true,
        name: true,
        credit_balance_cents: true,
        created_at: true,
        ledger_entries: {
          select: { amount_cents: true, created_at: true, type: true },
          orderBy: { created_at: "desc" as const },
        },
      },
    }),

    db.posEvent.findMany({
      where: { starts_at: { gte: now, lte: new Date(now.getTime() + 7 * 86400000) } },
      select: { id: true, name: true, starts_at: true, entry_fee_cents: true },
    }),

    db.posEvent.findMany({
      where: {
        starts_at: {
          gte: new Date(now.getTime() - 60 * 86400000),
          lt: now,
        },
      },
      select: {
        id: true,
        name: true,
        event_type: true,
        starts_at: true,
        entry_fee_cents: true,
        checkins: { select: { id: true, customer_id: true } },
        ledger_entries: { select: { amount_cents: true, type: true } },
      },
    }),

    db.posTimeEntry.findMany({
      where: { clock_in: { gte: todayStart } },
      select: { id: true },
    }),

    db.posCustomer.findMany({
      where: { credit_balance_cents: { gt: 5000 } },
      select: { id: true, name: true, credit_balance_cents: true, updated_at: true },
    }),

    db.posCustomer.findMany({
      where: { created_at: { gte: sevenDaysAgo } },
      select: { id: true, name: true, created_at: true },
    }),

    // Total outstanding store credit across ALL customers
    db.posCustomer.aggregate({
      where: { credit_balance_cents: { gt: 0 } },
      _sum: { credit_balance_cents: true },
      _count: true,
    }),

    // Trade-ins in the last 30 days for buylist analysis
    db.posTradeIn.findMany({
      where: { created_at: { gte: thirtyDaysAgo } },
      select: {
        total_offer_cents: true,
        total_payout_cents: true,
        payout_type: true,
        created_at: true,
      },
    }),
  ]);

  // ---- Build velocity maps ----
  const itemSalesCount = new Map<string, number>();
  const customerLastPurchase = new Map<string, Date>();
  const customerTotalSpend = new Map<string, number>();

  for (const entry of last30dLedger) {
    if (entry.type === "sale" && entry.customer_id) {
      const existing = customerLastPurchase.get(entry.customer_id);
      if (!existing || entry.created_at > existing) {
        customerLastPurchase.set(entry.customer_id, entry.created_at);
      }
    }

    if (entry.type === "sale") {
      const meta = entry.metadata as Record<string, unknown> | null;
      if (meta?.items) {
        const items = meta.items as Array<{ inventory_item_id: string; quantity: number }>;
        for (const item of items) {
          const prev = itemSalesCount.get(item.inventory_item_id) || 0;
          itemSalesCount.set(item.inventory_item_id, prev + item.quantity);
        }
      }
    }
  }

  for (const c of allCustomers) {
    let total = 0;
    for (const le of c.ledger_entries) {
      if (le.type === "sale") total += le.amount_cents;
    }
    customerTotalSpend.set(c.id, total);
  }

  // ---- Compute cash flow metrics for Liquidity Runway ----
  const monthlyFixedCosts =
    (settings.intel_monthly_rent || 0) +
    (settings.intel_monthly_utilities || 0) +
    (settings.intel_monthly_insurance || 0) +
    (settings.intel_monthly_payroll || 0) +
    (settings.intel_monthly_other_fixed || 0);
  const dailyFixedCosts = monthlyFixedCosts / 30;

  // 30-day revenue and COGS
  let revenue30d = 0;
  let payouts30d = 0;
  for (const e of last30dLedger) {
    if (e.type === "sale" || e.type === "event_fee") revenue30d += e.amount_cents;
    if (e.type === "trade_in" || e.type === "refund") payouts30d += Math.abs(e.amount_cents);
  }
  const dailyRevenue = revenue30d / 30;
  const dailyPayouts = payouts30d / 30;
  const dailyNetCash = dailyRevenue - dailyPayouts - dailyFixedCosts * 100; // convert dollars to cents

  // Total cost tied up in inventory
  const totalInventoryCost = allInventory.reduce((s, i) => s + i.cost_cents * i.quantity, 0);

  // ---- LIQUIDITY RUNWAY ----
  if (monthlyFixedCosts > 0) {
    const monthlyRevenue = revenue30d;
    const monthlyObligations = monthlyFixedCosts * 100 + payouts30d;
    const monthlyNetCash = monthlyRevenue - monthlyObligations;

    // If store has entered their current cash balance, calculate real runway
    const cashBalanceCents = (settings.current_cash_balance_cents as number) || 0;

    if (monthlyNetCash <= 0) {
      // Losing money — calculate how long cash lasts
      const dailyBurnRate = Math.abs(monthlyNetCash) / 30;
      const runwayDays = cashBalanceCents > 0 && dailyBurnRate > 0
        ? Math.max(0, Math.round(cashBalanceCents / dailyBurnRate))
        : Math.max(0, Math.round((monthlyRevenue / (monthlyFixedCosts * 100)) * 30));

      insights.push({
        id: "liquidity-runway",
        type: "warning",
        priority: runwayDays <= 14 ? "high" : "medium",
        icon: "\u{1F6A8}",
        title: `Cash Runway: ~${runwayDays} days`,
        message: runwayDays <= 7
          ? `At your current pace, you'll have trouble covering rent and payroll within a week. Time to run a sale on slow movers, push events harder, or hold off on new orders.`
          : runwayDays <= 14
            ? `Your cash is getting tight. Revenue isn't covering your fixed costs at this pace. Consider a flash sale on bench warmers, or shift buylists to store credit to conserve cash.`
            : `You've got about a month of runway. Not an emergency, but keep an eye on it. Focus on turning inventory faster and filling your event calendar.`,
        metric: `${runwayDays}d`,
        action: { label: "View Cash Flow", href: "/dashboard/cash-flow" },
        category: "cash_flow",
      });
    } else {
      // Profitable — show actual margin, not a fake "90 days"
      const marginPercent = Math.round((monthlyNetCash / monthlyRevenue) * 100);
      insights.push({
        id: "liquidity-runway",
        type: "celebration",
        priority: "low",
        icon: "\u{1F4AA}",
        title: "Cash flow is positive",
        message: `Revenue (${formatCents(monthlyRevenue)}) covers your monthly nut ($${monthlyFixedCosts.toLocaleString()}) with ${formatCents(monthlyNetCash)} to spare. That's a ${marginPercent}% operating margin after fixed costs.`,
        metric: `+${formatCents(monthlyNetCash)}`,
        action: { label: "View Cash Flow", href: "/dashboard/cash-flow" },
        category: "cash_flow",
      });
    }

    // Open-to-Buy / Buying Power
    const monthlyProfit = monthlyRevenue - monthlyObligations;
    if (monthlyProfit > 0) {
      const buyingPower = Math.round(monthlyProfit * 0.4); // 40% of net profit can go to new inventory
      insights.push({
        id: "buying-power",
        type: "opportunity",
        priority: "low",
        icon: "\u{1F4B0}",
        title: `Your Buying Power: ~${formatCents(buyingPower)}/month`,
        message: `Based on your revenue minus fixed costs, you can safely spend about ${formatCents(buyingPower)} on new inventory this month without stretching thin.`,
        action: { label: "View Inventory", href: "/dashboard/inventory" },
        category: "cash_flow",
      });
    }
  }

  // ---- STORE CREDIT LIABILITY ----
  const totalOutstandingCredit = totalCreditBalance._sum.credit_balance_cents || 0;
  const creditCustomerCount = totalCreditBalance._count || 0;

  if (totalOutstandingCredit > 0 && revenue30d > 0) {
    const creditPctOfRevenue = Math.round((totalOutstandingCredit / revenue30d) * 100);

    if (creditPctOfRevenue >= creditLiabilityWarnPct) {
      insights.push({
        id: "credit-liability",
        type: "warning",
        priority: creditPctOfRevenue > 100 ? "high" : "medium",
        icon: "\u{1F4B3}",
        title: `${formatCents(totalOutstandingCredit)} in credit on the books`,
        message: creditPctOfRevenue > 100
          ? `Your outstanding store credit is MORE than your monthly revenue. That's ${creditCustomerCount} customer${creditCustomerCount > 1 ? "s" : ""} holding IOUs. When they all come to spend, you're giving away product at full cost. Consider slowing down cash trade-in offers and pushing a "spend your credit" week.`
          : `Store credit outstanding is ${creditPctOfRevenue}% of your monthly revenue — ${creditCustomerCount} customer${creditCustomerCount > 1 ? "s" : ""} have balances. That's a liability on your books. Not dangerous yet, but worth watching.`,
        metric: formatCents(totalOutstandingCredit),
        action: { label: "View Customers", href: "/dashboard/customers" },
        category: "cash_flow",
      });
    }

    // Credit redemption modeling — estimate how much will come back
    // Look at credit usage in last 30 days
    const creditRedemptions = last30dLedger.filter(
      (e) => e.type === "sale" && (e.credit_amount_cents || 0) > 0,
    );
    const totalRedeemed30d = creditRedemptions.reduce(
      (s, e) => s + (e.credit_amount_cents || 0),
      0,
    );

    if (totalRedeemed30d > 0 && totalOutstandingCredit > 0) {
      const monthlyRedemptionRate = Math.round((totalRedeemed30d / totalOutstandingCredit) * 100);
      const monthsToRedeem = monthlyRedemptionRate > 0
        ? Math.round(100 / monthlyRedemptionRate)
        : 99;

      if (monthsToRedeem > 6) {
        insights.push({
          id: "credit-velocity",
          type: "opportunity",
          priority: "low",
          icon: "\u{1F3AF}",
          title: `Store credit is moving slowly`,
          message: `At the current redemption rate (${monthlyRedemptionRate}%/month), it would take ~${monthsToRedeem} months to cycle through outstanding credit. A "double credit value" event or exclusive credit-only deals could speed this up.`,
          category: "cash_flow",
        });
      }
    }
  }

  // ---- CASH-POSITION-AWARE BUYLIST ----
  if (monthlyFixedCosts > 0) {
    const monthlyObligations = monthlyFixedCosts * 100 + payouts30d;
    const cashTight = revenue30d < monthlyObligations;

    // Check trade-in payout method split
    const cashTradeIns = tradeInsLast30d.filter((t) => t.payout_type === "cash");
    const creditTradeIns = tradeInsLast30d.filter((t) => t.payout_type === "credit");
    const cashTradeInTotal = cashTradeIns.reduce((s, t) => s + t.total_payout_cents, 0);
    const creditTradeInTotal = creditTradeIns.reduce((s, t) => s + t.total_payout_cents, 0);

    if (cashTight && cashTradeInTotal > creditTradeInTotal && tradeInsLast30d.length > 0) {
      insights.push({
        id: "buylist-cash-shift",
        type: "action",
        priority: "high",
        icon: "\u{1F4B8}",
        title: "Shift buylists toward store credit",
        message: `Cash is tight and ${Math.round((cashTradeInTotal / (cashTradeInTotal + creditTradeInTotal)) * 100)}% of your trade-in payouts are going out as cash. Bump your credit bonus to ${settings.trade_in_credit_bonus_percent || 30}%+ and steer customers toward credit. It keeps cash in the register and still moves cards.`,
        action: { label: "Trade-In Settings", href: "/dashboard/settings" },
        category: "pricing",
      });
    } else if (!cashTight && settings.intel_prefer_credit_buylists && creditTradeInTotal > cashTradeInTotal * 3) {
      // Cash is healthy but they're over-indexing on credit
      insights.push({
        id: "buylist-credit-heavy",
        type: "opportunity",
        priority: "low",
        icon: "\u2696\uFE0F",
        title: "Cash is healthy — you can offer more cash on buylists",
        message: `You're in a comfortable cash position and most trade-ins are going to credit. Offering competitive cash offers could attract bigger collections and new customers who don't have credit balances.`,
        category: "pricing",
      });
    }
  }

  // ---- INVENTORY INSIGHTS (FLGS vocabulary) ----

  // Reorder Alerts — "Your shelves need restocking"
  const lowStockItems: Array<{
    name: string;
    quantity: number;
    velocity: number;
    daysUntilStockout: number | null;
  }> = [];

  for (const item of allInventory) {
    if (item.quantity >= 900) continue;
    if (item.category === "food_drink") continue;

    const sales30d = itemSalesCount.get(item.id) || 0;
    const dailyVelocity = sales30d / 30;
    const weeklyVelocity = dailyVelocity * 7;

    if (item.quantity <= item.low_stock_threshold && item.quantity > 0) {
      const daysUntilStockout = dailyVelocity > 0 ? Math.round(item.quantity / dailyVelocity) : null;
      lowStockItems.push({
        name: item.name,
        quantity: item.quantity,
        velocity: Math.round(weeklyVelocity * 10) / 10,
        daysUntilStockout,
      });
    }
  }

  if (lowStockItems.length > 0) {
    lowStockItems.sort((a, b) => (a.daysUntilStockout ?? 999) - (b.daysUntilStockout ?? 999));
    const top = lowStockItems[0];
    const urgency = top.daysUntilStockout !== null && top.daysUntilStockout <= 7
      ? `Order by ${new Date(now.getTime() + (top.daysUntilStockout - 2) * 86400000).toLocaleDateString("en-US", { weekday: "long" })} or you'll be out.`
      : "Time to reorder before customers notice.";

    insights.push({
      id: "reorder-alert",
      type: "action",
      priority: "high",
      icon: "\u{1F6A8}",
      title: `${lowStockItems.length} item${lowStockItems.length > 1 ? "s" : ""} running low`,
      message: lowStockItems.length === 1
        ? `${top.name}: only ${top.quantity} left, selling ${top.velocity}/week. ${urgency}`
        : `${top.name} is most urgent — ${top.quantity} left, selling ${top.velocity}/week. ${urgency} ${lowStockItems.length - 1} more also need attention.`,
      metric: `${lowStockItems.length}`,
      action: { label: "Create Purchase Order", href: "/dashboard/purchase-orders" },
      category: "inventory",
    });
  }

  // Dead Stock — "Cards on the Bench"
  const benchItems: Array<{ name: string; costTrapped: number; daysSince: number }> = [];
  for (const item of allInventory) {
    if (item.quantity <= 0 || item.quantity >= 900 || item.category === "food_drink") continue;
    const sales30d = itemSalesCount.get(item.id) || 0;
    if (sales30d > 0) continue;

    const daysSinceCreated = Math.floor((now.getTime() - item.created_at.getTime()) / 86400000);
    if (daysSinceCreated >= deadStockDays) {
      benchItems.push({
        name: item.name,
        costTrapped: item.cost_cents * item.quantity,
        daysSince: daysSinceCreated,
      });
    }
  }

  if (benchItems.length > 0) {
    const totalTrapped = benchItems.reduce((s, d) => s + d.costTrapped, 0);
    insights.push({
      id: "bench-warmers",
      type: "warning",
      priority: totalTrapped > 50000 ? "high" : "medium",
      icon: "\u{1F4E6}",
      title: `${formatCents(totalTrapped)} sitting on the bench`,
      message: `${benchItems.length} item${benchItems.length > 1 ? "s" : ""} with zero sales in ${deadStockDays}+ days. That's cash trapped on your shelves doing nothing. Mark these down, bundle them, or run a clearance event to free up buying power.`,
      metric: formatCents(totalTrapped),
      action: { label: "Run a Promotion", href: "/dashboard/promotions" },
      category: "inventory",
    });
  }

  // Overstock — "Too deep on these"
  const overstockItems: Array<{ name: string; quantity: number; monthlyVelocity: number; monthsOfStock: number }> = [];
  for (const item of allInventory) {
    if (item.quantity <= 0 || item.quantity >= 900 || item.category === "food_drink") continue;
    const sales30d = itemSalesCount.get(item.id) || 0;
    if (sales30d === 0) continue;
    const monthlyVelocity = sales30d;
    if (item.quantity > monthlyVelocity * 3) {
      const monthsOfStock = Math.round((item.quantity / monthlyVelocity) * 10) / 10;
      overstockItems.push({
        name: item.name,
        quantity: item.quantity,
        monthlyVelocity,
        monthsOfStock,
      });
    }
  }

  if (overstockItems.length > 0) {
    overstockItems.sort((a, b) => b.monthsOfStock - a.monthsOfStock);
    const top = overstockItems[0];
    insights.push({
      id: "overstock",
      type: "opportunity",
      priority: "low",
      icon: "\u{1F4CA}",
      title: `Too deep on ${overstockItems.length} item${overstockItems.length > 1 ? "s" : ""}`,
      message: `${top.quantity} of "${top.name}" but you only move ${top.monthlyVelocity}/month — that's ${top.monthsOfStock} months of stock. Your cash is better off in things that actually sell.`,
      action: { label: "Adjust Pricing", href: "/dashboard/singles/pricing" },
      category: "inventory",
    });
  }

  // ---- CUSTOMER INSIGHTS ----

  // Regulars Going MIA
  const miaCustomers: Array<{ name: string; lifetimeSpend: number; daysSinceVisit: number }> = [];
  for (const c of allCustomers) {
    const lifetime = customerTotalSpend.get(c.id) || 0;
    if (lifetime < 20000) continue; // $200 minimum

    const lastPurchaseEntries = c.ledger_entries.filter(le => le.type === "sale");
    if (lastPurchaseEntries.length === 0) continue;
    const lastPurchase = lastPurchaseEntries[0]?.created_at;
    if (!lastPurchase) continue;

    const daysSince = Math.floor((now.getTime() - new Date(lastPurchase).getTime()) / 86400000);
    if (daysSince >= atRiskDays) {
      miaCustomers.push({
        name: c.name,
        lifetimeSpend: lifetime,
        daysSinceVisit: daysSince,
      });
    }
  }

  if (miaCustomers.length > 0) {
    miaCustomers.sort((a, b) => b.lifetimeSpend - a.lifetimeSpend);
    const top = miaCustomers[0];
    const weeksGone = Math.floor(top.daysSinceVisit / 7);
    insights.push({
      id: "regulars-mia",
      type: "warning",
      priority: "medium",
      icon: "\u{1F441}\uFE0F",
      title: `${top.name} hasn't been in for ${weeksGone} week${weeksGone > 1 ? "s" : ""}`,
      message: miaCustomers.length === 1
        ? `${top.name} has spent ${formatCents(top.lifetimeSpend)} lifetime but hasn't been around in ${top.daysSinceVisit} days. A text or shout-out at the next event could bring them back.`
        : `${top.name} (${formatCents(top.lifetimeSpend)} lifetime) and ${miaCustomers.length - 1} other regular${miaCustomers.length > 2 ? "s" : ""} have gone quiet. These are the people who keep the lights on — worth a personal reach-out.`,
      metric: `${miaCustomers.length}`,
      action: { label: "View Customers", href: "/dashboard/customers" },
      category: "customers",
    });
  }

  // VIP Hot Streak
  const weeklySpenders = new Map<string, { name: string; spent: number }>();
  for (const entry of last30dLedger) {
    if (entry.type !== "sale" || !entry.customer_id) continue;
    if (entry.created_at < sevenDaysAgo) continue;
    const customer = allCustomers.find(c => c.id === entry.customer_id);
    if (!customer) continue;
    const existing = weeklySpenders.get(entry.customer_id);
    if (existing) {
      existing.spent += entry.amount_cents;
    } else {
      weeklySpenders.set(entry.customer_id, { name: customer.name, spent: entry.amount_cents });
    }
  }

  const topSpender = [...weeklySpenders.entries()]
    .filter(([, v]) => v.spent >= 10000)
    .sort(([, a], [, b]) => b.spent - a.spent)[0];

  if (topSpender) {
    const [, spender] = topSpender;
    insights.push({
      id: "vip-hot-streak",
      type: "celebration",
      priority: "low",
      icon: "\u{1F525}",
      title: `${spender.name} dropped ${formatCents(spender.spent)} this week`,
      message: `${spender.name} is on fire. Thank them — a handwritten note, a free promo pack, or even just remembering their name goes a long way.`,
      metric: formatCents(spender.spent),
      action: { label: "View Customers", href: "/dashboard/customers" },
      category: "customers",
    });
  }

  // New Customers
  const newCustomersWithPurchase = newCustomers.filter(c => {
    const entries = allCustomers.find(ac => ac.id === c.id)?.ledger_entries || [];
    return entries.some(le => le.type === "sale");
  });

  if (newCustomersWithPurchase.length > 0) {
    insights.push({
      id: "new-faces",
      type: "celebration",
      priority: "low",
      icon: "\u{1F389}",
      title: `${newCustomersWithPurchase.length} new face${newCustomersWithPurchase.length > 1 ? "s" : ""} this week`,
      message: `Fresh blood! ${newCustomersWithPurchase.length} new customer${newCustomersWithPurchase.length > 1 ? "s" : ""} made a purchase. First impressions are everything — make sure they feel like part of the community.`,
      category: "customers",
    });
  }

  // Credit Sitting — "Credit waiting to be spent"
  const staleCredit = customersWithCredit.filter(c => {
    const daysSinceUpdate = Math.floor((now.getTime() - new Date(c.updated_at).getTime()) / 86400000);
    return daysSinceUpdate >= 30;
  });

  if (staleCredit.length > 0) {
    const totalCredit = staleCredit.reduce((s, c) => s + c.credit_balance_cents, 0);
    insights.push({
      id: "credit-waiting",
      type: "opportunity",
      priority: "medium",
      icon: "\u{1F4B0}",
      title: `${formatCents(totalCredit)} in credit collecting dust`,
      message: `${staleCredit.length} customer${staleCredit.length > 1 ? "s" : ""} ha${staleCredit.length > 1 ? "ve" : "s"} credit sitting for 30+ days. That's potential revenue just waiting for a nudge. "Hey, you've got $${Math.round(totalCredit / 100)} in credit — new set drops Friday!"`,
      metric: formatCents(totalCredit),
      action: { label: "View Customers", href: "/dashboard/customers" },
      category: "customers",
    });
  }

  // ---- EVENT INSIGHTS ----

  // Event Halo Effect — purchases within 7 days after event attendance
  if (pastEvents.length > 0) {
    const eventROI = pastEvents.map(e => {
      let totalRevenue = 0;
      for (const le of e.ledger_entries) {
        if (le.type === "sale" || le.type === "event_fee") {
          totalRevenue += le.amount_cents;
        }
      }
      return {
        name: e.name,
        type: e.event_type,
        revenue: totalRevenue,
        attendees: e.checkins.length,
        date: e.starts_at,
      };
    }).filter(e => e.attendees > 0 || e.revenue > 0);

    if (eventROI.length >= 2) {
      eventROI.sort((a, b) => b.revenue - a.revenue);
      const best = eventROI[0];
      const worst = eventROI[eventROI.length - 1];

      if (best.revenue > 0) {
        const perPlayer = best.attendees > 0 ? Math.round(best.revenue / best.attendees) : 0;
        insights.push({
          id: "best-event",
          type: "celebration",
          priority: "low",
          icon: "\u{1F3C6}",
          title: `${best.name} is your money maker`,
          message: `${formatCents(best.revenue)} from ${best.attendees} players${perPlayer > 0 ? ` (${formatCents(perPlayer)}/player)` : ""}. This is the type of event that pays rent. Run it more often.`,
          metric: formatCents(best.revenue),
          action: { label: "View Events", href: "/dashboard/events" },
          category: "events",
        });
      }

      if (worst.revenue < best.revenue * 0.5 && worst.revenue > 0) {
        insights.push({
          id: "weak-event",
          type: "opportunity",
          priority: "low",
          icon: "\u{1F4C9}",
          title: `${worst.name} needs a boost`,
          message: `Only ${formatCents(worst.revenue)} — less than half your best event. Try a different night, add prizes, or shake up the format. If it's not bringing people in, your time is better spent elsewhere.`,
          action: { label: "View Events", href: "/dashboard/events" },
          category: "events",
        });
      }
    }
  }

  // No Events Scheduled
  if (upcomingEvents.length === 0) {
    insights.push({
      id: "no-events",
      type: "action",
      priority: "medium",
      icon: "\u{1F4C5}",
      title: "Nothing on the calendar this week",
      message: "Events are what separate you from Amazon. FNM, Commander nights, board game meetups — they bring regulars through the door who buy singles, snacks, and sleeves. An empty calendar is a quiet register.",
      action: { label: "Schedule an Event", href: "/dashboard/events" },
      category: "events",
    });
  }

  // ---- WPN METRICS ----
  if (settings.intel_wpn_level && settings.intel_wpn_level !== "none") {
    const wpnLevel = settings.intel_wpn_level;
    const eventCount60d = pastEvents.filter(e => {
      const type = e.event_type?.toLowerCase() || "";
      return type.includes("fnm") || type.includes("draft") || type.includes("prerelease") || type.includes("tournament");
    }).length;

    // WPN targets (approximate — actual Wizards targets vary)
    const wpnTargets: Record<string, { events: number; engaged: number }> = {
      core: { events: 4, engaged: 24 },
      advanced: { events: 8, engaged: 48 },
      premium: { events: 12, engaged: 96 },
    };

    const target = wpnTargets[wpnLevel];
    if (target) {
      const monthlyEvents = Math.round(eventCount60d / 2);
      if (monthlyEvents < target.events) {
        insights.push({
          id: "wpn-events",
          type: "action",
          priority: "medium",
          icon: "\u{1FA84}",
          title: `WPN ${wpnLevel.charAt(0).toUpperCase() + wpnLevel.slice(1)}: need more events`,
          message: `You ran ~${monthlyEvents} sanctioned events last month. WPN ${wpnLevel} targets ~${target.events}/month. Schedule a few more FNMs or draft nights to stay on track.`,
          action: { label: "Create Event", href: "/dashboard/events" },
          category: "events",
        });
      }

      // Unique engaged players
      const uniquePlayers = new Set<string>();
      for (const e of pastEvents) {
        for (const c of e.checkins) {
          if (c.customer_id) uniquePlayers.add(c.customer_id);
        }
      }
      const monthlyEngaged = Math.round(uniquePlayers.size / 2); // 60 days / 2

      if (monthlyEngaged < target.engaged) {
        insights.push({
          id: "wpn-engagement",
          type: "opportunity",
          priority: "low",
          icon: "\u{1F465}",
          title: `WPN engagement: ${monthlyEngaged}/${target.engaged} unique players`,
          message: `WPN ${wpnLevel} wants ~${target.engaged} unique players per month. You're at ${monthlyEngaged}. Bring-a-friend promos or beginner-friendly events could close the gap.`,
          action: { label: "View Events", href: "/dashboard/events" },
          category: "events",
        });
      }
    }
  }

  // ---- SEASONAL INTELLIGENCE ----
  if (settings.intel_seasonal_warnings !== false) {
    if (isQ4()) {
      // Q4 overspending warning
      insights.push({
        id: "q4-warning",
        type: "warning",
        priority: "medium",
        icon: "\u{1F384}",
        title: "Holiday season: don't overstock",
        message: "Q4 is exciting but January is coming. Order for demand, not for hype. Sealed product that doesn't move by Dec 31 becomes dead weight in January when everyone is broke. Keep your orders tight.",
        category: "operations",
      });
    }

    if (isJanuaryCliff()) {
      insights.push({
        id: "january-cliff",
        type: "warning",
        priority: "high",
        icon: "\u{1F9CA}",
        title: "January cliff: cash conservation mode",
        message: "Post-holiday slump hits game stores hard. Foot traffic and spend drop 30-50% in Jan/Feb. Hold off on big orders, push events to keep regulars coming in, and lean into trade-ins (credit, not cash). This is survival season.",
        category: "cash_flow",
      });
    }

    if (isPrereleaseSeason()) {
      insights.push({
        id: "prerelease-prep",
        type: "opportunity",
        priority: "low",
        icon: "\u{1F3AE}",
        title: "Prerelease season incoming",
        message: "New set drops are your biggest revenue weekends. Make sure you've got enough sealed product ordered, events scheduled, and staff lined up. Prerelease weekends can make your whole month.",
        action: { label: "View Events", href: "/dashboard/events" },
        category: "events",
      });
    }
  }

  // ---- CASH FLOW INSIGHTS ----

  // Daily Summary
  let yesterdayRevenue = 0;
  let yesterdayPayouts = 0;
  for (const e of yesterdayLedger) {
    if (e.type === "sale" || e.type === "event_fee") yesterdayRevenue += e.amount_cents;
    if (e.type === "trade_in" || e.type === "refund") yesterdayPayouts += Math.abs(e.amount_cents);
  }

  let lastWeekSameDayRevenue = 0;
  for (const e of lastWeekSameDayLedger) {
    if (e.type === "sale" || e.type === "event_fee") lastWeekSameDayRevenue += e.amount_cents;
  }

  if (yesterdayRevenue > 0 || yesterdayPayouts > 0) {
    const net = yesterdayRevenue - yesterdayPayouts;
    let comparison = "";
    if (lastWeekSameDayRevenue > 0) {
      const changePct = Math.round(((yesterdayRevenue - lastWeekSameDayRevenue) / lastWeekSameDayRevenue) * 100);
      comparison = changePct >= 0
        ? ` That's up ${changePct}% from the same day last week.`
        : ` That's down ${Math.abs(changePct)}% from the same day last week.`;
    }

    insights.push({
      id: "daily-summary",
      type: net >= 0 ? "celebration" : "warning",
      priority: "low",
      icon: net >= 0 ? "\u2600\uFE0F" : "\u{1F327}\uFE0F",
      title: `Yesterday: ${formatCents(net)} net`,
      message: `Took in ${formatCents(yesterdayRevenue)}, paid out ${formatCents(yesterdayPayouts)}.${comparison}`,
      metric: formatCents(net),
      action: { label: "View Cash Flow", href: "/dashboard/cash-flow" },
      category: "cash_flow",
    });
  }

  // Weekly Revenue Trend
  let thisWeekRevenue = 0;
  for (const e of thisWeekLedger) {
    if (e.type === "sale" || e.type === "event_fee") thisWeekRevenue += e.amount_cents;
  }
  let lastWeekRevenue = 0;
  for (const e of lastWeekLedger) {
    if (e.type === "sale" || e.type === "event_fee") lastWeekRevenue += e.amount_cents;
  }

  if (lastWeekRevenue > 0 && thisWeekRevenue > 0) {
    const changePct = Math.round(((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100);
    if (changePct > 0) {
      insights.push({
        id: "week-trend-up",
        type: "celebration",
        priority: "low",
        icon: "\u{1F4C8}",
        title: `Revenue up ${changePct}% vs last week`,
        message: `${formatCents(thisWeekRevenue)} this week vs ${formatCents(lastWeekRevenue)} last week. Whatever you did, do more of it.`,
        category: "cash_flow",
      });
    } else if (changePct < -15) {
      insights.push({
        id: "week-trend-down",
        type: "warning",
        priority: "medium",
        icon: "\u{1F4C9}",
        title: `Revenue down ${Math.abs(changePct)}% vs last week`,
        message: `${formatCents(thisWeekRevenue)} this week vs ${formatCents(lastWeekRevenue)} last week. Was there an event last week that you didn't run this week? Check your event calendar.`,
        action: { label: "View Events", href: "/dashboard/events" },
        category: "cash_flow",
      });
    }
  }

  // Margin Alert
  const totalRevenue30d = last30dLedger
    .filter(e => e.type === "sale")
    .reduce((s, e) => s + e.amount_cents, 0);

  if (totalRevenue30d > 0) {
    let totalCost30d = 0;
    for (const entry of last30dLedger) {
      if (entry.type !== "sale") continue;
      const meta = entry.metadata as Record<string, unknown> | null;
      if (!meta?.items) continue;
      const items = meta.items as Array<{ inventory_item_id: string; quantity: number }>;
      for (const it of items) {
        const inv = allInventory.find(i => i.id === it.inventory_item_id);
        if (inv) totalCost30d += inv.cost_cents * it.quantity;
      }
    }

    const marginPct = Math.round(((totalRevenue30d - totalCost30d) / totalRevenue30d) * 100);
    if (marginPct < 30 && marginPct > 0) {
      let lowestMarginCat = "";
      let lowestMarginPct = 100;
      const catMargins = new Map<string, { rev: number; cost: number }>();
      for (const entry of last30dLedger) {
        if (entry.type !== "sale") continue;
        const meta = entry.metadata as Record<string, unknown> | null;
        if (!meta?.items) continue;
        const items = meta.items as Array<{ inventory_item_id: string; quantity: number; price_cents: number }>;
        for (const it of items) {
          const inv = allInventory.find(i => i.id === it.inventory_item_id);
          if (!inv) continue;
          const existing = catMargins.get(inv.category) || { rev: 0, cost: 0 };
          existing.rev += it.price_cents * it.quantity;
          existing.cost += inv.cost_cents * it.quantity;
          catMargins.set(inv.category, existing);
        }
      }

      for (const [cat, data] of catMargins) {
        if (data.rev > 0) {
          const m = Math.round(((data.rev - data.cost) / data.rev) * 100);
          if (m < lowestMarginPct) {
            lowestMarginPct = m;
            lowestMarginCat = cat;
          }
        }
      }

      insights.push({
        id: "margin-squeeze",
        type: "warning",
        priority: "high",
        icon: "\u{1F4C9}",
        title: `Margins are thin: ${marginPct}%`,
        message: `Game stores need 35%+ blended margin to stay healthy. You're at ${marginPct}%.${lowestMarginCat ? ` ${catLabel(lowestMarginCat)} at ${lowestMarginPct}% is the biggest drag.` : ""} Review your pricing or cut deals with distributors.`,
        action: { label: "View Cash Flow", href: "/dashboard/cash-flow" },
        category: "cash_flow",
      });
    }
  }

  // Cash in Inventory — "Capital locked in product"
  if (totalInventoryCost > 0) {
    const catCosts = new Map<string, number>();
    for (const item of allInventory) {
      const cost = item.cost_cents * item.quantity;
      catCosts.set(item.category, (catCosts.get(item.category) || 0) + cost);
    }
    let topCat = "";
    let topCatCost = 0;
    for (const [cat, cost] of catCosts) {
      if (cost > topCatCost) {
        topCat = cat;
        topCatCost = cost;
      }
    }
    const topCatPct = Math.round((topCatCost / totalInventoryCost) * 100);

    insights.push({
      id: "capital-locked",
      type: "opportunity",
      priority: "low",
      icon: "\u{1F4B5}",
      title: `${formatCents(totalInventoryCost)} locked in inventory`,
      message: `${topCatPct}% of that is in ${catLabel(topCat)}. Is that where your sales are? If not, you're tying up cash in the wrong place.`,
      action: { label: "View Cash Flow", href: "/dashboard/cash-flow" },
      category: "cash_flow",
    });
  }

  // ---- STAFF INSIGHTS ----
  const hour = now.getHours();
  if (hour >= 9 && hour <= 21 && todayTimeEntries.length === 0) {
    insights.push({
      id: "nobody-clocked-in",
      type: "warning",
      priority: "high",
      icon: "\u{1F6A8}",
      title: "Nobody's clocked in today",
      message: "It's a business day and no one has punched in. Is the store open? If you don't use the time clock, you can disable this in settings.",
      action: { label: "Time Clock", href: "/dashboard/timeclock" },
      category: "staff",
    });
  }

  // ---- Rotation Risk ----
  try {
    const tcgSingles = await db.posInventoryItem.findMany({
      where: { active: true, quantity: { gt: 0 }, category: "tcg_single", oracle_id: { not: null } },
      select: { oracle_id: true, name: true, price_cents: true, quantity: true },
    });

    if (tcgSingles.length > 0) {
      const oracleIds = tcgSingles.map((s) => s.oracle_id).filter(Boolean) as string[];
      // Lookup legalities from catalog (shared table — use global prisma)
      const catalogCards = oracleIds.length > 0 ? await prisma.posCatalogProduct.findMany({
        where: { oracle_id: { in: oracleIds.slice(0, 200) } },
        select: { oracle_id: true, legalities: true },
      }) : [];

      const legalityMap = new Map(catalogCards.map((c) => [c.oracle_id, c.legalities as Record<string, string> | null]));

      let rotatingValue = 0;
      let rotatingCount = 0;
      const rotatingCards: Array<{ name: string; price_cents: number; quantity: number; total_cents: number }> = [];
      for (const item of tcgSingles) {
        if (!item.oracle_id) continue;
        const legalities = legalityMap.get(item.oracle_id);
        if (!legalities) continue;
        if (legalities.standard === "legal" && legalities.future === "not_legal") {
          const total = item.price_cents * item.quantity;
          rotatingValue += total;
          rotatingCount++;
          rotatingCards.push({ name: item.name, price_cents: item.price_cents, quantity: item.quantity, total_cents: total });
        }
      }

      if (rotatingCount > 0 && rotatingValue > 1000) {
        rotatingCards.sort((a, b) => b.total_cents - a.total_cents);
        insights.push({
          id: "rotation-risk",
          type: rotatingValue > 10000 ? "warning" : "action",
          priority: rotatingValue > 10000 ? "high" : "medium",
          icon: "\u{1F4C5}",
          title: `${rotatingCount} cards rotating out of Standard`,
          message: `You're holding ${formatCents(rotatingValue)} in cards that will rotate out of Standard. Consider discounting or moving them before they drop in value.`,
          action: { label: "View Inventory", href: "/dashboard/inventory" },
          category: "inventory",
          data: {
            total_value_cents: rotatingValue,
            card_count: rotatingCount,
            cards: rotatingCards.slice(0, 20),
            source: "Scryfall legalities (synced daily)",
          },
        });
      }
    }
  } catch { /* non-critical */ }

  // ---- Price Spike Detection ----
  try {
    const pricedSingles = await db.posInventoryItem.findMany({
      where: { active: true, quantity: { gt: 0 }, category: "tcg_single", oracle_id: { not: null }, price_cents: { gt: 0 } },
      select: { oracle_id: true, name: true, price_cents: true, quantity: true },
      take: 500,
    });

    if (pricedSingles.length > 0) {
      const oracleIds = pricedSingles.map((s) => s.oracle_id).filter(Boolean) as string[];
      const catalogCards = oracleIds.length > 0 ? await prisma.posCatalogProduct.findMany({
        where: { oracle_id: { in: oracleIds.slice(0, 200) } },
        select: { oracle_id: true, name: true, prices: true },
      }) : [];

      const priceMap = new Map(catalogCards.map((c) => {
        const prices = (c.prices ?? {}) as Record<string, string>;
        const marketCents = prices.usd ? Math.round(parseFloat(prices.usd) * 100) : 0;
        return [c.oracle_id, marketCents];
      }));

      const underpriced: Array<{ name: string; storeCents: number; marketCents: number; qty: number }> = [];
      const overpriced: Array<{ name: string; storeCents: number; marketCents: number; qty: number }> = [];

      for (const item of pricedSingles) {
        if (!item.oracle_id) continue;
        const marketCents = priceMap.get(item.oracle_id);
        if (!marketCents || marketCents < 100) continue; // Skip sub-$1 cards

        const ratio = marketCents / item.price_cents;
        if (ratio > 1.3) {
          underpriced.push({ name: item.name, storeCents: item.price_cents, marketCents, qty: item.quantity });
        } else if (ratio < 0.7) {
          overpriced.push({ name: item.name, storeCents: item.price_cents, marketCents, qty: item.quantity });
        }
      }

      // Sort by biggest gap
      underpriced.sort((a, b) => (b.marketCents - b.storeCents) * b.qty - (a.marketCents - a.storeCents) * a.qty);
      overpriced.sort((a, b) => (b.storeCents - b.marketCents) * b.qty - (a.storeCents - a.marketCents) * a.qty);

      if (underpriced.length > 0) {
        const top3 = underpriced.slice(0, 3);
        const lostRevenue = underpriced.reduce((s, c) => s + (c.marketCents - c.storeCents) * c.qty, 0);
        insights.push({
          id: "price-spike-up",
          type: "warning",
          priority: lostRevenue > 5000 ? "high" : "medium",
          icon: "\u{1F4C8}",
          title: `${underpriced.length} cards priced below market`,
          message: `${top3.map((c) => `${c.name} (yours: ${formatCents(c.storeCents)}, market: ${formatCents(c.marketCents)})`).join("; ")}${underpriced.length > 3 ? ` and ${underpriced.length - 3} more` : ""}. Potential ${formatCents(lostRevenue)} in missed revenue.`,
          action: { label: "Reprice", href: "/dashboard/singles" },
          category: "inventory",
          data: {
            lost_revenue_cents: lostRevenue,
            card_count: underpriced.length,
            cards: underpriced.slice(0, 20).map((c) => ({
              name: c.name,
              store_price_cents: c.storeCents,
              market_price_cents: c.marketCents,
              quantity: c.qty,
              gap_cents: (c.marketCents - c.storeCents) * c.qty,
            })),
            source: "Scryfall market prices (synced daily)",
          },
        });
      }

      if (overpriced.length > 0) {
        const top3 = overpriced.slice(0, 3);
        insights.push({
          id: "price-spike-down",
          type: "opportunity",
          priority: "low",
          icon: "\u{1F4C9}",
          title: `${overpriced.length} cards priced above market`,
          message: `${top3.map((c) => `${c.name} (yours: ${formatCents(c.storeCents)}, market: ${formatCents(c.marketCents)})`).join("; ")}${overpriced.length > 3 ? ` and ${overpriced.length - 3} more` : ""}. These may not sell at current prices.`,
          action: { label: "Review Prices", href: "/dashboard/singles" },
          category: "inventory",
          data: {
            card_count: overpriced.length,
            cards: overpriced.slice(0, 20).map((c) => ({
              name: c.name,
              store_price_cents: c.storeCents,
              market_price_cents: c.marketCents,
              quantity: c.qty,
            })),
            source: "Scryfall market prices (synced daily)",
          },
        });
      }
    }
  } catch { /* non-critical */ }

  // ---- Sort by priority ----
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return insights;
}

/* ------------------------------------------------------------------ */
/*  Store Data Snapshot                                                 */
/*  Collects key metrics for the AI advisor prompt context.            */
/* ------------------------------------------------------------------ */

export interface StoreSnapshot {
  revenue30d: number;
  payouts30d: number;
  netCash30d: number;
  monthlyFixedCosts: number;
  cashRunwayDays: number;
  totalInventoryCost: number;
  deadStockValue: number;
  deadStockCount: number;
  totalCustomers: number;
  atRiskCustomers: number;
  newCustomersWeek: number;
  outstandingCredit: number;
  creditCustomerCount: number;
  upcomingEventCount: number;
  topCategory: string;
  topCategoryCostPct: number;
  blendedMarginPct: number;
  avgDailyRevenue: number;
  tradeInVolume30d: number;
  wpnLevel: string;
}

export async function getStoreSnapshot(
  db: TenantPrismaClient,
  storeId: string,
  settings: StoreSettings,
): Promise<StoreSnapshot> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const atRiskDays = settings.intel_at_risk_days || 14;

  const [ledger30d, inventory, customers, upcomingEvents, creditAgg, tradeIns] =
    await Promise.all([
      db.posLedgerEntry.findMany({
        where: { created_at: { gte: thirtyDaysAgo } },
        select: { type: true, amount_cents: true, metadata: true, customer_id: true, created_at: true },
      }),
      db.posInventoryItem.findMany({
        where: { active: true },
        select: { id: true, category: true, cost_cents: true, price_cents: true, quantity: true, created_at: true },
      }),
      db.posCustomer.findMany({
        select: {
          id: true,
          created_at: true,
          ledger_entries: {
            where: { type: "sale" },
            select: { created_at: true, amount_cents: true },
            orderBy: { created_at: "desc" as const },
            take: 1,
          },
        },
      }),
      db.posEvent.count({
        where: { starts_at: { gte: now } },
      }),
      db.posCustomer.aggregate({
        where: { credit_balance_cents: { gt: 0 } },
        _sum: { credit_balance_cents: true },
        _count: true,
      }),
      db.posTradeIn.count({
        where: { created_at: { gte: thirtyDaysAgo } },
      }),
    ]);

  let revenue30d = 0;
  let payouts30d = 0;
  let totalCost30d = 0;
  const itemSales = new Map<string, number>();

  for (const e of ledger30d) {
    if (e.type === "sale" || e.type === "event_fee") revenue30d += e.amount_cents;
    if (e.type === "trade_in" || e.type === "refund") payouts30d += Math.abs(e.amount_cents);

    if (e.type === "sale") {
      const meta = e.metadata as Record<string, unknown> | null;
      if (meta?.items) {
        for (const it of meta.items as Array<{ inventory_item_id: string; quantity: number }>) {
          itemSales.set(it.inventory_item_id, (itemSales.get(it.inventory_item_id) || 0) + it.quantity);
          const inv = inventory.find(i => i.id === it.inventory_item_id);
          if (inv) totalCost30d += inv.cost_cents * it.quantity;
        }
      }
    }
  }

  const monthlyFixed =
    (settings.intel_monthly_rent || 0) +
    (settings.intel_monthly_utilities || 0) +
    (settings.intel_monthly_insurance || 0) +
    (settings.intel_monthly_payroll || 0) +
    (settings.intel_monthly_other_fixed || 0);

  const monthlyObligations = monthlyFixed * 100 + payouts30d;
  const monthlyNetCash = revenue30d - monthlyObligations;
  const cashBalanceCents = (settings.current_cash_balance_cents as number) || 0;
  let cashRunwayDays: number;
  if (monthlyNetCash > 0) {
    cashRunwayDays = 999; // Profitable — not burning cash
  } else if (monthlyFixed > 0) {
    const dailyBurnRate = Math.abs(monthlyNetCash) / 30;
    cashRunwayDays = cashBalanceCents > 0 && dailyBurnRate > 0
      ? Math.max(0, Math.round(cashBalanceCents / dailyBurnRate))
      : Math.max(0, Math.round((revenue30d / (monthlyFixed * 100)) * 30));
  } else {
    cashRunwayDays = 999;
  }

  const totalInvCost = inventory.reduce((s, i) => s + i.cost_cents * i.quantity, 0);

  // Dead stock
  let deadStockValue = 0;
  let deadStockCount = 0;
  const deadStockDays = settings.intel_dead_stock_days || 30;
  for (const item of inventory) {
    if (item.quantity <= 0 || item.quantity >= 900) continue;
    const sales = itemSales.get(item.id) || 0;
    if (sales > 0) continue;
    const daysSince = Math.floor((now.getTime() - item.created_at.getTime()) / 86400000);
    if (daysSince >= deadStockDays) {
      deadStockValue += item.cost_cents * item.quantity;
      deadStockCount++;
    }
  }

  // At-risk customers
  const atRiskDate = new Date(now);
  atRiskDate.setDate(atRiskDate.getDate() - atRiskDays);
  let atRiskCount = 0;
  for (const c of customers) {
    const lastSale = c.ledger_entries[0]?.created_at;
    if (lastSale && new Date(lastSale) < atRiskDate) {
      const totalSpent = c.ledger_entries.reduce((s, e) => s + e.amount_cents, 0);
      if (totalSpent >= 20000) atRiskCount++;
    }
  }

  const newCustomersWeek = customers.filter(c => c.created_at >= sevenDaysAgo).length;

  // Top category
  const catCosts = new Map<string, number>();
  for (const item of inventory) {
    catCosts.set(item.category, (catCosts.get(item.category) || 0) + item.cost_cents * item.quantity);
  }
  let topCat = "";
  let topCatCost = 0;
  for (const [cat, cost] of catCosts) {
    if (cost > topCatCost) { topCat = cat; topCatCost = cost; }
  }

  const marginPct = revenue30d > 0
    ? Math.round(((revenue30d - totalCost30d) / revenue30d) * 100)
    : 0;

  return {
    revenue30d,
    payouts30d,
    netCash30d: revenue30d - payouts30d,
    monthlyFixedCosts: monthlyFixed,
    cashRunwayDays,
    totalInventoryCost: totalInvCost,
    deadStockValue,
    deadStockCount,
    totalCustomers: customers.length,
    atRiskCustomers: atRiskCount,
    newCustomersWeek,
    outstandingCredit: creditAgg._sum.credit_balance_cents || 0,
    creditCustomerCount: creditAgg._count || 0,
    upcomingEventCount: upcomingEvents,
    topCategory: catLabel(topCat),
    topCategoryCostPct: totalInvCost > 0 ? Math.round((topCatCost / totalInvCost) * 100) : 0,
    blendedMarginPct: marginPct,
    avgDailyRevenue: Math.round(revenue30d / 30),
    tradeInVolume30d: tradeIns,
    wpnLevel: settings.intel_wpn_level || "none",
  };
}
