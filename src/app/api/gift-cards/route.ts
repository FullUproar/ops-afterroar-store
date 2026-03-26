import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

function generateGiftCardCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0,O,1,I for readability
  let code = "";
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += "-";
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/* ------------------------------------------------------------------ */
/*  GET /api/gift-cards — list gift cards for the store                */
/* ------------------------------------------------------------------ */
export async function GET(request: NextRequest) {
  try {
    const { storeId } = await requirePermission("customers.edit");

    const search = request.nextUrl.searchParams.get("q");

    const where: Record<string, unknown> = { store_id: storeId };
    if (search) {
      where.code = { contains: search.toUpperCase(), mode: "insensitive" };
    }

    const cards = await prisma.posGiftCard.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: 100,
    });

    return NextResponse.json(cards);
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/gift-cards — create a new gift card                      */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    const { staff, storeId } = await requirePermission("customers.edit");

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

    // Generate a unique code
    let code = generateGiftCardCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await prisma.posGiftCard.findUnique({ where: { code } });
      if (!existing) break;
      code = generateGiftCardCode();
      attempts++;
    }

    const card = await prisma.$transaction(async (tx) => {
      const giftCard = await tx.posGiftCard.create({
        data: {
          store_id: storeId,
          code,
          balance_cents: body.amount_cents,
          initial_balance_cents: body.amount_cents,
          purchased_by_customer_id: body.customer_id ?? null,
        },
      });

      // Create a ledger entry for the sale
      await tx.posLedgerEntry.create({
        data: {
          store_id: storeId,
          type: "gift_card_sale",
          staff_id: staff.id,
          customer_id: body.customer_id ?? null,
          amount_cents: body.amount_cents,
          description: `Gift card sold: ${code}`,
          metadata: { gift_card_id: giftCard.id, code },
        },
      });

      return giftCard;
    });

    return NextResponse.json(card, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
