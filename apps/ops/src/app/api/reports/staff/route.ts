import { NextRequest, NextResponse } from "next/server";
import { requirePermissionAndFeature, handleAuthError } from "@/lib/require-staff";

export async function GET(req: NextRequest) {
  try {
    const { db } = await requirePermissionAndFeature("reports", "advanced_reports");

    const url = new URL(req.url);
    const periodKey = url.searchParams.get("period") || "30d";

    const now = new Date();
    let from: Date;

    if (periodKey === "7d") {
      from = new Date(now.getTime() - 7 * 86400000);
    } else if (periodKey === "90d") {
      from = new Date(now.getTime() - 90 * 86400000);
    } else {
      from = new Date(now.getTime() - 30 * 86400000);
    }

    // Fetch all staff for this store
    const staffList = await db.posStaff.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true },
    });

    const staffMap = new Map(staffList.map((s) => [s.id, s]));

    // Fetch sale entries with staff_id in period
    const sales = await db.posLedgerEntry.findMany({
      where: {
        type: "sale",
        created_at: { gte: from, lte: now },
        staff_id: { not: null },
      },
      select: {
        staff_id: true,
        amount_cents: true,
        tip_cents: true,
        metadata: true,
      },
    });

    // Fetch time entries in period
    const timeEntries = await db.posTimeEntry.findMany({
      where: {
        clock_in: { gte: from, lte: now },
      },
      select: {
        staff_id: true,
        hours_worked: true,
        clock_in: true,
        clock_in_location: true,
      },
    });

    // Per-staff aggregation
    const staffStats = new Map<string, {
      revenue_cents: number;
      transaction_count: number;
      total_items: number;
      tips_cents: number;
      hours_worked: number;
      on_time_count: number;
      total_clock_ins: number;
    }>();

    function getOrCreate(staffId: string) {
      let s = staffStats.get(staffId);
      if (!s) {
        s = {
          revenue_cents: 0,
          transaction_count: 0,
          total_items: 0,
          tips_cents: 0,
          hours_worked: 0,
          on_time_count: 0,
          total_clock_ins: 0,
        };
        staffStats.set(staffId, s);
      }
      return s;
    }

    for (const sale of sales) {
      if (!sale.staff_id) continue;
      const stats = getOrCreate(sale.staff_id);
      stats.revenue_cents += sale.amount_cents;
      stats.transaction_count++;
      stats.tips_cents += sale.tip_cents;

      const meta = sale.metadata as Record<string, unknown> | null;
      const items = Array.isArray(meta?.items) ? meta.items as Array<Record<string, unknown>> : [];
      let itemCount = 0;
      for (const item of items) {
        itemCount += typeof item.quantity === "number" ? item.quantity : 1;
      }
      stats.total_items += itemCount || 1;
    }

    for (const te of timeEntries) {
      const stats = getOrCreate(te.staff_id);
      const hours = te.hours_worked ? Number(te.hours_worked) : 0;
      stats.hours_worked += hours;
      stats.total_clock_ins++;
      // Consider "on_site" as on-time (simple heuristic)
      if (te.clock_in_location === "on_site") {
        stats.on_time_count++;
      }
    }

    // Build leaderboard
    const leaderboard = [...staffStats.entries()]
      .map(([staffId, stats]) => {
        const staff = staffMap.get(staffId);
        const revenuePerHour = stats.hours_worked > 0
          ? Math.round(stats.revenue_cents / stats.hours_worked)
          : 0;
        const avgTxCents = stats.transaction_count > 0
          ? Math.round(stats.revenue_cents / stats.transaction_count)
          : 0;
        const itemsPerTx = stats.transaction_count > 0
          ? Math.round((stats.total_items / stats.transaction_count) * 10) / 10
          : 0;

        return {
          staff_id: staffId,
          name: staff?.name || "Unknown",
          role: staff?.role || "unknown",
          revenue_cents: stats.revenue_cents,
          transaction_count: stats.transaction_count,
          avg_transaction_cents: avgTxCents,
          items_per_transaction: itemsPerTx,
          tips_cents: stats.tips_cents,
          hours_worked: Math.round(stats.hours_worked * 10) / 10,
          revenue_per_hour_cents: revenuePerHour,
          clock_ins: stats.total_clock_ins,
          on_site_pct: stats.total_clock_ins > 0
            ? Math.round((stats.on_time_count / stats.total_clock_ins) * 100)
            : null,
        };
      })
      .sort((a, b) => b.revenue_cents - a.revenue_cents);

    // Team totals
    const teamRevenue = leaderboard.reduce((a, b) => a + b.revenue_cents, 0);
    const teamHours = leaderboard.reduce((a, b) => a + b.hours_worked, 0);
    const teamTxCount = leaderboard.reduce((a, b) => a + b.transaction_count, 0);
    const teamTips = leaderboard.reduce((a, b) => a + b.tips_cents, 0);

    return NextResponse.json({
      period: { from: from.toISOString(), to: now.toISOString() },
      team: {
        revenue_cents: teamRevenue,
        hours_worked: Math.round(teamHours * 10) / 10,
        transaction_count: teamTxCount,
        tips_cents: teamTips,
        revenue_per_hour_cents: teamHours > 0 ? Math.round(teamRevenue / teamHours) : 0,
      },
      leaderboard,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
