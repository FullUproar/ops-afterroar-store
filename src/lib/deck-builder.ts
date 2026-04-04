/* ------------------------------------------------------------------ */
/*  Deck Builder Engine                                                 */
/*  Search Scryfall for archetype cards, parse text decklists,          */
/*  match against store inventory, suggest popular archetypes.          */
/* ------------------------------------------------------------------ */

import { prisma } from "./prisma";
import {
  fetchMetaArchetypes,
  fetchDecklist as fetchGoldfishDecklist,
  type MetaArchetype,
} from "./mtggoldfish";
import {
  getTopSynergyCards,
  searchCommanders,
  fetchCommanderData,
  type EDHRECCard,
  type CommanderSearchResult,
} from "./edhrec";
import {
  fetchTopPokemonDecks,
  type PokemonMetaDeck,
} from "./limitless";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface DeckCard {
  name: string;
  mana_cost: string | null;
  type_line: string;
  image_url: string | null;
  price_usd: number | null;     // dollars (from Scryfall)
  price_cents: number | null;   // cents
  set_name: string | null;
  rarity: string | null;
}

export interface ParsedCard {
  quantity: number;
  name: string;
}

export interface InventoryMatchResult {
  name: string;
  needed: number;
  in_stock: number;
  price_cents: number;
  inventory_item_id: string | null;
  image_url: string | null;
  status: "available" | "partial" | "unavailable";
}

export interface MetaDeck {
  name: string;
  format: string;
  searchQuery: string;
  metaShare?: number;       // percentage from live data
}

export interface LiveMetaResult {
  name: string;
  metaShare: number;
  format: string;
  deckUrl?: string;
}

export interface CommanderDeckResult {
  commander_name: string;
  num_decks: number;
  avg_price: number;
  color_identity: string[];
  synergy_cards: EDHRECCard[];
  inventory_matches: InventoryMatchResult[];
  substitutions: Array<{
    missing_card: string;
    substitute: string;
    substitute_synergy: number;
    in_stock: boolean;
  }>;
}

// Re-export types from sub-modules for convenience
export type { MetaArchetype } from "./mtggoldfish";
export type { EDHRECCard, CommanderSearchResult } from "./edhrec";
export type { PokemonMetaDeck } from "./limitless";

/* ------------------------------------------------------------------ */
/*  Rate-limit helper (Scryfall: max 10 req/s)                         */
/* ------------------------------------------------------------------ */

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/* ------------------------------------------------------------------ */
/*  searchDecklists — search Scryfall for cards by strategy/archetype  */
/* ------------------------------------------------------------------ */

