import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/barcode/catalog
 *
 * Create or update a catalog product entry when a new barcode is learned.
 * Links the inventory item to the catalog product for cross-store matching.
 */
export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requireStaff();

    const body = await request.json();
    const {
      inventory_item_id,
      barcode,
      name,
      category,
      image_url,
      description,
      brand,
      bgg_id,
      bgg_rating,
      bgg_image,
      min_players,
      max_players,
      playtime,
      source,
      catalog_product_id,
    } = body;

    if (!inventory_item_id || !barcode || !name) {
      return NextResponse.json(
        { error: "inventory_item_id, barcode, and name are required" },
        { status: 400 }
      );
    }

    // If we already have a catalog_product_id (from lookup), just link it
    if (catalog_product_id) {
      // SECURITY: scope update to store_id to prevent cross-tenant writes
      const result = await prisma.posInventoryItem.updateMany({
        where: { id: inventory_item_id, store_id: storeId },
        data: {
          catalog_product_id,
          shared_to_catalog: false,
        },
      });
      if (result.count === 0) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }

      return NextResponse.json({ linked: true, catalog_product_id });
    }

    // Check if a catalog product already exists for this UPC
    let existing = await prisma.posCatalogProduct.findFirst({
      where: {
        external_ids: { path: ["upc"], equals: barcode },
      },
    });

    if (!existing) {
      // Build external_ids
      const externalIds: Record<string, string> = {
        upc: barcode,
        primary: `upc:${barcode}`,
      };
      if (bgg_id) externalIds.bgg_id = String(bgg_id);

      // Build attributes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attributes: Record<string, any> = {};
      if (brand) attributes.brand = brand;
      if (bgg_rating) attributes.bgg_rating = bgg_rating;
      if (bgg_image) attributes.bgg_image = bgg_image;
      if (min_players) attributes.min_players = min_players;
      if (max_players) attributes.max_players = max_players;
      if (playtime) attributes.playtime = playtime;
      attributes.source = source || "manual";

      // Detect subcategory and game
      let game: string | null = null;
      let subcategory: string | null = null;
      let productType: string | null = null;

      if (category === "board_game") {
        productType = "board_game";
      } else if (category === "sealed" || category === "tcg_single") {
        productType = category === "sealed" ? "sealed" : "single";
        const lowerName = name.toLowerCase();
        if (lowerName.includes("magic") || lowerName.includes("mtg")) {
          game = "MTG";
          subcategory = category === "sealed" ? "mtg-sealed" : "mtg-singles";
        } else if (lowerName.includes("pokemon") || lowerName.includes("pokémon")) {
          game = "Pokemon";
          subcategory = category === "sealed" ? "pokemon-sealed" : "pokemon-singles";
        } else if (lowerName.includes("yu-gi-oh") || lowerName.includes("yugioh")) {
          game = "Yu-Gi-Oh!";
          subcategory = category === "sealed" ? "yugioh-sealed" : "yugioh-singles";
        }
      }

      existing = await prisma.posCatalogProduct.create({
        data: {
          name,
          category,
          subcategory,
          game,
          product_type: productType,
          attributes,
          external_ids: externalIds,
          image_url: image_url || null,
          description: description || null,
          contributed_by_store_id: storeId,
        },
      });
    }

    // Link inventory item to catalog product
    // SECURITY: scope update to store_id to prevent cross-tenant writes
    await prisma.posInventoryItem.updateMany({
      where: { id: inventory_item_id, store_id: storeId },
      data: {
        catalog_product_id: existing.id,
        shared_to_catalog: false,
      },
    });

    return NextResponse.json({
      linked: true,
      catalog_product_id: existing.id,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
