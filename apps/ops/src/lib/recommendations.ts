import { type TenantPrismaClient } from "./tenant-prisma";

/* ------------------------------------------------------------------ */
/*  Recommendation Engine — Tier 1                                      */
/*  Uses catalog metadata (BGG mechanics, TCG color/format affinity)    */
/*  to suggest products based on a customer's purchase history.         */
/*                                                                      */
/*  Tier 1: Content-based filtering (mechanics, themes, colors)         */
/*  Tier 2 (future): Collaborative filtering via co-purchase signals    */
/*  Tier 3 (future): ML model trained on cross-store anonymized data    */
/* ------------------------------------------------------------------ */

export interface Recommendation {
  type: "game" | "card" | "event" | "accessory";
  name: string;
  price_cents: number;
  image_url: string | null;
  inventory_item_id: string;
  reason: string;
  score: number; // confidence 0-1
  category: string;
}

/* ---- Internals ---------------------------------------------------- */

interface PreferenceProfile {
  mechanics: Map<string, number>;
  categories: Map<string, number>;
  themes: Map<string, number>;
  purchasedItemIds: Set<string>;
  purchasedCatalogIds: Set<string>;
}

interface TCGProfile {
  game: string | null; // MTG, Pokemon, Yu-Gi-Oh
  colors: Map<string, number>; // color identity frequency
  formats: Set<string>; // from event check-ins
  purchasedItemIds: Set<string>;
  purchasedCatalogIds: Set<string>;
}

/** Extract items array from ledger entry metadata */
function extractItems(
  metadata: unknown,
): Array<{ inventory_item_id?: string; name?: string; category?: string; quantity?: number }> {
  if (!metadata || typeof metadata !== "object") return [];
  const m = metadata as Record<string, unknown>;
  if (Array.isArray(m.items)) return m.items as Array<{ inventory_item_id?: string; name?: string; category?: string; quantity?: number }>;
  return [];
}

/** Parse JSON attributes safely */
function parseAttributes(attrs: unknown): Record<string, unknown> {
  if (!attrs || typeof attrs !== "object") return {};
  return attrs as Record<string, unknown>;
}

/** Split comma-separated string or return array from JSON */
function toStringArray(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === "string") return val.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

/** Normalize a score to 0-1 range */
function normalize(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(1, value / max);
}

/* ------------------------------------------------------------------ */
/*  Board Game Recommendations (BGG mechanics matching)                 */
/* ------------------------------------------------------------------ */

