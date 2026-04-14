import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/oauth/api-auth';
import type { Prisma } from '@prisma/client';
import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/badges — List badges for a user (current session or ServerKey-authed).
 * POST /api/badges — Issue a badge to a user (server-to-server only, from trusted clients).
 */

export async function GET(request: NextRequest) {
  // Try session first (Passport UI), then ServerKey (client apps)
  let userId: string | null = null;
  const session = await auth();
  if (session?.user?.id) {
    userId = session.user.id;
  } else {
    const apiAuth = await authenticateApiRequest(request);
    if (apiAuth) userId = apiAuth.userId;
  }

  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const badges = await prisma.userBadge.findMany({
    where: { userId, revokedAt: null },
    include: { badge: true },
    orderBy: { issuedAt: 'desc' },
  });

  return NextResponse.json({
    badges: badges.map((ub) => ({
      slug: ub.badge.slug,
      name: ub.badge.name,
      description: ub.badge.description,
      iconEmoji: ub.badge.iconEmoji,
      iconUrl: ub.badge.iconUrl,
      color: ub.badge.color,
      category: ub.badge.category,
      issuerType: ub.badge.issuerType,
      issuerName: ub.badge.issuerName,
      isLimited: ub.badge.isLimited,
      issuedAt: ub.issuedAt,
      reason: ub.reason,
    })),
    count: badges.length,
  });
}

export async function POST(request: NextRequest) {
  const apiAuth = await authenticateApiRequest(request);
  if (!apiAuth || apiAuth.authMethod !== 'server_key') {
    return NextResponse.json({ error: 'Server-to-server auth required' }, { status: 401 });
  }

  let body: { userId: string; badgeSlug: string; reason?: string; metadata?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!body.userId || !body.badgeSlug) {
    return NextResponse.json({ error: 'userId and badgeSlug are required' }, { status: 400 });
  }

  const badge = await prisma.passportBadge.findUnique({
    where: { slug: body.badgeSlug },
  });

  if (!badge) {
    return NextResponse.json({ error: 'Badge not found' }, { status: 404 });
  }

  if (badge.retiredAt) {
    return NextResponse.json({ error: 'Badge is no longer being issued' }, { status: 410 });
  }

  // Verify issuer has permission to issue this badge
  const clientCanIssue =
    badge.issuerType === apiAuth.clientId ||
    (badge.issuerType === 'afterroar') ||
    (badge.issuerType === 'fulluproar' && apiAuth.clientId === 'fulluproar-site') ||
    (badge.issuerType === 'fulluproar' && apiAuth.clientId === 'fulluproar-hq');

  if (!clientCanIssue) {
    return NextResponse.json(
      { error: `Client ${apiAuth.clientId} cannot issue ${badge.issuerType} badges` },
      { status: 403 }
    );
  }

  // Check supply limit
  if (badge.maxSupply && badge.totalIssued >= badge.maxSupply) {
    return NextResponse.json({ error: 'Badge has reached maximum supply' }, { status: 410 });
  }

  try {
    const userBadge = await prisma.$transaction(async (tx) => {
      const existing = await tx.userBadge.findUnique({
        where: { userId_badgeId: { userId: body.userId, badgeId: badge.id } },
      });
      if (existing && !existing.revokedAt) {
        return existing;
      }

      const created = existing
        ? await tx.userBadge.update({
            where: { id: existing.id },
            data: { revokedAt: null, reason: body.reason, metadata: (body.metadata as Prisma.InputJsonValue) || {} },
          })
        : await tx.userBadge.create({
            data: {
              userId: body.userId,
              badgeId: badge.id,
              issuedBy: apiAuth.clientId,
              reason: body.reason,
              metadata: (body.metadata as Prisma.InputJsonValue) || {},
            },
          });

      if (!existing) {
        await tx.passportBadge.update({
          where: { id: badge.id },
          data: { totalIssued: { increment: 1 } },
        });
      }

      return created;
    });

    return NextResponse.json({
      issued: true,
      badgeSlug: badge.slug,
      userId: body.userId,
      issuedAt: userBadge.issuedAt,
    }, { status: 201 });
  } catch (err) {
    console.error('[badges] issue failed:', err);
    return NextResponse.json({ error: 'Failed to issue badge' }, { status: 500 });
  }
}
