import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { pushInventoryToShopify, syncAllInventory, getShopifyCredentials } from "@/lib/shopify-sync";
import { ShopifyClient } from "@/lib/shopify";

/* ------------------------------------------------------------------ */
/*  GET /api/inventory/shopify-sync — sync status for all Shopify items */
/*  POST — bulk actions: sync_from_shopify, zero_all, match_stock       */
/* ------------------------------------------------------------------ */

export async function GET() {
  try {
    const { db, storeId } = await requirePermission("inventory.adjust");

    const items = await db.posInventoryItem.findMany({
      where: { store_id: storeId, shopify_variant_id: { not: null } },
      select: {
        id: true,
        name: true,
        quantity: true,
        online_allocation: true,
        shopify_variant_id: true,
        shopify_inventory_item_id: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      count: items.length,
      items,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db, storeId } = await requirePermission("inventory.adjust");
    const body = await request.json();
    const { action } = body as { action: string };

    if (action === "sync_from_shopify") {
      // Pull current Shopify quantities and set as online_allocation
      const creds = await getShopifyCredentials(storeId);
      if (!creds) {
        return NextResponse.json({ error: "Shopify not connected" }, { status: 400 });
      }

      const client = new ShopifyClient(creds.shopUrl, creds.accessToken);
      const locations = await client.getLocations();
      if (locations.length === 0) {
        return NextResponse.json({ error: "No Shopify locations found" }, { status: 400 });
      }
      const locationId = locations[0].id;

      const items = await db.posInventoryItem.findMany({
        where: { store_id: storeId, shopify_inventory_item_id: { not: null } },
        select: { id: true, shopify_inventory_item_id: true, quantity: true },
      });

      const inventoryItemIds = items.map(i => parseInt(i.shopify_inventory_item_id!));
      const levels = await client.getInventoryLevels(locationId, inventoryItemIds);
      const levelMap = new Map(levels.map(l => [String(l.inventory_item_id), l.available ?? 0]));

      let updated = 0;
      for (const item of items) {
        const shopifyQty = levelMap.get(item.shopify_inventory_item_id!) ?? 0;
        const allocation = Math.min(shopifyQty, item.quantity); // Can't allocate more than we have
        await prisma.posInventoryItem.update({
          where: { id: item.id },
          data: { online_allocation: Math.max(0, allocation) },
        });
        updated++;
      }

      return NextResponse.json({ success: true, action, updated });
    }

    if (action === "zero_all") {
      // Set all online allocations to 0 and push to Shopify
      const result = await db.posInventoryItem.updateMany({
        where: { store_id: storeId, shopify_variant_id: { not: null } },
        data: { online_allocation: 0 },
      });

      // Push all zeros to Shopify
      await syncAllInventory(storeId);

      return NextResponse.json({ success: true, action, updated: result.count });
    }

    if (action === "match_stock") {
      // Set online_allocation = quantity for all items (everything available online)
      const items = await db.posInventoryItem.findMany({
        where: { store_id: storeId, shopify_variant_id: { not: null } },
        select: { id: true, quantity: true },
      });

      for (const item of items) {
        await prisma.posInventoryItem.update({
          where: { id: item.id },
          data: { online_allocation: Math.max(0, item.quantity) },
        });
      }

      await syncAllInventory(storeId);

      return NextResponse.json({ success: true, action, updated: items.length });
    }

    if (action === "push_all") {
      // Push current allocations to Shopify
      await syncAllInventory(storeId);
      return NextResponse.json({ success: true, action });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return handleAuthError(error);
  }
}
