import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { compare } from "bcryptjs";
import {
  setActiveStaffCookie,
  clearActiveStaffCookie,
  getActiveStaffFromCookie,
} from "@/lib/active-staff";

/* ------------------------------------------------------------------ */
/*  Staff Auth API — Layer 2 authentication                            */
/*  POST: verify PIN, set active staff cookie                          */
/*  GET: check current active staff                                    */
/*  DELETE: end shift, clear cookie                                    */
/* ------------------------------------------------------------------ */

/** GET /api/staff-auth — who is the active staff member? */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ staff: null }, { status: 401 });
    }

    const active = await getActiveStaffFromCookie();
    if (!active) {
      return NextResponse.json({ staff: null });
    }

    // Verify the staff member still exists and is active
    const staff = await prisma.posStaff.findFirst({
      where: { id: active.staffId, store_id: active.storeId, active: true },
      select: { id: true, name: true, role: true },
    });

    if (!staff) {
      await clearActiveStaffCookie();
      return NextResponse.json({ staff: null });
    }

    return NextResponse.json({ staff });
  } catch {
    return NextResponse.json({ staff: null }, { status: 500 });
  }
}

/** POST /api/staff-auth — verify PIN and set active staff */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const body = await request.json();
    const { staff_id, pin } = body as { staff_id: string; pin: string };

    if (!staff_id || !pin) {
      return NextResponse.json({ error: "staff_id and pin required" }, { status: 400 });
    }

    // Get the session user's store
    const sessionStaff = await prisma.posStaff.findFirst({
      where: { user_id: session.user.id, active: true },
      select: { store_id: true },
    });

    if (!sessionStaff) {
      return NextResponse.json({ error: "No store found" }, { status: 403 });
    }

    // Find the target staff member (must be in the same store)
    const staff = await prisma.posStaff.findFirst({
      where: { id: staff_id, store_id: sessionStaff.store_id, active: true },
      select: { id: true, name: true, role: true, pin_hash: true, store_id: true },
    });

    if (!staff || !staff.pin_hash) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const pinValid = await compare(pin, staff.pin_hash);
    if (!pinValid) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    // Set the active staff cookie
    await setActiveStaffCookie(staff.id, staff.store_id);

    return NextResponse.json({
      staff: { id: staff.id, name: staff.name, role: staff.role },
    });
  } catch (error) {
    console.error("[staff-auth] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** DELETE /api/staff-auth — end shift, clear active staff */
export async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    await clearActiveStaffCookie();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
