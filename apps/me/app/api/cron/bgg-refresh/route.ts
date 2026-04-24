import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * BGG catalog refresh cron — runs every 6 hours via Vercel Cron.
 *
 * Three jobs in one pass, in priority order:
 *   1. ENRICH: rows with bggId but missing complexity/playtime → call BGG thing API
 *   2. REFRESH STALE: rows updated > 30 days ago → refresh weight/rating
 *   3. DETECT MERGES: if BGG responds with a different id than requested (rare but
 *      happens when duplicate entries get merged), update our bggId to follow.
 *
 * Rate-limited to respect BGG's ~2 req/s guideline: 500ms between calls, hard cap
 * per run. We run often rather than aggressively so the catalog stays warm without
 * hammering BGG.
 */

const BGG_CALL_DELAY_MS = 500;
const MAX_CALLS_PER_RUN = 40; // 40 calls × 500ms = 20s, leaves plenty of headroom
const STALE_DAYS = 30;

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface BggRow {
  id: number;
  bggId: number;
  slug: string;
  title: string;
  minPlayers: number | null;
  maxPlayers: number | null;
  minPlayMinutes: number | null;
  maxPlayMinutes: number | null;
  complexity: number | null;
  bggRating: number | null;
  yearPublished: number | null;
  updatedAt: Date;
}

interface BggThingResult {
  id: number; // May differ from requested id if BGG merged this entry
  title: string;
  minPlayers: number | null;
  maxPlayers: number | null;
  minPlayMinutes: number | null;
  maxPlayMinutes: number | null;
  complexity: number | null;
  bggRating: number | null;
  yearPublished: number | null;
}

