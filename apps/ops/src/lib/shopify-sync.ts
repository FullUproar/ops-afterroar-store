import { prisma } from "@/lib/prisma";
import { ShopifyClient } from "@/lib/shopify";

/* ------------------------------------------------------------------ */
/*  Shopify Inventory Sync                                             */
/*  Pushes inventory levels from Store Ops → Shopify.                  */
/*                                                                     */
/*  Store Ops is the source of truth. online_allocation controls how   */
/*  much is available for online sale. Active holds reduce the         */
/*  effective online quantity.                                         */
/*                                                                     */
/*  Effective online qty = online_allocation - active holds qty        */
/*  (clamped to 0)                                                     */
/* ------------------------------------------------------------------ */

/* ---------- Credentials ------------------------------------------- */

export interface ShopifyCredentials {
  shopUrl: string;
  accessToken: string;
  locationId?: number;
}

/**
 * Read Shopify credentials from store settings.
 * Returns null if not configured.
 */
export async function getShopifyCredentials(
  storeId: string,
): Promise<ShopifyCredentials | null> {
  const store = await prisma.posStore.findUnique({
    where: { id: storeId },
    select: { settings: true },
  });

  if (!store) return null;

  const settings = (store.settings ?? {}) as Record<string, unknown>;
  const shopUrl = settings.shopify_url as string | undefined;
  const accessToken = settings.shopify_access_token as string | undefined;

  if (!shopUrl || !accessToken) return null;

  return {
    shopUrl,
    accessToken,
    locationId: (settings.shopify_location_id as number) ?? undefined,
  };
}

/* ---------- Single item push -------------------------------------- */

/**
 * Push a single item's effective online quantity to Shopify.
 *
 * Effective qty = online_allocation - sum(active holds for this item).
 * Clamped to >= 0, and also clamped to physical stock.
 *
 * This is fire-and-forget safe — never throws to the caller in normal
 * usage (the checkout route calls this with `.catch(() => {})`).
 */
export async function pushInventoryToShopify(
  storeId: string,
  itemId: string,
): Promise<void> {
  const creds = await getShopifyCredentials(storeId);
  if (!creds) return;

  const item = await prisma.posInventoryItem.findFirst({
    where: { id: itemId, store_id: storeId },
    select: {
      id: true,
      quantity: true,
      online_allocation: true,
      shopify_variant_id: true,
      shopify_inventory_item_id: true,
    },
  });

  if (!item?.shopify_inventory_item_id) return;

  // Sum active holds for this item
  const holdResult = await prisma.posInventoryHold.aggregate({
    where: { item_id: itemId, store_id: storeId, status: "active" },
    _sum: { quantity: true },
  });
  const heldQty = holdResult._sum.quantity ?? 0;

  // Effective online qty: allocation minus holds, clamped to physical stock and 0
  const effectiveOnline = Math.max(
    0,
    Math.min(item.online_allocation - heldQty, item.quantity),
  );

  // Resolve location ID
  const client = new ShopifyClient(creds.shopUrl, creds.accessToken);
  let locationId = creds.locationId;

  if (!locationId) {
    // Auto-detect primary location and cache it
    const locations = await client.getLocations();
    const primary = locations.find((l) => l.active) ?? locations[0];
    if (!primary) {
      console.error(`[ShopifySync] No locations found for store ${storeId}`);
      return;
    }
    locationId = primary.id;

    // Cache the location ID in store settings
    const store = await prisma.posStore.findUnique({
      where: { id: storeId },
      select: { settings: true },
    });
    if (store) {
      const settings = (store.settings ?? {}) as Record<string, unknown>;
      await prisma.posStore.update({
        where: { id: storeId },
        data: {
          settings: JSON.parse(
            JSON.stringify({ ...settings, shopify_location_id: locationId }),
          ),
        },
      });
    }
  }

  const shopifyInventoryItemId = parseInt(item.shopify_inventory_item_id, 10);
  if (isNaN(shopifyInventoryItemId)) {
    console.error(
      `[ShopifySync] Invalid shopify_inventory_item_id for item ${itemId}`,
    );
    return;
  }

  await client.setInventoryLevel(locationId, shopifyInventoryItemId, effectiveOnline);

  console.log(
    `[ShopifySync] Pushed item ${itemId}: online=${effectiveOnline} ` +
      `(allocation=${item.online_allocation}, held=${heldQty}, physical=${item.quantity})`,
  );
}

/* ---------- Full reconciliation ----------------------------------- */

/**
 * Push all Shopify-synced items to Shopify.
 * Used for periodic reconciliation or manual full sync.
 */
export async function syncAllInventory(storeId: string): Promise<{
  synced: number;
  skipped: number;
  errors: string[];
}> {
  const creds = await getShopifyCredentials(storeId);
  if (!creds) return { synced: 0, skipped: 0, errors: ["Shopify not configured"] };

  const items = await prisma.posInventoryItem.findMany({
    where: {
      store_id: storeId,
      shopify_inventory_item_id: { not: null },
      active: true,
    },
    select: {
      id: true,
      name: true,
      quantity: true,
      online_allocation: true,
      shopify_inventory_item_id: true,
    },
  });

  if (items.length === 0) {
    return { synced: 0, skipped: 0, errors: [] };
  }

  // Get all active holds for this store in one query
  const holds = await prisma.posInventoryHold.groupBy({
    by: ["item_id"],
    where: { store_id: storeId, status: "active" },
    _sum: { quantity: true },
  });
  const holdMap = new Map(holds.map((h) => [h.item_id, h._sum.quantity ?? 0]));

  // Resolve location
  const client = new ShopifyClient(creds.shopUrl, creds.accessToken);
  let locationId = creds.locationId;

  if (!locationId) {
    const locations = await client.getLocations();
    const primary = locations.find((l) => l.active) ?? locations[0];
    if (!primary) return { synced: 0, skipped: 0, errors: ["No Shopify location found"] };
    locationId = primary.id;
  }

  const report = { synced: 0, skipped: 0, errors: [] as string[] };

  for (const item of items) {
    try {
      const shopifyInventoryItemId = parseInt(item.shopify_inventory_item_id!, 10);
      if (isNaN(shopifyInventoryItemId)) {
        report.skipped++;
        continue;
      }

      const heldQty = holdMap.get(item.id) ?? 0;
      const effectiveOnline = Math.max(
        0,
        Math.min(item.online_allocation - heldQty, item.quantity),
      );

      await client.setInventoryLevel(locationId, shopifyInventoryItemId, effectiveOnline);
      report.synced++;
    } catch (err) {
      report.errors.push(
        `${item.name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(
    `[ShopifySync] Full sync for store ${storeId}: ${report.synced} synced, ${report.skipped} skipped, ${report.errors.length} errors`,
  );

  return report;
}