export async function getGameRecommendations(
  db: TenantPrismaClient,
  customerId: string,
  storeId: string,
  limit = 10,
): Promise<Recommendation[]> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // 1. Pull customer's recent sales
  const sales = await db.posLedgerEntry.findMany({
    where: {
      customer_id: customerId,
      type: "sale",
      created_at: { gte: ninetyDaysAgo },
    },
    select: { metadata: true },
    orderBy: { created_at: "desc" },
    take: 100,
  });

  // 2. Collect purchased inventory item IDs
  const purchasedItemIds = new Set<string>();
  for (const sale of sales) {
    for (const item of extractItems(sale.metadata)) {
      if (item.inventory_item_id) purchasedItemIds.add(item.inventory_item_id);
    }
  }
  if (purchasedItemIds.size === 0) return [];

  // 3. Look up purchased board game inventory items and their catalog products
  const purchasedItems = await db.posInventoryItem.findMany({
    where: {
      id: { in: [...purchasedItemIds] },
      category: "board_game",
    },
    select: {
      id: true,
      catalog_product_id: true,
      attributes: true,
      catalog_product: {
        select: { id: true, attributes: true, category: true },
      },
    },
  });

  if (purchasedItems.length === 0) return [];

  // 4. Build preference profile from purchased games
  const profile: PreferenceProfile = {
    mechanics: new Map(),
    categories: new Map(),
    themes: new Map(),
    purchasedItemIds,
    purchasedCatalogIds: new Set(
      purchasedItems.map((i) => i.catalog_product_id).filter(Boolean) as string[],
    ),
  };

  for (const item of purchasedItems) {
    const attrs = parseAttributes(item.catalog_product?.attributes ?? item.attributes);

    for (const mechanic of toStringArray(attrs.mechanics ?? attrs.mechanic)) {
      profile.mechanics.set(mechanic, (profile.mechanics.get(mechanic) ?? 0) + 1);
    }
    for (const cat of toStringArray(attrs.categories ?? attrs.category)) {
      profile.categories.set(cat, (profile.categories.get(cat) ?? 0) + 1);
    }
    for (const theme of toStringArray(attrs.themes ?? attrs.theme)) {
      profile.themes.set(theme, (profile.themes.get(theme) ?? 0) + 1);
    }
  }

  // If no profile data, we can't make meaningful recs
  if (profile.mechanics.size === 0 && profile.categories.size === 0 && profile.themes.size === 0) {
    return [];
  }

  // 5. Query in-stock board games the customer hasn't bought
  const candidates = await db.posInventoryItem.findMany({
    where: {
      category: "board_game",
      active: true,
      quantity: { gt: 0 },
      id: { notIn: [...purchasedItemIds] },
      ...(profile.purchasedCatalogIds.size > 0
        ? { catalog_product_id: { notIn: [...profile.purchasedCatalogIds] } }
        : {}),
    },
    select: {
      id: true,
      name: true,
      price_cents: true,
      image_url: true,
      category: true,
      attributes: true,
      catalog_product: {
        select: { attributes: true, image_url: true },
      },
    },
    take: 200, // cap candidates for performance
  });

  // 6. Score each candidate
  const maxMechanic = Math.max(...profile.mechanics.values(), 1);
  const maxCategory = Math.max(...profile.categories.values(), 1);
  const maxTheme = Math.max(...profile.themes.values(), 1);

  const scored: Recommendation[] = [];

  for (const candidate of candidates) {
    const attrs = parseAttributes(candidate.catalog_product?.attributes ?? candidate.attributes);
    const candidateMechanics = toStringArray(attrs.mechanics ?? attrs.mechanic);
    const candidateCategories = toStringArray(attrs.categories ?? attrs.category);
    const candidateThemes = toStringArray(attrs.themes ?? attrs.theme);

    let mechanicScore = 0;
    let topMechanic = "";
    for (const m of candidateMechanics) {
      const weight = profile.mechanics.get(m) ?? 0;
      if (weight > 0) {
        mechanicScore += weight;
        if (!topMechanic || weight > (profile.mechanics.get(topMechanic) ?? 0)) topMechanic = m;
      }
    }

    let categoryScore = 0;
    for (const c of candidateCategories) {
      categoryScore += profile.categories.get(c) ?? 0;
    }

    let themeScore = 0;
    let topTheme = "";
    for (const t of candidateThemes) {
      const weight = profile.themes.get(t) ?? 0;
      if (weight > 0) {
        themeScore += weight;
        if (!topTheme || weight > (profile.themes.get(topTheme) ?? 0)) topTheme = t;
      }
    }

    // Weighted composite: mechanics 50%, themes 25%, categories 25%
    const score =
      normalize(mechanicScore, maxMechanic * candidateMechanics.length || 1) * 0.5 +
      normalize(themeScore, maxTheme * candidateThemes.length || 1) * 0.25 +
      normalize(categoryScore, maxCategory * candidateCategories.length || 1) * 0.25;

    if (score <= 0) continue;

    // Build a human reason
    let reason = "";
    if (topMechanic) {
      reason = `Features ${topMechanic.toLowerCase()} mechanics you enjoy`;
    } else if (topTheme) {
      reason = `Matches your taste for ${topTheme.toLowerCase()} themes`;
    } else {
      reason = "Similar to games you've purchased";
    }

    scored.push({
      type: "game",
      name: candidate.name,
      price_cents: candidate.price_cents,
      image_url: candidate.catalog_product?.image_url ?? candidate.image_url,
      inventory_item_id: candidate.id,
      reason,
      score,
      category: candidate.category,
    });
  }

  // Sort by score descending, take top N
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/* ------------------------------------------------------------------ */
/*  TCG Recommendations (format + color affinity)                       */
/* ------------------------------------------------------------------ */

