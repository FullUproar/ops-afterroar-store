import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { calculateEventPoints, earnPoints } from "@/lib/loyalty";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await requireStaff();

    // Verify event belongs to this store
    const event = await db.posEvent.findFirst({
      where: { id },
    });
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const data = await db.posEventCheckin.findMany({
      where: { event_id: id },
      include: { customer: { select: { name: true } } },
      orderBy: { checked_in_at: "asc" },
    });

    const mapped = data.map((ci) => ({
      ...ci,
      customer_name: ci.customer?.name ?? null,
      customer: undefined,
    }));

    return NextResponse.json(mapped);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: event_id } = await params;
    const { db, storeId } = await requireStaff();

    const body = await request.json();
    const { customer_id, ticket_tier_id } = body as {
      customer_id: string;
      ticket_tier_id?: string;
    };

    if (!customer_id) {
      return NextResponse.json({ error: "customer_id is required" }, { status: 400 });
    }

    // Check for duplicate checkin
    const existing = await db.posEventCheckin.findUnique({
      where: { event_id_customer_id: { event_id, customer_id } },
    });

    if (existing) {
      return NextResponse.json({ error: "Customer already checked in" }, { status: 409 });
    }

    // Get event — verify it belongs to this store
    const event = await db.posEvent.findFirst({
      where: { id: event_id },
      select: { entry_fee_cents: true },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Resolve ticket tier pricing (tier > flat fee > free)
    let feeCents = event.entry_fee_cents;
    let tierName: string | null = null;

    if (ticket_tier_id) {
      const tier = await db.posEventTicketTier.findFirst({
        where: { id: ticket_tier_id, event_id, active: true },
        select: { id: true, name: true, price_cents: true, capacity: true, sold: true },
      });

      if (!tier) {
        return NextResponse.json({ error: "Ticket tier not found or inactive" }, { status: 400 });
      }

      // Check capacity
      if (tier.capacity && tier.sold >= tier.capacity) {
        return NextResponse.json({ error: `${tier.name} is sold out` }, { status: 400 });
      }

      feeCents = tier.price_cents;
      tierName = tier.name;

      // Increment sold count
      await db.posEventTicketTier.update({
        where: { id: ticket_tier_id },
        data: { sold: { increment: 1 } },
      });
    }

    const fee_paid = feeCents > 0;

    // Create checkin record
    const checkin = await db.posEventCheckin.create({
      data: {
        event_id,
        customer_id,
        checked_in_at: new Date(),
        fee_paid,
        ticket_tier_id: ticket_tier_id || null,
        amount_paid_cents: feeCents,
      },
    });

    // If there's a fee, create a ledger entry
    if (feeCents > 0) {
      await db.posLedgerEntry.create({
        data: {
          store_id: storeId,
          customer_id,
          type: "event_fee",
          amount_cents: feeCents,
          event_id,
          description: tierName ? `Event ticket: ${tierName}` : "Event entry fee",
        },
      });
    }

    // Earn loyalty points for event attendance
    const storeRecord = await prisma.posStore.findUnique({
      where: { id: storeId },
      select: { settings: true },
    });
    const eventPoints = calculateEventPoints(
      storeRecord?.settings as Record<string, unknown> ?? null
    );
    if (eventPoints > 0) {
      // Use a mini-transaction for the loyalty update
      await prisma.$transaction(async (tx) => {
        await earnPoints(tx, {
          storeId,
          customerId: customer_id,
          type: "earn_event",
          points: eventPoints,
          description: "Event check-in bonus",
          referenceId: event_id,
        });
      });
    }

    // Sync event attendance to HQ if customer is linked
    try {
      const cust = await db.posCustomer.findFirst({
        where: { id: customer_id },
        select: { afterroar_user_id: true },
      });
      if (cust?.afterroar_user_id) {
        const eventFull = await db.posEvent.findFirst({
          where: { id: event_id },
          select: { name: true, event_type: true },
        });
        const { enqueueHQ } = await import("@/lib/hq-outbox");
        await enqueueHQ(storeId, "event_attendance", {
          userId: cust.afterroar_user_id,
          storeId,
          eventId: event_id,
          eventType: eventFull?.event_type || "unknown",
          eventName: eventFull?.name || "Event",
        });
      }
    } catch {}

    return NextResponse.json(checkin, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
