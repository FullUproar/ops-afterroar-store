import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { opLog } from "@/lib/op-log";

/* ------------------------------------------------------------------ */
/*  POST /api/hq-bridge/disconnect                                     */
/*  Player disconnects their Afterroar account from a specific store.  */
/*  We clear afterroar_user_id but keep loyalty points (earned, not    */
/*  borrowed).                                                         */
/*                                                                     */
/*  Auth: Bearer token = store's hq_webhook_secret                     */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing auth" }, { status: 401 });
  }

  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Missing auth" }, { status: 401 });
  }

  let body: { afterroar_user_id: string; store_id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { afterroar_user_id, store_id } = body;
  if (!afterroar_user_id || !store_id) {
    return NextResponse.json(
      { error: "afterroar_user_id and store_id required" },
      { status: 400 },
    );
  }

  // Find the store and verify the webhook secret
  const store = await prisma.posStore.findUnique({
    where: { id: store_id },
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

  // Find the customer in this specific store
  const customer = await prisma.posCustomer.findFirst({
    where: { store_id, afterroar_user_id },
    select: { id: true, name: true, loyalty_points: true },
  });

  if (!customer) {
    // Not linked at this store — that's fine, idempotent
    return NextResponse.json({ ok: true, was_linked: false });
  }

  // Clear afterroar_user_id — loyalty points stay
  await prisma.posCustomer.update({
    where: { id: customer.id },
    data: { afterroar_user_id: null },
  });

  opLog({
    storeId: store_id,
    eventType: "passport.disconnected",
    severity: "info",
    message: `Player disconnected Afterroar account — customer "${customer.name}" unlinked (${customer.loyalty_points} points retained)`,
    metadata: { afterroar_user_id, customer_id: customer.id },
  });

  return NextResponse.json({ ok: true, was_linked: true });
}