export async function searchDecklists(
  query: string,
  format?: string,
): Promise<DeckCard[]> {
  try {
    // Build Scryfall search query
    let q = query;
    if (format && format !== "other") {
      q = `${q} f:${format}`;
    }

    const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&order=edhrec&unique=cards`;

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    const cards: DeckCard[] = (data.data ?? []).slice(0, 30).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (card: any) => {
        const priceStr = card.prices?.usd ?? card.prices?.usd_foil;
        const priceUsd = priceStr ? parseFloat(priceStr) : null;
        return {
          name: card.name,
          mana_cost: card.mana_cost ?? null,
          type_line: card.type_line ?? "",
          image_url:
            card.image_uris?.small ??
            card.card_faces?.[0]?.image_uris?.small ??
            null,
          price_usd: priceUsd,
          price_cents: priceUsd != null ? Math.round(priceUsd * 100) : null,
          set_name: card.set_name ?? null,
          rarity: card.rarity ?? null,
        };
      },
    );

    return cards;
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  parseDecklistText — parse "4 Lightning Bolt" style decklists       */
/* ------------------------------------------------------------------ */

export function parseDecklistText(text: string): ParsedCard[] {
  const lines = text.split("\n");
  const results: ParsedCard[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("//") || line.startsWith("#")) continue;

    // Skip section headers like "Sideboard", "Mainboard", "Companion"
    if (/^(sideboard|mainboard|companion|deck|maybeboard):?\s*$/i.test(line)) continue;

    // Match patterns: "4 Lightning Bolt", "4x Lightning Bolt", "Lightning Bolt"
    const match = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    if (match) {
      const quantity = parseInt(match[1], 10);
      const name = match[2].trim();
      if (name && quantity > 0) {
        results.push({ quantity, name });
      }
    } else {
      // No quantity prefix — treat as 1x
      results.push({ quantity: 1, name: line });
    }
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  matchDeckToInventory — check store stock for each card             */
/* ------------------------------------------------------------------ */

export async function matchDeckToInventory(
  cards: ParsedCard[],
  storeId: string,
): Promise<InventoryMatchResult[]> {
  const results: InventoryMatchResult[] = [];

  for (const card of cards) {
    // Fuzzy match: case-insensitive name contains
    const items = await prisma.posInventoryItem.findMany({
      where: {
        store_id: storeId,
        active: true,
        name: { contains: card.name, mode: "insensitive" },
        quantity: { gt: 0 },
      },
      orderBy: { quantity: "desc" },
      take: 5,
    });

    if (items.length === 0) {
      // Try Scryfall to get the image
      let imageUrl: string | null = null;
      try {
        await delay(100);
        const scryfallRes = await fetch(
          `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(card.name)}`,
          { headers: { Accept: "application/json" } },
        );
        if (scryfallRes.ok) {
          const scryfallCard = await scryfallRes.json();
          imageUrl =
            scryfallCard.image_uris?.small ??
            scryfallCard.card_faces?.[0]?.image_uris?.small ??
            null;
        }
      } catch {
        // ignore
      }

      results.push({
        name: card.name,
        needed: card.quantity,
        in_stock: 0,
        price_cents: 0,
        inventory_item_id: null,
        image_url: imageUrl,
        status: "unavailable",
      });
      continue;
    }

    // Sum total available across all matching items (different conditions, sets, etc.)
    const totalAvailable = items.reduce((sum, it) => sum + it.quantity, 0);
    // Use the cheapest match for pricing, first match for ID
    const cheapest = items.reduce((a, b) =>
      a.price_cents < b.price_cents ? a : b,
    );

    const status: InventoryMatchResult["status"] =
      totalAvailable >= card.quantity
        ? "available"
        : totalAvailable > 0
          ? "partial"
          : "unavailable";

    results.push({
      name: card.name,
      needed: card.quantity,
      in_stock: totalAvailable,
      price_cents: cheapest.price_cents,
      inventory_item_id: cheapest.id,
      image_url: cheapest.image_url,
      status,
    });
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  suggestMetaDecks — live meta archetypes (falls back to hardcoded)  */
/* ------------------------------------------------------------------ */

const HARDCODED_META: Record<string, MetaDeck[]> = {
  standard: [
    { name: "Mono-Red Aggro", format: "standard", searchQuery: "c:r t:creature f:standard cmc<=3" },
    { name: "Azorius Control", format: "standard", searchQuery: "c:wu t:instant OR t:sorcery f:standard" },
    { name: "Golgari Midrange", format: "standard", searchQuery: "c:bg t:creature f:standard cmc>=3 cmc<=5" },
    { name: "Boros Convoke", format: "standard", searchQuery: "c:rw o:convoke OR t:creature f:standard cmc<=2" },
    { name: "Dimir Control", format: "standard", searchQuery: "c:ub t:instant OR t:sorcery f:standard" },
    { name: "Gruul Aggro", format: "standard", searchQuery: "c:rg t:creature f:standard pow>=3" },
  ],
  modern: [
    { name: "Burn", format: "modern", searchQuery: "c:r (o:damage AND o:target) f:modern cmc<=2" },
    { name: "Tron", format: "modern", searchQuery: "(Urza's OR Karn OR Wurmcoil) f:modern" },
    { name: "Murktide", format: "modern", searchQuery: "c:u (Murktide OR Expressive OR Consider) f:modern" },
    { name: "Yawgmoth Combo", format: "modern", searchQuery: "(Yawgmoth OR Undying OR Young Wolf) f:modern" },
    { name: "Hammer Time", format: "modern", searchQuery: "(Colossus Hammer OR Sigarda's Aid OR Puresteel) f:modern" },
    { name: "Living End", format: "modern", searchQuery: "(Living End OR cascade) f:modern" },
  ],
  pioneer: [
    { name: "Mono-Green Devotion", format: "pioneer", searchQuery: "c:g t:creature f:pioneer o:mana" },
    { name: "Rakdos Midrange", format: "pioneer", searchQuery: "c:br t:creature f:pioneer cmc>=2 cmc<=4" },
    { name: "Izzet Phoenix", format: "pioneer", searchQuery: "(Arclight Phoenix OR Temporal Trespass OR Consider) f:pioneer" },
    { name: "Azorius Spirits", format: "pioneer", searchQuery: "c:wu t:spirit f:pioneer" },
    { name: "Mono-White Humans", format: "pioneer", searchQuery: "c:w t:human f:pioneer cmc<=3" },
  ],
  commander: [
    { name: "Precon Upgrade", format: "commander", searchQuery: "t:legendary t:creature f:commander" },
    { name: "Treasure Makers", format: "commander", searchQuery: "o:treasure t:creature f:commander" },
    { name: "Token Generators", format: "commander", searchQuery: "o:\"create\" o:\"token\" f:commander" },
  ],
};

/**
 * suggestMetaDecks — returns live meta archetypes when available.
 * For MTG competitive formats: pulls from MTGGoldfish.
 * For Commander: returns hardcoded suggestions (use searchCommanders for live).
 * For Pokemon: returns top tournament decks from Limitless.
 * Falls back to hardcoded list if API calls fail.
 */
export async function suggestMetaDecks(
  format: string,
  game?: string,
): Promise<LiveMetaResult[]> {
  const fmt = format.toLowerCase();
  const g = (game ?? "mtg").toLowerCase();

  // Pokemon meta
  if (g === "pokemon" || fmt === "pokemon") {
    try {
      const decks = await fetchTopPokemonDecks(8);
      if (decks.length > 0) {
        return decks.map((d) => ({
          name: d.archetype,
          metaShare: 0,
          format: "pokemon",
          deckUrl: undefined,
        }));
      }
    } catch {
      // fall through
    }
    return [];
  }

  // MTG competitive formats — try live data
  const mtgFormats = ["standard", "modern", "pioneer", "pauper", "legacy", "vintage"];
  if (mtgFormats.includes(fmt)) {
    try {
      const archetypes = await fetchMetaArchetypes(fmt);
      if (archetypes.length > 0) {
        return archetypes.map((a) => ({
          name: a.name,
          metaShare: a.metaShare,
          format: fmt,
          deckUrl: a.deckUrl,
        }));
      }
    } catch {
      // fall through to hardcoded
    }
  }

  // Fallback to hardcoded
  const hardcoded = HARDCODED_META[fmt] ?? [];
  return hardcoded.map((d) => ({
    name: d.name,
    metaShare: 0,
    format: d.format,
  }));
}

/**
 * suggestMetaDecksSync — synchronous hardcoded fallback (for backward compat)
 */
export function suggestMetaDecksSync(format: string): MetaDeck[] {
  const key = format.toLowerCase();
  return HARDCODED_META[key] ?? [];
}

/* ------------------------------------------------------------------ */
/*  fetchMetaDeck — fetch a real tournament decklist for an archetype  */
/* ------------------------------------------------------------------ */

export async function fetchMetaDeck(
  archetype: string,
  format: string,
): Promise<ParsedCard[]> {
  const fmt = format.toLowerCase();

  // For MTG competitive formats, try MTGGoldfish
  try {
    const archetypes = await fetchMetaArchetypes(fmt);
    const match = archetypes.find(
      (a) => a.name.toLowerCase() === archetype.toLowerCase(),
    );

    if (match) {
      const text = await fetchGoldfishDecklist(match.deckUrl);
      if (text) {
        return parseDecklistText(text);
      }
    }
  } catch {
    // fall through
  }

  return [];
}

/* ------------------------------------------------------------------ */
/*  buildCommanderDeck — EDHREC synergy + inventory matching           */
/* ------------------------------------------------------------------ */

export async function buildCommanderDeck(
  commanderName: string,
  storeId: string,
): Promise<CommanderDeckResult | null> {
  const data = await fetchCommanderData(commanderName);
  if (!data) return null;

  const synergyCards = data.cards.slice(0, 100);

  // Match top synergy cards against store inventory
  const parsed: ParsedCard[] = synergyCards.map((c) => ({
    quantity: 1,
    name: c.name,
  }));

  const inventoryMatches = await matchDeckToInventory(parsed, storeId);

  // Find substitutions: for unavailable cards, suggest alternatives from
  // remaining EDHREC cards that ARE in stock
  const unavailable = inventoryMatches.filter(
    (m) => m.status === "unavailable",
  );
  const availableNames = new Set(
    inventoryMatches
      .filter((m) => m.status !== "unavailable")
      .map((m) => m.name.toLowerCase()),
  );

  const substitutions: CommanderDeckResult["substitutions"] = [];

  if (unavailable.length > 0 && data.cards.length > 100) {
    // Look through remaining EDHREC cards (beyond top 100) for alternatives
    const remainingCards = data.cards.slice(100);

    for (const missing of unavailable.slice(0, 20)) {
      // Try to find a substitute from remaining cards
      for (const candidate of remainingCards) {
        if (availableNames.has(candidate.name.toLowerCase())) continue;

        // Quick inventory check
        const items = await prisma.posInventoryItem.findMany({
          where: {
            store_id: storeId,
            active: true,
            name: { contains: candidate.name, mode: "insensitive" },
            quantity: { gt: 0 },
          },
          take: 1,
        });

        if (items.length > 0) {
          substitutions.push({
            missing_card: missing.name,
            substitute: candidate.name,
            substitute_synergy: candidate.synergy,
            in_stock: true,
          });
          availableNames.add(candidate.name.toLowerCase());
          break;
        }
      }
    }
  }

  return {
    commander_name: data.commander_name,
    num_decks: data.num_decks,
    avg_price: data.avg_price,
    color_identity: data.color_identity,
    synergy_cards: synergyCards,
    inventory_matches: inventoryMatches,
    substitutions,
  };
}

/* ------------------------------------------------------------------ */
/*  Re-export sub-module functions for API layer convenience            */
/* ------------------------------------------------------------------ */

export { searchCommanders } from "./edhrec";
export { fetchTopPokemonDecks } from "./limitless";
