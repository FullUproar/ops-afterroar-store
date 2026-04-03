import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { prisma } from "@/lib/prisma";
import { getStoreSettings } from "@/lib/store-settings-shared";

/* ------------------------------------------------------------------ */
/*  GET /api/passport/lookup?afterroar_user_id=xxx                     */
/*  Looks up an Afterroar user via HQ's Passport API, then finds or   */
/*  auto-creates a POS customer linked to that user.                   */
/*  Used when scanning a Passport QR at the register.                  */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { db, storeId } = await requireStaff();

    const afterroarUserId = request.nextUrl.searchParams.get("afterroar_user_id");
    if (!afterroarUserId) {
      return NextResponse.json({ error: "afterroar_user_id required" }, { status: 400 });
    }

    // Check if we already have this customer locally
    let customer = await db.posCustomer.findFirst({
      where: { afterroar_user_id: afterroarUserId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        credit_balance_cents: true,
        loyalty_points: true,
        afterroar_user_id: true,
        created_at: true,
      },
    });

    if (customer) {
      return NextResponse.json({ customer, source: "local" });
    }

    // Not found locally — call HQ Passport API
    const store = await db.posStore.findFirst({ select: { settings: true } });
    const settings = getStoreSettings((store?.settings ?? {}) as Record<string, unknown>);
    const webhookSecret = (store?.settings as Record<string, unknown>)?.hq_webhook_secret as string;
    const venueId = (store?.settings as Record<string, unknown>)?.venueId as string;

    if (!webhookSecret || !venueId) {
      return NextResponse.json({ error: "Afterroar not connected" }, { status: 503 });
    }

    try {
      const hqRes = await fetch(
        `https://www.fulluproar.com/api/passport/lookup?id=${encodeURIComponent(afterroarUserId)}`,
        {
          headers: {
            "Authorization": `Bearer ${webhookSecret}`,
            "X-Store-Id": venueId,
          },
          signal: AbortSignal.timeout(5000),
        }
      );

      if (!hqRes.ok) {
        return NextResponse.json({ customer: null, source: "hq_error" });
      }

      const passport = await hqRes.json();

      if (!passport.id) {
        return NextResponse.json({ customer: null, source: "not_found" });
      }

      // Auto-create POS customer from passport data
      customer = await prisma.posCustomer.create({
        data: {
          store_id: storeId,
          name: passport.displayName || passport.username || "Afterroar User",
          afterroar_user_id: passport.id,
          credit_balance_cents: 0,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          credit_balance_cents: true,
          loyalty_points: true,
          afterroar_user_id: true,
          created_at: true,
        },
      });

      return NextResponse.json({ customer, source: "hq_created" });
    } catch {
      // HQ unreachable — return null (don't block the cashier)
      return NextResponse.json({ customer: null, source: "hq_unreachable" });
    }
  } catch (error) {
    return handleAuthError(error);
  }
}
