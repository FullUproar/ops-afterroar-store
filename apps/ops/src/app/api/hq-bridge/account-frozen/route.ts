import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { opLog } from "@/lib/op-log";

/* ------------------------------------------------------------------ */
/*  POST /api/hq-bridge/account-frozen                                 */
/*  HQ notifies us that an Afterroar user's account was frozen or      */
/*  unfrozen. We tag/untag ALL matching customers across ALL stores.    */
/*                                                                     */
/*  Auth: Platform webhook secret (HQ_BRIDGE_SECRET env var)           */
/*  This is a PLATFORM-LEVEL operation, not store-scoped.              */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  // Authenticate using platform-level secret (not per-store)
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing authorization" }, { status: 401 });
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const platformSecret = process.env.HQ_BRIDGE_SECRET;

  if (!platformSecret || platformSecret.length < 16) {
    console.error("[HQ Bridge] HQ_BRIDGE_SECRET not configured or too short");
    return NextResponse.json({ error: "Bridge not configured" }, { status: 500 });
  }

  // Constant-time comparison
  const crypto = require("crypto");
  if (!crypto.timingSafeEqual(Buffer.from(token), Buffer.from(platformSecret))) {
    return NextResponse.json({ error: "Invalid authorization" }, { status: 401 });
  }

  let body: { afterroar_user_id: string; frozen: boolean; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { afterroar_user_id, frozen, reason } = body;
  if (!afterroar_user_id || typeof frozen !== "boolean") {
    return NextResponse.json(
      { error: "afterroar_user_id and frozen (boolean) required" },
      { status: 400 },
    );
  }

  // Validate afterroar_user_id format
  if (!/^[a-zA-Z0-9_-]{5,128}$/.test(afterroar_user_id)) {
    return NextResponse.json({ error: "Invalid user ID format" }, { status: 400 });
  }

  // Find ALL customers across ALL stores linked to this Afterroar user
  const linkedCustomers = await prisma.posCustomer.findMany({
    where: { afterroar_user_id },
    select: { id: true, store_id: true, name: true, tags: true },
    take: 1000, // Safety limit
  });

  if (linkedCustomers.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const TAG = "afterroar_frozen";

  for (const cust of linkedCustomers) {
    const currentTags = (cust.tags ?? []) as string[];
    const hasTag = currentTags.includes(TAG);

    if (frozen && !hasTag) {
      await prisma.posCustomer.update({
        where: { id: cust.id },
        data: { tags: { push: TAG } },
      });
    } else if (!frozen && hasTag) {
      const newTags = currentTags.filter((t) => t !== TAG);
      await prisma.posCustomer.update({
        where: { id: cust.id },
        data: { tags: { set: newTags } },
      });
    }

    opLog({
      storeId: cust.store_id,
      eventType: frozen ? "passport.frozen" : "passport.unfrozen",
      severity: frozen ? "warn" : "info",
      message: `Afterroar account ${frozen ? "frozen" : "unfrozen"} for "${cust.name}"${reason ? ` — ${reason}` : ""}`,
      metadata: { afterroar_user_id, customer_id: cust.id, frozen, reason },
    });
  }

  return NextResponse.json({ ok: true, updated: linkedCustomers.length });
}