async function fetchBggThing(bggId: number, token?: string): Promise<BggThingResult | null> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(
      `https://boardgamegeek.com/xmlapi2/thing?id=${bggId}&stats=1`,
      { headers, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const xml = await res.text();

    // <item type="boardgame" id="12345">
    const idMatch = xml.match(/<item\s+type="boardgame"\s+id="(\d+)"/);
    if (!idMatch) return null;
    const resolvedId = parseInt(idMatch[1]);

    // Primary name
    const nameMatch = xml.match(/<name\s+type="primary"\s+[^>]*value="([^"]+)"/);
    if (!nameMatch) return null;
    const title = nameMatch[1]
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));

    const minP = xml.match(/minplayers\s+value="(\d+)"/);
    const maxP = xml.match(/maxplayers\s+value="(\d+)"/);
    const minT = xml.match(/minplaytime\s+value="(\d+)"/);
    const maxT = xml.match(/maxplaytime\s+value="(\d+)"/);
    const year = xml.match(/yearpublished\s+value="(\d+)"/);
    const weight = xml.match(/averageweight\s+value="([\d.]+)"/);
    const rating = xml.match(/<average\s+value="([\d.]+)"/);

    const num = (m: RegExpMatchArray | null) => m ? parseInt(m[1]) : null;
    const numF = (m: RegExpMatchArray | null) => m ? Math.round(parseFloat(m[1]) * 10) / 10 : null;

    return {
      id: resolvedId,
      title,
      minPlayers: num(minP),
      maxPlayers: num(maxP),
      minPlayMinutes: num(minT),
      maxPlayMinutes: num(maxT),
      complexity: numF(weight),
      bggRating: numF(rating),
      yearPublished: num(year),
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const bggToken = process.env.BGG_API_TOKEN || undefined;
  const summary = {
    status: 'ok',
    enriched: 0,
    refreshed: 0,
    merged: 0,
    errors: 0,
    calls: 0,
    queuedEnrich: 0,
    queuedStale: 0,
  };

  // Priority queue: enrichment first, then staleness
  const enrichTargets = await prisma.$queryRawUnsafe<BggRow[]>(`
    SELECT id, "bggId", slug, title,
           "minPlayers", "maxPlayers", "minPlayMinutes", "maxPlayMinutes",
           complexity, "bggRating", "yearPublished", "updatedAt"
    FROM "BoardGameMetadata"
    WHERE "bggId" IS NOT NULL
      AND (complexity IS NULL OR "minPlayMinutes" IS NULL OR "maxPlayers" = 0 OR "minPlayers" = 0)
    ORDER BY "updatedAt" ASC
    LIMIT ${Math.floor(MAX_CALLS_PER_RUN * 0.7)}
  `);
  summary.queuedEnrich = enrichTargets.length;

  const remainingBudget = MAX_CALLS_PER_RUN - enrichTargets.length;
  const staleTargets = remainingBudget > 0
    ? await prisma.$queryRawUnsafe<BggRow[]>(`
        SELECT id, "bggId", slug, title,
               "minPlayers", "maxPlayers", "minPlayMinutes", "maxPlayMinutes",
               complexity, "bggRating", "yearPublished", "updatedAt"
        FROM "BoardGameMetadata"
        WHERE "bggId" IS NOT NULL
          AND "updatedAt" < NOW() - INTERVAL '${STALE_DAYS} days'
          AND NOT (complexity IS NULL OR "minPlayMinutes" IS NULL)
        ORDER BY "updatedAt" ASC
        LIMIT ${remainingBudget}
      `)
    : [];
  summary.queuedStale = staleTargets.length;

  const targets = [...enrichTargets, ...staleTargets];
  if (targets.length === 0) {
    return NextResponse.json({ ...summary, message: 'Nothing to refresh' });
  }

  for (const row of targets) {
    if (summary.calls >= MAX_CALLS_PER_RUN) break;
    if (summary.calls > 0) await delay(BGG_CALL_DELAY_MS);
    summary.calls++;

    const fresh = await fetchBggThing(row.bggId, bggToken);
    if (!fresh) {
      summary.errors++;
      continue;
    }

    const merged = fresh.id !== row.bggId;

    try {
      // Upsert on the resolved bggId (handles merge case). If another row already
      // has the merged id, we keep the older one and null-out this row's bggId.
      if (merged) {
        const existing = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
          `SELECT id FROM "BoardGameMetadata" WHERE "bggId" = $1 AND id <> $2 LIMIT 1`,
          fresh.id, row.id,
        );
        if (existing.length > 0) {
          // Canonical row exists — drop the old bggId reference on our row
          await prisma.$executeRawUnsafe(
            `UPDATE "BoardGameMetadata" SET "bggId" = NULL, "updatedAt" = NOW() WHERE id = $1`,
            row.id,
          );
          summary.merged++;
          continue;
        }
        // Otherwise our row can adopt the new bggId
      }

      await prisma.$executeRawUnsafe(
        `UPDATE "BoardGameMetadata"
         SET title = COALESCE($1, title),
             "bggId" = $2,
             "minPlayers" = COALESCE(NULLIF($3, 0), "minPlayers"),
             "maxPlayers" = COALESCE(NULLIF($4, 0), "maxPlayers"),
             "minPlayMinutes" = COALESCE($5, "minPlayMinutes"),
             "maxPlayMinutes" = COALESCE($6, "maxPlayMinutes"),
             complexity = COALESCE($7, complexity),
             "bggRating" = COALESCE($8, "bggRating"),
             "yearPublished" = COALESCE($9, "yearPublished"),
             "updatedAt" = NOW()
         WHERE id = $10`,
        fresh.title,
        fresh.id,
        fresh.minPlayers,
        fresh.maxPlayers,
        fresh.minPlayMinutes,
        fresh.maxPlayMinutes,
        fresh.complexity,
        fresh.bggRating,
        fresh.yearPublished,
        row.id,
      );

      if (merged) summary.merged++;
      else if (enrichTargets.some((t) => t.id === row.id)) summary.enriched++;
      else summary.refreshed++;
    } catch (err) {
      console.error(`[bgg-refresh] upsert failed for bggId ${row.bggId}:`, err);
      summary.errors++;
    }
  }

  return NextResponse.json(summary);
}
