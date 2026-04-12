import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { prisma } from "@/lib/prisma";
import { searchBGG, getBGGGame } from "@/lib/bgg";

interface UPCItemDBItem {
  title: string;
  description: string;
  brand: string;
  category: string;
  images: string[];
}

interface UPCItemDBResponse {
  code: string;
  total: number;
  offset: number;
  items: UPCItemDBItem[];
}

interface LookupProduct {
  name: string;
  brand: string;
  description: string;
  category: string;
  image_url: string | null;
  upc: string;
  suggested_price_cents: number | null;
  bgg: {
    id: string;
    rating: number;
    min_players: number;
    max_players: number;
    playtime: string;
    image: string;
  } | null;
}

/**
 * Auto-detect category from product data.
 */
function detectCategory(
  name: string,
  brand: string,
  upcCategory: string,
  bggMatch: boolean
): string {
  const lower = `${name} ${brand} ${upcCategory}`.toLowerCase();

  if (bggMatch) return "board_game";
  if (
    lower.includes("magic") ||
    lower.includes("pokemon") ||
    lower.includes("yu-gi-oh") ||
    lower.includes("yugioh") ||
    lower.includes("digimon")
  ) {
    // If it has "booster" or "box" or "pack" or "bundle" or "deck" → sealed
    if (
      lower.includes("booster") ||
      lower.includes("box") ||
      lower.includes("pack") ||
      lower.includes("bundle") ||
      lower.includes("deck") ||
      lower.includes("display") ||
      lower.includes("collection")
    ) {
      return "sealed";
    }
    return "sealed"; // default TCG products with barcodes to sealed
  }
  if (lower.includes("miniature") || lower.includes("warhammer") || lower.includes("d&d")) {
    return "miniature";
  }
  if (lower.includes("sleeve") || lower.includes("dice") || lower.includes("playmat") || lower.includes("binder")) {
    return "accessory";
  }
  if (
    lower.includes("board game") ||
    lower.includes("tabletop") ||
    lower.includes("game") ||
    lower.includes("puzzle")
  ) {
    return "board_game";
  }
  return "other";
}

/**
 * GET /api/barcode/lookup?code=029877030712
 *
 * Look up a barcode (UPC/EAN) via:
 * 1. Our own catalog (pos_catalog_products)
 * 2. UPCitemdb.com free trial API
 * 3. BoardGameGeek enrichment
 */
export async function GET(request: NextRequest) {
  try {
    await requireStaff();

    const code = request.nextUrl.searchParams.get("code")?.trim();

    if (!code) {
      return NextResponse.json(
        { error: "code parameter is required" },
        { status: 400 }
      );
    }

    // 1. Check our own catalog first
    const catalogProduct = await prisma.posCatalogProduct.findFirst({
      where: {
        external_ids: { path: ["upc"], equals: code },
      },
    });

    if (catalogProduct) {
      const attrs = catalogProduct.attributes as Record<string, unknown>;
      const extIds = catalogProduct.external_ids as Record<string, unknown>;
      const bggId = extIds?.bgg_id as string | undefined;

      return NextResponse.json({
        found: true,
        source: "catalog",
        catalog_product_id: catalogProduct.id,
        product: {
          name: catalogProduct.name,
          brand: (attrs?.brand as string) || "",
          description: catalogProduct.description || "",
          category: catalogProduct.category,
          image_url: catalogProduct.image_url,
          upc: code,
          suggested_price_cents: null,
          bgg: bggId
            ? {
                id: bggId,
                rating: (attrs?.bgg_rating as number) || 0,
                min_players: (attrs?.min_players as number) || 0,
                max_players: (attrs?.max_players as number) || 0,
                playtime: (attrs?.playtime as string) || "",
                image: (attrs?.bgg_image as string) || catalogProduct.image_url || "",
              }
            : null,
        },
      });
    }

    // 2. Try UPCitemdb.com free trial API
    let upcProduct: UPCItemDBItem | null = null;
    let rateLimited = false;

    try {
      const upcRes = await fetch(
        `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`,
        {
          headers: {
            "User-Agent": "AfterroarStoreOps/1.0",
            Accept: "application/json",
          },
        }
      );

      if (upcRes.status === 429) {
        rateLimited = true;
      } else if (upcRes.ok) {
        const upcData: UPCItemDBResponse = await upcRes.json();
        if (upcData.items && upcData.items.length > 0) {
          upcProduct = upcData.items[0];
        }
      }
    } catch (err) {
      console.error("UPCitemdb lookup failed:", err);
    }

    if (rateLimited && !upcProduct) {
      return NextResponse.json({
        found: false,
        rate_limited: true,
        source: "not_found",
        product: null,
      });
    }

    if (!upcProduct) {
      return NextResponse.json({
        found: false,
        rate_limited: false,
        source: "not_found",
        product: null,
      });
    }

    // 3. Try BGG enrichment if we found a product
    let bggData: LookupProduct["bgg"] = null;
    let bggMatch = false;

    try {
      const searchName = upcProduct.title
        .replace(/\(.*?\)/g, "") // remove parentheticals
        .replace(/\s+/g, " ")
        .trim();

      const bggResults = await searchBGG(searchName);

      if (bggResults.length > 0) {
        // Try to find an exact-ish match
        const lowerName = searchName.toLowerCase();
        const exactMatch = bggResults.find(
          (r) => r.name.toLowerCase() === lowerName
        );
        const bestMatch = exactMatch || bggResults[0];

        const game = await getBGGGame(bestMatch.id);

        if (game) {
          bggMatch = true;
          const minTime = game.playingTime;
          bggData = {
            id: game.id,
            rating: game.rating,
            min_players: game.minPlayers,
            max_players: game.maxPlayers,
            playtime: `${minTime}`,
            image: game.image,
          };
        }
      }
    } catch (err) {
      console.error("BGG enrichment failed:", err);
    }

    const category = detectCategory(
      upcProduct.title,
      upcProduct.brand,
      upcProduct.category,
      bggMatch
    );

    const product: LookupProduct = {
      name: upcProduct.title,
      brand: upcProduct.brand || "",
      description: upcProduct.description || "",
      category,
      image_url:
        bggData?.image ||
        (upcProduct.images && upcProduct.images.length > 0
          ? upcProduct.images[0]
          : null),
      upc: code,
      suggested_price_cents: null,
      bgg: bggData,
    };

    return NextResponse.json({
      found: true,
      source: "upcitemdb",
      product,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
