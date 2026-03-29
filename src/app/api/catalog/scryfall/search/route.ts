import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import {
  searchCards,
  scryfallToCatalogCard,
  type CatalogCard,
} from "@/lib/scryfall";

/**
 * GET /api/catalog/scryfall/search?q=lightning+bolt
 *
 * Fast card search for the bulk trade-in flow.
 * Returns detailed card data (name, set, prices, images) for display.
 * Results are cached in-memory for 5 minutes.
 */

interface CacheEntry {
  cards: CatalogCard[];
  ts: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getFromCache(key: string): CatalogCard[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.cards;
}

function setCache(key: string, cards: CatalogCard[]) {
  // Evict stale entries if cache gets large
  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now - v.ts > CACHE_TTL_MS) cache.delete(k);
    }
  }
  cache.set(key, { cards, ts: Date.now() });
}

export async function GET(request: NextRequest) {
  try {
    await requireStaff();

    const q = request.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ cards: [], total: 0 });
    }

    // Normalize cache key
    const cacheKey = q.toLowerCase();
    const cached = getFromCache(cacheKey);
    if (cached) {
      return NextResponse.json({ cards: cached, total: cached.length });
    }

    // Scryfall search — get up to 20 results for display
    const { cards, total } = await searchCards(q);
    const mapped = cards.slice(0, 20).map(scryfallToCatalogCard);

    setCache(cacheKey, mapped);

    return NextResponse.json({ cards: mapped, total });
  } catch (error) {
    return handleAuthError(error);
  }
}
