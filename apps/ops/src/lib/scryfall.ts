// Scryfall API client
// Free API, no auth required. Rate limit: 50ms between requests.
// https://scryfall.com/docs/api

const BASE_URL = "https://api.scryfall.com";

let lastRequestTime = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 100) {
    await new Promise((resolve) => setTimeout(resolve, 100 - elapsed));
  }
  lastRequestTime = Date.now();
  return fetch(url, {
    headers: { "User-Agent": "AfterroarStoreOps/1.0" },
  });
}

export interface ScryfallCard {
  id: string;
  name: string;
  set_name: string;
  set: string;
  collector_number: string;
  prices: { usd: string | null; usd_foil: string | null };
  image_uris?: { small: string; normal: string; large: string };
  card_faces?: Array<{
    image_uris?: { small: string; normal: string; large: string };
  }>;
  foil: boolean;
  nonfoil: boolean;
  rarity: string;
  lang: string;
  type_line?: string;
  mana_cost?: string;
  oracle_text?: string;
}

interface ScryfallSearchResponse {
  object: string;
  total_cards: number;
  has_more: boolean;
  data: ScryfallCard[];
}

interface ScryfallAutocompleteResponse {
  object: string;
  total_values: number;
  data: string[];
}

/**
 * Search Scryfall cards. Returns up to 175 results per page.
 */
export async function searchCards(
  query: string
): Promise<{ cards: ScryfallCard[]; total: number }> {
  const url = `${BASE_URL}/cards/search?q=${encodeURIComponent(query)}&unique=prints`;
  const res = await rateLimitedFetch(url);

  if (!res.ok) {
    if (res.status === 404) {
      return { cards: [], total: 0 };
    }
    throw new Error(`Scryfall search failed: ${res.status}`);
  }

  const data: ScryfallSearchResponse = await res.json();
  return { cards: data.data, total: data.total_cards };
}

/**
 * Get a single card by Scryfall ID.
 */
export async function getCard(id: string): Promise<ScryfallCard> {
  const url = `${BASE_URL}/cards/${encodeURIComponent(id)}`;
  const res = await rateLimitedFetch(url);

  if (!res.ok) {
    throw new Error(`Scryfall card fetch failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Fast card name autocomplete (up to 20 suggestions).
 */
export async function autocomplete(query: string): Promise<string[]> {
  const url = `${BASE_URL}/cards/autocomplete?q=${encodeURIComponent(query)}`;
  const res = await rateLimitedFetch(url);

  if (!res.ok) {
    return [];
  }

  const data: ScryfallAutocompleteResponse = await res.json();
  return data.data;
}

/**
 * Get the card image URL, handling double-faced cards.
 */
function getImageUrl(card: ScryfallCard): string | null {
  return (
    card.image_uris?.normal ||
    card.card_faces?.[0]?.image_uris?.normal ||
    null
  );
}

function getSmallImageUrl(card: ScryfallCard): string | null {
  return (
    card.image_uris?.small ||
    card.card_faces?.[0]?.image_uris?.small ||
    null
  );
}

/**
 * Map a Scryfall card to our PosInventoryItem format.
 */
export function scryfallToInventoryItem(
  card: ScryfallCard,
  foil: boolean
): {
  name: string;
  category: string;
  price_cents: number;
  cost_cents: number;
  image_url: string | null;
  external_id: string;
  attributes: Record<string, unknown>;
} {
  const priceStr = foil ? card.prices.usd_foil : card.prices.usd;
  const priceCents = priceStr
    ? Math.round(parseFloat(priceStr) * 100)
    : 0;

  return {
    name: foil ? `${card.name} (Foil)` : card.name,
    category: "tcg_single",
    price_cents: priceCents,
    cost_cents: 0,
    image_url: getImageUrl(card),
    external_id: `scryfall:${card.id}:${foil ? "foil" : "nonfoil"}`,
    attributes: {
      game: "MTG",
      set: card.set_name,
      set_code: card.set.toUpperCase(),
      collector_number: card.collector_number,
      rarity: card.rarity,
      foil,
      language: card.lang.toUpperCase(),
      condition: "NM",
      scryfall_id: card.id,
    },
  };
}

/**
 * Serialize a Scryfall card for client display.
 */
export interface CatalogCard {
  scryfall_id: string;
  name: string;
  set_name: string;
  set_code: string;
  collector_number: string;
  rarity: string;
  price_usd: string | null;
  price_usd_foil: string | null;
  image_url: string | null;
  small_image_url: string | null;
  foil: boolean;
  nonfoil: boolean;
  type_line: string;
  mana_cost: string;
}

export function scryfallToCatalogCard(card: ScryfallCard): CatalogCard {
  return {
    scryfall_id: card.id,
    name: card.name,
    set_name: card.set_name,
    set_code: card.set.toUpperCase(),
    collector_number: card.collector_number,
    rarity: card.rarity,
    price_usd: card.prices.usd,
    price_usd_foil: card.prices.usd_foil,
    image_url: getImageUrl(card),
    small_image_url: getSmallImageUrl(card),
    foil: card.foil,
    nonfoil: card.nonfoil,
    type_line: card.type_line || "",
    mana_cost: card.mana_cost || "",
  };
}
