import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  /api/events/[id]/tiers — manage ticket tiers for an event          */
/*  GET: list tiers                                                    */
/*  POST: create a tier                                                */
/*  PATCH: update a tier                                               */
/*  DELETE: remove a tier                                              */
/* ------------------------------------------------------------------ */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db } = await requirePermission("events.checkin");
    const { id } = await params;

    const tiers = await db.posEventTicketTier.findMany({
      where: { event_id: id },
      orderBy: { sort_order: "asc" },
      include: {
        _count: { select: { checkins: true } },
      },
    });

    return NextResponse.json(
      tiers.map((t) => ({
        ...t,
        tickets_sold: t._count.checkins,
        available: t.capacity ? t.capacity - t._count.checkins : null,
      })),
    );
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db } = await requirePermission("events.manage");
    const { id } = await params;

    // Verify event exists
    const event = await db.posEvent.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const body = await request.json();
    const { name, description, price_cents, capacity, sort_order, available_from, available_until } = body as {
      name: string;
      description?: string;
      price_cents: number;
      capacity?: number;
      sort_order?: number;
      available_from?: string;
      available_until?: string;
    };

    if (!name || price_cents === undefined) {
      return NextResponse.json({ error: "name and price_cents required" }, { status: 400 });
    }

    const tier = await db.posEventTicketTier.create({
      data: {
        event_id: id,
        name,
        description: description || null,
        price_cents,
        capacity: capacity || null,
        sort_order: sort_order ?? 0,
        available_from: available_from ? new Date(available_from) : null,
        available_until: available_until ? new Date(available_until) : null,
      },
    });

    return NextResponse.json(tier, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db } = await requirePermission("events.manage");
    await params; // event id — we use tier_id from body

    const body = await request.json();
    const { tier_id, ...updates } = body as {
      tier_id: string;
      name?: string;
      description?: string;
      price_cents?: number;
      capacity?: number;
      sort_order?: number;
      available_from?: string | null;
      available_until?: string | null;
      active?: boolean;
    };

    if (!tier_id) {
      return NextResponse.json({ error: "tier_id required" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (updates.name !== undefined) data.name = updates.name;
    if (updates.description !== undefined) data.description = updates.description;
    if (updates.price_cents !== undefined) data.price_cents = updates.price_cents;
    if (updates.capacity !== undefined) data.capacity = updates.capacity;
    if (updates.sort_order !== undefined) data.sort_order = updates.sort_order;
    if (updates.active !== undefined) data.active = updates.active;
    if (updates.available_from !== undefined) {
      data.available_from = updates.available_from ? new Date(updates.available_from) : null;
    }
    if (updates.available_until !== undefined) {
      data.available_until = updates.available_until ? new Date(updates.available_until) : null;
    }

    const tier = await db.posEventTicketTier.update({
      where: { id: tier_id },
      data,
    });

    return NextResponse.json(tier);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db } = await requirePermission("events.manage");
    await params;

    const body = await request.json();
    const { tier_id } = body as { tier_id: string };

    if (!tier_id) {
      return NextResponse.json({ error: "tier_id required" }, { status: 400 });
    }

    // Check no checkins use this tier
    const checkinCount = await db.posEventCheckin.count({
      where: { ticket_tier_id: tier_id },
    });

    if (checkinCount > 0) {
      // Soft-delete — just deactivate
      await db.posEventTicketTier.update({
        where: { id: tier_id },
        data: { active: false },
      });
      return NextResponse.json({ deactivated: true, reason: "Has existing checkins" });
    }

    await db.posEventTicketTier.delete({ where: { id: tier_id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleAuthError(error);
  }
}
