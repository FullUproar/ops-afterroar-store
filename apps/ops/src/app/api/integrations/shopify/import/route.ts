import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { prisma } from "@/lib/prisma";
import { ShopifyClient, type ShopifyProduct, type ShopifyVariant } from "@/lib/shopify";
import { decryptCredential } from "@/lib/crypto";

/* ------------------------------------------------------------------ */
/*  POST /api/integrations/shopify/import — import Shopify catalog      */
/*  GET  /api/integrations/shopify/import — check import status         */
/* ------------------------------------------------------------------ */

/* ---------- Category mapping -------------------------------------- */

function mapCategory(productType: string, tags: string, title: string): string {
  const haystack = `${productType} ${tags} ${title}`.toLowerCase();

  if (/board\s*game|tabletop/.test(haystack)) return "board_game";
  if (/magic|pokemon|pok[eé]mon|yu-?gi-?oh|trading\s*card|tcg/.test(haystack)) {
    // If it looks like a single (has condition variants or "single" in tags)
    if (/single|near mint|lightly played|moderately played|heavily played|damaged/.test(haystack)) {
      return "tcg_single";
    }
    return "sealed";
  }
  if (/miniature|warhammer|paint/.test(haystack)) return "miniature";
  if (/dice|sleeve|deck\s*box|playmat/.test(haystack)) return "accessory";
  if (/shirt|apparel|clothing/.test(haystack)) return "clothing";
  if (/food|drink|snack|candy/.test(haystack)) return "food_drink";
  return "other";
}

/* ---------- Helpers ----------------------------------------------- */

