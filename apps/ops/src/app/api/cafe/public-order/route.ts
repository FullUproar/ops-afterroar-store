import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantClient } from "@/lib/tenant-prisma";

/** POST /api/cafe/public-order — place order from QR table ordering */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { store_slug, table_label, tab_id, items } = body as {
    store_slug: string;
    table_label: string;
    tab_id?: string;
    items: Array<{ menu_item_id: string; name: string; price_cents: number; quantity: number }>;
  };

  if (!store_slug || !items?.length) {
    return NextResponse.json({ error: "store_slug and items required" }, { status: 400 });
  }

  const store = await prisma.posStore.findFirst({ where: { slug: store_slug }, select: { id: true } });
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const storeId = store.id;
  const db = getTenantClient(storeId);

  // Find or create tab for this table
  let activeTabId = tab_id;
  if (!activeTabId) {
    // Check for existing open tab at this table
    const existingTab = await db.posTab.findFirst({
      where: { store_id: storeId, table_label: table_label, status: "open" },
    });
    if (existingTab) {
      activeTabId = existingTab.id;
    } else {
      const newTab = await db.posTab.create({
        data: {
          store_id: store.id,
          table_label: table_label,
          notes: "QR order",
        },
      });
      activeTabId = newTab.id;
    }
  }

  // Add items to tab
  let totalAdded = 0;
  for (const item of items) {
    await db.posTabItem.create({
      data: {
        tab_id: activeTabId,
        name: item.name,
        price_cents: item.price_cents,
        quantity: item.quantity,
        item_type: "cafe",
      },
    });
    totalAdded += item.price_cents * item.quantity;
  }

  // Update tab subtotal
  await db.posTab.update({
    where: { id: activeTabId },
    data: { subtotal_cents: { increment: totalAdded } },
  });

  return NextResponse.json({
    success: true,
    tab_id: activeTabId,
    items_added: items.length,
  }, { status: 201 });
}
