import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/oauth/tokens';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/activity — Activity history for the authenticated user.
 *
 * Requires Bearer access token with 'checkins:read' scope.
 * Returns recent check-ins, event attendance, tournament results.
 *
 * Query params:
 *   limit — max entries to return (default 20, max 100)
 *   action — filter by action type (optional)
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

  if (!payload.scope.includes('checkins:read')) {
    return NextResponse.json({ error: 'Insufficient scope — requires checkins:read' }, { status: 403 });
  }

  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit')) || 20, 100);
  const actionFilter = request.nextUrl.searchParams.get('action');

  const activities = await prisma.userActivity.findMany({
    where: {
      userId: payload.userId,
      ...(actionFilter ? { action: actionFilter } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      metadata: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    userId: payload.userId,
    activities: activities.map((a) => ({
      id: a.id,
      action: a.action,
      targetType: a.targetType,
      targetId: a.targetId,
      metadata: a.metadata ? JSON.parse(a.metadata) : null,
      createdAt: a.createdAt,
    })),
  }, {
    headers: { 'Cache-Control': 'private, max-age=30' },
  });
}
