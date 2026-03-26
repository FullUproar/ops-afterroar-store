import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { getVenueById, getGroupForVenue } from "@/lib/hq-bridge";

export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requirePermission("store.settings");

    const body = await request.json();
    const { venueId } = body;

    if (!venueId) {
      return NextResponse.json({ error: "venueId is required" }, { status: 400 });
    }

    // Look up the venue
    const venue = await getVenueById(venueId);
    if (!venue) {
      return NextResponse.json({ error: "Venue not found" }, { status: 404 });
    }

    // Look up the venue's GameGroup
    const group = await getGroupForVenue(venueId);

    // Save venueId and groupId to store settings
    const store = await prisma.posStore.findUnique({
      where: { id: storeId },
      select: { settings: true },
    });

    const existing = (store?.settings ?? {}) as Record<string, unknown>;
    const merged = {
      ...existing,
      venueId: venue.id,
      venueName: venue.name,
      venueSlug: venue.slug,
      groupId: group?.id || null,
      groupName: group?.name || null,
    };

    await prisma.posStore.update({
      where: { id: storeId },
      data: { settings: merged, updated_at: new Date() },
    });

    return NextResponse.json({
      success: true,
      venue: { id: venue.id, name: venue.name, slug: venue.slug },
      group: group ? { id: group.id, name: group.name } : null,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(_request: NextRequest) {
  try {
    const { storeId } = await requirePermission("store.settings");

    const store = await prisma.posStore.findUnique({
      where: { id: storeId },
      select: { settings: true },
    });

    const existing = (store?.settings ?? {}) as Record<string, unknown>;
    const { venueId: _v, venueName: _vn, venueSlug: _vs, groupId: _g, groupName: _gn, ...rest } = existing;

    await prisma.posStore.update({
      where: { id: storeId },
      data: { settings: rest as Record<string, string>, updated_at: new Date() },
    });

    return NextResponse.json({ success: true, disconnected: true });
  } catch (error) {
    return handleAuthError(error);
  }
}