function priceToCents(price: string | null | undefined): number {
  if (!price) return 0;
  const n = parseFloat(price);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function buildExternalId(variantId: number): string {
  return `shopify:${variantId}`;
}

/* ---------- POST — run import ------------------------------------- */

export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePermission("store.settings");
    const { storeId } = ctx;

    const body = await request.json().catch(() => ({})) as {
      shopify_url?: string;
      access_token?: string;
      use_pending?: boolean;
    };

    let shopUrl: string;
    let accessToken: string;

    if (body.use_pending) {
      // Decrypt from store settings pending_credentials
      const store = await prisma.posStore.findUnique({
        where: { id: storeId },
        select: { settings: true },
      });
      const settings = (store?.settings ?? {}) as Record<string, unknown>;
      const pending = (settings.pending_credentials ?? []) as Array<Record<string, unknown>>;

      // Find the most recent unconsumed shopify credential
      const cred = [...pending]
        .reverse()
        .find((c) => c.type === "shopify" && !c.consumed);

      if (!cred) {
        return NextResponse.json(
          { error: "No pending Shopify credential found. Ask the store owner to submit one via /connect." },
          { status: 400 },
        );
      }

      accessToken = decryptCredential({
        encrypted: cred.encrypted as string,
        iv: cred.iv as string,
        tag: cred.tag as string,
      });

      // We need the shop URL — check if it was stored alongside the credential
      shopUrl = (cred.shop_url as string) || (settings.shopify_url as string) || "";
      if (!shopUrl) {
        return NextResponse.json(
          { error: "No Shopify shop URL found. Provide shopify_url in the request body." },
          { status: 400 },
        );
      }

      // Mark credential as consumed
      const updatedPending = pending.map((c) =>
        c === cred ? { ...c, consumed: true, consumed_at: new Date().toISOString() } : c,
      );
      await prisma.posStore.update({
        where: { id: storeId },
        data: {
          settings: JSON.parse(JSON.stringify({ ...settings, pending_credentials: updatedPending })),
          updated_at: new Date(),
        },
      });
    } else {
      if (!body.shopify_url || !body.access_token) {
        return NextResponse.json(
          { error: "shopify_url and access_token are required (or use_pending: true)" },
          { status: 400 },
        );
      }
      shopUrl = body.shopify_url;
      accessToken = body.access_token;
    }

    // --- Run the import ---
    const client = new ShopifyClient(shopUrl, accessToken);

    const totalCount = await client.getProductCount();
    console.log(`[Shopify Import] Starting import for store ${storeId}. ${totalCount} products in Shopify.`);

    const products = await client.getProducts();
    console.log(`[Shopify Import] Fetched ${products.length} products from Shopify.`);

    // Optionally get inventory levels from the primary location
    let locationId: number | null = null;
    try {
      const locations = await client.getLocations();
      if (locations.length > 0) {
        locationId = locations[0].id;
        console.log(`[Shopify Import] Using primary location: ${locations[0].name} (${locationId})`);
      }
    } catch (err) {
      console.warn("[Shopify Import] Could not fetch locations, using variant inventory_quantity:", err);
    }

    // Build a map of inventory levels if we have a location
    const inventoryMap = new Map<number, number>();
    if (locationId) {
      const allInventoryItemIds = products.flatMap((p) =>
        p.variants.map((v) => v.inventory_item_id),
      );
      try {
        const levels = await client.getInventoryLevels(locationId, allInventoryItemIds);
        for (const level of levels) {
          inventoryMap.set(level.inventory_item_id, level.available ?? 0);
        }
        console.log(`[Shopify Import] Fetched inventory levels for ${levels.length} items.`);
      } catch (err) {
        console.warn("[Shopify Import] Could not fetch inventory levels, using variant quantities:", err);
      }
    }

    // Check existing external_ids to skip duplicates
    const existingItems = await prisma.posInventoryItem.findMany({
      where: {
        store_id: storeId,
        external_id: { startsWith: "shopify:" },
      },
      select: { external_id: true },
    });
    const existingIds = new Set(existingItems.map((i) => i.external_id));

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Process in chunks to avoid overwhelming the DB
    const CHUNK_SIZE = 50;
    const itemsToCreate: Array<{
      product: ShopifyProduct;
      variant: ShopifyVariant;
    }> = [];

    let updated = 0;
    for (const product of products) {
      for (const variant of product.variants) {
        const externalId = buildExternalId(variant.id);
        if (existingIds.has(externalId)) {
          // Update existing items with Shopify IDs (for sync) if missing
          try {
            await prisma.posInventoryItem.updateMany({
              where: {
                store_id: storeId,
                external_id: externalId,
                shopify_variant_id: null,
              },
              data: {
                shopify_variant_id: String(variant.id),
                shopify_inventory_item_id: String(variant.inventory_item_id),
              },
            });
            updated++;
          } catch {}
          skipped++;
          continue;
        }
        itemsToCreate.push({ product, variant });
      }
    }

    for (let i = 0; i < itemsToCreate.length; i += CHUNK_SIZE) {
      const chunk = itemsToCreate.slice(i, i + CHUNK_SIZE);

      const createOps = chunk.map(({ product, variant }) => {
        const externalId = buildExternalId(variant.id);
        const category = mapCategory(product.product_type, product.tags, product.title);
        const imageUrl = product.images?.[0]?.src || null;
        const quantity = inventoryMap.has(variant.inventory_item_id)
          ? Math.max(0, inventoryMap.get(variant.inventory_item_id)!)
          : Math.max(0, variant.inventory_quantity ?? 0);

        // Build a display name: product title + variant title (if not "Default Title")
        const name =
          variant.title && variant.title !== "Default Title"
            ? `${product.title} - ${variant.title}`
            : product.title;

        const attributes: Record<string, unknown> = {
          shopify_tags: product.tags ? product.tags.split(",").map((t) => t.trim()) : [],
          shopify_product_id: product.id,
          shopify_vendor: product.vendor || null,
        };

        return prisma.posInventoryItem.create({
          data: {
            store_id: storeId,
            name,
            category,
            sku: variant.sku || null,
            barcode: variant.barcode || null,
            price_cents: priceToCents(variant.price),
            cost_cents: 0, // Shopify read_products scope does not expose cost
            quantity,
            image_url: imageUrl,
            external_id: externalId,
            shopify_variant_id: String(variant.id),
            shopify_inventory_item_id: String(variant.inventory_item_id),
            attributes: JSON.parse(JSON.stringify(attributes)),
            active: product.status === "active",
          },
        });
      });

      try {
        await prisma.$transaction(createOps);
        imported += chunk.length;
      } catch (batchErr) {
        console.error("[Shopify Import] Batch failed, trying one-by-one:", batchErr instanceof Error ? batchErr.message : batchErr);
        // If batch fails, try one-by-one to isolate the bad record
        for (const op of chunk) {
          try {
            const externalId = buildExternalId(op.variant.id);
            const category = mapCategory(op.product.product_type, op.product.tags, op.product.title);
            const imageUrl = op.product.images?.[0]?.src || null;
            const quantity = inventoryMap.has(op.variant.inventory_item_id)
              ? Math.max(0, inventoryMap.get(op.variant.inventory_item_id)!)
              : Math.max(0, op.variant.inventory_quantity ?? 0);
            const name =
              op.variant.title && op.variant.title !== "Default Title"
                ? `${op.product.title} - ${op.variant.title}`
                : op.product.title;
            const attributes: Record<string, unknown> = {
              shopify_tags: op.product.tags ? op.product.tags.split(",").map((t: string) => t.trim()) : [],
              shopify_product_id: op.product.id,
              shopify_vendor: op.product.vendor || null,
            };

            await prisma.posInventoryItem.create({
              data: {
                store_id: storeId,
                name,
                category,
                sku: op.variant.sku || null,
                barcode: op.variant.barcode || null,
                price_cents: priceToCents(op.variant.price),
                cost_cents: 0,
                quantity,
                image_url: imageUrl,
                external_id: externalId,
                shopify_variant_id: String(op.variant.id),
                shopify_inventory_item_id: String(op.variant.inventory_item_id),
                attributes: JSON.parse(JSON.stringify(attributes)),
                active: op.product.status === "active",
              },
            });
            imported++;
          } catch (itemErr) {
            const msg = itemErr instanceof Error ? itemErr.message : String(itemErr);
            errors.push(`Variant ${op.variant.id}: ${msg}`);
          }
        }
      }

      console.log(`[Shopify Import] Imported ${imported}/${itemsToCreate.length} products...`);
    }

    console.log(
      `[Shopify Import] Complete. Imported: ${imported}, Skipped: ${skipped}, Errors: ${errors.length}`,
    );

    return NextResponse.json({
      imported,
      updated,
      skipped,
      total_in_shopify: totalCount,
      products_fetched: products.length,
      items_to_create: itemsToCreate.length,
      errors: errors.slice(0, 50),
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ---------- GET — check import status ----------------------------- */

export async function GET() {
  try {
    const ctx = await requirePermission("store.settings");
    const { storeId } = ctx;

    const count = await prisma.posInventoryItem.count({
      where: {
        store_id: storeId,
        external_id: { startsWith: "shopify:" },
      },
    });

    const byCategory = await prisma.posInventoryItem.groupBy({
      by: ["category"],
      where: {
        store_id: storeId,
        external_id: { startsWith: "shopify:" },
      },
      _count: true,
    });

    const categories: Record<string, number> = {};
    for (const row of byCategory) {
      categories[row.category] = row._count;
    }

    return NextResponse.json({
      shopify_items: count,
      by_category: categories,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
