import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/* ------------------------------------------------------------------ */
/*  GET /api/public/stock — public inventory quantity by SKU            */
/*  No auth needed. Returns quantity only — no pricing, no PII.         */
/*  Used by: HQ website to show real-time stock on product pages.       */
/*                                                                     */
/*  Query params:                                                       */
/*    ?sku=FU-HYD-001           — single SKU lookup                    */
/*    ?skus=FU-HYD-001,FU-CF-001 — batch lookup                       */
/*    ?store=slug               — filter by store slug (optional)      */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const singleSku = params.get("sku");
  const batchSkus = params.get("skus");
  const storeSlug = params.get("store");

  if (!singleSku && !batchSkus) {
    return NextResponse.json({ error: "sku or skus parameter required" }, { status: 400 });
  }

  // Resolve store filter
  let storeId: string | undefined;
  if (storeSlug) {
    const store = await prisma.posStore.findFirst({
      where: { slug: storeSlug },
      select: { id: true },
    });
    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }
    storeId = store.id;
  }

  const where: Record<string, unknown> = {
    active: true,
  };
  if (storeId) where.store_id = storeId;

  // Single SKU
  if (singleSku) {
    where.sku = singleSku;

    const items = await prisma.posInventoryItem.findMany({
      where,
      select: { sku: true, quantity: true, store_id: true },
    });

    // Sum across locations/stores if no store filter
    const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);

    return NextResponse.json(
      { sku: singleSku, quantity: totalQty },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        },
      },
    );
  }

  // Batch SKUs
  const skuList = batchSkus!.split(",").map((s) => s.trim()).filter(Boolean);
  if (skuList.length === 0) {
    return NextResponse.json({ error: "No valid SKUs provided" }, { status: 400 });
  }
  if (skuList.length > 50) {
    return NextResponse.json({ error: "Max 50 SKUs per request" }, { status: 400 });
  }

  where.sku = { in: skuList };

  const items = await prisma.posInventoryItem.findMany({
    where,
    select: { sku: true, quantity: true },
  });

  // Aggregate by SKU
  const qtyBySku = new Map<string, number>();
  for (const item of items) {
    if (item.sku) {
      qtyBySku.set(item.sku, (qtyBySku.get(item.sku) || 0) + item.quantity);
    }
  }

  const result = skuList.map((sku) => ({
    sku,
    quantity: qtyBySku.get(sku) ?? 0,
  }));

  return NextResponse.json(
    { items: result },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    },
  );
}
