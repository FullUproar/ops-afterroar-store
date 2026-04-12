import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { getEbayClient } from "@/lib/ebay";

/**
 * POST /api/ebay/sync
 *
 * Full inventory sync to eBay:
 * 1. Update quantities for existing listings
 * 2. Remove listings for items no longer in stock
 * Returns a sync report.
 */
export async function POST(request: NextRequest) {
  try {
    const { db } = await requirePermission("inventory.adjust");

    const ebay = getEbayClient();
    if (!ebay) {
      return NextResponse.json(
        { error: "eBay not configured. Set EBAY_USER_TOKEN env var." },
        { status: 400 }
      );
    }

    // Get all items currently listed on eBay
    const listedItems = await db.posInventoryItem.findMany({
      where: {
        category: "tcg_single",
        listed_on_ebay: true,
      },
      select: {
        id: true,
        name: true,
        quantity: true,
        price_cents: true,
        ebay_listing_id: true,
        ebay_offer_id: true,
        active: true,
        attributes: true,
      },
    });

    const report = {
      updated: 0,
      removed: 0,
      errors: [] as string[],
      total_processed: listedItems.length,
    };

    for (const item of listedItems) {
      const sku = `afterroar-${item.id}`;

      try {
        // If out of stock or inactive, remove listing
        if (item.quantity <= 0 || !item.active) {
          if (item.ebay_offer_id) {
            await ebay.deleteOffer(item.ebay_offer_id).catch(() => {});
          }
          await ebay.deleteInventoryItem(sku).catch(() => {});

          await db.posInventoryItem.update({
            where: { id: item.id },
            data: {
              ebay_listing_id: null,
              ebay_offer_id: null,
              listed_on_ebay: false,
              updated_at: new Date(),
            },
          });

          report.removed++;
          continue;
        }

        // Update quantity on eBay
        const attrs = (item.attributes ?? {}) as Record<string, unknown>;
        const condition = (attrs.condition as string) || "NM";

        const conditionMap: Record<string, string> = {
          NM: "LIKE_NEW",
          LP: "USED_EXCELLENT",
          MP: "USED_VERY_GOOD",
          HP: "USED_GOOD",
          DMG: "USED_ACCEPTABLE",
        };

        await ebay.createOrReplaceInventoryItem(sku, {
          availability: {
            shipToLocationAvailability: { quantity: item.quantity },
          },
          condition: conditionMap[condition] || "LIKE_NEW",
          product: {
            title: item.name.slice(0, 80),
            description: item.name,
            imageUrls: [],
            aspects: {},
          },
        });

        // Update offer price if changed
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
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        report.errors.push(`${item.name}: ${msg}`);
      }
    }

    return NextResponse.json({
      ...report,
      message: `Sync complete: ${report.updated} updated, ${report.removed} removed, ${report.errors.length} errors`,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
