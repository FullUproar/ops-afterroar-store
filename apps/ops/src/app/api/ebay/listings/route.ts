import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { getEbayClient, EBAY_TCG_CATEGORIES } from "@/lib/ebay";

/**
 * GET /api/ebay/listings
 *
 * List inventory items with eBay status.
 * Returns listed items and items available to list.
 */
export async function GET(request: NextRequest) {
  try {
    const { db } = await requirePermission("inventory.adjust");

    const params = request.nextUrl.searchParams;
    const filter = params.get("filter") || "all"; // "listed", "unlisted", "all"
    const limit = Math.min(parseInt(params.get("limit") || "50", 10), 200);

    const where: Record<string, unknown> = {
      category: "tcg_single",
      active: true,
      quantity: { gt: 0 },
    };

    if (filter === "listed") {
      where.listed_on_ebay = true;
    } else if (filter === "unlisted") {
      where.listed_on_ebay = false;
    }

    const items = await db.posInventoryItem.findMany({
      where,
      orderBy: { price_cents: "desc" },
      take: limit,
      select: {
        id: true,
        name: true,
        price_cents: true,
        cost_cents: true,
        quantity: true,
        image_url: true,
        external_id: true,
        attributes: true,
        ebay_listing_id: true,
        ebay_offer_id: true,
        listed_on_ebay: true,
      },
    });

    // Stats
    const listedCount = await db.posInventoryItem.count({
      where: {
        category: "tcg_single",
        active: true,
        listed_on_ebay: true,
      },
    });

    const enriched = items.map((item) => {
      const attrs = (item.attributes ?? {}) as Record<string, unknown>;
      return {
        ...item,
        game: (attrs.game as string) || null,
        set_name: (attrs.set_name as string) || null,
        condition: (attrs.condition as string) || "NM",
        foil: (attrs.foil as boolean) || false,
        rarity: (attrs.rarity as string) || null,
      };
    });

    return NextResponse.json({
      items: enriched,
      listed_count: listedCount,
      ebay_configured: !!process.env.EBAY_USER_TOKEN,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/**
 * POST /api/ebay/listings
 *
 * List an inventory item on eBay.
 * Body: { inventory_item_id, price_cents? }
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

    const body = await request.json();
    const { inventory_item_id, price_cents } = body;

    if (!inventory_item_id) {
      return NextResponse.json(
        { error: "inventory_item_id is required" },
        { status: 400 }
      );
    }

    const item = await db.posInventoryItem.findFirst({
      where: { id: inventory_item_id, category: "tcg_single" },
    });

    if (!item) {
      return NextResponse.json(
        { error: "Item not found" },
        { status: 404 }
      );
    }

    if (item.listed_on_ebay) {
      return NextResponse.json(
        { error: "Item already listed on eBay" },
        { status: 400 }
      );
    }

    const attrs = (item.attributes ?? {}) as Record<string, unknown>;
    const condition = (attrs.condition as string) || "NM";
    const game = (attrs.game as string) || "MTG";
    const setName = (attrs.set_name as string) || "";
    const rarity = (attrs.rarity as string) || "";
    const foil = (attrs.foil as boolean) || false;
    const finalPrice = price_cents || item.price_cents;

    // SKU format: store-item-id
    const sku = `afterroar-${item.id}`;

    const imageUrls = item.image_url ? [item.image_url] : [];
    const description = [
      item.name,
      setName && `Set: ${setName}`,
      `Condition: ${condition}`,
      foil && "Foil",
      rarity && `Rarity: ${rarity}`,
    ]
      .filter(Boolean)
      .join(" | ");

    const result = await ebay.listSingle({
      sku,
      title: item.name.slice(0, 80), // eBay 80-char title limit
      condition,
      priceCents: finalPrice,
      quantity: item.quantity,
      description,
      imageUrls,
      game,
      setName,
      rarity,
    });

    // Update inventory item with eBay IDs
    await db.posInventoryItem.update({
      where: { id: item.id },
      data: {
        ebay_listing_id: result.listingId,
        ebay_offer_id: result.offerId,
        listed_on_ebay: true,
        updated_at: new Date(),
      },
    });

    return NextResponse.json({
      listing_id: result.listingId,
      offer_id: result.offerId,
      message: `Listed ${item.name} on eBay`,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/**
 * DELETE /api/ebay/listings
 *
 * Remove an eBay listing.
 * Body: { inventory_item_id }
 */
export async function DELETE(request: NextRequest) {
  try {
    const { db } = await requirePermission("inventory.adjust");

    const ebay = getEbayClient();
    if (!ebay) {
      return NextResponse.json(
        { error: "eBay not configured" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { inventory_item_id } = body;

    if (!inventory_item_id) {
      return NextResponse.json(
        { error: "inventory_item_id is required" },
        { status: 400 }
      );
    }

    const item = await db.posInventoryItem.findFirst({
      where: { id: inventory_item_id, category: "tcg_single" },
    });

    if (!item) {
      return NextResponse.json(
        { error: "Item not found" },
        { status: 404 }
      );
    }

    // Remove from eBay
    const sku = `afterroar-${item.id}`;
    if (item.ebay_offer_id) {
      await ebay.deleteOffer(item.ebay_offer_id).catch(() => {});
    }
    await ebay.deleteInventoryItem(sku).catch(() => {});

    // Clear eBay fields
    await db.posInventoryItem.update({
      where: { id: item.id },
      data: {
        ebay_listing_id: null,
        ebay_offer_id: null,
        listed_on_ebay: false,
        updated_at: new Date(),
      },
    });

    return NextResponse.json({
      message: `Removed ${item.name} from eBay`,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
