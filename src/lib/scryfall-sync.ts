/* ------------------------------------------------------------------ */
/*  Scryfall Bulk Data Sync Engine                                      */
/*  Downloads oracle_cards bulk data and upserts into pos_catalog_products */
/*  for offline access, price caching, and oracle_id matching.           */
/* ------------------------------------------------------------------ */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const SCRYFALL_BULK_API = "https://api.scryfall.com/bulk-data";
const BATCH_SIZE = 100;

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface ScryfallBulkEntry {
  id: string;
  type: string;
  download_uri: string;
  updated_at: string;
  size: number;
  name: string;
}

interface ScryfallCard {
  id: string;
  oracle_id: string;
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  keywords?: string[];
  color_identity?: string[];
  cmc?: number;
  rarity?: string;
  set: string;
  set_name: string;
  legalities?: Record<string, string>;
  prices?: Record<string, string | null>;
  image_uris?: { normal?: string; small?: string; large?: string };
  card_faces?: Array<{ image_uris?: { normal?: string; small?: string } }>;
}

export interface SyncResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  duration_ms: number;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Progress callback for logging                                       */
/* ------------------------------------------------------------------ */

type ProgressCallback = (processed: number, total: number) => void;

/* ------------------------------------------------------------------ */
/*  Main sync function                                                  */
/* ------------------------------------------------------------------ */

