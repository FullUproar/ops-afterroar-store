import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { opLog } from "@/lib/op-log";

/* ------------------------------------------------------------------ */
/*  POST /api/hq-bridge/user-deleted                                   */
/*  HQ notifies us that an Afterroar user deleted their account.       */
/*  We clear afterroar_user_id on ALL matching customers across ALL    */
/*  stores. Cross-store operation — uses global prisma.                */
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

  let body: { afterroar_user_id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { afterroar_user_id } = body;
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

  // Find ALL customers across ALL stores linked to this Afterroar user
  const linkedCustomers = await prisma.posCustomer.findMany({
    where: { afterroar_user_id },
    select: { id: true, store_id: true, name: true },
    take: 1000,
  });

  if (linkedCustomers.length === 0) {
    return NextResponse.json({ ok: true, unlinked: 0 });
  }

  // Clear afterroar_user_id on each
  await prisma.posCustomer.updateMany({
    where: { afterroar_user_id },
    data: { afterroar_user_id: null },
  });

  // Log to each affected store
  for (const cust of linkedCustomers) {
    opLog({
      storeId: cust.store_id,
      eventType: "passport.deleted",
      severity: "info",
      message: `Afterroar account deleted — customer link removed for "${cust.name}"`,
      metadata: { afterroar_user_id, customer_id: cust.id },
    });
  }

  return NextResponse.json({ ok: true, unlinked: linkedCustomers.length });
}
