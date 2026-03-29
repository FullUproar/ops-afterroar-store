import { NextRequest, NextResponse } from "next/server";
import { requireStaff, requirePermission, handleAuthError } from "@/lib/require-staff";

/**
 * GET /api/singles
 *
 * List TCG singles with filtering, sorting, stats, and market data.
 * Query params:
 *   game      — filter by game (MTG, Pokemon, Lorcana, Yu-Gi-Oh)
 *   condition — filter by condition (NM, LP, MP, HP, DMG)
 *   foil      — "true" or "false"
 *   set       — filter by set code
 *   search    — text search on name
 *   sort      — price, name, set, quantity, condition (default: name)
 *   dir       — asc or desc (default: asc)
 *   cursor    — last item ID for pagination
 *   limit     — items per page (default 40, max 100)
 *   stats     — "true" to include KPI stats (default true)
 */
export async function GET(request: NextRequest) {
  try {
    const { db } = await requireStaff();

    const params = request.nextUrl.searchParams;
    const game = params.get("game")?.trim();
    const condition = params.get("condition")?.trim();
    const foilParam = params.get("foil");
    const setCode = params.get("set")?.trim();
    const search = params.get("search")?.trim();
    const sort = params.get("sort") || "name";
    const dir = params.get("dir") === "desc" ? "desc" : "asc";
    const cursor = params.get("cursor");
    const limit = Math.min(parseInt(params.get("limit") || "40", 10), 100);
    const includeStats = params.get("stats") !== "false";

    // Build where clause
    const where: Record<string, unknown> = {
      category: "tcg_single",
      active: true,
    };

    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    // Prisma JSON filtering for attributes
    const attrFilters: Record<string, unknown>[] = [];
    if (game) {
      attrFilters.push({ attributes: { path: ["game"], equals: game } });
    }
    if (condition) {
      attrFilters.push({
        attributes: { path: ["condition"], equals: condition },
      });
    }
    if (foilParam) {
      attrFilters.push({
        attributes: { path: ["foil"], equals: foilParam === "true" },
      });
    }
    if (setCode) {
      attrFilters.push({
        attributes: { path: ["set_code"], equals: setCode.toUpperCase() },
      });
    }

    if (attrFilters.length > 0) {
      where.AND = attrFilters;
    }

    // Cursor-based pagination
    const paginationArgs: Record<string, unknown> = {};
    if (cursor) {
      paginationArgs.cursor = { id: cursor };
      paginationArgs.skip = 1;
    }

    // Build orderBy
    type OrderByValue = Record<string, "asc" | "desc">;
    let orderBy: OrderByValue;
    switch (sort) {
      case "price":
        orderBy = { price_cents: dir };
        break;
      case "quantity":
        orderBy = { quantity: dir };
        break;
      case "set":
        orderBy = { name: dir }; // sets are in attributes, sort by name as fallback
        break;
      case "condition":
        orderBy = { name: dir }; // condition is in attributes
        break;
      default:
        orderBy = { name: dir };
    }

    // Fetch items
    const items = await db.posInventoryItem.findMany({
      where,
      orderBy,
      take: limit + 1, // +1 to detect if there are more
      ...paginationArgs,
      select: {
        id: true,
        name: true,
        category: true,
        price_cents: true,
        cost_cents: true,
        quantity: true,
        image_url: true,
        external_id: true,
        attributes: true,
        ebay_listing_id: true,
        listed_on_ebay: true,
        created_at: true,
        updated_at: true,
      },
    });

    const hasMore = items.length > limit;
    const pageItems = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? pageItems[pageItems.length - 1]?.id : null;

    // Enrich items with parsed attributes and margin calculation
    const enriched = pageItems.map((item) => {
      const attrs = (item.attributes ?? {}) as Record<string, unknown>;
      const marginPercent =
        item.cost_cents > 0
          ? Math.round(
              ((item.price_cents - item.cost_cents) / item.price_cents) * 100
            )
          : null;

      return {
        ...item,
        game: (attrs.game as string) || null,
        set_name: (attrs.set_name as string) || null,
        set_code: (attrs.set_code as string) || null,
        condition: (attrs.condition as string) || "NM",
        foil: (attrs.foil as boolean) || false,
        rarity: (attrs.rarity as string) || null,
        scryfall_id: (attrs.scryfall_id as string) || null,
        collector_number: (attrs.collector_number as string) || null,
        margin_percent: marginPercent,
      };
    });

    // KPI stats (computed once, not on every page)
    let stats = null;
    if (includeStats && !cursor) {
      const allSingles = await db.posInventoryItem.findMany({
        where: { category: "tcg_single", active: true },
        select: {
          price_cents: true,
          cost_cents: true,
          quantity: true,
        },
      });

      const totalCount = allSingles.reduce((s, i) => s + i.quantity, 0);
      const totalCostCents = allSingles.reduce(
        (s, i) => s + i.cost_cents * i.quantity,
        0
      );
      const totalRetailCents = allSingles.reduce(
        (s, i) => s + i.price_cents * i.quantity,
        0
      );
      const avgMargin =
        totalRetailCents > 0
          ? Math.round(
              ((totalRetailCents - totalCostCents) / totalRetailCents) * 100
            )
          : 0;

      // Count items with price alerts (items with Scryfall ID that might have drift)
      const alertEligible = allSingles.filter(
        (i) => i.quantity > 0 && i.cost_cents > 0
      ).length;

      stats = {
        total_singles: totalCount,
        unique_cards: allSingles.length,
        total_cost_cents: totalCostCents,
        total_retail_cents: totalRetailCents,
        avg_margin_percent: avgMargin,
        alert_eligible: alertEligible,
      };
    }

    return NextResponse.json({
      items: enriched,
      stats,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/**
 * PATCH /api/singles
 *
 * Update a single inventory item's price or quantity inline.
 * Body: { id, price_cents?, quantity?, quantity_delta? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const { db } = await requirePermission("inventory.adjust");

    const body = await request.json();
    const { id, price_cents, quantity, quantity_delta } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const existing = await db.posInventoryItem.findFirst({
      where: { id, category: "tcg_single" },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Item not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (typeof price_cents === "number" && price_cents >= 0) {
      updateData.price_cents = price_cents;
    }
    if (typeof quantity === "number" && quantity >= 0) {
      updateData.quantity = quantity;
    }
    if (typeof quantity_delta === "number") {
      updateData.quantity = Math.max(0, existing.quantity + quantity_delta);
    }

    const updated = await db.posInventoryItem.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ item: updated });
  } catch (error) {
    return handleAuthError(error);
  }
}
