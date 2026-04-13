import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/library/scan — Identify board games from a shelf photo.
 *
 * Pipeline:
 * 1. Claude Haiku vision extracts game descriptions from the photo
 * 2. Each description is fuzzy-matched against BoardGameMetadata (BGG data)
 * 3. Returns matched games with full BGG metadata for user confirmation
 *
 * Rate limited: 3 scans per user per day (admin accounts unlimited).
 * Body: { image: string (base64 data URL) }
 */

const scanCounts = new Map<string, { count: number; resetAt: number }>();
const MAX_SCANS_PER_DAY = 3;
const MAX_IMAGE_BYTES = 1_500_000;
const UNLIMITED_EMAILS = ['info@fulluproar.com', 'shawnoah.pollock@gmail.com'];

function checkRateLimit(userId: string, email?: string | null): { allowed: boolean; remaining: number } {
  if (email && UNLIMITED_EMAILS.includes(email)) {
    return { allowed: true, remaining: 999 };
  }
  const now = Date.now();
  const record = scanCounts.get(userId);
  if (!record || record.resetAt < now) {
    scanCounts.set(userId, { count: 0, resetAt: now + 24 * 60 * 60 * 1000 });
    return { allowed: true, remaining: MAX_SCANS_PER_DAY };
  }
  if (record.count >= MAX_SCANS_PER_DAY) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: MAX_SCANS_PER_DAY - record.count };
}

function recordScan(userId: string) {
  const record = scanCounts.get(userId);
  if (record) record.count++;
}

interface VisionGame {
  title: string;
  publisher?: string;
  description?: string;
}

interface ResolvedGame {
  title: string;
  bggId: number | null;
  slug: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  playTime: string | null;
  complexity: number | null;
  bggRating: number | null;
  yearPublished: number | null;
  thumbnail: string | null;
  confidence: 'high' | 'medium' | 'low';
  rawGuess: string;
}

