import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/oauth/api-auth';
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
  
  const auth = await authenticateApiRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!auth.scope?.includes('points:read')) {
    return NextResponse.json({ error: 'Insufficient scope — requires points:read' }, { status: 403 });
  }

  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit')) || 20, 100);

  const [transactions, balances] = await Promise.all([
    prisma.pointsLedger.findMany({
      where: { userId: auth.userId },
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
      WHERE "userId" = ${auth.userId}
      GROUP BY "storeId"
    `,
  ]);

  return NextResponse.json({
    userId: auth.userId,
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
