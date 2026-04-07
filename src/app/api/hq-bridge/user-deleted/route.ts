import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { opLog } from "@/lib/op-log";

/* ------------------------------------------------------------------ */
/*  POST /api/hq-bridge/user-deleted                                   */
/*  HQ notifies us that an Afterroar user deleted their account.       */
/*  We clear afterroar_user_id on ALL matching customers across ALL    */
/*  stores. Cross-store operation — uses global prisma.                */
/*                                                                     */
/*  Auth: Bearer token matched against each store's hq_webhook_secret  */
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

  // Verify the bearer token matches at least one store's webhook secret.
  // HQ sends one secret — we find which store(s) it belongs to.
  const stores = await prisma.posStore.findMany({
    where: {
      settings: { path: ["hq_webhook_secret"], equals: token },
    },
    select: { id: true },
  });

  if (stores.length === 0) {
    return NextResponse.json({ error: "Invalid auth" }, { status: 401 });
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

  // Find ALL customers across ALL stores linked to this Afterroar user
  const linkedCustomers = await prisma.posCustomer.findMany({
    where: { afterroar_user_id },
    select: { id: true, store_id: true, name: true },
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
