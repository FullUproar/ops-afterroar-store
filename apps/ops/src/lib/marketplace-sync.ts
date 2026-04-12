import { prisma } from "@/lib/prisma";
import { EbayClient, getEbayClient, getEbayClientForStore, refreshEbayToken } from "@/lib/ebay";
import { getCardTraderClientForStore } from "@/lib/cardtrader";
import { getManaPoolClientForStore } from "@/lib/manapool";
import { ingestOrder } from "@/lib/order-ingest";

/* ------------------------------------------------------------------ */
/*  Token management — auto-refresh expired eBay tokens                */
/* ------------------------------------------------------------------ */

async function getEbayClientWithRefresh(storeId: string): Promise<EbayClient | null> {
  const store = await prisma.posStore.findUnique({
    where: { id: storeId },
    select: { settings: true },
  });
  if (!store) return getEbayClient();

  const settings = (store.settings ?? {}) as Record<string, unknown>;

  // Check if store has its own token and if it's expired
  if (settings.ebay_access_token && settings.ebay_token_expires_at) {
    const expiresAt = new Date(settings.ebay_token_expires_at as string);
    const buffer = 5 * 60 * 1000; // 5 min buffer

    if (expiresAt.getTime() - buffer < Date.now() && settings.ebay_refresh_token) {
      // Refresh the token
      const refreshed = await refreshEbayToken(settings.ebay_refresh_token as string);
      if (refreshed) {
        await prisma.posStore.update({
          where: { id: storeId },
          data: {
            settings: JSON.parse(JSON.stringify({
              ...settings,
              ebay_access_token: refreshed.access_token,
              ebay_token_expires_at: new Date(
                Date.now() + refreshed.expires_in * 1000,
              ).toISOString(),
            })),
          },
        });
        settings.ebay_access_token = refreshed.access_token;
      }
    }
  }

  return getEbayClientForStore(settings);
}

/* ------------------------------------------------------------------ */
/*  Marketplace Sync Engine                                            */
/*  Handles bidirectional sync between Store Ops inventory and         */
/*  external marketplaces (eBay, CardTrader, Mana Pool).               */
/*                                                                     */
/*  Two directions:                                                    */
/*    OUT: inventory changes → push qty/price to marketplace           */
/*    IN:  marketplace orders → pull into fulfillment queue             */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  OUTBOUND: Push inventory changes to marketplaces                   */
/* ------------------------------------------------------------------ */

/**
 * Push a single item's quantity to all marketplaces it's listed on.
 * Called after POS sale, return, stock adjustment — fire and forget.
 */
