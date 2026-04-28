/**
 * GET /api/devices — list paired register tablets for the active store.
 *
 * Returns active + revoked devices (UI filters as needed). Each row includes
 * the Passport user that paired it so the owner sees "Counter 1, paired by
 * Sarah on Apr 12."
 *
 * Auth: session-based, requires `staff.manage`.
 */

import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

export async function GET() {
  try {
    const { db } = await requirePermission("staff.manage");

    const devices = await db.registerDevice.findMany({
      orderBy: [{ revoked_at: { sort: "asc", nulls: "first" } }, { last_seen_at: "desc" }],
      include: {
        paired_by_user: { select: { id: true, email: true, displayName: true } },
      },
    });

    const rows = devices.map((d) => ({
      id: d.id,
      display_name: d.display_name,
      device_id: d.device_id,
      paired_by: {
        id: d.paired_by_user.id,
        email: d.paired_by_user.email,
        display_name: d.paired_by_user.displayName,
      },
      last_seen_at: d.last_seen_at,
      revoked_at: d.revoked_at,
      revoke_reason: d.revoke_reason,
      scopes: d.scopes,
      created_at: d.created_at,
    }));

    return NextResponse.json({ devices: rows });
  } catch (error) {
    return handleAuthError(error);
  }
}
