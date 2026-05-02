import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withApiKey } from '@/lib/api-middleware';

/**
 * POST /api/v1/play-records
 *
 * Connect-tier write endpoint. HQ (and future apps) call this when a
 * match locks to record a player's portable event history. Passport is
 * the canonical store; HQ-side detail can be purged without losing
 * the resume.
 *
 * Body: PlayRecordWriteRequest (single record) or { records: ... } (batch).
 *
 * Required scope: write:play-records
 *
 * Idempotency: dedup on (userId, sourceApp, eventId, matchId). Re-posting
 * the same match-lock is a no-op (returns the existing record).
 */

interface PlayRecordWriteRequest {
  userId: string;
  sourceApp?: string; // defaults to 'hq'
  eventId: string;
  eventName: string;
  eventDate: string; // ISO
  venueId?: string;
  venueName?: string;
  gameTitle?: string;
  bggId?: number;
  matchId?: string;
  roundNumber?: number;
  placement?: number;
  score?: number;
  result?: 'win' | 'loss' | 'draw' | 'bye' | 'no_show';
  source?: 'verified' | 'self_reported' | 'corroborated';
  verifiedByUserId?: string;
  verifiedAt?: string; // ISO
}

const VALID_RESULTS = ['win', 'loss', 'draw', 'bye', 'no_show'];
const VALID_SOURCES = ['verified', 'self_reported', 'corroborated'];

export const POST = withApiKey<Record<string, never>>(async (req) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  // Accept either single record or { records: [...] } batch.
  const records: PlayRecordWriteRequest[] = Array.isArray((body as { records?: unknown[] }).records)
    ? ((body as { records: PlayRecordWriteRequest[] }).records)
    : [body as PlayRecordWriteRequest];

  if (records.length === 0) {
    return NextResponse.json({ error: 'No records to write.' }, { status: 400 });
  }
  if (records.length > 200) {
    return NextResponse.json(
      { error: 'Batch too large; max 200 per request.' },
      { status: 400 },
    );
  }

  const created: { id: string; userId: string; eventId: string; matchId: string | null }[] = [];
  const errors: Array<{ index: number; error: string }> = [];

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (!r.userId || !r.eventId || !r.eventName || !r.eventDate) {
      errors.push({ index: i, error: 'Missing required field (userId, eventId, eventName, eventDate).' });
      continue;
    }
    if (r.result && !VALID_RESULTS.includes(r.result)) {
      errors.push({ index: i, error: `Invalid result '${r.result}'.` });
      continue;
    }
    if (r.source && !VALID_SOURCES.includes(r.source)) {
      errors.push({ index: i, error: `Invalid source '${r.source}'.` });
      continue;
    }

    const sourceApp = r.sourceApp ?? 'hq';

    try {
      // Idempotency check: same source + event + match = same record.
      // matchId is the strongest dedup key; fall back to (user, event)
      // when matchId is null (e.g., self-reported with no match attached).
      const existing = r.matchId
        ? await prisma.playRecord.findFirst({
            where: {
              userId: r.userId,
              sourceApp,
              eventId: r.eventId,
              matchId: r.matchId,
            },
            select: { id: true },
          })
        : await prisma.playRecord.findFirst({
            where: {
              userId: r.userId,
              sourceApp,
              eventId: r.eventId,
              matchId: null,
            },
            select: { id: true },
          });

      if (existing) {
        // Update in place — score/placement may have been corrected.
        const updated = await prisma.playRecord.update({
          where: { id: existing.id },
          data: {
            eventName: r.eventName,
            eventDate: new Date(r.eventDate),
            venueId: r.venueId ?? null,
            venueName: r.venueName ?? null,
            gameTitle: r.gameTitle ?? null,
            bggId: r.bggId ?? null,
            roundNumber: r.roundNumber ?? null,
            placement: r.placement ?? null,
            score: r.score ?? null,
            result: r.result ?? null,
            source: r.source ?? 'verified',
            verifiedByUserId: r.verifiedByUserId ?? null,
            verifiedAt: r.verifiedAt ? new Date(r.verifiedAt) : null,
          },
          select: { id: true, userId: true, eventId: true, matchId: true },
        });
        created.push(updated);
        continue;
      }

      const record = await prisma.playRecord.create({
        data: {
          userId: r.userId,
          sourceApp,
          eventId: r.eventId,
          eventName: r.eventName,
          eventDate: new Date(r.eventDate),
          venueId: r.venueId ?? null,
          venueName: r.venueName ?? null,
          gameTitle: r.gameTitle ?? null,
          bggId: r.bggId ?? null,
          matchId: r.matchId ?? null,
          roundNumber: r.roundNumber ?? null,
          placement: r.placement ?? null,
          score: r.score ?? null,
          result: r.result ?? null,
          source: r.source ?? 'verified',
          verifiedByUserId: r.verifiedByUserId ?? null,
          verifiedAt: r.verifiedAt ? new Date(r.verifiedAt) : null,
        },
        select: { id: true, userId: true, eventId: true, matchId: true },
      });
      created.push(record);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Write failed.';
      // Likely cause: userId not in Passport's User table. Worth surfacing.
      errors.push({ index: i, error: message });
    }
  }

  return NextResponse.json({
    written: created.length,
    records: created,
    errors,
  }, { status: errors.length === 0 ? 200 : 207 });
}, 'write:play-records');
