import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/oauth/api-auth';
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
  
  const auth = await authenticateApiRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!auth.scope?.includes('checkins:read')) {
    return NextResponse.json({ error: 'Insufficient scope — requires checkins:read' }, { status: 403 });
  }

  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit')) || 20, 100);
  const actionFilter = request.nextUrl.searchParams.get('action');

  const activities = await prisma.userActivity.findMany({
    where: {
      userId: auth.userId,
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
    userId: auth.userId,
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
