import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/oauth/tokens';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/points — Loyalty points for the authenticated user.
 *
 * Requires Bearer access token with 'points:read' scope.
 * Returns per-store balances and recent transactions.
 *
 * Query params:
 *   limit — max transactions to return (default 20, max 100)
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

  if (!payload.scope.includes('points:read')) {
    return NextResponse.json({ error: 'Insufficient scope — requires points:read' }, { status: 403 });
  }

  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit')) || 20, 100);

  const [transactions, balances] = await Promise.all([
    prisma.pointsLedger.findMany({
      where: { userId: payload.userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        amount: true,
        balance: true,
        action: true,
        category: true,
        description: true,
        storeId: true,
        createdAt: true,
      },
    }),
    prisma.$queryRaw<Array<{ storeId: string | null; total: bigint }>>`
      SELECT "storeId", SUM(amount)::bigint AS total
      FROM "PointsLedger"
      WHERE "userId" = ${payload.userId}
      GROUP BY "storeId"
    `,
  ]);

  return NextResponse.json({
    userId: payload.userId,
    balances: balances.map((b) => ({
      storeId: b.storeId,
      balance: Number(b.total),
    })),
    transactions: transactions.map((t) => ({
      id: t.id,
      amount: t.amount,
      balance: t.balance,
      action: t.action,
      category: t.category,
      description: t.description,
      storeId: t.storeId,
      createdAt: t.createdAt,
    })),
  }, {
    headers: { 'Cache-Control': 'private, max-age=30' },
  });
}
