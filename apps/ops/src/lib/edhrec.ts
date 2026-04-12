/* ------------------------------------------------------------------ */
/*  EDHREC Commander Synergy Data                                       */
/*  Fetches commander popularity, synergy cards, and color identity     */
/*  from EDHREC's public JSON endpoints + Scryfall fallback.            */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface EDHRECCard {
  name: string;
  synergy: number;          // synergy score (higher = more synergistic)
  num_decks: number;        // decks that include this card
  potential_decks: number;  // decks that could include it
  category: string;         // "High Synergy", "Top Cards", etc.
  image_url?: string;
}

export interface CommanderData {
  commander_name: string;
  num_decks: number;
  avg_price: number;        // dollars
  color_identity: string[];
  cards: EDHRECCard[];
}

export interface CommanderSearchResult {
  name: string;
  color_identity: string[];
  image_url: string | null;
  type_line: string;
}

/* ------------------------------------------------------------------ */
/*  Cache (in-memory Map with TTL)                                      */
/* ------------------------------------------------------------------ */

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiry: Date.now() + ttlMs });
}

const EDHREC_CACHE_TTL = 24 * 60 * 60 * 1000;  // 24 hours
const SCRYFALL_CACHE_TTL = 6 * 60 * 60 * 1000;  // 6 hours

/* ------------------------------------------------------------------ */
/*  Rate limiting — Scryfall 100ms between calls                       */
/* ------------------------------------------------------------------ */

let lastScryfallTime = 0;

async function scryfallFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastScryfallTime;
  if (elapsed < 100) {
    await new Promise((r) => setTimeout(r, 100 - elapsed));
  }
  lastScryfallTime = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: controller.signal,
  });
  clearTimeout(timeout);
  return res;
}

/* ------------------------------------------------------------------ */
/*  sanitizeCommanderName — for EDHREC URL                             */
/* ------------------------------------------------------------------ */

function sanitizeCommanderName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[,']/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/* ------------------------------------------------------------------ */
/*  fetchCommanderData — get synergy data from EDHREC                  */
/* ------------------------------------------------------------------ */

export async function fetchCommanderData(
  commanderName: string,
): Promise<CommanderData | null> {
  const sanitized = sanitizeCommanderName(commanderName);
  const cacheKey = `edhrec:${sanitized}`;
  const cached = getCached<CommanderData>(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://json.edhrec.com/pages/commanders/${sanitized}.json`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();

    const cards: EDHRECCard[] = [];

    // EDHREC structures cards in cardlists with headers
    const cardlists = data.container?.json_dict?.cardlists ?? [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const section of cardlists) {
      const category = section.header ?? "Other";
      const cardViews = section.cardviews ?? [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const cv of cardViews) {
        cards.push({
          name: cv.name ?? cv.names?.[0] ?? "",
          synergy: typeof cv.synergy === "number" ? cv.synergy : 0,
          num_decks: typeof cv.num_decks === "number" ? cv.num_decks : 0,
          potential_decks:
            typeof cv.potential_decks === "number" ? cv.potential_decks : 0,
          category,
          image_url: cv.image_url ?? undefined,
        });
      }
    }

    // Sort by synergy score descending
    cards.sort((a, b) => b.synergy - a.synergy);

    const result: CommanderData = {
      commander_name:
        data.container?.json_dict?.card?.name ?? commanderName,
      num_decks:
        data.container?.json_dict?.num_decks ??
        data.container?.json_dict?.card?.num_decks ??
        0,
      avg_price: data.container?.json_dict?.avg_price ?? 0,
      color_identity:
        data.container?.json_dict?.card?.color_identity ?? [],
      cards,
    };

    setCache(cacheKey, result, EDHREC_CACHE_TTL);
    return result;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  getTopSynergyCards — top N cards sorted by synergy                  */
/* ------------------------------------------------------------------ */

export async function getTopSynergyCards(
  commanderName: string,
  limit: number = 100,
): Promise<EDHRECCard[]> {
  const data = await fetchCommanderData(commanderName);
  if (!data) return [];

  // Already sorted by synergy in fetchCommanderData
  return data.cards.slice(0, limit);
}

/* ------------------------------------------------------------------ */
/*  getCommanderColorIdentity — from EDHREC or Scryfall fallback       */
/* ------------------------------------------------------------------ */

export async function getCommanderColorIdentity(
  commanderName: string,
): Promise<string[]> {
  // Try EDHREC first (cheaper, might be cached)
  const data = await fetchCommanderData(commanderName);
  if (data && data.color_identity.length > 0) {
    return data.color_identity;
  }

  // Fallback to Scryfall
  try {
    const res = await scryfallFetch(
      `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(commanderName)}`,
    );
    if (!res.ok) return [];
    const card = await res.json();
    return card.color_identity ?? [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  searchCommanders — search Scryfall for legendary creatures          */
/* ------------------------------------------------------------------ */

export async function searchCommanders(
  query: string,
): Promise<CommanderSearchResult[]> {
  const cacheKey = `cmdr-search:${query.toLowerCase()}`;
  const cached = getCached<CommanderSearchResult[]>(cacheKey);
  if (cached) return cached;

  try {
    const scryfallQuery = `${query} is:commander`;
    const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(scryfallQuery)}&order=edhrec&unique=cards`;

    const res = await scryfallFetch(url);
    if (!res.ok) return [];

    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: CommanderSearchResult[] = (data.data ?? [])
      .slice(0, 20)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((card: any) => ({
        name: card.name,
        color_identity: card.color_identity ?? [],
        image_url:
          card.image_uris?.small ??
          card.card_faces?.[0]?.image_uris?.small ??
          null,
        type_line: card.type_line ?? "",
      }));

    if (results.length > 0) {
      setCache(cacheKey, results, SCRYFALL_CACHE_TTL);
    }

    return results;
  } catch {
    return [];
  }
}
