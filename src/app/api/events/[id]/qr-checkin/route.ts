import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { markGuestAttended } from "@/lib/hq-bridge";
import { calculateEventPoints, earnPoints } from "@/lib/loyalty";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: event_id } = await params;
    const { db, storeId } = await requireStaff();

    const body = await request.json();
    const { guest_id } = body;

    if (!guest_id) {
      return NextResponse.json({ error: "guest_id is required" }, { status: 400 });
    }

    // Verify event belongs to this store and has an HQ link
    const event = await db.posEvent.findFirst({
      where: { id: event_id },
      select: { afterroar_event_id: true, entry_fee_cents: true },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (!event.afterroar_event_id) {
      return NextResponse.json({ error: "Event is not linked to Afterroar" }, { status: 400 });
    }

    // Read the GameNightGuest to get userId
    const guestRows = await prisma.$queryRawUnsafe<
      Array<{ id: string; userId: string | null; guestName: string | null; guestEmail: string | null }>
    >(
      `SELECT id, "userId", "guestName", "guestEmail"
       FROM "GameNightGuest"
       WHERE id = $1 AND "gameNightId" = $2
       LIMIT 1`,
      guest_id,
      event.afterroar_event_id
    );

    const guest = guestRows[0];
    if (!guest) {
      return NextResponse.json({ error: "Guest not found for this event" }, { status: 404 });
    }

    // Find or create pos_customer linked to this user
    let customer;
    if (guest.userId) {
      // Try to find existing customer linked to this Afterroar user
      customer = await db.posCustomer.findFirst({
        where: { afterroar_user_id: guest.userId },
      });

      if (!customer) {
        // Look up user info for name/email
        const userRows = await prisma.$queryRawUnsafe<
          Array<{ displayName: string | null; email: string }>
        >(
          `SELECT "displayName", email FROM "User" WHERE id = $1 LIMIT 1`,
          guest.userId
        );
        const user = userRows[0];

        customer = await db.posCustomer.create({
          data: {
            store_id: storeId,
            name: user?.displayName || guest.guestName || "Unknown Player",
            email: user?.email || guest.guestEmail || null,
            afterroar_user_id: guest.userId,
          },
        });
      }
    } else {
      // Guest without an Afterroar account -- create/find by guest email
      if (guest.guestEmail) {
        customer = await db.posCustomer.findFirst({
          where: { email: guest.guestEmail },
        });
      }
      if (!customer) {
        customer = await db.posCustomer.create({
          data: {
            store_id: storeId,
            name: guest.guestName || "Walk-in Guest",
            email: guest.guestEmail || null,
          },
        });
      }
    }

    // Check for duplicate check-in
    const existing = await db.posEventCheckin.findUnique({
      where: { event_id_customer_id: { event_id, customer_id: customer.id } },
    });

    if (existing) {
      return NextResponse.json({ error: "Guest already checked in" }, { status: 409 });
    }

    const fee_paid = event.entry_fee_cents > 0;

    // Create check-in record
    const checkin = await db.posEventCheckin.create({
      data: {
        event_id,
        customer_id: customer.id,
        checked_in_at: new Date(),
        fee_paid,
      },
    });

    // Create ledger entry for entry fee if applicable
    let fee_charged = 0;
    if (event.entry_fee_cents > 0) {
      await db.posLedgerEntry.create({
        data: {
          store_id: storeId,
          customer_id: customer.id,
          type: "event_fee",
          amount_cents: event.entry_fee_cents,
          event_id,
          description: "Event entry fee (QR check-in)",
        },
      });
      fee_charged = event.entry_fee_cents;
    }

    // Mark guest as attended in HQ
    await markGuestAttended(guest_id, true);

    // Earn loyalty points for event attendance
    let points_earned = 0;
    const storeRecord = await prisma.posStore.findUnique({
      where: { id: storeId },
      select: { settings: true },
    });
    const eventPoints = calculateEventPoints(
      storeRecord?.settings as Record<string, unknown> ?? null
    );
    if (eventPoints > 0) {
      await prisma.$transaction(async (tx) => {
        const result = await earnPoints(tx, {
          storeId,
          customerId: customer.id,
          type: "earn_event",
          points: eventPoints,
          description: "Event check-in bonus (QR)",
          referenceId: event_id,
        });
        points_earned = result.points_earned;
      });
    }

    return NextResponse.json({
      success: true,
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
      },
      fee_charged,
      points_earned,
    }, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
