import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { getGameNightGuests, getTrustBadge, isIdentityVerified } from "@/lib/hq-bridge";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await requireStaff();

    // Verify event belongs to this store and has an HQ link
    const event = await db.posEvent.findFirst({
      where: { id },
      select: { afterroar_event_id: true },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (!event.afterroar_event_id) {
      return NextResponse.json({ error: "Event is not linked to Afterroar" }, { status: 400 });
    }

    // Get RSVP guest list from HQ
    const guests = await getGameNightGuests(event.afterroar_event_id);

    // Get existing check-ins for this event
    const checkins = await db.posEventCheckin.findMany({
      where: { event_id: id },
      select: { customer_id: true, customer: { select: { afterroar_user_id: true } } },
    });
    const checkedInUserIds = new Set(
      checkins
        .map((c) => c.customer?.afterroar_user_id)
        .filter(Boolean)
    );

    // Enrich guests with trust badges and check-in status
    const enriched = guests.map((guest) => {
      const badge = getTrustBadge(guest.reputationScore);
      const verified = isIdentityVerified(guest.identityVerified);
      const checkedIn = guest.userId ? checkedInUserIds.has(guest.userId) : false;

      return {
        id: guest.id,
        userId: guest.userId,
        name: guest.displayName || guest.guestName || guest.guestEmail || "Unknown",
        email: guest.guestEmail,
        avatarUrl: guest.avatarUrl,
        status: guest.status,
        attended: guest.attended,
        noShow: guest.noShow,
        confirmedAt: guest.confirmedAt,
        trustBadge: badge,
        identityVerified: verified,
        checkedIn,
        reputationScore: guest.reputationScore,
      };
    });

    return NextResponse.json(enriched);
  } catch (error) {
    return handleAuthError(error);
  }
}
