import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ingestOrder } from "@/lib/order-ingest";

/* ------------------------------------------------------------------ */
/*  POST /api/hq-bridge/orders — receive merchant-fulfilled orders     */
/*  from HQ (Full Uproar website). Only merchant items — POD stays HQ. */
/*                                                                     */
/*  Auth: Bearer token = store's hq_webhook_secret                     */
/*        X-Store-Id = venue ID (maps to store via settings.venueId)   */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const storeId = request.headers.get("x-store-id");

  if (!authHeader || !storeId) {
    return NextResponse.json({ error: "Missing auth" }, { status: 401 });
  }

  const token = authHeader.replace("Bearer ", "");

  const store = await prisma.posStore.findFirst({
    where: {
      settings: { path: ["venueId"], equals: storeId },
    },
    select: { id: true, name: true, settings: true },
  });

  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  const settings = (store.settings ?? {}) as Record<string, unknown>;
  const expectedSecret = settings.hq_webhook_secret as string;

  if (!expectedSecret || token !== expectedSecret) {
    return NextResponse.json({ error: "Invalid auth" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.order_number || !body.items) {
    return NextResponse.json({ error: "order_number and items required" }, { status: 400 });
  }

  const result = await ingestOrder(store.id, store.name, {
    external_id: body.hq_order_id as string,
    order_number: body.order_number as string,
    source: "hq_website",
    customer: body.customer as any,
    shipping_address: body.shipping_address as any,
    items: body.items as any,
    shipping_method: body.shipping_method as any,
    total_cents: body.total_cents as number,
    shipping_cents: body.shipping_cents as number,
    tax_cents: body.tax_cents as number,
    paid_at: body.paid_at as string,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
