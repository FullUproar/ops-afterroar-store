/* ------------------------------------------------------------------ */
/*  Pokemon TCG API Client                                             */
/*  API docs: https://docs.pokemontcg.io/                             */
/*  Free API, no key required (rate limited to 1000 req/day)          */
/* ------------------------------------------------------------------ */

export interface PokemonCard {
  id: string;
  name: string;
  supertype: string; // "Pokémon", "Trainer", "Energy"
  subtypes: string[];
  hp?: string;
  types?: string[];
  set: {
    id: string;
    name: string;
    series: string;
    printedTotal: number;
    total: number;
    releaseDate: string;
    images: {
      symbol: string;
      logo: string;
    };
  };
  number: string;
  rarity?: string;
  images: {
    small: string;
    large: string;
  };
  tcgplayer?: {
    url: string;
    updatedAt: string;
    prices?: Record<string, {
      low?: number;
      mid?: number;
      high?: number;
      market?: number;
      directLow?: number;
    }>;
  };
  cardmarket?: {
    url: string;
    updatedAt: string;
    prices?: {
      averageSellPrice?: number;
      lowPrice?: number;
      trendPrice?: number;
    };
  };
}

export interface PokemonSearchResult {
  cards: PokemonCard[];
  total: number;
}

export interface CatalogPokemonCard {
  pokemon_id: string;
  name: string;
  set_name: string;
  set_id: string;
  number: string;
  rarity: string | null;
  supertype: string;
  image_url: string | null;
  small_image_url: string | null;
  price_market: number | null; // cents
  price_low: number | null;    // cents
  hp: string | null;
  types: string[];
}

function dollarsToCents(dollars: number | undefined | null): number | null {
  if (dollars == null || isNaN(dollars)) return null;
  return Math.round(dollars * 100);
}

function getBestPrice(card: PokemonCard): { market: number | null; low: number | null } {
  // Try TCGPlayer prices first (most common in US market)
  if (card.tcgplayer?.prices) {
    const priceTypes = Object.values(card.tcgplayer.prices);
    for (const pt of priceTypes) {
      if (pt.market) return { market: dollarsToCents(pt.market), low: dollarsToCents(pt.low) };
      if (pt.mid) return { market: dollarsToCents(pt.mid), low: dollarsToCents(pt.low) };
    }
  }
  // Fall back to Cardmarket
  if (card.cardmarket?.prices) {
    return {
      market: dollarsToCents(card.cardmarket.prices.trendPrice || card.cardmarket.prices.averageSellPrice),
      low: dollarsToCents(card.cardmarket.prices.lowPrice),
    };
  }
  return { market: null, low: null };
}

export function pokemonToCatalogCard(card: PokemonCard): CatalogPokemonCard {
  const prices = getBestPrice(card);
  return {
    pokemon_id: card.id,
    name: card.name,
    set_name: card.set.name,
    set_id: card.set.id,
    number: card.number,
    rarity: card.rarity ?? null,
    supertype: card.supertype,
    image_url: card.images.large,
    small_image_url: card.images.small,
    price_market: prices.market,
    price_low: prices.low,
    hp: card.hp ?? null,
    types: card.types ?? [],
  };
}

/**
 * Search Pokemon TCG cards by name.
 * Returns up to 20 results.
 */
export async function searchPokemonCards(query: string): Promise<PokemonSearchResult> {
  const encodedQuery = encodeURIComponent(`name:"${query}*"`);
  const url = `https://api.pokemontcg.io/v2/cards?q=${encodedQuery}&pageSize=20&orderBy=-set.releaseDate`;

  const headers: Record<string, string> = {};
  if (process.env.POKEMON_TCG_API_KEY) {
    headers["X-Api-Key"] = process.env.POKEMON_TCG_API_KEY;
  }

  const res = await fetch(url, { headers, next: { revalidate: 300 } }); // 5-min cache

  if (!res.ok) {
    console.error("[Pokemon TCG] API error:", res.status, await res.text().catch(() => ""));
    return { cards: [], total: 0 };
  }

  const data = await res.json();
  return {
    cards: (data.data ?? []) as PokemonCard[],
    total: data.totalCount ?? 0,
  };
}

/**
 * Get a specific Pokemon card by ID.
 */
export async function getPokemonCard(id: string): Promise<PokemonCard | null> {
  const url = `https://api.pokemontcg.io/v2/cards/${encodeURIComponent(id)}`;

  const headers: Record<string, string> = {};
  if (process.env.POKEMON_TCG_API_KEY) {
    headers["X-Api-Key"] = process.env.POKEMON_TCG_API_KEY;
  }

  const res = await fetch(url, { headers, next: { revalidate: 3600 } }); // 1-hr cache

  if (!res.ok) return null;

  const data = await res.json();
  return (data.data ?? null) as PokemonCard | null;
}
