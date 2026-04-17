import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { createHQGameNight } from "@/lib/hq-bridge";

export async function GET(request: NextRequest) {
  try {
    const { db, storeId } = await requireStaff();

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);
    const skip = (page - 1) * pageSize;

    const where = { store_id: storeId };

    const [events, total] = await Promise.all([
      db.posEvent.findMany({
        where,
        orderBy: { starts_at: "desc" },
        skip,
        take: Math.min(pageSize, 200),
        include: {
          _count: { select: { checkins: true } },
        },
      }),
      db.posEvent.count({ where }),
    ]);

    // For HQ-linked events, get RSVP counts
    const hqEventIds = events
      .filter((e) => e.afterroar_event_id)
      .map((e) => e.afterroar_event_id as string);

    let rsvpCounts: Record<string, number> = {};
    if (hqEventIds.length > 0) {
      const placeholders = hqEventIds.map((_, i) => `$${i + 1}`).join(",");
      const rows = await prisma.$queryRawUnsafe<
        Array<{ gameNightId: string; count: bigint }>
      >(
        `SELECT "gameNightId", COUNT(*) as count
         FROM "GameNightGuest"
         WHERE "gameNightId" IN (${placeholders}) AND status = 'IN'
         GROUP BY "gameNightId"`,
        ...hqEventIds
      );
      rsvpCounts = Object.fromEntries(
        rows.map((r) => [r.gameNightId, Number(r.count)])
      );
    }

    const mapped = events.map((e) => ({
      ...e,
      checkin_count: e._count.checkins,
      rsvp_count: e.afterroar_event_id
        ? rsvpCounts[e.afterroar_event_id] ?? 0
        : null,
      _count: undefined,
    }));

    return NextResponse.json({ data: mapped, total, page, pageSize });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db, storeId, staff } = await requireStaff();

    const body = await request.json();
    const {
      name,
      event_type,
      starts_at,
      ends_at,
      entry_fee_cents,
      max_players,
      description,
      create_hq_event,
    } = body;

    if (!name || !event_type || !starts_at) {
      return NextResponse.json(
        { error: "name, event_type, and starts_at are required" },
        { status: 400 }
      );
    }

    let afterroar_event_id: string | null = null;

    // If creating an HQ-linked event, create GameNight first
    if (create_hq_event) {
      const store = await prisma.posStore.findUnique({
        where: { id: storeId },
        select: { settings: true },
      });
      const settings = (store?.settings ?? {}) as Record<string, unknown>;
      const groupId = settings.groupId as string | undefined;

      if (!groupId) {
        return NextResponse.json(
          { error: "Store is not connected to Afterroar. Connect in Settings first." },
          { status: 400 }
        );
      }

      // Get the staff member's HQ user ID
      const staffRecord = await prisma.posStaff.findFirst({
        where: { id: staff.id },
        select: { user_id: true },
      });

      if (!staffRecord) {
        return NextResponse.json({ error: "Staff record not found" }, { status: 400 });
      }

      const eventDate = new Date(starts_at);
      const startTime = `${String(eventDate.getHours()).padStart(2, "0")}:${String(eventDate.getMinutes()).padStart(2, "0")}`;

      const result = await createHQGameNight({
        title: name,
        date: eventDate,
        startTime,
        description: description || undefined,
        maxGuests: max_players || undefined,
        groupId,
        createdById: staffRecord.user_id,
        vibe: "COMPETITIVE",
        isPublic: true,
      }) as Array<{ id: string }>;

      if (result && result.length > 0) {
        afterroar_event_id = result[0].id;
      }
    }

    const data = await db.posEvent.create({
      data: {
        store_id: storeId,
        name,
        event_type,
        starts_at: new Date(starts_at),
        ends_at: ends_at ? new Date(ends_at) : null,
        entry_fee_cents: entry_fee_cents ?? 0,
        max_players: max_players || null,
        description: description || null,
        afterroar_event_id,
      },
    });

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
