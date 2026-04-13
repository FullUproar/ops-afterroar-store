import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/loans — List all game loans for the authenticated user.
 * POST /api/loans — Create a new loan (lend a game to someone).
 * PATCH /api/loans — Mark a loan as returned.
 */

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const loans = await prisma.gameLoan.findMany({
    where: { userId: session.user.id },
    orderBy: [{ returnedAt: 'asc' }, { lentAt: 'desc' }],
  });

  const active = loans.filter((l) => !l.returnedAt);
  const returned = loans.filter((l) => l.returnedAt);

  return NextResponse.json({ active, returned, total: loans.length });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: { gameTitle: string; bggId?: number; borrowerName: string; borrowerContact?: string; dueDate?: string; notes?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  if (!body.gameTitle?.trim() || !body.borrowerName?.trim()) {
    return NextResponse.json({ error: 'gameTitle and borrowerName are required' }, { status: 400 });
  }

  const loan = await prisma.gameLoan.create({
    data: {
      userId: session.user.id,
      gameTitle: body.gameTitle.trim(),
      bggId: body.bggId || null,
      borrowerName: body.borrowerName.trim(),
      borrowerContact: body.borrowerContact?.trim() || null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      notes: body.notes?.trim() || null,
    },
  });

  return NextResponse.json(loan, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: { id: string; returnedAt?: string; condition?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const loan = await prisma.gameLoan.updateMany({
    where: { id: body.id, userId: session.user.id },
    data: {
      returnedAt: body.returnedAt ? new Date(body.returnedAt) : new Date(),
      condition: body.condition || null,
    },
  });

  if (loan.count === 0) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
  return NextResponse.json({ updated: true });
}
