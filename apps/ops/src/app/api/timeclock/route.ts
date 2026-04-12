import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/timeclock — get current clock status for the user          */
/* ------------------------------------------------------------------ */
export async function GET() {
  try {
    const { staff, storeId, db } = await requireStaff();

    // Find open time entry (clocked in but not out)
    const openEntry = await db.posTimeEntry.findFirst({
      where: { store_id: storeId, staff_id: staff.id, clock_out: null },
      orderBy: { clock_in: "desc" },
    });

    // Get recent entries
    const recent = await db.posTimeEntry.findMany({
      where: { store_id: storeId, staff_id: staff.id },
      orderBy: { clock_in: "desc" },
      take: 10,
    });

    // Calculate hours this week
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const weekEntries = await db.posTimeEntry.findMany({
      where: {
        store_id: storeId,
        staff_id: staff.id,
        clock_in: { gte: weekStart },
        clock_out: { not: null },
      },
    });

    const hoursThisWeek = weekEntries.reduce(
      (sum, e) => sum + (Number(e.hours_worked) || 0), 0
    );

    return NextResponse.json({
      clocked_in: !!openEntry,
      current_entry: openEntry,
      recent,
      hours_this_week: Math.round(hoursThisWeek * 100) / 100,
      staff_name: staff.name,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/timeclock — clock in or clock out                         */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    const { staff, storeId, db } = await requireStaff();

    let body: { action: "clock_in" | "clock_out"; notes?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (body.action === "clock_in") {
      // Check not already clocked in
      const existing = await db.posTimeEntry.findFirst({
        where: { store_id: storeId, staff_id: staff.id, clock_out: null },
      });
      if (existing) {
        return NextResponse.json({ error: "Already clocked in" }, { status: 400 });
      }

      const entry = await db.posTimeEntry.create({
        data: {
          store_id: storeId,
          staff_id: staff.id,
          clock_in: new Date(),
          notes: body.notes ?? null,
        },
      });

      return NextResponse.json({ clocked_in: true, entry }, { status: 201 });
    }

    if (body.action === "clock_out") {
      const openEntry = await db.posTimeEntry.findFirst({
        where: { store_id: storeId, staff_id: staff.id, clock_out: null },
        orderBy: { clock_in: "desc" },
      });

      if (!openEntry) {
        return NextResponse.json({ error: "Not clocked in" }, { status: 400 });
      }

      const clockOut = new Date();
      const hoursWorked = (clockOut.getTime() - new Date(openEntry.clock_in).getTime()) / 3600000;

      const entry = await db.posTimeEntry.update({
        where: { id: openEntry.id },
        data: {
          clock_out: clockOut,
          hours_worked: Math.round(hoursWorked * 100) / 100,
          notes: body.notes ?? openEntry.notes,
        },
      });

      return NextResponse.json({ clocked_in: false, entry });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return handleAuthError(error);
  }
}
