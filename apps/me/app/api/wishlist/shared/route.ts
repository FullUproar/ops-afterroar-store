import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/wishlist/shared?userId=xxx
 *
 * Public wishlist endpoint — no auth required. Returns a user's
 * wishlist if they have one. Used for shareable gift-giving links.
 *
 * No PII exposed — just game titles, priority, and notes.
 */
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, passportCode: true },
  });

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const items = await prisma.wishlistItem.findMany({
    where: { userId },
    orderBy: [{ priority: 'asc' }, { addedAt: 'desc' }],
    select: {
      gameTitle: true,
      bggId: true,
      priority: true,
      notes: true,
      addedAt: true,
    },
  });

  return NextResponse.json({
    owner: user.displayName || 'A gamer',
    items,
    count: items.length,
  }, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
