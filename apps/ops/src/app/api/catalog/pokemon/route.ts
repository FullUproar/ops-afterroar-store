import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import {
  searchPokemonCards,
  pokemonToCatalogCard,
  type CatalogPokemonCard,
} from "@/lib/pokemon-tcg";

/* ------------------------------------------------------------------ */
/*  GET /api/catalog/pokemon?q=charizard                               */
/*  Search Pokemon TCG cards by name.                                  */
/* ------------------------------------------------------------------ */

interface CacheEntry {
  cards: CatalogPokemonCard[];
  ts: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    await requireStaff();

    const q = request.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ cards: [], total: 0 });
    }

    const cacheKey = `pkmn:${q.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return NextResponse.json({ cards: cached.cards, total: cached.cards.length });
    }

    const { cards, total } = await searchPokemonCards(q);
    const mapped = cards.slice(0, 20).map(pokemonToCatalogCard);

    // Cache and evict stale
    if (cache.size > 200) {
      const now = Date.now();
      for (const [k, v] of cache) {
        if (now - v.ts > CACHE_TTL_MS) cache.delete(k);
      }
    }
    cache.set(cacheKey, { cards: mapped, ts: Date.now() });

    return NextResponse.json({ cards: mapped, total });
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/catalog/pokemon — add a Pokemon card to inventory        */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    const { db, storeId } = await requireStaff();

    const body = await request.json();
    const { pokemon_id, name, set_name, number, rarity, image_url, price_cents, cost_cents, quantity, condition } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Check if already exists by external ID
    const existing = await db.posInventoryItem.findFirst({
      where: { external_id: `pokemon:${pokemon_id}` },
    });

    if (existing) {
      // Update quantity
      const updated = await db.posInventoryItem.update({
        where: { id: existing.id },
        data: { quantity: { increment: quantity || 1 } },
      });
      return NextResponse.json(updated);
    }

    // Create new item
    const item = await db.posInventoryItem.create({
      data: {
        store_id: storeId,
        name: `${name}${number ? ` (${number})` : ""}`,
        category: "tcg_single",
        price_cents: price_cents || 0,
        cost_cents: cost_cents || 0,
        quantity: quantity || 1,
        image_url: image_url || null,
        external_id: `pokemon:${pokemon_id}`,
        attributes: {
          game: "Pokemon",
          set: set_name,
          number,
          rarity,
          condition: condition || "NM",
          pokemon_id,
        },
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
