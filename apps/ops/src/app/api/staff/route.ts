import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { hash } from "bcryptjs";

/* ------------------------------------------------------------------ */
/*  GET /api/staff — list staff for the store                          */
/* ------------------------------------------------------------------ */
export async function GET() {
  try {
    const { db, storeId } = await requirePermission("staff.manage");
    // SECURITY: explicit store_id filter + tenant client for defense-in-depth
    const staff = await db.posStaff.findMany({
      where: { store_id: storeId },
      include: {
        user: { select: { email: true, displayName: true, avatarUrl: true } },
      },
      orderBy: { created_at: "asc" },
    });

    return NextResponse.json(
      staff.map((s) => ({
        id: s.id,
        store_id: s.store_id,
        user_id: s.user_id,
        name: s.name,
        email: s.user.email,
        display_name: s.user.displayName,
        avatar_url: s.user.avatarUrl,
        role: s.role,
        active: s.active,
        has_pin: !!s.pin_hash,
        created_at: s.created_at,
      }))
    );
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/staff — invite staff member                              */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    const { storeId, role: callerRole, db } = await requirePermission("staff.manage");

    let body: { email: string; name: string; role: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { email, name, role } = body;

    if (!email?.trim() || !name?.trim()) {
      return NextResponse.json(
        { error: "Email and name are required" },
        { status: 400 }
      );
    }

    if (!["manager", "cashier"].includes(role)) {
      return NextResponse.json(
        { error: "Role must be manager or cashier" },
        { status: 400 }
      );
    }

    // Only owners can create managers
    if (role === "manager" && callerRole !== "owner") {
      return NextResponse.json(
        { error: "Only owners can create managers" },
        { status: 403 }
      );
    }

    // Find or create User record
    let user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      // Create a new user with a temporary password
      const tempPassword = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const passwordHash = await hash(tempPassword, 12);

      user = await prisma.user.create({
        data: {
          id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          email: email.toLowerCase().trim(),
          displayName: name.trim(),
          passwordHash,
        },
      });
    }

    // Check if staff record already exists
    const existing = await db.posStaff.findFirst({
      where: { user_id: user.id },
    });

    if (existing) {
      if (existing.active) {
        return NextResponse.json(
          { error: "This user is already a staff member" },
          { status: 400 }
        );
      }
      // Reactivate
      const updated = await db.posStaff.update({
        where: { id: existing.id },
        data: { active: true, role, name: name.trim() },
      });
      return NextResponse.json(updated, { status: 201 });
    }

    // Create new staff record
    const staff = await db.posStaff.create({
      data: {
        user_id: user.id,
        store_id: storeId,
        role,
        name: name.trim(),
      },
    });

    return NextResponse.json(
      { ...staff, email: user.email },
      { status: 201 }
    );
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  PATCH /api/staff — update role or active status                    */
/* ------------------------------------------------------------------ */
export async function PATCH(request: NextRequest) {
  try {
    const { storeId, role: callerRole, staff: callerStaff, db } =
      await requirePermission("staff.manage");

    let body: { staff_id: string; role?: string; active?: boolean };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { staff_id, role, active } = body;

    if (!staff_id) {
      return NextResponse.json(
        { error: "staff_id is required" },
        { status: 400 }
      );
    }

    // Cannot modify yourself
    if (staff_id === callerStaff.id) {
      return NextResponse.json(
        { error: "Cannot modify your own role or status" },
        { status: 400 }
      );
    }

    const target = await db.posStaff.findFirst({
      where: { id: staff_id },
    });

    if (!target) {
      return NextResponse.json(
        { error: "Staff member not found" },
        { status: 404 }
      );
    }

    // Only owners can change roles
    if (role !== undefined && callerRole !== "owner") {
      return NextResponse.json(
        { error: "Only owners can change roles" },
        { status: 403 }
      );
    }

    // Cannot change owner role
    if (target.role === "owner" && role && role !== "owner") {
      return NextResponse.json(
        { error: "Cannot demote the owner" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (role !== undefined && ["owner", "manager", "cashier"].includes(role)) {
      updateData.role = role;
    }
    if (active !== undefined) {
      updateData.active = active;
    }

    // SECURITY: scope update to store_id via tenant client
    const updated = await db.posStaff.update({
      where: { id: staff_id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleAuthError(error);
  }
}
