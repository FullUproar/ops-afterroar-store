import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantClient } from "@/lib/tenant-prisma";

/** GET /api/cafe/public-menu?store=slug — public menu for QR ordering */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("store");
  if (!slug) return NextResponse.json({ error: "store required" }, { status: 400 });

  const store = await prisma.posStore.findFirst({ where: { slug }, select: { id: true } });
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const storeId = store.id;
  const db = getTenantClient(storeId);
  const [menuItems, modifiers] = await Promise.all([
    db.posMenuItem.findMany({
      where: { store_id: storeId, available: true },
      orderBy: [{ category: "asc" }, { sort_order: "asc" }],
    }),
    db.posMenuModifier.findMany({ where: { store_id: storeId }, orderBy: { sort_order: "asc" } }),
  ]);

  return NextResponse.json({ menu_items: menuItems, modifiers }, {
    headers: { "Cache-Control": "public, s-maxage=60" },
  });
}
