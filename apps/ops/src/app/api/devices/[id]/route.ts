/**
 * PATCH /api/devices/[id] — rename a register device.
 * DELETE /api/devices/[id] — revoke a register device (the token stops working).
 *
 * Auth: session-based, requires `staff.manage`.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  try {
    const { db } = await requirePermission("staff.manage");

    let body: { display_name?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!body.display_name?.trim()) {
      return NextResponse.json({ error: "display_name is required" }, { status: 400 });
    }

    const device = await db.registerDevice.findFirst({ where: { id } });
    if (!device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    const updated = await db.registerDevice.update({
      where: { id },
      data: { display_name: body.display_name.trim() },
    });
    return NextResponse.json({ id: updated.id, display_name: updated.display_name });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  try {
    const { db } = await requirePermission("staff.manage");

    const device = await db.registerDevice.findFirst({ where: { id } });
    if (!device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }
    if (device.revoked_at) {
      return NextResponse.json({ id, already_revoked: true });
    }

    await db.registerDevice.update({
      where: { id },
      data: { revoked_at: new Date(), revoke_reason: "manual" },
    });
    return NextResponse.json({ id, revoked: true });
  } catch (error) {
    return handleAuthError(error);
  }
}
