import { NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/customers/recent — recent customers for register          */
/*  Returns: recent check-ins (from Afterroar) + recent purchasers     */
/*  Used by the register customer panel to show "just checked in" list */
/* ------------------------------------------------------------------ */

export async function GET() {
  try {
    const { db, storeId } = await requireStaff();

    // Get store settings for recent check-ins
    const store = await db.posStore.findFirst({
      select: { settings: true },
    });
    const settings = (store?.settings ?? {}) as Record<string, unknown>;
    const recentCheckins = (settings.recent_checkins as Array<{
      customer_id: string;
      name: string;
      afterroar_user_id: string;
      checked_in_at: string;
    }>) || [];

    // Filter to last 2 hours only
    const twoHoursAgo = new Date(Date.now() - 2 * 3600000);
    const activeCheckins = recentCheckins.filter(
      (ci) => new Date(ci.checked_in_at) >= twoHoursAgo
    );

    // Get recent purchasers (last 2 hours)
    const recentSales = await db.posLedgerEntry.findMany({
      where: {
        type: "sale",
        customer_id: { not: null },
        created_at: { gte: twoHoursAgo },
      },
      select: {
        customer_id: true,
        customer: { select: { id: true, name: true, email: true } },
        created_at: true,
      },
      orderBy: { created_at: "desc" },
      take: 10,
    });

    // Deduplicate
    const seen = new Set<string>();
    const results: Array<{
      id: string;
      name: string;
      email: string | null;
      source: "checkin" | "purchase";
      timestamp: string;
    }> = [];

    // Check-ins first (higher priority)
    for (const ci of activeCheckins) {
      if (!seen.has(ci.customer_id)) {
        seen.add(ci.customer_id);
        results.push({
          id: ci.customer_id,
          name: ci.name,
          email: null,
          source: "checkin",
          timestamp: ci.checked_in_at,
        });
      }
    }

    // Then recent purchasers
    for (const sale of recentSales) {
      if (sale.customer?.id && !seen.has(sale.customer.id)) {
        seen.add(sale.customer.id);
        results.push({
          id: sale.customer.id,
          name: sale.customer.name,
          email: sale.customer.email,
          source: "purchase",
          timestamp: sale.created_at.toISOString(),
        });
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    return handleAuthError(error);
  }
}