export async function syncScryfallBulkData(
  onProgress?: ProgressCallback
): Promise<SyncResult> {
  const startTime = Date.now();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  try {
    // 1. Fetch bulk data metadata
    console.log("[Scryfall Sync] Fetching bulk data metadata...");
    const metaRes = await fetch(SCRYFALL_BULK_API, {
      headers: { Accept: "application/json" },
    });
    if (!metaRes.ok) {
      throw new Error(`Failed to fetch bulk metadata: ${metaRes.status}`);
    }
    const metaData = await metaRes.json();

    // 2. Find the oracle_cards entry
    const oracleEntry = (metaData.data as ScryfallBulkEntry[]).find(
      (e) => e.type === "oracle_cards"
    );
    if (!oracleEntry) {
      throw new Error("oracle_cards bulk data entry not found");
    }

    console.log(
      `[Scryfall Sync] Downloading oracle_cards (${(oracleEntry.size / 1024 / 1024).toFixed(1)}MB)...`
    );

    // 3. Download the JSON file
    const dataRes = await fetch(oracleEntry.download_uri);
    if (!dataRes.ok) {
      throw new Error(`Failed to download bulk data: ${dataRes.status}`);
    }
    const cards: ScryfallCard[] = await dataRes.json();
    const total = cards.length;

    console.log(`[Scryfall Sync] Downloaded ${total} cards. Starting upsert...`);

    // 4. Process in batches
    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = cards.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map((card) => upsertCard(card))
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          if (result.value === "created") created++;
          else if (result.value === "updated") updated++;
          else skipped++;
        } else {
          skipped++;
        }
      }

      // Log progress every 5000 cards
      const processed = Math.min(i + BATCH_SIZE, total);
      if (processed % 5000 < BATCH_SIZE || processed === total) {
        console.log(
          `[Scryfall Sync] Processed ${processed}/${total} cards (created: ${created}, updated: ${updated}, skipped: ${skipped})`
        );
        onProgress?.(processed, total);
      }
    }

    const duration_ms = Date.now() - startTime;
    console.log(
      `[Scryfall Sync] Complete: ${total} cards, ${created} created, ${updated} updated, ${skipped} skipped in ${(duration_ms / 1000).toFixed(1)}s`
    );

    return { total, created, updated, skipped, duration_ms };
  } catch (err) {
    const duration_ms = Date.now() - startTime;
    const errorMsg =
      err instanceof Error ? err.message : "Unknown sync error";
    console.error(`[Scryfall Sync] Error: ${errorMsg}`);
    return {
      total: 0,
      created,
      updated,
      skipped,
      duration_ms,
      error: errorMsg,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Upsert a single card into pos_catalog_products                      */
/* ------------------------------------------------------------------ */

async function upsertCard(
  card: ScryfallCard
): Promise<"created" | "updated" | "skipped"> {
  // Skip tokens, emblems, etc.
  if (!card.oracle_id || !card.name) return "skipped";

  const imageUri =
    card.image_uris?.normal ??
    card.image_uris?.small ??
    card.card_faces?.[0]?.image_uris?.normal ??
    card.card_faces?.[0]?.image_uris?.small ??
    null;

  const data = {
    name: card.name,
    category: "singles",
    game: "mtg",
    product_type: "single",
    oracle_id: card.oracle_id,
    scryfall_id: card.id,
    mana_cost: card.mana_cost ?? null,
    type_line: card.type_line ?? null,
    oracle_text: card.oracle_text ?? null,
    keywords: card.keywords?.join(",") ?? null,
    color_identity: card.color_identity?.join(",") ?? null,
    cmc: card.cmc ?? null,
    rarity: card.rarity ?? null,
    set_code: card.set,
    set_name: card.set_name,
    legalities: card.legalities ?? Prisma.JsonNull,
    prices: card.prices ?? Prisma.JsonNull,
    image_uri: imageUri,
    image_url: imageUri,
    last_synced_at: new Date(),
    updated_at: new Date(),
  };

  // Try to find existing by scryfall_id first, then oracle_id
  const existing = await prisma.posCatalogProduct.findFirst({
    where: {
      OR: [
        { scryfall_id: card.id },
        { oracle_id: card.oracle_id, game: "mtg" },
      ],
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.posCatalogProduct.update({
      where: { id: existing.id },
      data,
    });
    return "updated";
  }

  await prisma.posCatalogProduct.create({
    data: {
      ...data,
      external_ids: { scryfall_id: card.id, oracle_id: card.oracle_id },
    },
  });
  return "created";
}

/* ------------------------------------------------------------------ */
/*  Query helpers                                                       */
/* ------------------------------------------------------------------ */

/** Find a catalog card by oracle_id */
export async function getCardByOracleId(oracleId: string) {
  return prisma.posCatalogProduct.findFirst({
    where: { oracle_id: oracleId, game: "mtg" },
  });
}

/** Search the local catalog with optional filters */
export async function searchCatalogCards(
  query: string,
  filters?: {
    format?: string;
    colorIdentity?: string[];
    cmc?: number;
    rarity?: string;
    setCode?: string;
  },
  limit = 50
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    game: "mtg",
    name: { contains: query, mode: "insensitive" },
  };

  if (filters?.rarity) {
    where.rarity = filters.rarity;
  }
  if (filters?.setCode) {
    where.set_code = filters.setCode;
  }
  if (filters?.cmc !== undefined) {
    where.cmc = filters.cmc;
  }
  if (filters?.colorIdentity && filters.colorIdentity.length > 0) {
    // Color identity is stored as comma-separated, filter in-app
    // For now, use a simple contains check for each color
    where.AND = filters.colorIdentity.map((c) => ({
      color_identity: { contains: c },
    }));
  }

  const results = await prisma.posCatalogProduct.findMany({
    where,
    take: limit,
    orderBy: { name: "asc" },
  });

  // Post-filter by format legality if requested
  if (filters?.format) {
    return results.filter((card) => {
      const legalities = card.legalities as Record<string, string> | null;
      return legalities?.[filters.format!] === "legal";
    });
  }

  return results;
}

/** Get cached price data for a card by oracle_id */
export async function getCardPrice(oracleId: string) {
  const card = await prisma.posCatalogProduct.findFirst({
    where: { oracle_id: oracleId, game: "mtg" },
    select: {
      name: true,
      oracle_id: true,
      prices: true,
      set_name: true,
      rarity: true,
      last_synced_at: true,
    },
  });

  if (!card) return null;

  const prices = card.prices as Record<string, string | null> | null;

  return {
    name: card.name,
    oracle_id: card.oracle_id,
    set_name: card.set_name,
    rarity: card.rarity,
    usd: prices?.usd ? parseFloat(prices.usd) : null,
    usd_foil: prices?.usd_foil ? parseFloat(prices.usd_foil) : null,
    usd_etched: prices?.usd_etched ? parseFloat(prices.usd_etched) : null,
    last_synced_at: card.last_synced_at,
  };
}

/** Get the last sync timestamp and total synced card count */
export async function getSyncStatus() {
  const [count, lastSynced] = await Promise.all([
    prisma.posCatalogProduct.count({
      where: { game: "mtg", oracle_id: { not: null } },
    }),
    prisma.posCatalogProduct.findFirst({
      where: { game: "mtg", last_synced_at: { not: null } },
      orderBy: { last_synced_at: "desc" },
      select: { last_synced_at: true },
    }),
  ]);

  return {
    synced_card_count: count,
    last_synced_at: lastSynced?.last_synced_at ?? null,
  };
}
