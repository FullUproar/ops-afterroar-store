import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/oauth/api-auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/library — Game library for a user.
 *
 * Auth: Bearer token (library:read scope) OR ServerKey + X-User-Id.
 * Returns the user's declared game library with tags.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateApiRequest(request);
  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (auth.scope && !auth.scope.includes('library:read')) {
    return NextResponse.json({ error: 'Insufficient scope — requires library:read' }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
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
    userId: auth.userId,
    games,
    count: games.length,
  }, {
    headers: { 'Cache-Control': 'private, max-age=60' },
  });
}
