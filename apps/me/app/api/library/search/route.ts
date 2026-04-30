import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/library/search?q=catan
 *
 * Searches BoardGameGeek's public XML API for board games matching the
 * query. Returns up to 15 results in the shape the library editor expects.
 *
 * Background: this endpoint previously queried a `BoardGameMetadata`
 * table that lived on the FU side of the platform's database. After the
 * 2026-04-27 schema split, apps/me sits on afterroar-pos-prod which
 * doesn't have that table. The previous implementation silently caught
 * the "table doesn't exist" error and returned `{ results: [] }`, which
 * presented as a "borked" search to users. This rewrite removes the
 * cross-DB dependency entirely by going to BGG directly.
 *
 * Trade-offs:
 *   - BGG is single-source-of-truth for board games. Always fresh.
 *   - Latency is BGG's network round-trip (~200-800ms typical). Slower
 *     than a local DB query but fine for user-driven search.
 *   - BGG asks for ~1 req/sec rate limit. User-driven search is well
 *     within that. We don't pre-fetch or batch.
 *   - We return title + slug (= bgg:N). minPlayers / maxPlayers /
 *     complexity would require a second BGG /thing call per result;
 *     skipping for snappiness. Library editor handles them as undefined.
 *
 * BGG XML API:
 *   GET https://boardgamegeek.com/xmlapi2/search?query={Q}&type=boardgame
 *   Response: XML with <item id="N" type="boardgame"><name value="..."/></item>
 *
 * Auth: BGG started requiring Bearer auth on their XML API in 2026. Token
 * lives in BGG_API_TOKEN env var (already configured in Vercel for the
 * /api/cron/bgg-refresh job; we share the same token here).
 *
 * Cached 60s at the framework level — BGG content rarely changes, users
 * often retry the same query, and caching protects us if BGG is briefly slow.
 */

const BGG_SEARCH_URL = 'https://boardgamegeek.com/xmlapi2/search';

export const revalidate = 60;

interface SearchResult {
  title: string;
  slug: string;
  minPlayers?: number;
  maxPlayers?: number;
  complexity?: number;
}

function parseSearchXml(xml: string): SearchResult[] {
  // BGG response is simple enough for regex extraction. Each result is:
  //   <item type="boardgame" id="13">
  //     <name type="primary" value="Catan"/>
  //     <yearpublished value="1995"/>
  //   </item>
  // We capture id + the primary name (BGG sometimes lists multiple
  // <name> entries — one primary plus alternates).
  const itemRegex = /<item\s+type="boardgame"\s+id="(\d+)"[^>]*>([\s\S]*?)<\/item>/g;
  const results: SearchResult[] = [];
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const id = match[1];
    const inner = match[2];
    const primaryNameMatch = /<name[^>]*type="primary"[^>]*value="([^"]+)"/.exec(inner);
    const anyNameMatch = /<name[^>]*value="([^"]+)"/.exec(inner);
    const title = primaryNameMatch?.[1] ?? anyNameMatch?.[1];
    if (!id || !title) continue;
    results.push({ title, slug: `bgg:${id}` });
    if (results.length >= 15) break;
  }
  return results;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim();
  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const url = new URL(BGG_SEARCH_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('type', 'boardgame');

  const headers: Record<string, string> = {
    'User-Agent': 'Afterroar Passport/1.0',
  };
  const bggToken = process.env.BGG_API_TOKEN;
  if (bggToken) headers['Authorization'] = `Bearer ${bggToken}`;

  try {
    const res = await fetch(url.toString(), {
      headers,
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { results: [], error: `BGG returned ${res.status}` },
        { status: 502 },
      );
    }
    const xml = await res.text();
    return NextResponse.json({ results: parseSearchXml(xml) });
  } catch (err) {
    return NextResponse.json(
      {
        results: [],
        error: err instanceof Error ? err.message : 'BGG search failed',
      },
      { status: 502 },
    );
  }
}
