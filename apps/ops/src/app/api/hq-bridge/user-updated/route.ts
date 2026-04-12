import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { opLog } from "@/lib/op-log";

/* ------------------------------------------------------------------ */
/*  POST /api/hq-bridge/user-updated                                   */
/*  HQ notifies us that an Afterroar user updated their profile.       */
/*  We store the HQ display name + avatar in the customer's            */
/*  attributes so the store-entered name is always preserved.          */
/*                                                                     */
/*  Auth: Platform-level HQ_BRIDGE_SECRET (cross-store operation)      */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  // Platform-level auth (not per-store — this is a cross-store operation)
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing authorization" }, { status: 401 });
  }
  const token = authHeader.replace("Bearer ", "").trim();
  const platformSecret = process.env.HQ_BRIDGE_SECRET;
  if (!platformSecret || platformSecret.length < 16) {
    return NextResponse.json({ error: "Bridge not configured" }, { status: 500 });
  }
  const crypto = require("crypto");
  if (!crypto.timingSafeEqual(Buffer.from(token), Buffer.from(platformSecret))) {
    return NextResponse.json({ error: "Invalid authorization" }, { status: 401 });
  }

  let body: { afterroar_user_id: string; displayName?: string; avatarUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { afterroar_user_id, displayName, avatarUrl } = body;
  if (!afterroar_user_id) {
    return NextResponse.json(
      { error: "afterroar_user_id required" },
      { status: 400 },
    );
  }

  // Validate afterroar_user_id format (CUID or UUID)
  if (!/^[a-zA-Z0-9_-]{10,128}$/.test(afterroar_user_id)) {
    return NextResponse.json(
      { error: "Invalid afterroar_user_id format" },
      { status: 400 },
    );
  }

  if (!displayName && !avatarUrl) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  // Find ALL customers across ALL stores linked to this Afterroar user
  const linkedCustomers = await prisma.posCustomer.findMany({
    where: { afterroar_user_id },
    select: { id: true, store_id: true, name: true, tags: true },
    take: 1000,
  });

  if (linkedCustomers.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  for (const cust of linkedCustomers) {
    // Store HQ profile data as prefixed tags to preserve the store-entered name.
    // Format: "afterroar_display_name::John Doe", "afterroar_avatar_url::https://..."
    const currentTags = (cust.tags ?? []) as string[];
    let newTags = [...currentTags];

    if (displayName) {
      newTags = newTags.filter((t) => !t.startsWith("afterroar_display_name::"));
      newTags.push(`afterroar_display_name::${displayName}`);
    }
    if (avatarUrl) {
      newTags = newTags.filter((t) => !t.startsWith("afterroar_avatar_url::"));
      newTags.push(`afterroar_avatar_url::${avatarUrl}`);
    }

    await prisma.posCustomer.update({
      where: { id: cust.id },
      data: { tags: { set: newTags } },
    });

    opLog({
      storeId: cust.store_id,
      eventType: "passport.updated",
      severity: "info",
      message: `Afterroar profile updated for "${cust.name}"`,
      metadata: {
        afterroar_user_id,
        customer_id: cust.id,
        ...(displayName ? { displayName } : {}),
        ...(avatarUrl ? { avatarUrl } : {}),
      },
    });
  }

  return NextResponse.json({ ok: true, updated: linkedCustomers.length });
}
