import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantClient } from "@/lib/tenant-prisma";
import { hash, compare } from "bcryptjs";
import { getStoreSettings } from "@/lib/store-settings-shared";

/* ------------------------------------------------------------------ */
/*  Mobile Timeclock API — PIN-based, no session required              */
/*  Used by /clock/[slug] for employee phone clock-in                  */
/* ------------------------------------------------------------------ */

/** GET /api/clock?store=slug — get store info + staff list for clock page */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("store");
  if (!slug) {
    return NextResponse.json({ error: "Store slug required" }, { status: 400 });
  }

  const store = await prisma.posStore.findFirst({
    where: { slug },
    select: { id: true, name: true, slug: true, settings: true },
  });

  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  const settings = getStoreSettings(
    (store.settings ?? {}) as Record<string, unknown>,
  );

  // Get active staff who have PINs set
  const staff = await prisma.posStaff.findMany({
    where: { store_id: store.id, active: true, pin_hash: { not: null } },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });

  // Check if geofence is configured
  const geofence = settings.timeclock_geofence_enabled
    ? {
        lat: settings.timeclock_geofence_lat as number,
        lng: settings.timeclock_geofence_lng as number,
        radius: (settings.timeclock_geofence_radius_meters as number) || 150,
      }
    : null;

  return NextResponse.json({
    store: { id: store.id, name: store.name, slug: store.slug },
    staff: staff.map((s) => ({ id: s.id, name: s.name })),
    geofence,
  });
}

/** POST /api/clock — punch in/out with PIN */
export async function POST(request: NextRequest) {
  let body: {
    store_slug: string;
    staff_id: string;
    pin: string;
    action: "clock_in" | "clock_out";
    lat?: number | null;
    lng?: number | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { store_slug, staff_id, pin, action, lat, lng } = body;

  if (!store_slug || !staff_id || !pin || !action) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Find store
  const store = await prisma.posStore.findFirst({
    where: { slug: store_slug },
    select: { id: true, settings: true },
  });
  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  // Find staff
  const staff = await prisma.posStaff.findFirst({
    where: { id: staff_id, store_id: store.id, active: true },
    select: { id: true, name: true, pin_hash: true, store_id: true },
  });
  if (!staff || !staff.pin_hash) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // Verify PIN
  const pinValid = await compare(pin, staff.pin_hash);
  if (!pinValid) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  // Determine location status
  const settings = getStoreSettings(
    (store.settings ?? {}) as Record<string, unknown>,
  );

  let clockInLocation = "no_gps";
  if (lat != null && lng != null) {
    if (settings.timeclock_geofence_enabled) {
      const storeLat = settings.timeclock_geofence_lat as number;
      const storeLng = settings.timeclock_geofence_lng as number;
      const radius = (settings.timeclock_geofence_radius_meters as number) || 150;

      const distance = haversineDistance(lat, lng, storeLat, storeLng);
      clockInLocation = distance <= radius ? "on_site" : "remote";
    } else {
      clockInLocation = "on_site"; // no geofence = trust everyone
    }
  }

  const db = getTenantClient(store.id);

  if (action === "clock_in") {
    // Check not already clocked in
    const existing = await db.posTimeEntry.findFirst({
      where: { staff_id: staff.id, clock_out: null },
    });
    if (existing) {
      return NextResponse.json({ error: "Already clocked in" }, { status: 400 });
    }

    const entry = await db.posTimeEntry.create({
      data: {
        store_id: store.id,
        staff_id: staff.id,
        clock_in: new Date(),
        clock_in_lat: lat ?? null,
        clock_in_lng: lng ?? null,
        clock_in_location: clockInLocation,
      },
    });

    return NextResponse.json({
      clocked_in: true,
      staff_name: staff.name,
      entry: { id: entry.id, clock_in: entry.clock_in, location: clockInLocation },
    }, { status: 201 });
  }

  if (action === "clock_out") {
    const openEntry = await db.posTimeEntry.findFirst({
      where: { staff_id: staff.id, clock_out: null },
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
      },
    });

    return NextResponse.json({
      clocked_in: false,
      staff_name: staff.name,
      entry: {
        id: entry.id,
        clock_in: entry.clock_in,
        clock_out: entry.clock_out,
        hours_worked: entry.hours_worked,
        location: openEntry.clock_in_location,
      },
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

/** PATCH /api/clock — set or update PIN for a staff member (requires session auth) */
export async function PATCH(request: NextRequest) {
  // This uses the standard auth flow — only owners/managers can set PINs
  const { auth } = await import("@/auth");
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const caller = await prisma.posStaff.findFirst({
    where: { user_id: session.user.id, active: true },
  });
  if (!caller || (caller.role !== "owner" && caller.role !== "manager")) {
    return NextResponse.json({ error: "Only owners and managers can set PINs" }, { status: 403 });
  }

  let body: { staff_id: string; pin: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { staff_id, pin } = body;
  if (!staff_id || !pin) {
    return NextResponse.json({ error: "staff_id and pin required" }, { status: 400 });
  }

  if (pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
    return NextResponse.json({ error: "PIN must be 4-8 digits" }, { status: 400 });
  }

  // Verify staff belongs to same store
  const target = await prisma.posStaff.findFirst({
    where: { id: staff_id, store_id: caller.store_id, active: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
  }

  // Check PIN uniqueness within store
  const pinHashed = await hash(pin, 10);

  // We can't check uniqueness on hashed PINs easily, so we'll just set it
  // and rely on the owner to communicate PINs to staff
  await prisma.posStaff.update({
    where: { id: staff_id },
    data: { pin_hash: pinHashed },
  });

  return NextResponse.json({ success: true, staff_name: target.name });
}

/* ------------------------------------------------------------------ */
/*  Haversine distance in meters                                       */
/* ------------------------------------------------------------------ */
function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
