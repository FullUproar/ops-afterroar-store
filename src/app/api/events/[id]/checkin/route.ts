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
    const { customer_id } = body;

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

    const fee_paid = event.entry_fee_cents > 0;

    // Create checkin record
    const checkin = await db.posEventCheckin.create({
      data: {
        event_id,
        customer_id,
        checked_in_at: new Date(),
        fee_paid,
      },
    });

    // If there's an entry fee, create a ledger entry
    if (event.entry_fee_cents > 0) {
      await db.posLedgerEntry.create({
        data: {
          store_id: storeId,
          customer_id,
          type: "event_fee",
          amount_cents: event.entry_fee_cents,
          event_id,
          description: "Event entry fee",
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
