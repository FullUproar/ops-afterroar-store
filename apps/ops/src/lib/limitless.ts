/* ------------------------------------------------------------------ */
/*  Limitless TCG — Pokemon Tournament Decklists                        */
/*  Fetches recent tournament results and decklists from Limitless.     */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface LimitlessTournament {
  id: string;
  name: string;
  date: string;
  players: number;
}

export interface LimitlessStanding {
  player_name: string;
  placing: number;
  decklist: LimitlessDeckCard[];
}

export interface LimitlessDeckCard {
  name: string;
  quantity: number;
  category: "pokemon" | "trainer" | "energy";
}

export interface PokemonMetaDeck {
  archetype: string;           // inferred from top Pokemon
  placing: number;
  tournament_name: string;
  cards: LimitlessDeckCard[];
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

const TOURNAMENT_CACHE_TTL = 6 * 60 * 60 * 1000;   // 6 hours
const STANDINGS_CACHE_TTL = 1 * 60 * 60 * 1000;     // 1 hour

/* ------------------------------------------------------------------ */
/*  Rate limiting — be polite                                          */
/* ------------------------------------------------------------------ */

let lastFetchTime = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastFetchTime;
  if (elapsed < 500) {
    await new Promise((r) => setTimeout(r, 500 - elapsed));
  }
  lastFetchTime = Date.now();

  return fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
}

/* ------------------------------------------------------------------ */
/*  fetchRecentTournaments                                             */
/* ------------------------------------------------------------------ */

export async function fetchRecentTournaments(
  limit: number = 10,
): Promise<LimitlessTournament[]> {
  const cacheKey = `limitless:tournaments:${limit}`;
  const cached = getCached<LimitlessTournament[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://play.limitlesstcg.com/api/tournaments?game=PTCG&limit=${limit}`;
    const res = await rateLimitedFetch(url);
    if (!res.ok) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[] = await res.json();

    const tournaments: LimitlessTournament[] = data.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (t: any) => ({
        id: String(t.id ?? t._id ?? ""),
        name: t.name ?? "Unknown",
        date: t.date ?? t.startDate ?? "",
        players: t.players ?? t.playerCount ?? 0,
      }),
    );

    if (tournaments.length > 0) {
      setCache(cacheKey, tournaments, TOURNAMENT_CACHE_TTL);
    }

    return tournaments;
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  fetchTournamentStandings                                           */
/* ------------------------------------------------------------------ */

export async function fetchTournamentStandings(
  tournamentId: string,
): Promise<LimitlessStanding[]> {
  const cacheKey = `limitless:standings:${tournamentId}`;
  const cached = getCached<LimitlessStanding[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://play.limitlesstcg.com/api/tournaments/${tournamentId}/standings`;
    const res = await rateLimitedFetch(url);
    if (!res.ok) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[] = await res.json();

    const standings: LimitlessStanding[] = data
      .filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: any) => s.decklist || s.deck,
      )
      .map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: any) => {
          const deckSource = s.decklist ?? s.deck ?? {};
          const cards: LimitlessDeckCard[] = [];

          // Parse deck sections
          for (const [section, cardList] of Object.entries(
            deckSource,
          ) as [string, unknown][]) {
            const category = inferCategory(section);
            if (!Array.isArray(cardList)) continue;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const c of cardList as any[]) {
              cards.push({
                name: c.name ?? c.card ?? String(c),
                quantity: c.count ?? c.quantity ?? c.qty ?? 1,
                category,
              });
            }
          }

          return {
            player_name: s.name ?? s.player ?? "Unknown",
            placing: s.placing ?? s.standing ?? 0,
            decklist: cards,
          };
        },
      );

    if (standings.length > 0) {
      setCache(cacheKey, standings, STANDINGS_CACHE_TTL);
    }

    return standings;
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  fetchTopPokemonDecks — convenience: top placing decks               */
/* ------------------------------------------------------------------ */

export async function fetchTopPokemonDecks(
  limit: number = 8,
): Promise<PokemonMetaDeck[]> {
  const cacheKey = `limitless:topdecks:${limit}`;
  const cached = getCached<PokemonMetaDeck[]>(cacheKey);
  if (cached) return cached;

  try {
    const tournaments = await fetchRecentTournaments(5);
    if (tournaments.length === 0) return [];

    const results: PokemonMetaDeck[] = [];

    for (const tourney of tournaments) {
      if (results.length >= limit) break;

      const standings = await fetchTournamentStandings(tourney.id);
      // Take top finishers with decklists
      const topStandings = standings
        .filter((s) => s.decklist.length > 0)
        .slice(0, 3);

      for (const standing of topStandings) {
        if (results.length >= limit) break;

        // Infer archetype from top Pokemon cards
        const pokemonCards = standing.decklist.filter(
          (c) => c.category === "pokemon",
        );
        const topPokemon = pokemonCards
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 2)
          .map((c) => c.name);

        results.push({
          archetype:
            topPokemon.length > 0
              ? topPokemon.join(" / ")
              : "Unknown Archetype",
          placing: standing.placing,
          tournament_name: tourney.name,
          cards: standing.decklist,
        });
      }
    }

    if (results.length > 0) {
      setCache(cacheKey, results, TOURNAMENT_CACHE_TTL);
    }

    return results;
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Helper: infer card category from section name                      */
/* ------------------------------------------------------------------ */

function inferCategory(section: string): "pokemon" | "trainer" | "energy" {
  const s = section.toLowerCase();
  if (s.includes("pokemon") || s.includes("pokémon")) return "pokemon";
  if (s.includes("energy")) return "energy";
  return "trainer";
}
