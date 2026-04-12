/**
 * Market Price Cache
 *
 * Caches Scryfall market prices in-memory with a 1-hour TTL.
 * Supports batch lookups to minimize API calls.
 * Respects Scryfall's 100ms rate limit between requests.
 */

import { getCard, type ScryfallCard } from "@/lib/scryfall";

export interface CachedPrice {
  scryfall_id: string;
  usd: number; // cents
  usd_foil: number; // cents
  updated_at: Date;
}

interface CacheEntry {
  price: CachedPrice;
  expires_at: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_SIZE = 5000;
const RATE_LIMIT_MS = 100; // Scryfall requires 100ms between requests

const cache = new Map<string, CacheEntry>();

function parsePriceToCents(priceStr: string | null): number {
  if (!priceStr) return 0;
  return Math.round(parseFloat(priceStr) * 100);
}

function evictStale(): void {
  if (cache.size < MAX_CACHE_SIZE) return;
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expires_at < now) {
      cache.delete(key);
    }
  }
}

function cardToPrice(card: ScryfallCard): CachedPrice {
  return {
    scryfall_id: card.id,
    usd: parsePriceToCents(card.prices.usd),
    usd_foil: parsePriceToCents(card.prices.usd_foil),
    updated_at: new Date(),
  };
}

/**
 * Get a single cached market price. Fetches from Scryfall if not cached.
 */
export async function getMarketPrice(
  scryfallId: string
): Promise<CachedPrice | null> {
  const now = Date.now();
  const cached = cache.get(scryfallId);
  if (cached && cached.expires_at > now) {
    return cached.price;
  }

  try {
    const card = await getCard(scryfallId);
    const price = cardToPrice(card);
    evictStale();
    cache.set(scryfallId, { price, expires_at: now + CACHE_TTL_MS });
    return price;
  } catch {
    return null;
  }
}

/**
 * Batch-fetch market prices for multiple cards.
 * Returns cached results immediately, fetches uncached in sequence
 * with rate limiting. Stops after maxFetch API calls to avoid timeouts.
 */
export async function getMarketPrices(
  scryfallIds: string[],
  maxFetch = 20
): Promise<Map<string, CachedPrice>> {
  const results = new Map<string, CachedPrice>();
  const now = Date.now();
  const toFetch: string[] = [];

  // Return cached, collect uncached
  for (const id of scryfallIds) {
    const cached = cache.get(id);
    if (cached && cached.expires_at > now) {
      results.set(id, cached.price);
    } else {
      toFetch.push(id);
    }
  }

  // Fetch uncached with rate limiting
  let fetched = 0;
  for (const id of toFetch) {
    if (fetched >= maxFetch) break;

    try {
      if (fetched > 0) {
        await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
      }
      const card = await getCard(id);
      const price = cardToPrice(card);
      evictStale();
      cache.set(id, { price, expires_at: now + CACHE_TTL_MS });
      results.set(id, price);
      fetched++;
    } catch {
      // Skip failed lookups
    }
  }

  return results;
}

/**
 * Pre-populate cache with prices from Scryfall card data already in hand.
 */
export function cacheFromCard(card: ScryfallCard): CachedPrice {
  const price = cardToPrice(card);
  cache.set(card.id, {
    price,
    expires_at: Date.now() + CACHE_TTL_MS,
  });
  return price;
}

/**
 * Invalidate cached price for a card.
 */
export function invalidatePrice(scryfallId: string): void {
  cache.delete(scryfallId);
}

/**
 * Get cache stats for diagnostics.
 */
export function getCacheStats(): { size: number; maxSize: number; ttlMs: number } {
  return { size: cache.size, maxSize: MAX_CACHE_SIZE, ttlMs: CACHE_TTL_MS };
}
