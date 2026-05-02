import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withApiKey } from '@/lib/api-middleware';

/**
 * GET /api/v1/users/:id/play-history
 *
 * Returns the player's portable event history (PlayRecord rows).
 * Connect-tier read endpoint, used by HQ for "your past tournaments"
 * surfaces and by Store Ops for in-store recognition.
 *
 * Required scope: read:play-records
 *
 * Query params:
 *   ?limit=50     (max 200)
 *   ?cursor=ID    (pagination, descending by recordedAt)
 *   ?source=verified   (filter by provenance)
 *   ?eventId=ID  (filter to a specific event)
 *
 * Response includes a `verifiedCount` and `selfReportedCount` summary
 * so callers can surface the verified-vs-self-reported distinction
 * the UI marketing claim depends on.
 */

export const GET = withApiKey<{ id: string }>(async (req, { params }) => {
  const { id: userId } = await params;
  const url = new URL(req.url);

  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)));
  const cursor = url.searchParams.get('cursor') || undefined;
  const sourceFilter = url.searchParams.get('source');
  const eventIdFilter = url.searchParams.get('eventId');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, displayName: true, passportCode: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const where: Record<string, unknown> = { userId };
  if (sourceFilter) where.source = sourceFilter;
  if (eventIdFilter) where.eventId = eventIdFilter;

  const [records, summary] = await Promise.all([
    prisma.playRecord.findMany({
      where,
      orderBy: { recordedAt: 'desc' },
      take: limit + 1, // +1 to detect more
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        sourceApp: true,
        eventId: true,
        eventName: true,
        eventDate: true,
        venueId: true,
        venueName: true,
        gameTitle: true,
        bggId: true,
        matchId: true,
        roundNumber: true,
        placement: true,
        score: true,
        result: true,
        source: true,
        recordedAt: true,
      },
    }),
    prisma.playRecord.groupBy({
      by: ['source'],
      where: { userId },
      _count: { _all: true },
    }),
  ]);

  const hasMore = records.length > limit;
  const trimmed = hasMore ? records.slice(0, limit) : records;
  const nextCursor = hasMore ? trimmed[trimmed.length - 1]?.id : null;

  const counts = { verified: 0, selfReported: 0, corroborated: 0 };
  for (const c of summary) {
    if (c.source === 'verified') counts.verified = c._count._all;
    else if (c.source === 'self_reported') counts.selfReported = c._count._all;
    else if (c.source === 'corroborated') counts.corroborated = c._count._all;
  }

  return NextResponse.json({
    user: {
      id: user.id,
      displayName: user.displayName,
      passportCode: user.passportCode,
    },
    counts,
    records: trimmed,
    nextCursor,
  });
}, 'read:play-records');