async function searchBGGApi(query: string): Promise<Omit<ResolvedGame, 'confidence' | 'rawGuess'> | null> {
  const bggToken = process.env.BGG_API_TOKEN;
  if (!bggToken) return null;

  try {
    const res = await fetch(
      `https://boardgamegeek.com/xmlapi2/search?query=${encodeURIComponent(query)}&type=boardgame&exact=0`,
      {
        headers: { Authorization: `Bearer ${bggToken}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return null;

    const xml = await res.text();

    // Parse first result's ID and name from XML
    const itemMatch = xml.match(/<item type="boardgame" id="(\d+)"[\s\S]*?<name type="primary" value="([^"]+)"[\s\S]*?(?:<yearpublished value="(\d+)")?/);
    if (!itemMatch) return null;

    const bggId = parseInt(itemMatch[1]);
    const title = itemMatch[2];
    const yearPublished = itemMatch[3] ? parseInt(itemMatch[3]) : null;

    // Fetch details for the first result
    const detailRes = await fetch(
      `https://boardgamegeek.com/xmlapi2/thing?id=${bggId}&stats=1`,
      {
        headers: { Authorization: `Bearer ${bggToken}` },
        signal: AbortSignal.timeout(5000),
      },
    );

    let minPlayers: number | null = null;
    let maxPlayers: number | null = null;
    let playTime: string | null = null;
    let complexity: number | null = null;
    let bggRating: number | null = null;
    let thumbnail: string | null = null;

    if (detailRes.ok) {
      const detailXml = await detailRes.text();

      const minP = detailXml.match(/minplayers value="(\d+)"/);
      const maxP = detailXml.match(/maxplayers value="(\d+)"/);
      const minTime = detailXml.match(/minplaytime value="(\d+)"/);
      const maxTime = detailXml.match(/maxplaytime value="(\d+)"/);
      const avgWeight = detailXml.match(/averageweight value="([\d.]+)"/);
      const avgRating = detailXml.match(/average value="([\d.]+)"/);
      const thumb = detailXml.match(/<thumbnail>([^<]+)<\/thumbnail>/);

      minPlayers = minP ? parseInt(minP[1]) : null;
      maxPlayers = maxP ? parseInt(maxP[1]) : null;
      if (minTime && maxTime) {
        playTime = minTime[1] === maxTime[1] ? `${minTime[1]} min` : `${minTime[1]}-${maxTime[1]} min`;
      }
      complexity = avgWeight ? Math.round(parseFloat(avgWeight[1]) * 10) / 10 : null;
      bggRating = avgRating ? Math.round(parseFloat(avgRating[1]) * 10) / 10 : null;
      thumbnail = thumb ? thumb[1] : null;
    }

    return {
      title,
      bggId,
      slug: null,
      minPlayers,
      maxPlayers,
      playTime,
      complexity,
      bggRating,
      yearPublished,
      thumbnail,
    };
  } catch {
    return null;
  }
}

async function resolveAgainstBGG(games: VisionGame[]): Promise<ResolvedGame[]> {
  const results: ResolvedGame[] = [];

  for (const game of games) {
    const searchTerms = game.title;

    // Try exact match first, then fuzzy
    let match = await prisma.$queryRawUnsafe<Array<{
      title: string;
      slug: string;
      bggId: number | null;
      minPlayers: number | null;
      maxPlayers: number | null;
      minPlayMinutes: number | null; maxPlayMinutes: number | null;
      complexity: number | null;
      bggRating: number | null;
      yearPublished: number | null;
      thumbnailUrl: string | null;
    }>>(
      `SELECT title, slug, "bggId", "minPlayers", "maxPlayers", "minPlayMinutes", "maxPlayMinutes",
              complexity, "bggRating", "yearPublished", NULL AS "thumbnailUrl"
       FROM "BoardGameMetadata"
       WHERE LOWER(title) = LOWER($1)
       LIMIT 1`,
      searchTerms,
    );

    let confidence: 'high' | 'medium' | 'low' = 'high';

    if (match.length === 0) {
      // Fuzzy: trigram similarity search
      match = await prisma.$queryRawUnsafe<Array<{
        title: string;
        slug: string;
        bggId: number | null;
        minPlayers: number | null;
        maxPlayers: number | null;
        minPlayMinutes: number | null; maxPlayMinutes: number | null;
        complexity: number | null;
        bggRating: number | null;
        yearPublished: number | null;
        thumbnailUrl: string | null;
      }>>(
        `SELECT title, slug, "bggId", "minPlayers", "maxPlayers", "minPlayMinutes", "maxPlayMinutes",
                complexity, "bggRating", "yearPublished", NULL AS "thumbnailUrl"
         FROM "BoardGameMetadata"
         WHERE title ILIKE $1
         ORDER BY "bggRating" DESC NULLS LAST
         LIMIT 1`,
        `%${searchTerms}%`,
      );
      confidence = match.length > 0 ? 'medium' : 'low';
    }

    if (match.length === 0 && game.publisher) {
      // Try with publisher context
      match = await prisma.$queryRawUnsafe<Array<{
        title: string;
        slug: string;
        bggId: number | null;
        minPlayers: number | null;
        maxPlayers: number | null;
        minPlayMinutes: number | null; maxPlayMinutes: number | null;
        complexity: number | null;
        bggRating: number | null;
        yearPublished: number | null;
        thumbnailUrl: string | null;
      }>>(
        `SELECT title, slug, "bggId", "minPlayers", "maxPlayers", "minPlayMinutes", "maxPlayMinutes",
                complexity, "bggRating", "yearPublished", NULL AS "thumbnailUrl"
         FROM "BoardGameMetadata"
         WHERE title ILIKE $1 OR title ILIKE $2
         ORDER BY "bggRating" DESC NULLS LAST
         LIMIT 1`,
        `%${game.publisher}%${searchTerms}%`,
        `%${searchTerms}%${game.publisher}%`,
      );
      confidence = match.length > 0 ? 'medium' : 'low';
    }

    if (match.length > 0) {
      const m = match[0];
      results.push({
        title: m.title,
        bggId: m.bggId,
        slug: m.slug,
        minPlayers: m.minPlayers,
        maxPlayers: m.maxPlayers,
        playTime: m.minPlayMinutes ? (m.maxPlayMinutes && m.maxPlayMinutes !== m.minPlayMinutes ? `${m.minPlayMinutes}-${m.maxPlayMinutes} min` : `${m.minPlayMinutes} min`) : null,
        complexity: m.complexity ? Math.round(m.complexity * 10) / 10 : null,
        bggRating: m.bggRating ? Math.round(m.bggRating * 10) / 10 : null,
        yearPublished: m.yearPublished,
        thumbnail: m.thumbnailUrl,
        confidence,
        rawGuess: game.title,
      });
    } else {
      // Fallback: search BGG API directly
      const bggResult = await searchBGGApi(game.title);
      if (bggResult) {
        results.push({ ...bggResult, confidence: 'medium', rawGuess: game.title });
      } else {
        results.push({
          title: game.title,
          bggId: null, slug: null,
          minPlayers: null, maxPlayers: null,
          playTime: null, complexity: null,
          bggRating: null, yearPublished: null,
          thumbnail: null,
          confidence: 'low',
          rawGuess: game.title,
        });
      }
    }
  }

  return results;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Vision service not configured' }, { status: 503 });
  }

  const rateCheck = checkRateLimit(session.user.id, session.user.email);
  if (!rateCheck.allowed) {
    return NextResponse.json({
      error: 'Daily scan limit reached (3 per day). Try again tomorrow.',
      scansRemaining: 0,
    }, { status: 429 });
  }

  let body: { image: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.image || !body.image.startsWith('data:image/')) {
    return NextResponse.json({ error: 'Image must be a base64 data URL' }, { status: 400 });
  }

  if (body.image.length > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: 'Image too large. Please resize to under 1MB.' }, { status: 400 });
  }

  const match = body.image.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) {
    return NextResponse.json({ error: 'Invalid image format' }, { status: 400 });
  }

  const mediaType = match[1] as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  const imageData = match[2];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: imageData },
            },
            {
              type: 'text',
              text: `You are identifying board games, card games, and tabletop games visible in this photo of a game shelf or collection.

Return a JSON object with two fields:
- "totalVisible": The total number of game boxes/items you can see in the photo, including ones you cannot identify
- "games": An array of identified games

For each game you CAN identify, include:
- "title": Your best guess at the full, official game title (e.g., "Star Wars: Armada" not just "Armada")
- "publisher": The publisher if you can determine it (e.g., "Fantasy Flight Games", "Stonemaier Games")
- "description": A brief physical description to help verify — box color, distinctive art, size (e.g., "large blue box with spaceship art")

Be specific with titles — include franchise names, subtitles, and edition markers. If you see "Armada" with Star Wars imagery, return "Star Wars: Armada". If you see "Catan" in an older box, return "The Settlers of Catan".

Only include games you can identify with reasonable confidence. It is OK to have totalVisible > games.length.

Example output:
{
  "totalVisible": 12,
  "games": [
    {"title": "Star Wars: Armada", "publisher": "Fantasy Flight Games", "description": "large rectangular box with Star Destroyer art"},
    {"title": "Wingspan", "publisher": "Stonemaier Games", "description": "medium box with bird illustration, teal/nature colors"},
    {"title": "Carcassonne", "publisher": "Z-Man Games", "description": "square box with medieval landscape"}
  ]
}

If no games are visible, return: {"totalVisible": 0, "games": []}`,
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[library/scan] Anthropic API error:', response.status, errBody);
      return NextResponse.json({ error: `Vision service error (${response.status}): ${errBody.slice(0, 200)}` }, { status: 502 });
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || '[]';

    let visionGames: VisionGame[] = [];
    let totalVisible = 0;
    try {
      // Try parsing as object first (new format), fall back to array
      const jsonMatch = text.match(/\{[\s\S]*\}/) || text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          visionGames = parsed;
          totalVisible = parsed.length;
        } else {
          visionGames = parsed.games || [];
          totalVisible = parsed.totalVisible || visionGames.length;
        }
      }
    } catch {
      console.error('[library/scan] Failed to parse vision response:', text);
    }

    const resolved = await resolveAgainstBGG(
      visionGames.filter((g): g is VisionGame => !!g?.title)
    );

    recordScan(session.user.id);

    const unidentified = Math.max(0, totalVisible - visionGames.length);

    return NextResponse.json({
      games: resolved,
      totalVisible,
      identified: visionGames.length,
      unidentified,
      scansRemaining: rateCheck.remaining - 1,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[library/scan] Vision call failed:', msg);
    return NextResponse.json({ error: `Vision service unavailable: ${msg}` }, { status: 502 });
  }
}