export async function pushInventoryUpdate(
  itemId: string,
  newQuantity: number,
): Promise<void> {
  try {
    const item = await prisma.posInventoryItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        store_id: true,
        listed_on_ebay: true,
        ebay_offer_id: true,
        listed_on_cardtrader: true,
        cardtrader_product_id: true,
        listed_on_manapool: true,
        manapool_listing_id: true,
        quantity: true,
      },
    });

    if (!item) return;

    // eBay
    if (item.listed_on_ebay) {
      const ebay = await getEbayClientWithRefresh(item.store_id);
      if (ebay) {
        const sku = `afterroar-${itemId}`;
        try {
          if (newQuantity <= 0) {
            // Remove listing when out of stock
            if (item.ebay_offer_id) {
              await ebay.deleteOffer(item.ebay_offer_id).catch(() => {});
            }
            await ebay.deleteInventoryItem(sku).catch(() => {});
            await prisma.posInventoryItem.update({
              where: { id: itemId },
              data: {
                listed_on_ebay: false,
                ebay_listing_id: null,
                ebay_offer_id: null,
                updated_at: new Date(),
              },
            });
            console.log(`[MarketplaceSync] eBay: delisted ${sku} (out of stock)`);
          } else {
            await ebay.updateQuantity(sku, newQuantity);
            console.log(`[MarketplaceSync] eBay: updated ${sku} qty=${newQuantity}`);
          }
        } catch (err) {
          console.error(`[MarketplaceSync] eBay push failed for ${sku}:`, err);
        }
      }
    }

    // CardTrader
    if (item.listed_on_cardtrader && item.cardtrader_product_id) {
      const store = await prisma.posStore.findUnique({
        where: { id: item.store_id },
        select: { settings: true },
      });
      const settings = (store?.settings ?? {}) as Record<string, unknown>;
      const ct = getCardTraderClientForStore(settings);
      if (ct) {
        try {
          if (newQuantity <= 0) {
            await ct.deleteProduct(item.cardtrader_product_id).catch(() => {});
            await prisma.posInventoryItem.update({
              where: { id: itemId },
              data: {
                listed_on_cardtrader: false,
                cardtrader_product_id: null,
                updated_at: new Date(),
              },
            });
            console.log(`[MarketplaceSync] CardTrader: delisted ${itemId} (out of stock)`);
          } else {
            await ct.updateQuantity(item.cardtrader_product_id, newQuantity);
            console.log(`[MarketplaceSync] CardTrader: updated ${itemId} qty=${newQuantity}`);
          }
        } catch (err) {
          console.error(`[MarketplaceSync] CardTrader push failed for ${itemId}:`, err);
        }
      }
    }

    // Mana Pool
    if (item.listed_on_manapool && item.manapool_listing_id) {
      const store = await prisma.posStore.findUnique({
        where: { id: item.store_id },
        select: { settings: true },
      });
      const settings = (store?.settings ?? {}) as Record<string, unknown>;
      const mp = getManaPoolClientForStore(settings);
      if (mp) {
        try {
          if (newQuantity <= 0) {
            await mp.deleteListing(item.manapool_listing_id).catch(() => {});
            await prisma.posInventoryItem.update({
              where: { id: itemId },
              data: {
                listed_on_manapool: false,
                manapool_listing_id: null,
                updated_at: new Date(),
              },
            });
            console.log(`[MarketplaceSync] ManaPool: delisted ${itemId} (out of stock)`);
          } else {
            await mp.updateQuantity(item.manapool_listing_id, newQuantity);
            console.log(`[MarketplaceSync] ManaPool: updated ${itemId} qty=${newQuantity}`);
          }
        } catch (err) {
          console.error(`[MarketplaceSync] ManaPool push failed for ${itemId}:`, err);
        }
      }
    }
  } catch (err) {
    // Fire and forget — never break the calling flow
    console.error("[MarketplaceSync] pushInventoryUpdate error:", err);
  }
}

/**
 * Batch push: sync all listed items to their marketplaces.
 * Used by the cron job and manual sync button.
 */
