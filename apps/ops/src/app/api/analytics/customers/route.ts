import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/analytics/customers — customer intelligence                */
/*                                                                      */
/*  Returns:                                                            */
/*  - Churn risk (customers who haven't been in for X weeks)           */
/*  - Top customers (by spend, by visits)                               */
/*  - New vs returning ratio                                            */
/*  - Average customer value                                            */
/*  - Cohort activity                                                   */
/*                                                                      */
/*  "Jake hasn't been in for 3 weeks" — this is where the money is.   */
/* ------------------------------------------------------------------ */
export async function GET() {
  try {
    const { db } = await requirePermission("reports");

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 86400000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);
    const threeWeeksAgo = new Date(now.getTime() - 21 * 86400000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000);

    // Get all customers with their recent activity
    const customers = await db.posCustomer.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        credit_balance_cents: true,
        loyalty_points: true,
        created_at: true,
      },
    });

    // Get each customer's last transaction date + spend totals
    const customerActivity = await db.posLedgerEntry.groupBy({
      by: ["customer_id"],
      where: {
        customer_id: { not: null },
        type: { in: ["sale", "event_fee"] },
      },
      _max: { created_at: true },
      _sum: { amount_cents: true },
      _count: true,
    });

    const activityMap = new Map(
      customerActivity.map((a) => [
        a.customer_id,
        {
          last_visit: a._max.created_at,
          total_spend_cents: a._sum.amount_cents ?? 0,
          visit_count: a._count,
        },
      ])
    );

    // Recent activity (last 30 days) for frequency
    const recentActivity = await db.posLedgerEntry.groupBy({
      by: ["customer_id"],
      where: {
        customer_id: { not: null },
        type: { in: ["sale", "event_fee"] },
        created_at: { gte: thirtyDaysAgo },
      },
      _count: true,
      _sum: { amount_cents: true },
    });

    const recentMap = new Map(
      recentActivity.map((a) => [
        a.customer_id,
        { recent_visits: a._count, recent_spend_cents: a._sum.amount_cents ?? 0 },
      ])
    );

    // Build customer intelligence
    const customerIntel = customers.map((c) => {
      const activity = activityMap.get(c.id);
      const recent = recentMap.get(c.id);
      const lastVisit = activity?.last_visit ? new Date(activity.last_visit) : null;
      const daysSinceVisit = lastVisit
        ? Math.floor((now.getTime() - lastVisit.getTime()) / 86400000)
        : null;

      let churnRisk: "none" | "low" | "medium" | "high" | "churned" = "none";
      if (daysSinceVisit === null) {
        churnRisk = activity ? "churned" : "none"; // Never visited vs long-gone
      } else if (daysSinceVisit > 60) {
        churnRisk = "churned";
      } else if (daysSinceVisit > 21) {
        churnRisk = "high";
      } else if (daysSinceVisit > 14) {
        churnRisk = "medium";
      } else if (daysSinceVisit > 7) {
        churnRisk = "low";
      }

      return {
        id: c.id,
        name: c.name,
        email: c.email,
        credit_balance_cents: c.credit_balance_cents,
        loyalty_points: c.loyalty_points,
        total_spend_cents: activity?.total_spend_cents ?? 0,
        total_visits: activity?.visit_count ?? 0,
        last_visit: lastVisit?.toISOString() ?? null,
        days_since_visit: daysSinceVisit,
        recent_visits_30d: recent?.recent_visits ?? 0,
        recent_spend_30d_cents: recent?.recent_spend_cents ?? 0,
        churn_risk: churnRisk,
        customer_since: c.created_at,
      };
    });

    // Sort by churn risk (highest first), then by total spend (highest first)
    const churnOrder = { churned: 0, high: 1, medium: 2, low: 3, none: 4 };
    customerIntel.sort((a, b) => {
      const riskDiff = churnOrder[a.churn_risk] - churnOrder[b.churn_risk];
      if (riskDiff !== 0) return riskDiff;
      return b.total_spend_cents - a.total_spend_cents;
    });

    // Summary stats
    const activeCustomers = customerIntel.filter((c) => c.days_since_visit !== null && c.days_since_visit <= 30).length;
    const atRiskCustomers = customerIntel.filter((c) => c.churn_risk === "high" || c.churn_risk === "medium").length;
    const churnedCustomers = customerIntel.filter((c) => c.churn_risk === "churned").length;
    const newThisMonth = customers.filter((c) => new Date(c.created_at) >= thirtyDaysAgo).length;
    const avgSpend = customerIntel.length > 0
      ? Math.round(customerIntel.reduce((s, c) => s + c.total_spend_cents, 0) / customerIntel.length)
      : 0;

    // Top customers by spend
    const topBySpend = [...customerIntel]
      .sort((a, b) => b.total_spend_cents - a.total_spend_cents)
      .slice(0, 10);

    // Top customers by visit frequency (30 days)
    const topByFrequency = [...customerIntel]
      .sort((a, b) => b.recent_visits_30d - a.recent_visits_30d)
      .filter((c) => c.recent_visits_30d > 0)
      .slice(0, 10);

    return NextResponse.json({
      summary: {
        total_customers: customers.length,
        active_30d: activeCustomers,
        at_risk: atRiskCustomers,
        churned: churnedCustomers,
        new_this_month: newThisMonth,
        avg_lifetime_spend_cents: avgSpend,
      },
      churn_alerts: customerIntel.filter(
        (c) => (c.churn_risk === "high" || c.churn_risk === "medium") && c.total_spend_cents > 0
      ).slice(0, 20),
      top_by_spend: topBySpend,
      top_by_frequency: topByFrequency,
      all_customers: customerIntel.slice(0, 500), // Paginated — first 500 by risk/spend
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
