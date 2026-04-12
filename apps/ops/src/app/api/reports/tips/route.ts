import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/reports/tips — tip summary by staff and period            */
/*  Query: ?from=ISO&to=ISO&group=day|week|staff                      */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { db } = await requirePermission("reports");

    const params = request.nextUrl.searchParams;
    const from = params.get("from") || new Date(Date.now() - 7 * 86400000).toISOString();
    const to = params.get("to") || new Date().toISOString();

    // Tips by staff member
    const byStaff = await db.posLedgerEntry.groupBy({
      by: ["staff_id"],
      where: {
        type: "sale",
        tip_cents: { gt: 0 },
        created_at: { gte: new Date(from), lte: new Date(to) },
      },
      _sum: { tip_cents: true },
      _count: true,
    });

    // Get staff names
    const staffIds = byStaff.map((s) => s.staff_id).filter(Boolean) as string[];
    const staffRecords = staffIds.length > 0
      ? await db.posStaff.findMany({
          where: { id: { in: staffIds } },
          select: { id: true, name: true },
        })
      : [];
    const staffMap = new Map(staffRecords.map((s) => [s.id, s.name]));

    // Total tips in period
    const totalResult = await db.posLedgerEntry.aggregate({
      where: {
        type: "sale",
        tip_cents: { gt: 0 },
        created_at: { gte: new Date(from), lte: new Date(to) },
      },
      _sum: { tip_cents: true },
      _count: true,
    });

    // Recent tipped transactions
    const recent = await db.posLedgerEntry.findMany({
      where: {
        type: "sale",
        tip_cents: { gt: 0 },
        created_at: { gte: new Date(from), lte: new Date(to) },
      },
      orderBy: { created_at: "desc" },
      take: 50,
      select: {
        id: true,
        amount_cents: true,
        tip_cents: true,
        staff_id: true,
        created_at: true,
        staff: { select: { name: true } },
      },
    });

    return NextResponse.json({
      period: { from, to },
      total_tips_cents: totalResult._sum.tip_cents || 0,
      total_tipped_transactions: totalResult._count,
      by_staff: byStaff.map((s) => ({
        staff_id: s.staff_id,
        staff_name: staffMap.get(s.staff_id!) || "Unknown",
        total_tips_cents: s._sum.tip_cents || 0,
        transaction_count: s._count,
      })),
      recent_transactions: recent.map((t) => ({
        id: t.id,
        sale_amount_cents: t.amount_cents,
        tip_cents: t.tip_cents,
        staff_name: t.staff?.name || "Unknown",
        created_at: t.created_at,
      })),
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
