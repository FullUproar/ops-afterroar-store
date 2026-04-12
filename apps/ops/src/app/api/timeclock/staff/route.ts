import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/timeclock/staff — all staff clock status (manager only)   */
/* ------------------------------------------------------------------ */
export async function GET() {
  try {
    const { db, storeId } = await requirePermission("staff.manage");

    const staff = await db.posStaff.findMany({
      where: { store_id: storeId, active: true },
      select: { id: true, name: true },
    });

    const result = await Promise.all(
      staff.map(async (s) => {
        const openEntry = await db.posTimeEntry.findFirst({
          where: { staff_id: s.id, clock_out: null },
          orderBy: { clock_in: "desc" },
        });
        return {
          staff_id: s.id,
          staff_name: s.name,
          clocked_in: !!openEntry,
          clock_in_time: openEntry?.clock_in ?? null,
        };
      })
    );

    return NextResponse.json(result);
  } catch (error) {
    return handleAuthError(error);
  }
}
