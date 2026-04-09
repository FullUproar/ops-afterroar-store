import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { formatCents } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  GET /api/health/store — submarine-style store health rollup         */
/*                                                                      */
/*  Returns the "single slide" — every domain rolled up to              */
/*  green/yellow/red with a 1-line summary and drill-down data.         */
/* ------------------------------------------------------------------ */

type Status = "green" | "yellow" | "red";

interface HealthDomain {
  key: string;
  label: string;
  icon: string;
  status: Status;
  summary: string;
  details: HealthDetail[];
}

interface HealthDetail {
  key: string;
  label: string;
  status: Status;
  summary: string;
  items?: HealthItem[];
}

interface HealthItem {
  id?: string;
  label: string;
  status: Status;
  detail: string;
  action?: string;
  actionHref?: string;
}

function worstStatus(...statuses: Status[]): Status {
  if (statuses.includes("red")) return "red";
  if (statuses.includes("yellow")) return "yellow";
  return "green";
}

export async function GET() {
  try {
    const { storeId } = await requireStaff();

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    // ── Parallel data fetch ──
    const [
      todaySalesCount,
      todayRevenue,
      inventoryStats,
      lowStockItems,
      zeroStockItems,
      staffCount,
      activeStaff,
      customerCount,
      churnCandidates,
      upcomingEvents,
      outstandingCredit,
      pendingPreorders,
      openTabs,
      recentReturns,
      flaggedReorders,
    ] = await Promise.all([
      // Sales
      prisma.posLedgerEntry.count({
        where: { store_id: storeId, type: "sale", created_at: { gte: todayStart } },
      }),
      prisma.posLedgerEntry.aggregate({
        where: { store_id: storeId, type: "sale", created_at: { gte: todayStart } },
        _sum: { amount_cents: true },
      }),
      // Inventory
      prisma.posInventoryItem.aggregate({
        where: { store_id: storeId, active: true },
        _count: true,
        _sum: { quantity: true },
      }),
      prisma.posInventoryItem.findMany({
        where: {
          store_id: storeId,
          active: true,
          quantity: { gt: 0 },
        },
        select: { id: true, name: true, quantity: true, low_stock_threshold: true, category: true },
      }),
      prisma.posInventoryItem.count({
        where: { store_id: storeId, active: true, quantity: { lte: 0 } },
      }),
      // Staff
      prisma.posStaff.count({ where: { store_id: storeId } }),
      prisma.posStaff.count({ where: { store_id: storeId, active: true } }),
      // Customers
      prisma.posCustomer.count({ where: { store_id: storeId } }),
      // Churn: customers with purchases but not in 21+ days
      prisma.posLedgerEntry.groupBy({
        by: ["customer_id"],
        where: {
          store_id: storeId,
          type: { in: ["sale", "event_fee"] },
          customer_id: { not: null },
        },
        _max: { created_at: true },
        _count: true,
      }),
      // Events
      prisma.posEvent.count({
        where: { store_id: storeId, starts_at: { gte: now } },
      }),
      // Credit liability
      prisma.posCustomer.aggregate({
        where: { store_id: storeId, credit_balance_cents: { gt: 0 } },
        _sum: { credit_balance_cents: true },
        _count: true,
      }),
      // Preorders
      prisma.posPreorder.count({
        where: { store_id: storeId, status: { in: ["pending", "confirmed", "received"] } },
      }),
      // Cafe tabs
      prisma.posTab.count({
        where: { store_id: storeId, status: "open" },
      }).catch(() => 0),
      // Returns (last 7 days)
      prisma.posReturn.count({
        where: { store_id: storeId, created_at: { gte: new Date(now.getTime() - 7 * 86400000) } },
      }).catch(() => 0),
      // Flagged reorders
      prisma.posInventoryItem.count({
        where: {
          store_id: storeId,
          active: true,
          attributes: { path: ["reorder_flagged"], equals: true },
        },
      }).catch(() => 0),
    ]);

    // ── Compute statuses ──

    // Filter low stock items properly
    const actualLowStock = lowStockItems.filter(
      (i) => i.quantity > 0 && i.quantity <= (i.low_stock_threshold ?? 5)
    );
    const lowStockCount = actualLowStock.length;

    // Churn calculation
    const twentyOneDaysAgo = new Date(now.getTime() - 21 * 86400000);
    const atRiskCustomers = churnCandidates.filter((c) => {
      const lastVisit = c._max.created_at;
      return lastVisit && new Date(lastVisit) < twentyOneDaysAgo && c._count >= 2;
    });

    const creditLiability = outstandingCredit._sum.credit_balance_cents ?? 0;
    const creditCustomerCount = outstandingCredit._count;

    // ── SALES domain ──
    const salesStatus: Status = todaySalesCount > 0 ? "green" : "yellow";
    const salesDomain: HealthDomain = {
      key: "sales",
      label: "Sales",
      icon: "◈",
      status: salesStatus,
      summary: todaySalesCount > 0
        ? `${todaySalesCount} sales · ${formatCents(todayRevenue._sum.amount_cents ?? 0)} today`
        : "No sales yet today",
      details: [
        {
          key: "today",
          label: "Today's Activity",
          status: salesStatus,
          summary: `${todaySalesCount} transactions, ${formatCents(todayRevenue._sum.amount_cents ?? 0)} revenue`,
        },
        ...(recentReturns > 0 ? [{
          key: "returns",
          label: "Returns (7 days)",
          status: (recentReturns > 5 ? "yellow" : "green") as Status,
          summary: `${recentReturns} return${recentReturns !== 1 ? "s" : ""} this week`,
        }] : []),
        ...(openTabs > 0 ? [{
          key: "tabs",
          label: "Open Cafe Tabs",
          status: "green" as Status,
          summary: `${openTabs} tab${openTabs !== 1 ? "s" : ""} open`,
        }] : []),
      ],
    };

    // ── INVENTORY domain ──
    const invStatus: Status =
      zeroStockItems > 10 || lowStockCount > 20 ? "red" :
      zeroStockItems > 0 || lowStockCount > 5 || flaggedReorders > 0 ? "yellow" :
      "green";

    const invSummary = [
      `${inventoryStats._count} SKUs`,
      lowStockCount > 0 ? `${lowStockCount} low` : null,
      zeroStockItems > 0 ? `${zeroStockItems} out` : null,
      flaggedReorders > 0 ? `${flaggedReorders} flagged` : null,
    ].filter(Boolean).join(" · ");

    // Group low stock by category
    const lowByCategory = new Map<string, typeof actualLowStock>();
    for (const item of actualLowStock) {
      const cat = item.category;
      if (!lowByCategory.has(cat)) lowByCategory.set(cat, []);
      lowByCategory.get(cat)!.push(item);
    }

    const inventoryDomain: HealthDomain = {
      key: "inventory",
      label: "Inventory",
      icon: "▦",
      status: invStatus,
      summary: invSummary,
      details: [
        {
          key: "low_stock",
          label: "Low Stock",
          status: lowStockCount > 5 ? "yellow" : lowStockCount > 0 ? "yellow" : "green",
          summary: lowStockCount > 0 ? `${lowStockCount} items below threshold` : "All stocked",
          items: actualLowStock.slice(0, 10).map((i) => ({
            id: i.id,
            label: i.name,
            status: (i.quantity <= 1 ? "red" : "yellow") as Status,
            detail: `${i.quantity} left (threshold: ${i.low_stock_threshold ?? 5})`,
            action: "Reorder",
            actionHref: `/dashboard/inventory/${i.id}`,
          })),
        },
        {
          key: "out_of_stock",
          label: "Out of Stock",
          status: zeroStockItems > 10 ? "red" : zeroStockItems > 0 ? "yellow" : "green",
          summary: zeroStockItems > 0 ? `${zeroStockItems} items at zero` : "Nothing out of stock",
        },
        ...(flaggedReorders > 0 ? [{
          key: "flagged",
          label: "Flagged for Reorder",
          status: "yellow" as Status,
          summary: `${flaggedReorders} item${flaggedReorders !== 1 ? "s" : ""} flagged by staff`,
        }] : []),
        ...(pendingPreorders > 0 ? [{
          key: "preorders",
          label: "Pending Preorders",
          status: "green" as Status,
          summary: `${pendingPreorders} preorder${pendingPreorders !== 1 ? "s" : ""} awaiting stock`,
        }] : []),
      ],
    };

    // ── PEOPLE domain ──
    const peopleStatus: Status = atRiskCustomers.length > 10 ? "yellow" : "green";
    const peopleDomain: HealthDomain = {
      key: "people",
      label: "People",
      icon: "♟",
      status: peopleStatus,
      summary: `${customerCount} customers · ${activeStaff} active staff`,
      details: [
        {
          key: "customers",
          label: "Customers",
          status: "green",
          summary: `${customerCount} total`,
        },
        {
          key: "churn_risk",
          label: "At Risk (21+ days absent)",
          status: atRiskCustomers.length > 10 ? "yellow" : atRiskCustomers.length > 0 ? "yellow" : "green",
          summary: atRiskCustomers.length > 0
            ? `${atRiskCustomers.length} regular${atRiskCustomers.length !== 1 ? "s" : ""} haven't been in 3+ weeks`
            : "All regulars active",
        },
        {
          key: "staff",
          label: "Staff",
          status: "green",
          summary: `${activeStaff} active of ${staffCount} total`,
        },
      ],
    };

    // ── MONEY domain ──
    const moneyStatus: Status = creditLiability > 100_00_00 ? "yellow" : "green"; // >$10K liability = yellow
    const moneyDomain: HealthDomain = {
      key: "money",
      label: "Money",
      icon: "◎",
      status: moneyStatus,
      summary: `+${formatCents(todayRevenue._sum.amount_cents ?? 0)} today · ${formatCents(creditLiability)} credit outstanding`,
      details: [
        {
          key: "revenue",
          label: "Today's Revenue",
          status: "green",
          summary: formatCents(todayRevenue._sum.amount_cents ?? 0),
        },
        {
          key: "credit_liability",
          label: "Store Credit Outstanding",
          status: creditLiability > 100_00_00 ? "yellow" : "green",
          summary: `${formatCents(creditLiability)} across ${creditCustomerCount} customer${creditCustomerCount !== 1 ? "s" : ""}`,
        },
      ],
    };

    // ── EVENTS domain ──
    const eventsDomain: HealthDomain = {
      key: "events",
      label: "Events",
      icon: "★",
      status: "green",
      summary: upcomingEvents > 0
        ? `${upcomingEvents} upcoming`
        : "No upcoming events",
      details: [
        {
          key: "upcoming",
          label: "Upcoming Events",
          status: upcomingEvents > 0 ? "green" : "green",
          summary: `${upcomingEvents} scheduled`,
        },
      ],
    };

    // ── OVERALL ──
    const domains = [salesDomain, inventoryDomain, peopleDomain, moneyDomain, eventsDomain];
    const overallStatus = worstStatus(...domains.map((d) => d.status));

    return NextResponse.json({
      overall: overallStatus,
      domains,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
