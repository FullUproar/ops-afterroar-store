import { NextRequest, NextResponse } from "next/server";
import { requirePermissionAndFeature, handleAuthError } from "@/lib/require-staff";
import { getCardTraderClient } from "@/lib/cardtrader";

/**
 * GET /api/cardtrader/listings
 *
 * List inventory items with CardTrader status.
 * Returns listed items and items available to list.
 */
export async function GET(request: NextRequest) {
  try {
    const { db, storeId } = await requirePermissionAndFeature("inventory.adjust", "ecommerce");

    const params = request.nextUrl.searchParams;
    const filter = params.get("filter") || "all"; // "listed", "unlisted", "all"
    const limit = Math.min(parseInt(params.get("limit") || "50", 10), 200);

    const where: Record<string, unknown> = {
      store_id: storeId,
      category: "tcg_single",
      active: true,
      quantity: { gt: 0 },
    };

    if (filter === "listed") {
      where.listed_on_cardtrader = true;
    } else if (filter === "unlisted") {
      where.listed_on_cardtrader = false;
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
        cardtrader_product_id: true,
        listed_on_cardtrader: true,
      },
    });

    // Stats
    const listedCount = await db.posInventoryItem.count({
      where: {
        store_id: storeId,
        category: "tcg_single",
        active: true,
        listed_on_cardtrader: true,
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
        blueprint_id: (attrs.cardtrader_blueprint_id as number) || null,
      };
    });

    return NextResponse.json({
      items: enriched,
      listed_count: listedCount,
      cardtrader_configured: !!process.env.CARDTRADER_API_TOKEN,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/**
 * POST /api/cardtrader/listings
 *
 * List an inventory item on CardTrader.
 * Body: { inventory_item_id, price_cents?, blueprint_id? }
 */
export async function POST(request: NextRequest) {
  try {
    const { db, storeId } = await requirePermissionAndFeature("inventory.adjust", "ecommerce");

    const ct = getCardTraderClient();
    if (!ct) {
      return NextResponse.json(
        { error: "CardTrader not configured. Set CARDTRADER_API_TOKEN env var." },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { inventory_item_id, price_cents, blueprint_id } = body;

    if (!inventory_item_id) {
      return NextResponse.json(
        { error: "inventory_item_id is required" },
        { status: 400 },
      );
    }

    const item = await db.posInventoryItem.findFirst({
      where: { id: inventory_item_id, store_id: storeId, category: "tcg_single" },
    });

    if (!item) {
      return NextResponse.json(
        { error: "Item not found" },
        { status: 404 },
      );
    }

    if (item.listed_on_cardtrader) {
      return NextResponse.json(
        { error: "Item already listed on CardTrader" },
        { status: 400 },
      );
    }

    const attrs = (item.attributes ?? {}) as Record<string, unknown>;
    const condition = (attrs.condition as string) || "NM";
    const game = (attrs.game as string) || "MTG";
    const foil = (attrs.foil as boolean) || false;
    const finalPrice = price_cents || item.price_cents;

    // Blueprint ID is required for CardTrader — use provided or stored
    const bpId = blueprint_id || (attrs.cardtrader_blueprint_id as number);
    if (!bpId) {
      return NextResponse.json(
        { error: "blueprint_id is required for CardTrader listings" },
        { status: 400 },
      );
    }

    const description = [
      item.name,
      `Condition: ${condition}`,
      foil && "Foil",
    ]
      .filter(Boolean)
      .join(" | ");

    const result = await ct.listSingle({
      blueprintId: bpId,
      title: item.name,
      condition,
      priceCents: finalPrice,
      quantity: item.quantity,
      description,
      foil,
      game,
    });

    // Update inventory item with CardTrader ID
    await db.posInventoryItem.update({
      where: { id: item.id },
      data: {
        cardtrader_product_id: String(result.productId),
        listed_on_cardtrader: true,
        updated_at: new Date(),
      },
    });

    return NextResponse.json({
      product_id: result.productId,
      message: `Listed ${item.name} on CardTrader`,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/**
 * DELETE /api/cardtrader/listings
 *
 * Remove a CardTrader listing.
 * Body: { inventory_item_id }
 */
export async function DELETE(request: NextRequest) {
  try {
    const { db, storeId } = await requirePermissionAndFeature("inventory.adjust", "ecommerce");

    const ct = getCardTraderClient();
    if (!ct) {
      return NextResponse.json(
        { error: "CardTrader not configured" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { inventory_item_id } = body;

    if (!inventory_item_id) {
      return NextResponse.json(
        { error: "inventory_item_id is required" },
        { status: 400 },
      );
    }

    const item = await db.posInventoryItem.findFirst({
      where: { id: inventory_item_id, store_id: storeId, category: "tcg_single" },
    });

    if (!item) {
      return NextResponse.json(
        { error: "Item not found" },
        { status: 404 },
      );
    }

    // Remove from CardTrader
    if (item.cardtrader_product_id) {
      await ct.deleteProduct(item.cardtrader_product_id).catch(() => {});
    }

    // Clear CardTrader fields
    await db.posInventoryItem.update({
      where: { id: item.id },
      data: {
        cardtrader_product_id: null,
        listed_on_cardtrader: false,
        updated_at: new Date(),
      },
    });

    return NextResponse.json({
      message: `Removed ${item.name} from CardTrader`,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
