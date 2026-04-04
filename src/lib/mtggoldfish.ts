/* ------------------------------------------------------------------ */
/*  MTGGoldfish Meta Scraper                                            */
/*  Fetches top tournament archetypes and decklists from MTGGoldfish.   */
/*  No official API — uses HTML scraping + download endpoints.          */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface MetaArchetype {
  name: string;
  metaShare: number;       // percentage (e.g. 12.5 = 12.5%)
  deckUrl: string;         // full URL to a sample deck
}

export interface MetaDeckResult {
  archetype: string;
  metaShare: number;
  cards: Array<{ quantity: number; name: string }>;
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

const META_CACHE_TTL = 6 * 60 * 60 * 1000;       // 6 hours
const DECKLIST_CACHE_TTL = 1 * 60 * 60 * 1000;    // 1 hour

/* ------------------------------------------------------------------ */
/*  Rate limiting — 1s between MTGGoldfish calls                       */
/* ------------------------------------------------------------------ */

let lastFetchTime = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastFetchTime;
  if (elapsed < 1000) {
    await new Promise((r) => setTimeout(r, 1000 - elapsed));
  }
  lastFetchTime = Date.now();

  return fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,*/*",
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Valid formats                                                       */
/* ------------------------------------------------------------------ */

const VALID_FORMATS = [
  "standard",
  "modern",
  "pioneer",
  "pauper",
  "legacy",
  "vintage",
] as const;

export type GoldfishFormat = (typeof VALID_FORMATS)[number];

export function isValidFormat(f: string): f is GoldfishFormat {
  return (VALID_FORMATS as readonly string[]).includes(f.toLowerCase());
}

/* ------------------------------------------------------------------ */
/*  fetchMetaArchetypes — scrape top archetypes for a format            */
/* ------------------------------------------------------------------ */

export async function fetchMetaArchetypes(
  format: string,
): Promise<MetaArchetype[]> {
  const fmt = format.toLowerCase();
  if (!isValidFormat(fmt)) return [];

  const cacheKey = `meta:${fmt}`;
  const cached = getCached<MetaArchetype[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://www.mtggoldfish.com/metagame/${fmt}/full#paper`;
    const res = await rateLimitedFetch(url);
    if (!res.ok) return [];

    const html = await res.text();
    const archetypes = parseMetaHtml(html, fmt);

    if (archetypes.length > 0) {
      setCache(cacheKey, archetypes, META_CACHE_TTL);
    }

    return archetypes;
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  HTML parser — extract archetypes from metagame page                 */
/* ------------------------------------------------------------------ */

function parseMetaHtml(html: string, format: string): MetaArchetype[] {
  const results: MetaArchetype[] = [];

  // MTGGoldfish metagame page has archetype tiles with:
  //   <span class="deck-price-paper">XX.XX%</span>
  //   <a ... href="/archetype/deck-name#paper">Deck Name</a>
  // We look for archetype links paired with percentage spans.

  // Pattern 1: archetype tile links — href="/archetype/{name}..." with text content
  const tilePattern =
    /class="[^"]*archetype-tile[^"]*"[\s\S]*?<a[^>]+href="(\/archetype\/[^"#]+)[^"]*"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<span[^>]*class="[^"]*deck-price-paper[^"]*"[^>]*>([\d.]+)%<\/span>/gi;

  let match: RegExpExecArray | null;
  while ((match = tilePattern.exec(html)) !== null) {
    const deckPath = match[1].trim();
    const rawName = match[2].replace(/<[^>]+>/g, "").trim();
    const share = parseFloat(match[3]);

    if (rawName && !isNaN(share)) {
      results.push({
        name: rawName,
        metaShare: share,
        deckUrl: `https://www.mtggoldfish.com${deckPath}`,
      });
    }
  }

  // Pattern 2: fallback — simpler pattern scanning for deck names + percentages
  if (results.length === 0) {
    const simplePattern =
      /<a[^>]+href="(\/archetype\/[^"#]+)[^"]*"[^>]*>([^<]+)<\/a>/gi;
    const percentPattern = /([\d.]+)%/g;
    const percentages: number[] = [];

    let pMatch: RegExpExecArray | null;
    while ((pMatch = percentPattern.exec(html)) !== null) {
      const pct = parseFloat(pMatch[1]);
      if (pct > 0 && pct < 100) percentages.push(pct);
    }

    let pIdx = 0;
    while ((match = simplePattern.exec(html)) !== null) {
      const deckPath = match[1].trim();
      const rawName = match[2].trim();
      // Skip non-archetype links
      if (
        !deckPath.includes(format) &&
        !deckPath.includes("archetype")
      )
        continue;
      if (rawName.length < 3 || rawName.length > 60) continue;

      const share = pIdx < percentages.length ? percentages[pIdx++] : 0;
      results.push({
        name: rawName,
        metaShare: share,
        deckUrl: `https://www.mtggoldfish.com${deckPath}`,
      });
    }
  }

  // Deduplicate by name
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = r.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ------------------------------------------------------------------ */
/*  fetchDecklist — download a decklist as plaintext                    */
/* ------------------------------------------------------------------ */

export async function fetchDecklist(
  deckUrl: string,
): Promise<string | null> {
  const cacheKey = `deck:${deckUrl}`;
  const cached = getCached<string>(cacheKey);
  if (cached) return cached;

  try {
    // Extract deck ID from URL patterns:
    //   /archetype/deck-name-12345#paper → get the archetype page, find a deck link
    //   /deck/12345 → direct download
    //   /deck/download/12345 → direct download

    let deckId: string | null = null;

    const directMatch = deckUrl.match(/\/deck(?:\/download)?\/(\d+)/);
    if (directMatch) {
      deckId = directMatch[1];
    }

    if (!deckId) {
      // Fetch the archetype page and find a deck download link
      const res = await rateLimitedFetch(deckUrl);
      if (!res.ok) return null;

      const html = await res.text();
      const deckIdMatch = html.match(/\/deck\/download\/(\d+)/);
      if (deckIdMatch) {
        deckId = deckIdMatch[1];
      } else {
        // Try /deck/ pattern
        const altMatch = html.match(/\/deck\/(\d+)/);
        if (altMatch) deckId = altMatch[1];
      }
    }

    if (!deckId) return null;

    const downloadUrl = `https://www.mtggoldfish.com/deck/download/${deckId}`;
    const res = await rateLimitedFetch(downloadUrl);
    if (!res.ok) return null;

    const text = await res.text();
    if (text && text.trim().length > 0) {
      setCache(cacheKey, text, DECKLIST_CACHE_TTL);
    }

    return text;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  fetchTopDecks — convenience: fetch archetypes + decklists           */
/* ------------------------------------------------------------------ */

export async function fetchTopDecks(
  format: string,
  limit: number = 5,
): Promise<MetaDeckResult[]> {
  const archetypes = await fetchMetaArchetypes(format);
  const topN = archetypes.slice(0, limit);
  const results: MetaDeckResult[] = [];

  for (const arch of topN) {
    const text = await fetchDecklist(arch.deckUrl);
    if (!text) {
      results.push({
        archetype: arch.name,
        metaShare: arch.metaShare,
        cards: [],
      });
      continue;
    }

    const cards = parseDecklistPlaintext(text);
    results.push({
      archetype: arch.name,
      metaShare: arch.metaShare,
      cards,
    });
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  parseDecklistPlaintext — parse "4 Lightning Bolt" format            */
/* ------------------------------------------------------------------ */

function parseDecklistPlaintext(
  text: string,
): Array<{ quantity: number; name: string }> {
  const lines = text.split("\n");
  const results: Array<{ quantity: number; name: string }> = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("//") || line.startsWith("#")) continue;
    if (/^(sideboard|mainboard|companion|deck|maybeboard):?\s*$/i.test(line))
      continue;

    const match = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    if (match) {
      const quantity = parseInt(match[1], 10);
      const name = match[2].trim();
      if (name && quantity > 0) {
        results.push({ quantity, name });
      }
    }
  }

  return results;
}
