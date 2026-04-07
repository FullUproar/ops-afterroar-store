import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff, requirePermission, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/gift-cards/[code] — look up a gift card by code           */
/* ------------------------------------------------------------------ */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { db, storeId } = await requireStaff();
    const { code } = await params;

    const card = await db.posGiftCard.findFirst({
      where: { store_id: storeId, code: code.toUpperCase() },
    });

    if (!card) {
      return NextResponse.json(
        { error: "Gift card not found" },
        { status: 404 }
      );
    }

    // Get transaction history
    const history = await db.posLedgerEntry.findMany({
      where: {
        store_id: storeId,
        type: { in: ["gift_card_sale", "gift_card_redeem"] },
        metadata: { path: ["code"], equals: code.toUpperCase() },
      },
      orderBy: { created_at: "desc" },
      take: 50,
    });

    return NextResponse.json({ ...card, history });
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/gift-cards/[code] — redeem gift card (deduct balance)    */
/* ------------------------------------------------------------------ */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { staff, storeId, db } = await requirePermission("checkout");
    const { code } = await params;

    let body: { amount_cents: number; customer_id?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.amount_cents || body.amount_cents <= 0) {
      return NextResponse.json(
        { error: "amount_cents must be positive" },
        { status: 400 }
      );
    }

    const card = await db.posGiftCard.findFirst({
      where: { store_id: storeId, code: code.toUpperCase(), active: true },
    });

    if (!card) {
      return NextResponse.json(
        { error: "Gift card not found or inactive" },
        { status: 404 }
      );
    }

    if (card.balance_cents < body.amount_cents) {
      return NextResponse.json(
        {
          error: `Insufficient balance. Card has ${card.balance_cents} cents, requested ${body.amount_cents}`,
        },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.posGiftCard.update({
        where: { id: card.id },
        data: { balance_cents: { decrement: body.amount_cents } },
      });

      await tx.posLedgerEntry.create({
        data: {
          store_id: storeId,
          type: "gift_card_redeem",
          staff_id: staff.id,
          customer_id: body.customer_id ?? null,
          amount_cents: -body.amount_cents,
          description: `Gift card redeemed: ${code.toUpperCase()}`,
          metadata: {
            gift_card_id: card.id,
            code: code.toUpperCase(),
            amount_redeemed_cents: body.amount_cents,
            remaining_balance_cents: updated.balance_cents,
          },
        },
      });

      return updated;
    });

    return NextResponse.json({
      success: true,
      remaining_balance_cents: result.balance_cents,
      amount_redeemed_cents: body.amount_cents,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
