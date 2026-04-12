import { NextRequest, NextResponse } from "next/server";
import { requirePermissionAndFeature, handleAuthError } from "@/lib/require-staff";
import { getManaPoolClient } from "@/lib/manapool";

/**
 * GET /api/manapool/listings
 *
 * List inventory items with Mana Pool status.
 * Returns listed items and items available to list.
 */
export async function GET(request: NextRequest) {
  try {
    const { db } = await requirePermissionAndFeature("inventory.adjust", "ecommerce");

    const params = request.nextUrl.searchParams;
    const filter = params.get("filter") || "all"; // "listed", "unlisted", "all"
    const limit = Math.min(parseInt(params.get("limit") || "50", 10), 200);

    const where: Record<string, unknown> = {
      category: "tcg_single",
      active: true,
      quantity: { gt: 0 },
    };

    if (filter === "listed") {
      where.listed_on_manapool = true;
    } else if (filter === "unlisted") {
      where.listed_on_manapool = false;
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
        manapool_listing_id: true,
        listed_on_manapool: true,
      },
    });

    // Stats
    const listedCount = await db.posInventoryItem.count({
      where: {
        category: "tcg_single",
        active: true,
        listed_on_manapool: true,
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
      manapool_configured: !!process.env.MANAPOOL_API_KEY,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/**
 * POST /api/manapool/listings
 *
 * List an inventory item on Mana Pool.
 * Body: { inventory_item_id, price_cents? }
 */
export async function POST(request: NextRequest) {
  try {
    const { db } = await requirePermissionAndFeature("inventory.adjust", "ecommerce");

    const mp = getManaPoolClient();
    if (!mp) {
      return NextResponse.json(
        { error: "Mana Pool not configured. Set MANAPOOL_API_KEY env var." },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { inventory_item_id, price_cents } = body;

    if (!inventory_item_id) {
      return NextResponse.json(
        { error: "inventory_item_id is required" },
        { status: 400 },
      );
    }

    const item = await db.posInventoryItem.findFirst({
      where: { id: inventory_item_id, category: "tcg_single" },
    });

    if (!item) {
      return NextResponse.json(
        { error: "Item not found" },
        { status: 404 },
      );
    }

    if (item.listed_on_manapool) {
      return NextResponse.json(
        { error: "Item already listed on Mana Pool" },
        { status: 400 },
      );
    }

    const attrs = (item.attributes ?? {}) as Record<string, unknown>;
    const condition = (attrs.condition as string) || "NM";
    const game = (attrs.game as string) || "MTG";
    const setName = (attrs.set_name as string) || "";
    const rarity = (attrs.rarity as string) || "";
    const foil = (attrs.foil as boolean) || false;
    const finalPrice = price_cents || item.price_cents;

    const sku = `afterroar-${item.id}`;
    const description = [
      item.name,
      setName && `Set: ${setName}`,
      `Condition: ${condition}`,
      foil && "Foil",
      rarity && `Rarity: ${rarity}`,
    ]
      .filter(Boolean)
      .join(" | ");

    const result = await mp.listSingle({
      sku,
      title: item.name,
      condition,
      priceCents: finalPrice,
      quantity: item.quantity,
      description,
      imageUrl: item.image_url || undefined,
      foil,
      game,
      setName,
    });

    // Update inventory item with Mana Pool ID
    await db.posInventoryItem.update({
      where: { id: item.id },
      data: {
        manapool_listing_id: result.listingId,
        listed_on_manapool: true,
        updated_at: new Date(),
      },
    });

    return NextResponse.json({
      listing_id: result.listingId,
      message: `Listed ${item.name} on Mana Pool`,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/**
 * DELETE /api/manapool/listings
 *
 * Remove a Mana Pool listing.
 * Body: { inventory_item_id }
 */
export async function DELETE(request: NextRequest) {
  try {
    const { db } = await requirePermissionAndFeature("inventory.adjust", "ecommerce");

    const mp = getManaPoolClient();
    if (!mp) {
      return NextResponse.json(
        { error: "Mana Pool not configured" },
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
      where: { id: inventory_item_id, category: "tcg_single" },
    });

    if (!item) {
      return NextResponse.json(
        { error: "Item not found" },
        { status: 404 },
      );
    }

    // Remove from Mana Pool
    if (item.manapool_listing_id) {
      await mp.deleteListing(item.manapool_listing_id).catch(() => {});
    }

    // Clear Mana Pool fields
    await db.posInventoryItem.update({
      where: { id: item.id },
      data: {
        manapool_listing_id: null,
        listed_on_manapool: false,
        updated_at: new Date(),
      },
    });

    return NextResponse.json({
      message: `Removed ${item.name} from Mana Pool`,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