export async function getTCGRecommendations(
  db: TenantPrismaClient,
  customerId: string,
  storeId: string,
  limit = 10,
): Promise<Recommendation[]> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // 1. Pull customer's recent sales
  const sales = await db.posLedgerEntry.findMany({
    where: {
      customer_id: customerId,
      type: "sale",
      created_at: { gte: ninetyDaysAgo },
    },
    select: { metadata: true },
    orderBy: { created_at: "desc" },
    take: 100,
  });

  const purchasedItemIds = new Set<string>();
  for (const sale of sales) {
    for (const item of extractItems(sale.metadata)) {
      if (item.inventory_item_id) purchasedItemIds.add(item.inventory_item_id);
    }
  }
  if (purchasedItemIds.size === 0) return [];

  // 2. Look up purchased TCG singles with catalog data
  const purchasedItems = await db.posInventoryItem.findMany({
    where: {
      id: { in: [...purchasedItemIds] },
      category: "tcg_single",
    },
    select: {
      id: true,
      attributes: true,
      catalog_product_id: true,
      catalog_product: {
        select: {
          id: true,
          game: true,
          color_identity: true,
          attributes: true,
          set_code: true,
        },
      },
    },
  });

  if (purchasedItems.length === 0) return [];

  // 3. Build TCG profile
  const profile: TCGProfile = {
    game: null,
    colors: new Map(),
    formats: new Set(),
    purchasedItemIds,
    purchasedCatalogIds: new Set(
      purchasedItems.map((i) => i.catalog_product_id).filter(Boolean) as string[],
    ),
  };

  // Determine primary game from frequency
  const gameCounts = new Map<string, number>();
  for (const item of purchasedItems) {
    const attrs = parseAttributes(item.attributes);
    const game = (item.catalog_product?.game ?? attrs.game ?? "") as string;
    if (game) gameCounts.set(game, (gameCounts.get(game) ?? 0) + 1);

    // Color identity from catalog product (Scryfall data) or attributes
    const colors = toStringArray(
      item.catalog_product?.color_identity ?? attrs.color_identity ?? attrs.colors,
    );
    for (const c of colors) {
      profile.colors.set(c, (profile.colors.get(c) ?? 0) + 1);
    }
  }

  // Pick most-purchased game
  let maxGame = "";
  let maxGameCount = 0;
  for (const [game, count] of gameCounts) {
    if (count > maxGameCount) {
      maxGame = game;
      maxGameCount = count;
    }
  }
  profile.game = maxGame || null;

  // 4. Check event check-ins for format affinity
  const checkins = await db.posEventCheckin.findMany({
    where: { customer_id: customerId },
    select: {
      event: {
        select: { name: true, event_type: true, metadata: true },
      },
    },
    take: 50,
  });

  for (const checkin of checkins) {
    const eventName = (checkin.event?.name ?? "").toLowerCase();
    const eventType = (checkin.event?.event_type ?? "").toLowerCase();
    const eventMeta = parseAttributes(checkin.event?.metadata);
    const format = (eventMeta.format ?? "") as string;

    if (format) profile.formats.add(format.toLowerCase());

    // Infer format from event name/type
    for (const f of ["standard", "modern", "pioneer", "legacy", "vintage", "commander", "pauper", "draft", "sealed"]) {
      if (eventName.includes(f) || eventType.includes(f)) {
        profile.formats.add(f);
      }
    }
  }

  if (!profile.game) return [];

  // 5. Query in-stock TCG singles matching game + not purchased
  const candidates = await db.posInventoryItem.findMany({
    where: {
      category: "tcg_single",
      active: true,
      quantity: { gt: 0 },
      id: { notIn: [...purchasedItemIds] },
      ...(profile.purchasedCatalogIds.size > 0
        ? { catalog_product_id: { notIn: [...profile.purchasedCatalogIds] } }
        : {}),
    },
    select: {
      id: true,
      name: true,
      price_cents: true,
      image_url: true,
      category: true,
      attributes: true,
      created_at: true,
      catalog_product: {
        select: {
          game: true,
          color_identity: true,
          rarity: true,
          set_code: true,
          set_name: true,
          attributes: true,
          image_url: true,
          image_uri: true,
          legalities: true,
        },
      },
    },
    take: 300,
  });

  // 6. Score candidates
  const maxColor = Math.max(...profile.colors.values(), 1);
  const now = Date.now();
  const scored: Recommendation[] = [];

  for (const candidate of candidates) {
    const cp = candidate.catalog_product;
    const attrs = parseAttributes(candidate.attributes);
    const game = (cp?.game ?? attrs.game ?? "") as string;

    // Must match primary game
    if (game.toLowerCase() !== profile.game!.toLowerCase()) continue;

    // Color affinity score
    const candidateColors = toStringArray(cp?.color_identity ?? attrs.color_identity ?? attrs.colors);
    let colorScore = 0;
    const matchedColors: string[] = [];
    for (const c of candidateColors) {
      const weight = profile.colors.get(c) ?? 0;
      if (weight > 0) {
        colorScore += weight;
        matchedColors.push(c);
      }
    }

    // Format legality bonus
    let formatBonus = 0;
    let matchedFormat = "";
    if (cp?.legalities && profile.formats.size > 0) {
      const legalities = cp.legalities as Record<string, string>;
      for (const f of profile.formats) {
        if (legalities[f] === "legal") {
          formatBonus += 0.15;
          matchedFormat = f;
        }
      }
    }

    // Recency bonus: newer cards score higher (up to 0.15 bonus for last 30 days)
    const ageMs = now - candidate.created_at.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const recencyBonus = ageDays < 30 ? 0.15 : ageDays < 90 ? 0.08 : 0;

    // Value bonus: higher-value cards get a slight bump (more relevant recommendations)
    const valueBonus = candidate.price_cents > 500 ? 0.05 : 0;

    const score =
      normalize(colorScore, maxColor * (candidateColors.length || 1)) * 0.5 +
      Math.min(formatBonus, 0.2) +
      recencyBonus +
      valueBonus;

    if (score <= 0.05) continue;

    // Build reason
    let reason = "";
    const colorNames = colorToNames(matchedColors);
    if (colorNames && matchedFormat) {
      reason = `You play ${colorNames} in ${capitalize(matchedFormat)} — new option in stock`;
    } else if (colorNames) {
      reason = `Matches your ${colorNames} preference`;
    } else if (matchedFormat) {
      reason = `Legal in ${capitalize(matchedFormat)}, which you play`;
    } else {
      reason = `Matches your ${game} collection`;
    }

    scored.push({
      type: "card",
      name: candidate.name,
      price_cents: candidate.price_cents,
      image_url: cp?.image_url ?? cp?.image_uri ?? candidate.image_url,
      inventory_item_id: candidate.id,
      reason,
      score,
      category: candidate.category,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/* ------------------------------------------------------------------ */
/*  Event-Based Recommendations                                         */
/* ------------------------------------------------------------------ */

export async function getEventRecommendations(
  db: TenantPrismaClient,
  customerId: string,
  storeId: string,
  limit = 5,
): Promise<Recommendation[]> {
  // 1. Get customer's event check-ins
  const checkins = await db.posEventCheckin.findMany({
    where: { customer_id: customerId },
    select: {
      event: {
        select: { name: true, event_type: true, metadata: true },
      },
    },
    orderBy: { checked_in_at: "desc" },
    take: 30,
  });

  if (checkins.length === 0) return [];

  // 2. Extract formats from events
  const formats = new Set<string>();
  const eventTypes = new Set<string>();

  for (const checkin of checkins) {
    const eventName = (checkin.event?.name ?? "").toLowerCase();
    const eventType = (checkin.event?.event_type ?? "").toLowerCase();
    const eventMeta = parseAttributes(checkin.event?.metadata);
    const format = (eventMeta.format ?? "") as string;

    if (eventType) eventTypes.add(eventType);
    if (format) formats.add(format.toLowerCase());

    for (const f of ["standard", "modern", "pioneer", "legacy", "vintage", "commander", "pauper"]) {
      if (eventName.includes(f) || eventType.includes(f)) {
        formats.add(f);
      }
    }
  }

  if (formats.size === 0) return [];

  // 3. Get customer's existing purchases to exclude
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const recentSales = await db.posLedgerEntry.findMany({
    where: {
      customer_id: customerId,
      type: "sale",
      created_at: { gte: ninetyDaysAgo },
    },
    select: { metadata: true },
    take: 100,
  });

  const purchasedItemIds = new Set<string>();
  for (const sale of recentSales) {
    for (const item of extractItems(sale.metadata)) {
      if (item.inventory_item_id) purchasedItemIds.add(item.inventory_item_id);
    }
  }

  // 4. Find in-stock TCG singles that are legal in those formats
  const candidates = await db.posInventoryItem.findMany({
    where: {
      category: "tcg_single",
      active: true,
      quantity: { gt: 0 },
      ...(purchasedItemIds.size > 0 ? { id: { notIn: [...purchasedItemIds] } } : {}),
    },
    select: {
      id: true,
      name: true,
      price_cents: true,
      image_url: true,
      category: true,
      created_at: true,
      catalog_product: {
        select: {
          legalities: true,
          rarity: true,
          image_url: true,
          image_uri: true,
        },
      },
    },
    orderBy: { created_at: "desc" },
    take: 200,
  });

  const scored: Recommendation[] = [];
  const now = Date.now();

  for (const candidate of candidates) {
    const legalities = (candidate.catalog_product?.legalities ?? {}) as Record<string, string>;
    let matchedFormat = "";
    let legalCount = 0;

    for (const f of formats) {
      if (legalities[f] === "legal") {
        legalCount++;
        if (!matchedFormat) matchedFormat = f;
      }
    }

    if (legalCount === 0) continue;

    // Score: format match + recency + value
    const ageMs = now - candidate.created_at.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const recencyBonus = ageDays < 14 ? 0.3 : ageDays < 30 ? 0.15 : ageDays < 60 ? 0.05 : 0;
    const valueBonus = candidate.price_cents > 1000 ? 0.1 : candidate.price_cents > 500 ? 0.05 : 0;
    const formatScore = Math.min(legalCount * 0.2, 0.4);

    const score = formatScore + recencyBonus + valueBonus;
    if (score <= 0.1) continue;

    scored.push({
      type: "event",
      name: candidate.name,
      price_cents: candidate.price_cents,
      image_url: candidate.catalog_product?.image_url ?? candidate.catalog_product?.image_uri ?? candidate.image_url,
      inventory_item_id: candidate.id,
      reason: `You play ${capitalize(matchedFormat)} — ${ageDays < 14 ? "just arrived" : "in stock and ready"}`,
      score,
      category: candidate.category,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/* ------------------------------------------------------------------ */
/*  Combined Recommendations                                            */
/* ------------------------------------------------------------------ */

export async function getRecommendationsForCustomer(
  db: TenantPrismaClient,
  customerId: string,
  storeId: string,
): Promise<{
  games: Recommendation[];
  cards: Recommendation[];
  events: Recommendation[];
}> {
  // Run all three in parallel for speed
  const [games, cards, events] = await Promise.all([
    getGameRecommendations(db, customerId, storeId).catch(() => [] as Recommendation[]),
    getTCGRecommendations(db, customerId, storeId).catch(() => [] as Recommendation[]),
    getEventRecommendations(db, customerId, storeId).catch(() => [] as Recommendation[]),
  ]);

  // Deduplicate across categories (same inventory_item_id)
  const seen = new Set<string>();
  const dedup = (recs: Recommendation[]) => {
    const result: Recommendation[] = [];
    for (const r of recs) {
      if (!seen.has(r.inventory_item_id)) {
        seen.add(r.inventory_item_id);
        result.push(r);
      }
    }
    return result;
  };

  // Cards get priority (highest margin), then events (timely), then games
  return {
    cards: dedup(cards),
    events: dedup(events),
    games: dedup(games),
  };
}

/* ------------------------------------------------------------------ */
/*  Purchase Signal Recording (Tier 2 prep)                             */
/* ------------------------------------------------------------------ */

/**
 * Record co-purchase signals after checkout.
 * Fire-and-forget — never blocks the checkout flow.
 *
 * For Tier 1, this is a no-op since the ledger metadata already captures
 * everything we need (items purchased together in the same transaction).
 *
 * Tier 2 will use these signals for collaborative filtering:
 * "Customers who bought X also bought Y" — by analyzing co-occurrence
 * patterns across ledger entries with multiple items.
 *
 * No new tables needed — the ledger already records:
 *   metadata.items = [{ inventory_item_id, name, category, quantity, ... }]
 *
 * When tier 2 is ready, this function will:
 * 1. Extract item pairs from the transaction
 * 2. Update a co-purchase frequency matrix (new table: pos_copurchase_signals)
 * 3. Feed into a recommendation model that combines content-based (tier 1)
 *    with collaborative filtering for hybrid recommendations
 */
export async function recordPurchaseSignal(
  _storeId: string,
  _customerId: string,
  _items: Array<{ inventory_item_id: string; category: string }>,
): Promise<void> {
  // Tier 1: No-op. The ledger entry metadata already captures co-purchase data.
  // This function exists as the integration point for tier 2 collaborative filtering.
  return;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const MTG_COLOR_NAMES: Record<string, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
};

/** Convert MTG color codes to readable names */
function colorToNames(colors: string[]): string {
  if (colors.length === 0) return "";
  const names = colors
    .map((c) => MTG_COLOR_NAMES[c.toUpperCase()] ?? c)
    .filter(Boolean);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}/${names[1]}`;
  return names.slice(0, 2).join("/") + "+";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
