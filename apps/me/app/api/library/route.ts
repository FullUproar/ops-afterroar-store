import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/oauth/tokens';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/library — Game library for the authenticated user.
 *
 * Requires Bearer access token with 'library:read' scope.
 * Returns the user's declared game library.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
  }

  const payload = await verifyAccessToken(authHeader.slice(7));
  if (!payload) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  if (!payload.scope.includes('library:read')) {
    return NextResponse.json({ error: 'Insufficient scope — requires library:read' }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { gameLibrary: true },
  });

  let games: unknown[] = [];
  if (user?.gameLibrary) {
    try {
      const parsed = JSON.parse(user.gameLibrary);
      games = Array.isArray(parsed) ? parsed : [];
    } catch { /* invalid JSON — return empty */ }
  }

  return NextResponse.json({
    userId: payload.userId,
    games,
    count: games.length,
  }, {
    headers: { 'Cache-Control': 'private, max-age=60' },
  });
}
