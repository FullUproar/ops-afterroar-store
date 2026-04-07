import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";

/* ------------------------------------------------------------------ */
/*  GET /api/staff/accept-invite?token=xxx — validate invite token     */
/*  POST /api/staff/accept-invite — accept invite, set password + PIN  */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const staff = await prisma.posStaff.findFirst({
    where: { invite_token: token },
    include: {
      store: { select: { name: true } },
      user: { select: { email: true } },
    },
  });

  if (!staff) {
    return NextResponse.json({ error: "Invite not found or already used." }, { status: 404 });
  }

  if (staff.invite_accepted_at) {
    return NextResponse.json({ error: "This invite has already been accepted." }, { status: 400 });
  }

  if (staff.invite_expires_at && new Date() > new Date(staff.invite_expires_at)) {
    return NextResponse.json({ error: "This invite has expired. Ask your manager for a new one." }, { status: 400 });
  }

  return NextResponse.json({
    staff_name: staff.name,
    store_name: staff.store.name,
    role: staff.role,
    email: staff.user?.email,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, password, pin } = body as { token: string; password: string; pin: string };

    if (!token || !password || !pin) {
      return NextResponse.json({ error: "Token, password, and PIN are required." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    if (pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
      return NextResponse.json({ error: "PIN must be 4-8 digits." }, { status: 400 });
    }

    const staff = await prisma.posStaff.findFirst({
      where: { invite_token: token },
      include: { user: true },
    });

    if (!staff) {
      return NextResponse.json({ error: "Invite not found." }, { status: 404 });
    }

    if (staff.invite_accepted_at) {
      return NextResponse.json({ error: "Already accepted." }, { status: 400 });
    }

    if (staff.invite_expires_at && new Date() > new Date(staff.invite_expires_at)) {
      return NextResponse.json({ error: "Invite expired." }, { status: 400 });
    }

    // Hash password and PIN
    const passwordHash = await hash(password, 12);
    const pinHash = await hash(pin, 10);

    // Update HQ User with password hash
    await prisma.user.update({
      where: { id: staff.user_id },
      data: { passwordHash },
    });

    // Update staff with PIN and mark invite as accepted
    await prisma.posStaff.update({
      where: { id: staff.id },
      data: {
        pin_hash: pinHash,
        invite_accepted_at: new Date(),
        invite_token: null, // Clear token after use
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[accept-invite]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to accept invite" },
      { status: 500 }
    );
  }
}
