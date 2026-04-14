import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/badges/catalog — Public list of all available badges.
 * Used by apps to display badge info, issuers to plan their own badges, etc.
 */
export async function GET() {
  const badges = await prisma.passportBadge.findMany({
    where: { retiredAt: null },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    select: {
      slug: true,
      name: true,
      description: true,
      iconEmoji: true,
      iconUrl: true,
      color: true,
      category: true,
      issuerType: true,
      issuerName: true,
      isLimited: true,
      totalIssued: true,
      maxSupply: true,
    },
  });

  return NextResponse.json({ badges, count: badges.length }, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
  });
}
