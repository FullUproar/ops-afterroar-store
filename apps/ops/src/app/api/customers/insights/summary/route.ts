import { NextResponse } from "next/server";
import { requirePermissionAndFeature, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/customers/insights/summary — aggregate customer stats     */
/* ------------------------------------------------------------------ */

export async function GET() {
  try {
    const { db } = await requirePermissionAndFeature("customers.view", "intelligence");

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const customers = await db.posCustomer.findMany({
      where: { deletion_requested: false },
      select: {
        id: true,
        email: true,
        ledger_entries: {
          where: { type: "sale" },
          select: { amount_cents: true, created_at: true },
        },
      },
    });

    const totalCustomers = customers.length;
    const withEmail = customers.filter((c) => c.email && c.email.length > 0).length;
    const withoutEmail = totalCustomers - withEmail;

    // Active in last 30 days (had a sale)
    const active30d = customers.filter((c) =>
      c.ledger_entries.some((e) => new Date(e.created_at) >= thirtyDaysAgo),
    ).length;

    // Average lifetime value
    const totalLifetimeSpend = customers.reduce(
      (sum, c) => sum + c.ledger_entries.reduce((s, e) => s + e.amount_cents, 0),
      0,
    );
    const avgLifetimeValueCents = totalCustomers > 0 ? Math.round(totalLifetimeSpend / totalCustomers) : 0;

    // Retention rate: % who made 2+ purchases
    const multiPurchase = customers.filter((c) => c.ledger_entries.length >= 2).length;
    const retentionRate = totalCustomers > 0 ? Math.round((multiPurchase / totalCustomers) * 100) : 0;

    return NextResponse.json({
      total_customers: totalCustomers,
      with_email: withEmail,
      without_email: withoutEmail,
      active_30d: active30d,
      avg_lifetime_value_cents: avgLifetimeValueCents,
      retention_rate: retentionRate,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
