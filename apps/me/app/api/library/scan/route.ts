import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';

/**
 * POST /api/library/scan — Identify board games from a shelf photo.
 *
 * Uses Claude Haiku vision (cheapest model) to identify games from
 * box spines/covers in a photo. Returns a list of identified titles.
 *
 * Rate limited: 3 scans per user per day.
 * Image must be base64, max 1MB after client-side resize.
 *
 * Body: { image: string (base64 data URL) }
 * Returns: { games: string[], scansRemaining: number }
 */

// In-memory rate limit tracker (per Vercel function instance)
// For production scale, move to Redis/KV
const scanCounts = new Map<string, { count: number; resetAt: number }>();

const MAX_SCANS_PER_DAY = 3;
const MAX_IMAGE_BYTES = 1_500_000; // ~1.5MB base64

function checkRateLimit(userId: string): { allowed: boolean; remaining: number } {
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

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Vision service not configured' }, { status: 503 });
  }

  // Rate limit check
  const rateCheck = checkRateLimit(session.user.id);
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

  // Size check
  if (body.image.length > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: 'Image too large. Please resize to under 1MB.' }, { status: 400 });
  }

  // Extract base64 data and media type
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
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageData,
              },
            },
            {
              type: 'text',
              text: `Identify every board game, card game, or tabletop game visible in this photo. Look at box spines, covers, and any visible game titles.

Return ONLY a JSON array of game title strings. Be precise with titles. If you can't identify a game with confidence, skip it. Do not guess.

Example output: ["Catan", "Ticket to Ride", "Pandemic", "Wingspan"]

If no games are visible, return: []`,
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[library/scan] Anthropic API error:', response.status, errBody);
      return NextResponse.json({ error: 'Vision service error' }, { status: 502 });
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || '[]';

    // Parse the JSON array from the response
    let games: string[] = [];
    try {
      // Extract JSON array from response (might be wrapped in markdown code blocks)
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        games = JSON.parse(jsonMatch[0]);
      }
    } catch {
      console.error('[library/scan] Failed to parse vision response:', text);
      games = [];
    }

    // Record the scan against rate limit
    recordScan(session.user.id);

    return NextResponse.json({
      games: games.filter((g: unknown) => typeof g === 'string' && g.length > 0),
      scansRemaining: rateCheck.remaining - 1,
    });
  } catch (err) {
    console.error('[library/scan] Vision call failed:', err);
    return NextResponse.json({ error: 'Vision service unavailable' }, { status: 502 });
  }
}
