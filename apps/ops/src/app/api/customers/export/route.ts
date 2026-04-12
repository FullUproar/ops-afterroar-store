import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/customers/export?segment=vip — CSV export of customers    */
/*  Filterable by segment. Includes LTV projection.                    */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { db } = await requirePermission("customers.view");

    const segment = request.nextUrl.searchParams.get("segment");
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000);

    const customers = await db.posCustomer.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        credit_balance_cents: true,
        loyalty_points: true,
        tags: true,
        created_at: true,
        ledger_entries: {
          where: { type: "sale" },
          select: { amount_cents: true, created_at: true },
          orderBy: { created_at: "desc" as const },
          take: 200, // Limit per customer to prevent timeout on high-volume stores
        },
      },
    });

    const rows = customers.map((c) => {
      const lifetimeSpend = c.ledger_entries.reduce((s, e) => s + e.amount_cents, 0);
      const last90dSpend = c.ledger_entries
        .filter((e) => new Date(e.created_at) >= ninetyDaysAgo)
        .reduce((s, e) => s + e.amount_cents, 0);
      const purchases30d = c.ledger_entries.filter((e) => new Date(e.created_at) >= thirtyDaysAgo).length;
      const lastPurchase = c.ledger_entries[0]?.created_at;
      const daysSinceLastPurchase = lastPurchase
        ? Math.floor((now.getTime() - new Date(lastPurchase).getTime()) / 86400000)
        : null;

      // LTV projection: annualized from 90-day spend
      const annualizedLTV = Math.round(last90dSpend * (365 / 90));

      // Auto-segment
      let seg = "active";
      if (lifetimeSpend >= 50000) seg = "vip";
      else if (purchases30d >= 3) seg = "regular";
      else if (daysSinceLastPurchase === null || new Date(c.created_at) >= thirtyDaysAgo) seg = "new";
      else if (daysSinceLastPurchase >= 60) seg = "dormant";
      else if (daysSinceLastPurchase >= 14 && lifetimeSpend >= 20000) seg = "at_risk";

      return {
        name: c.name,
        email: c.email || "",
        phone: c.phone || "",
        segment: seg,
        lifetime_spend: (lifetimeSpend / 100).toFixed(2),
        last_90d_spend: (last90dSpend / 100).toFixed(2),
        projected_annual_ltv: (annualizedLTV / 100).toFixed(2),
        purchases_30d: purchases30d,
        days_since_last_visit: daysSinceLastPurchase ?? "never",
        credit_balance: (c.credit_balance_cents / 100).toFixed(2),
        loyalty_points: c.loyalty_points,
        tags: (c.tags || []).join("; "),
        customer_since: new Date(c.created_at).toLocaleDateString(),
      };
    });

    // Filter by segment if requested
    const filtered = segment ? rows.filter((r) => r.segment === segment) : rows;

    // Build CSV
    const headers = Object.keys(filtered[0] || {});
    const csv = [
      headers.join(","),
      ...filtered.map((row) =>
        headers.map((h) => {
          const val = String((row as Record<string, unknown>)[h] || "");
          return val.includes(",") || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
        }).join(",")
      ),
    ].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="customers${segment ? `-${segment}` : ""}-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
