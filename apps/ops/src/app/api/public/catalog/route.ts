import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/* ------------------------------------------------------------------ */
/*  GET /api/public/catalog — shared product catalog for HQ pull       */
/*  Public, cached, rate-limited. HQ polls periodically.              */
/*                                                                     */
/*  Query params:                                                      */
/*    category=board_game — filter by category                         */
/*    since=ISO_DATE — only products updated after this date           */
/*    limit=100 — max results (default 100, max 500)                   */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category");
  const since = request.nextUrl.searchParams.get("since");
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = Math.min(parseInt(limitParam || "100", 10) || 100, 500);

  const where: Record<string, unknown> = {
    verified: true, // Only return verified catalog entries
  };

  if (category) where.category = category;
  if (since) where.updated_at = { gte: new Date(since) };

  const products = await prisma.posCatalogProduct.findMany({
    where,
    orderBy: { updated_at: "desc" },
    take: limit,
    select: {
      id: true,
      name: true,
      category: true,
      subcategory: true,
      game: true,
      product_type: true,
      set_name: true,
      set_code: true,
      attributes: true,
      external_ids: true,
      image_url: true,
      description: true,
      verified: true,
      created_at: true,
      updated_at: true,
    },
  });

  return NextResponse.json({
    products,
    total: products.length,
    pulled_at: new Date().toISOString(),
  }, {
    headers: {
      "Cache-Control": "public, s-maxage=300", // 5-min cache
    },
  });
}
