import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/library/update — Update the user's game library.
 *
 * Body: { games: Array<{ title, slug? }> }
 * Replaces the entire library. Ownership only — no app-specific preferences.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: { games: Array<{ title: string; slug?: string; bggId?: number }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!Array.isArray(body.games)) {
    return NextResponse.json({ error: 'games must be an array' }, { status: 400 });
  }

  const library = body.games.map((g) => ({
    name: g.title,
    title: g.title,
    slug: g.slug || undefined,
    bggId: g.bggId || undefined,
    addedAt: new Date().toISOString(),
  }));

  await prisma.user.update({
    where: { id: session.user.id },
    data: { gameLibrary: JSON.stringify(library) },
  });

  return NextResponse.json({ count: library.length });
}
