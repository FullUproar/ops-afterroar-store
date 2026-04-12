import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/* ------------------------------------------------------------------ */
/*  POST /api/hq-bridge/checkin — HQ notifies us of a player check-in */
/*  When a player geo-checks in at our store via Afterroar, HQ calls  */
/*  this endpoint. We surface them in the register's recent customers. */
/*                                                                     */
/*  Auth: Bearer token = store's hq_webhook_secret                     */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  // Verify auth
  const authHeader = request.headers.get("authorization");
  const storeId = request.headers.get("x-store-id"); // venue ID

  if (!authHeader || !storeId) {
    return NextResponse.json({ error: "Missing auth" }, { status: 401 });
  }

  const token = authHeader.replace("Bearer ", "");

  // Find the store by venue ID
  const store = await prisma.posStore.findFirst({
    where: {
      settings: { path: ["venueId"], equals: storeId },
    },
    select: { id: true, settings: true },
  });

  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  const settings = (store.settings ?? {}) as Record<string, unknown>;
  const expectedSecret = settings.hq_webhook_secret as string;

  if (!expectedSecret || token !== expectedSecret) {
    return NextResponse.json({ error: "Invalid auth" }, { status: 401 });
  }

  // Parse body
  let body: {
    afterroar_user_id: string;
    display_name: string;
    avatar_url?: string;
    timestamp?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { afterroar_user_id, display_name, avatar_url } = body;

  if (!afterroar_user_id || !display_name) {
    return NextResponse.json({ error: "afterroar_user_id and display_name required" }, { status: 400 });
  }

  // Find or create the POS customer
  let customer = await prisma.posCustomer.findFirst({
    where: { store_id: store.id, afterroar_user_id },
    select: { id: true, name: true },
  });

  if (!customer) {
    // Auto-create customer from Afterroar passport data
    customer = await prisma.posCustomer.create({
      data: {
        store_id: store.id,
        name: display_name,
        afterroar_user_id,
        credit_balance_cents: 0,
      },
      select: { id: true, name: true },
    });
  }

  // Record the check-in timestamp in a lightweight way
  // Store recent check-ins in store settings (last 20, rolling)
  const recentCheckins = ((settings.recent_checkins as Array<{
    customer_id: string;
    name: string;
    afterroar_user_id: string;
    checked_in_at: string;
  }>) || []).slice(0, 19); // Keep last 19, we'll add 1

  recentCheckins.unshift({
    customer_id: customer.id,
    name: customer.name,
    afterroar_user_id,
    checked_in_at: new Date().toISOString(),
  });

  await prisma.posStore.update({
    where: { id: store.id },
    data: {
      settings: JSON.parse(JSON.stringify({
        ...settings,
        recent_checkins: recentCheckins,
      })),
    },
  });

  return NextResponse.json({ success: true, customer_id: customer.id });
}
