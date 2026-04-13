import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/oauth/tokens';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/consent/check?categories=fulluproar_marketing,platform_product
 *
 * Checks whether the user has granted specific consent categories.
 * Used by client apps to gate email sends, personalization, etc.
 *
 * Requires Bearer access token with 'openid' scope (minimal).
 * Returns { granted: boolean, categories: { [name]: boolean } }
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

  const categoriesParam = request.nextUrl.searchParams.get('categories');
  if (!categoriesParam) {
    return NextResponse.json({ error: 'categories query param required' }, { status: 400 });
  }

  const requested = categoriesParam.split(',').map((c) => c.trim()).filter(Boolean);

  const consents = await prisma.userConsent.findMany({
    where: {
      userId: payload.userId,
      category: { in: requested },
      granted: true,
    },
    select: { category: true },
  });

  const grantedSet = new Set(consents.map((c) => c.category));
  const categories: Record<string, boolean> = {};
  for (const cat of requested) {
    categories[cat] = grantedSet.has(cat);
  }

  return NextResponse.json({
    userId: payload.userId,
    granted: requested.every((cat) => grantedSet.has(cat)),
    categories,
  }, {
    headers: { 'Cache-Control': 'private, max-age=10' },
  });
}