export async function pushFullInventorySync(storeId: string): Promise<{
  updated: number;
  removed: number;
  errors: string[];
}> {
  const ebay = await getEbayClientWithRefresh(storeId);
  if (!ebay) return { updated: 0, removed: 0, errors: ["eBay not configured"] };

  const items = await prisma.posInventoryItem.findMany({
    where: {
      store_id: storeId,
      listed_on_ebay: true,
    },
    select: {
      id: true,
      name: true,
      quantity: true,
      price_cents: true,
      active: true,
      ebay_listing_id: true,
      ebay_offer_id: true,
      attributes: true,
    },
  });

  const report = { updated: 0, removed: 0, errors: [] as string[] };

  for (const item of items) {
    const sku = `afterroar-${item.id}`;

    try {
      if (item.quantity <= 0 || !item.active) {
        // Delist
        if (item.ebay_offer_id) {
          await ebay.deleteOffer(item.ebay_offer_id).catch(() => {});
        }
        await ebay.deleteInventoryItem(sku).catch(() => {});
        await prisma.posInventoryItem.update({
          where: { id: item.id },
          data: {
            listed_on_ebay: false,
            ebay_listing_id: null,
            ebay_offer_id: null,
            updated_at: new Date(),
          },
        });
        report.removed++;
      } else {
        // Update qty + price
        const attrs = (item.attributes ?? {}) as Record<string, unknown>;
        const conditionMap: Record<string, string> = {
          NM: "LIKE_NEW", LP: "USED_EXCELLENT", MP: "USED_VERY_GOOD",
          HP: "USED_GOOD", DMG: "USED_ACCEPTABLE",
        };
        const condition = conditionMap[(attrs.condition as string) || "NM"] || "LIKE_NEW";

        await ebay.createOrReplaceInventoryItem(sku, {
          availability: { shipToLocationAvailability: { quantity: item.quantity } },
          condition,
          product: {
            title: item.name.slice(0, 80),
            description: item.name,
            imageUrls: [],
            aspects: {},
          },
        });

        if (item.ebay_offer_id) {
          await ebay.updateOffer(item.ebay_offer_id, {
            sku,
            marketplaceId: "EBAY_US",
            format: "FIXED_PRICE",
            availableQuantity: item.quantity,
            pricingSummary: {
              price: {
                value: (item.price_cents / 100).toFixed(2),
                currency: "USD",
              },
            },
            categoryId: "38292",
          });
        }
        report.updated++;
      }
    } catch (err) {
      report.errors.push(`${item.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return report;
}

/* ------------------------------------------------------------------ */
/*  INBOUND: Pull marketplace orders into fulfillment queue            */
/* ------------------------------------------------------------------ */

/**
 * Poll eBay for new orders and ingest them.
 * Uses store settings to track last poll time.
 */
export async function pullEbayOrders(storeId: string): Promise<{
  imported: number;
  skipped: number;
  errors: string[];
}> {
  const ebay = await getEbayClientWithRefresh(storeId);
  if (!ebay) return { imported: 0, skipped: 0, errors: ["eBay not configured"] };

  const store = await prisma.posStore.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, settings: true },
  });

  if (!store) return { imported: 0, skipped: 0, errors: ["Store not found"] };

  const settings = (store.settings ?? {}) as Record<string, unknown>;

  // Last poll time — default to 24 hours ago on first run
  const lastPoll = settings.ebay_last_poll
    ? new Date(settings.ebay_last_poll as string)
    : new Date(Date.now() - 86400000);

  const report = { imported: 0, skipped: 0, errors: [] as string[] };

  try {
    const orders = await ebay.getOrdersSince(lastPoll);

    for (const ebayOrder of orders) {
      // Skip if not a completed sale
      if (ebayOrder.orderFulfillmentStatus === "FULFILLED") {
        report.skipped++;
        continue;
      }

      // Map eBay SKUs back to inventory items
      const items = ebayOrder.lineItems.map((li) => {
        // SKU format: afterroar-{inventory_item_id}
        const inventoryId = li.sku?.startsWith("afterroar-")
          ? li.sku.slice(10)
          : undefined;

        return {
          name: li.title,
          sku: inventoryId, // Use inventory ID as SKU for matching
          quantity: li.quantity,
          price_cents: Math.round(parseFloat(li.total.value) * 100 / li.quantity),
          fulfillment_type: "merchant" as const,
        };
      });

      // Get buyer info from the order (eBay doesn't include full address in
      // order list — would need individual order fetch for full address)
      const result = await ingestOrder(store.id, store.name, {
        external_id: ebayOrder.orderId,
        order_number: `EBAY-${ebayOrder.orderId}`,
        source: "ebay",
        items,
        total_cents: Math.round(parseFloat(ebayOrder.pricingSummary.total.value) * 100),
        paid_at: ebayOrder.creationDate,
      });

      if (result.deduplicated) {
        report.skipped++;
      } else if (result.ok) {
        report.imported++;
      }
    }

    // Update last poll time
    await prisma.posStore.update({
      where: { id: storeId },
      data: {
        settings: JSON.parse(JSON.stringify({
          ...settings,
          ebay_last_poll: new Date().toISOString(),
        })),
      },
    });
  } catch (err) {
    report.errors.push(err instanceof Error ? err.message : String(err));
  }

  return report;
}

/* ------------------------------------------------------------------ */
/*  INBOUND: Pull CardTrader orders                                    */
/* ------------------------------------------------------------------ */

/**
 * Poll CardTrader for new orders and ingest them.
 * Uses store settings to track last poll time.
 */
export async function pullCardTraderOrders(storeId: string): Promise<{
  imported: number;
  skipped: number;
  errors: string[];
}> {
  const store = await prisma.posStore.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, settings: true },
  });

  if (!store) return { imported: 0, skipped: 0, errors: ["Store not found"] };

  const settings = (store.settings ?? {}) as Record<string, unknown>;
  const ct = getCardTraderClientForStore(settings);
  if (!ct) return { imported: 0, skipped: 0, errors: ["CardTrader not configured"] };

  // Last poll time — default to 24 hours ago on first run
  const lastPoll = settings.cardtrader_last_poll
    ? new Date(settings.cardtrader_last_poll as string)
    : new Date(Date.now() - 86400000);

  const report = { imported: 0, skipped: 0, errors: [] as string[] };

  try {
    const orders = await ct.getOrders({ since: lastPoll.toISOString() });

    for (const ctOrder of orders) {
      // Skip already-fulfilled orders
      if (ctOrder.state === "shipped" || ctOrder.state === "completed") {
        report.skipped++;
        continue;
      }

      const items = ctOrder.items.map((li) => ({
        name: li.name_en,
        sku: undefined as string | undefined,
        quantity: li.quantity,
        price_cents: li.price_cents,
        fulfillment_type: "merchant" as const,
      }));

      const result = await ingestOrder(store.id, store.name, {
        external_id: String(ctOrder.id),
        order_number: `CT-${ctOrder.code}`,
        source: "cardtrader",
        items,
        total_cents: ctOrder.total_cents,
        paid_at: ctOrder.created_at,
        customer: ctOrder.buyer
          ? {
              name: ctOrder.buyer.username,
              email: ctOrder.buyer.email || null,
            }
          : undefined,
      });

      if (result.deduplicated) {
        report.skipped++;
      } else if (result.ok) {
        report.imported++;
      }
    }

    // Update last poll time
    await prisma.posStore.update({
      where: { id: storeId },
      data: {
        settings: JSON.parse(JSON.stringify({
          ...settings,
          cardtrader_last_poll: new Date().toISOString(),
        })),
      },
    });
  } catch (err) {
    report.errors.push(err instanceof Error ? err.message : String(err));
  }

  return report;
}

/* ------------------------------------------------------------------ */
/*  INBOUND: Pull Mana Pool orders                                     */
/* ------------------------------------------------------------------ */

/**
 * Poll Mana Pool for new orders and ingest them.
 * Uses store settings to track last poll time.
 */
export async function pullManaPoolOrders(storeId: string): Promise<{
  imported: number;
  skipped: number;
  errors: string[];
}> {
  const store = await prisma.posStore.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, settings: true },
  });

  if (!store) return { imported: 0, skipped: 0, errors: ["Store not found"] };

  const settings = (store.settings ?? {}) as Record<string, unknown>;
  const mp = getManaPoolClientForStore(settings);
  if (!mp) return { imported: 0, skipped: 0, errors: ["Mana Pool not configured"] };

  // Last poll time — default to 24 hours ago on first run
  const lastPoll = settings.manapool_last_poll
    ? new Date(settings.manapool_last_poll as string)
    : new Date(Date.now() - 86400000);

  const report = { imported: 0, skipped: 0, errors: [] as string[] };

  try {
    const orders = await mp.getOrders({ since: lastPoll.toISOString() });

    for (const mpOrder of orders) {
      // Skip already-fulfilled orders
      if (mpOrder.status === "shipped" || mpOrder.status === "completed") {
        report.skipped++;
        continue;
      }

      // Map Mana Pool SKUs back to inventory items
      const items = mpOrder.items.map((li) => {
        // SKU format: afterroar-{inventory_item_id}
        const inventoryId = li.sku?.startsWith("afterroar-")
          ? li.sku.slice(10)
          : undefined;

        return {
          name: li.title,
          sku: inventoryId,
          quantity: li.quantity,
          price_cents: li.price_cents,
          fulfillment_type: "merchant" as const,
        };
      });

      const result = await ingestOrder(store.id, store.name, {
        external_id: mpOrder.id,
        order_number: `MP-${mpOrder.order_number}`,
        source: "manapool",
        items,
        total_cents: mpOrder.total_cents,
        paid_at: mpOrder.created_at,
        customer: mpOrder.buyer
          ? {
              name: mpOrder.buyer.name,
              email: mpOrder.buyer.email || null,
            }
          : undefined,
      });

      if (result.deduplicated) {
        report.skipped++;
      } else if (result.ok) {
        report.imported++;
      }
    }

    // Update last poll time
    await prisma.posStore.update({
      where: { id: storeId },
      data: {
        settings: JSON.parse(JSON.stringify({
          ...settings,
          manapool_last_poll: new Date().toISOString(),
        })),
      },
    });
  } catch (err) {
    report.errors.push(err instanceof Error ? err.message : String(err));
  }

  return report;
}
