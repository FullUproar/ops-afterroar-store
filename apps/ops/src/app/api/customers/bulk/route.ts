import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/customers/bulk — customers for offline cache               */
/*  Supports delta sync: ?since=2026-04-08T12:00:00Z                   */
/* ------------------------------------------------------------------ */
export async function GET(request: NextRequest) {
  try {
    const { db } = await requireStaff();

    const url = new URL(request.url);
    const since = url.searchParams.get("since");

    const where: Record<string, unknown> = {};
    if (since) {
      where.updated_at = { gte: new Date(since) };
    }

    const customers = await db.posCustomer.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        credit_balance_cents: true,
      },
    });

    return NextResponse.json({
      customers,
      syncedAt: new Date().toISOString(),
      full: !since,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
