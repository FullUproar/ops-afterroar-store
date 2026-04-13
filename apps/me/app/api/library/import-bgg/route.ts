import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/library/import-bgg — Import game collection from BGG username.
 *
 * Fetches the user's BGG collection (owned games) and returns them
 * for confirmation. Does NOT auto-add — user picks which to import.
 *
 * Body: { username: string }
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: { username: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!body.username?.trim()) {
    return NextResponse.json({ error: 'BGG username required' }, { status: 400 });
  }

  const bggToken = process.env.BGG_API_TOKEN;
  const headers: Record<string, string> = {};
  if (bggToken) headers['Authorization'] = `Bearer ${bggToken}`;

  try {
    // BGG collection API — own=1 returns only owned games
    const res = await fetch(
      `https://boardgamegeek.com/xmlapi2/collection?username=${encodeURIComponent(body.username.trim())}&own=1&subtype=boardgame&stats=1`,
      { headers, signal: AbortSignal.timeout(15000) },
    );

    if (res.status === 202) {
      // BGG queues collection requests — need to retry
      return NextResponse.json({
        error: 'BGG is preparing your collection. Please try again in a few seconds.',
        retry: true,
      }, { status: 202 });
    }

    if (!res.ok) {
      return NextResponse.json({ error: `BGG returned status ${res.status}` }, { status: 502 });
    }

    const xml = await res.text();

    // Parse games from XML
    const gameMatches = xml.matchAll(/<item[^>]*objectid="(\d+)"[\s\S]*?<name[^>]*>([^<]+)<\/name>[\s\S]*?(?:<yearpublished>(\d+)<\/yearpublished>)?[\s\S]*?(?:<stats[^>]*minplayers="(\d+)"[^>]*maxplayers="(\d+)")?[\s\S]*?(?:<rating[^>]*>[\s\S]*?<average[^>]*value="([\d.]+)")?[\s\S]*?<\/item>/g);

    const games: Array<{
      title: string;
      bggId: number;
      yearPublished: number | null;
      minPlayers: number | null;
      maxPlayers: number | null;
      bggRating: number | null;
    }> = [];

    for (const match of gameMatches) {
      games.push({
        title: decodeXmlEntities(match[2]),
        bggId: parseInt(match[1]),
        yearPublished: match[3] ? parseInt(match[3]) : null,
        minPlayers: match[4] ? parseInt(match[4]) : null,
        maxPlayers: match[5] ? parseInt(match[5]) : null,
        bggRating: match[6] && match[6] !== '0' ? Math.round(parseFloat(match[6]) * 10) / 10 : null,
      });
    }

    // Also try simpler parsing if regex missed some
    if (games.length === 0) {
      const simpleMatches = xml.matchAll(/objectid="(\d+)"[\s\S]*?<name[^>]*>([^<]+)<\/name>/g);
      for (const match of simpleMatches) {
        games.push({
          title: decodeXmlEntities(match[2]),
          bggId: parseInt(match[1]),
          yearPublished: null,
          minPlayers: null,
          maxPlayers: null,
          bggRating: null,
        });
      }
    }

    // Get existing library to mark duplicates
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { gameLibrary: true },
    });

    let existingTitles: Set<string> = new Set();
    if (user?.gameLibrary) {
      try {
        const parsed = JSON.parse(user.gameLibrary);
        if (Array.isArray(parsed)) {
          existingTitles = new Set(parsed.map((g: { title?: string; name?: string }) =>
            (g.title || g.name || '').toLowerCase()
          ));
        }
      } catch {}
    }

    const enriched = games.map((g) => ({
      ...g,
      alreadyOwned: existingTitles.has(g.title.toLowerCase()),
    }));

    return NextResponse.json({
      username: body.username.trim(),
      games: enriched,
      total: enriched.length,
      newGames: enriched.filter((g) => !g.alreadyOwned).length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `BGG import failed: ${msg}` }, { status: 502 });
  }
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}
