import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/wishlist — List all wishlist items for the authenticated user.
 * POST /api/wishlist — Add a game to the wishlist.
 * DELETE /api/wishlist — Remove a game from the wishlist.
 */

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const items = await prisma.wishlistItem.findMany({
    where: { userId: session.user.id },
    orderBy: [{ priority: 'asc' }, { addedAt: 'desc' }],
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: { gameTitle: string; bggId?: number; priority?: number; notes?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  if (!body.gameTitle?.trim()) {
    return NextResponse.json({ error: 'gameTitle is required' }, { status: 400 });
  }

  const item = await prisma.wishlistItem.upsert({
    where: {
      userId_gameTitle: { userId: session.user.id, gameTitle: body.gameTitle.trim() },
    },
    create: {
      userId: session.user.id,
      gameTitle: body.gameTitle.trim(),
      bggId: body.bggId || null,
      priority: body.priority ?? 3,
      notes: body.notes?.trim() || null,
    },
    update: {
      priority: body.priority ?? undefined,
      notes: body.notes?.trim() ?? undefined,
      bggId: body.bggId ?? undefined,
    },
  });

  return NextResponse.json(item, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const deleted = await prisma.wishlistItem.deleteMany({
    where: { id, userId: session.user.id },
  });

  if (deleted.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
