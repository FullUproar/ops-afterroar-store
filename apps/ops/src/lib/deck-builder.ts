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
  /** Suggested substitute when unavailable or partial — from store inventory */
  substitute?: {
    name: string;
    price_cents: number;
    inventory_item_id: string;
    image_url: string | null;
    reason: string;
  };
  /** Available at partner stores in the Afterroar network */
  network?: Array<{
    store_name: string;
    store_slug: string;
    city: string | null;
    state: string | null;
    quantity: number;
  }>;
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
  options?: { inStockOnly?: boolean },
): Promise<InventoryMatchResult[]> {
  const results: InventoryMatchResult[] = [];
  // Track names already in the deck to avoid suggesting them as substitutes
  const deckCardNames = new Set(cards.map((c) => c.name.toLowerCase()));
  // Cap external API calls to prevent timeout on large decklists
  let scryfallCallCount = 0;
  const MAX_SCRYFALL_CALLS = 10; // Limit substitute lookups

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
      // Skip unavailable cards entirely in "in stock only" mode
      if (options?.inStockOnly) continue;

      // Try Scryfall to get the image + card data for substitution
      // (capped to prevent timeout on large decklists)
      let imageUrl: string | null = null;
      let scryfallData: { type_line?: string; cmc?: number; colors?: string[]; keywords?: string[] } | null = null;
      let substitute: InventoryMatchResult["substitute"] = undefined;

      if (scryfallCallCount < MAX_SCRYFALL_CALLS) {
        try {
          scryfallCallCount++;
          await delay(100);
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const scryfallRes = await fetch(
            `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(card.name)}`,
            { headers: { Accept: "application/json" }, signal: controller.signal },
          );
          clearTimeout(timeout);
          if (scryfallRes.ok) {
            const sc = await scryfallRes.json();
            imageUrl = sc.image_uris?.small ?? sc.card_faces?.[0]?.image_uris?.small ?? null;
            scryfallData = {
              type_line: sc.type_line,
              cmc: sc.cmc,
              colors: sc.colors || sc.color_identity,
              keywords: sc.keywords,
            };
          }
        } catch {
          // Timeout or network error — skip substitute for this card
        }

        // Find a substitute from store inventory
        if (scryfallData) {
          substitute = await findSubstitute(storeId, card.name, scryfallData, deckCardNames);
        }
      }

      results.push({
        name: card.name,
        needed: card.quantity,
        in_stock: 0,
        price_cents: 0,
        inventory_item_id: null,
        image_url: imageUrl,
        status: "unavailable",
        substitute,
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

    // Find substitute if partial (not enough copies)
    let substitute: InventoryMatchResult["substitute"] = undefined;
    if (status === "partial" && !options?.inStockOnly && scryfallCallCount < MAX_SCRYFALL_CALLS) {
      try {
        scryfallCallCount++;
        await delay(100);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const scryfallRes = await fetch(
          `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(card.name)}`,
          { headers: { Accept: "application/json" }, signal: controller.signal },
        );
        clearTimeout(timeout);
        if (scryfallRes.ok) {
          const sc = await scryfallRes.json();
          substitute = await findSubstitute(storeId, card.name, {
            type_line: sc.type_line,
            cmc: sc.cmc,
            colors: sc.colors || sc.color_identity,
            keywords: sc.keywords,
          }, deckCardNames);
        }
      } catch {}
    }

    results.push({
      name: card.name,
      needed: card.quantity,
      in_stock: totalAvailable,
      price_cents: cheapest.price_cents,
      inventory_item_id: cheapest.id,
      image_url: cheapest.image_url,
      status,
      substitute,
    });
  }

  // Network lookup: check partner stores for unavailable cards
  if (!options?.inStockOnly) {
    const unavailable = results.filter((r) => r.status === "unavailable" || r.status === "partial");
    if (unavailable.length > 0) {
      try {
        // Check if current store has network enabled (read store settings)
        const store = await prisma.posStore.findUnique({
          where: { id: storeId },
          select: { settings: true },
        });
        const settings = (store?.settings ?? {}) as Record<string, unknown>;

        if (settings.network_inventory_enabled) {
          // Search network for each unavailable card (batch by name)
          for (const result of unavailable) {
            try {
              const networkItems = await prisma.posInventoryItem.findMany({
                where: {
                  store_id: { not: storeId },
                  active: true,
                  quantity: { gt: 0 },
                  name: { contains: result.name, mode: "insensitive" },
                  store: {
                    settings: {
                      path: ["network_inventory_enabled"],
                      equals: true,
                    },
                  },
                },
                select: {
                  quantity: true,
                  store: {
                    select: {
                      name: true,
                      slug: true,
                      address: true,
                      settings: true,
                    },
                  },
                },
                take: 5,
              });

              if (networkItems.length > 0) {
                result.network = networkItems.map((ni) => {
                  const addr = (ni.store.address ?? {}) as Record<string, string>;
                  const storeSettings = (ni.store.settings ?? {}) as Record<string, unknown>;
                  const visible = storeSettings.network_inventory_visible !== false;
                  return {
                    store_name: visible ? ni.store.name : "Partner Store",
                    store_slug: ni.store.slug,
                    city: visible ? (addr.city || null) : null,
                    state: visible ? (addr.state || null) : null,
                    quantity: ni.quantity,
                  };
                });
              }
            } catch {
              // Non-critical
            }
          }
        }
      } catch {
        // Network lookup is non-critical
      }
    }
  }

  return results;
}

/**
 * Find a functional substitute for a missing card from store inventory.
 * Matches by: same card type (creature/instant/etc), similar CMC, compatible colors.
 */
async function findSubstitute(
  storeId: string,
  originalName: string,
  cardData: { type_line?: string; cmc?: number; colors?: string[]; keywords?: string[] },
  excludeNames: Set<string>,
): Promise<InventoryMatchResult["substitute"] | undefined> {
  try {
    // Determine the broad type: creature, instant, sorcery, enchantment, artifact, land
    const typeLine = (cardData.type_line || "").toLowerCase();
    let broadType = "other";
    if (typeLine.includes("creature")) broadType = "creature";
    else if (typeLine.includes("instant")) broadType = "instant";
    else if (typeLine.includes("sorcery")) broadType = "sorcery";
    else if (typeLine.includes("enchantment")) broadType = "enchantment";
    else if (typeLine.includes("artifact")) broadType = "artifact";
    else if (typeLine.includes("land")) broadType = "land";
    else if (typeLine.includes("planeswalker")) broadType = "planeswalker";

    // Search catalog for similar cards (using local Scryfall cache)
    // We need cards of the same type with similar CMC from store inventory
    const cmc = cardData.cmc ?? 3;
    const cmcMin = Math.max(0, cmc - 1);
    const cmcMax = cmc + 1;

    // Search inventory for TCG singles with attributes matching the card type
    const candidates = await prisma.posInventoryItem.findMany({
      where: {
        store_id: storeId,
        active: true,
        quantity: { gt: 0 },
        category: "tcg_single",
        // Exclude the original card and cards already in the deck
        NOT: {
          name: { contains: originalName, mode: "insensitive" },
        },
      },
      orderBy: { price_cents: "asc" },
      take: 50,
      select: {
        id: true,
        name: true,
        price_cents: true,
        image_url: true,
        attributes: true,
      },
    });

    // Score candidates by similarity
    type ScoredCandidate = typeof candidates[0] & { score: number; reason: string };
    const scored: ScoredCandidate[] = [];

    for (const cand of candidates) {
      if (excludeNames.has(cand.name.toLowerCase())) continue;

      const attrs = (cand.attributes ?? {}) as Record<string, unknown>;
      let score = 0;
      const reasons: string[] = [];

      // Check type match from attributes or name patterns
      const candType = (attrs.type_line as string || "").toLowerCase();
      if (candType && broadType !== "other") {
        if (candType.includes(broadType)) {
          score += 5;
          reasons.push(`Same type (${broadType})`);
        }
      }

      // CMC match
      const candCmc = attrs.cmc as number | undefined;
      if (candCmc !== undefined) {
        if (candCmc >= cmcMin && candCmc <= cmcMax) {
          score += 3;
          if (candCmc === cmc) score += 2;
        }
      }

      // Color match
      const candColors = ((attrs.color_identity as string) || "").split(",").filter(Boolean);
      const targetColors = cardData.colors || [];
      if (candColors.length > 0 && targetColors.length > 0) {
        const overlap = candColors.filter((c) => targetColors.includes(c));
        if (overlap.length > 0) {
          score += 2;
          reasons.push("Same colors");
        }
      }

      // Keyword overlap
      const candKeywords = ((attrs.keywords as string) || "").split(",").filter(Boolean).map((k) => k.trim().toLowerCase());
      const targetKeywords = (cardData.keywords || []).map((k) => k.toLowerCase());
      const kwOverlap = candKeywords.filter((k) => targetKeywords.includes(k));
      if (kwOverlap.length > 0) {
        score += kwOverlap.length * 2;
        reasons.push(`Shares: ${kwOverlap.join(", ")}`);
      }

      if (score > 0) {
        scored.push({ ...cand, score, reason: reasons.join(" · ") || "Similar card in stock" });
      }
    }

    // Sort by score descending, take the best
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    if (best && best.score >= 3) {
      return {
        name: best.name,
        price_cents: best.price_cents,
        inventory_item_id: best.id,
        image_url: best.image_url,
        reason: best.reason,
      };
    }

    return undefined;
  } catch {
    return undefined;
  }
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
/*  Recommendation Engine — upsells + accessories + upgrades            */
/* ------------------------------------------------------------------ */

export interface Recommendation {
  type: "accessory" | "upgrade" | "sideboard" | "also_bought";
  name: string;
  reason: string;
  price_cents: number;
  inventory_item_id: string;
  image_url: string | null;
  category: string;
}

/**
 * Generate upsell/cross-sell recommendations based on a deck + inventory match.
 */
export async function getRecommendations(
  deckCards: ParsedCard[],
  inventoryMatches: InventoryMatchResult[],
  storeId: string,
  options?: { format?: string; colors?: string[] },
): Promise<Recommendation[]> {
  const recs: Recommendation[] = [];

  // 1. ACCESSORIES — sleeves, deck box, playmat if store has them
  const accessories = await prisma.posInventoryItem.findMany({
    where: {
      store_id: storeId,
      active: true,
      quantity: { gt: 0 },
      category: "accessory",
    },
    orderBy: { price_cents: "asc" },
    take: 20,
    select: { id: true, name: true, price_cents: true, image_url: true, category: true, attributes: true },
  });

  // Find sleeves, deck boxes, playmats
  const sleeves = accessories.filter((a) => /sleeve/i.test(a.name));
  const deckBoxes = accessories.filter((a) => /deck.?box/i.test(a.name));
  const playmats = accessories.filter((a) => /playmat/i.test(a.name));

  if (sleeves.length > 0) {
    const pick = sleeves[0];
    recs.push({
      type: "accessory",
      name: pick.name,
      reason: "Protect your new deck",
      price_cents: pick.price_cents,
      inventory_item_id: pick.id,
      image_url: pick.image_url,
      category: pick.category,
    });
  }

  if (deckBoxes.length > 0) {
    const pick = deckBoxes[0];
    recs.push({
      type: "accessory",
      name: pick.name,
      reason: "Keep your deck together",
      price_cents: pick.price_cents,
      inventory_item_id: pick.id,
      image_url: pick.image_url,
      category: pick.category,
    });
  }

  if (playmats.length > 0) {
    const pick = playmats[0];
    recs.push({
      type: "accessory",
      name: pick.name,
      reason: "Complete the setup",
      price_cents: pick.price_cents,
      inventory_item_id: pick.id,
      image_url: pick.image_url,
      category: pick.category,
    });
  }

  // 2. UPGRADES — foil or alt-art versions of cards in the deck
  const matchedNames = inventoryMatches
    .filter((m) => m.status === "available" && m.inventory_item_id)
    .map((m) => m.name);

  if (matchedNames.length > 0) {
    // Find foil/premium versions of cards the customer is buying
    const upgrades = await prisma.posInventoryItem.findMany({
      where: {
        store_id: storeId,
        active: true,
        quantity: { gt: 0 },
        category: "tcg_single",
        OR: matchedNames.slice(0, 10).map((name) => ({
          name: { contains: name, mode: "insensitive" as const },
        })),
        attributes: {
          path: ["foil"],
          equals: true,
        },
      },
      take: 5,
      select: { id: true, name: true, price_cents: true, image_url: true, category: true },
    });

    for (const upgrade of upgrades) {
      // Only suggest if we're not already adding this exact item
      const alreadyInDeck = inventoryMatches.some(
        (m) => m.inventory_item_id === upgrade.id,
      );
      if (!alreadyInDeck) {
        recs.push({
          type: "upgrade",
          name: upgrade.name,
          reason: "Foil upgrade available",
          price_cents: upgrade.price_cents,
          inventory_item_id: upgrade.id,
          image_url: upgrade.image_url,
          category: upgrade.category,
        });
      }
    }
  }

  // 3. FORMAT STAPLES — popular cards in the same format that complement the deck
  if (options?.format && options.format !== "commander") {
    // Find other popular singles in stock that aren't in the deck
    const deckCardNames = new Set(deckCards.map((c) => c.name.toLowerCase()));

    const formatStaples = await prisma.posInventoryItem.findMany({
      where: {
        store_id: storeId,
        active: true,
        quantity: { gt: 0 },
        category: "tcg_single",
        price_cents: { gte: 200 }, // $2+ cards are more interesting recommendations
        NOT: {
          name: { in: Array.from(deckCardNames).slice(0, 20) },
        },
      },
      orderBy: { price_cents: "desc" },
      take: 10,
      select: { id: true, name: true, price_cents: true, image_url: true, category: true, attributes: true },
    });

    // Filter to cards that share the deck's color identity
    const deckColors = options.colors || [];
    for (const staple of formatStaples.slice(0, 3)) {
      const attrs = (staple.attributes ?? {}) as Record<string, unknown>;
      const cardColors = ((attrs.color_identity as string) || "").split(",").filter(Boolean);

      // Only suggest if colors overlap or no color info
      if (cardColors.length === 0 || deckColors.length === 0 || cardColors.some((c) => deckColors.includes(c))) {
        if (!deckCardNames.has(staple.name.toLowerCase())) {
          recs.push({
            type: "also_bought",
            name: staple.name,
            reason: "Popular in this format",
            price_cents: staple.price_cents,
            inventory_item_id: staple.id,
            image_url: staple.image_url,
            category: staple.category,
          });
        }
      }
    }
  }

  return recs;
}

/* ------------------------------------------------------------------ */
/*  Re-export sub-module functions for API layer convenience            */
/* ------------------------------------------------------------------ */

export { searchCommanders } from "./edhrec";
export { fetchTopPokemonDecks } from "./limitless";
