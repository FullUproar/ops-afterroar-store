import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { calculateTradeInPoints, earnPoints } from "@/lib/loyalty";
import { opLog } from "@/lib/op-log";
import { formatCents } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  GET /api/trade-ins — list trade-ins for store                     */
/* ------------------------------------------------------------------ */
export async function GET() {
  try {
    const { db } = await requireStaff();

    const data = await db.posTradeIn.findMany({
      orderBy: { created_at: "desc" },
      take: 100,
      include: {
        customer: { select: { name: true } },
        _count: { select: { items: true } },
      },
    });

    const rows = data.map((ti) => ({
      id: ti.id,
      created_at: ti.created_at,
      customer_name: ti.customer?.name ?? "Unknown",
      item_count: ti._count.items,
      total_offer_cents: ti.total_offer_cents,
      total_payout_cents: ti.total_payout_cents,
      payout_type: ti.payout_type,
      status: ti.status,
    }));

    return NextResponse.json(rows);
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/trade-ins — create a new trade-in                       */
/* ------------------------------------------------------------------ */

interface TradeInItemInput {
  name: string;
  category: string;
  attributes: Record<string, unknown>;
  quantity: number;
  market_price_cents: number;
  offer_price_cents: number;
}

interface CreateTradeInBody {
  customer_id: string;
  items: TradeInItemInput[];
  payout_type: "cash" | "credit";
  credit_bonus_percent: number;
  notes: string | null;
  client_tx_id?: string; // Idempotency key for offline queue
}

export async function POST(request: NextRequest) {
  try {
    const { staff, storeId, db } = await requireStaff();

    let body: CreateTradeInBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { customer_id, items, payout_type, credit_bonus_percent, notes, client_tx_id } = body;

    // Idempotency: if this transaction was already processed, return the existing result
    if (client_tx_id) {
      const existing = await db.posLedgerEntry.findFirst({
        where: {
          store_id: storeId, // Explicit defense-in-depth (tenant-prisma also injects)
          type: "trade_in",
          metadata: { path: ["client_tx_id"], equals: client_tx_id },
        },
      });
      if (existing) {
        return NextResponse.json({ id: existing.id, deduplicated: true });
      }
    }

    if (!customer_id || !items?.length) {
      return NextResponse.json(
        { error: "customer_id and at least one item are required" },
        { status: 400 }
      );
    }

    // Calculate totals
    const total_offer_cents = items.reduce(
      (sum, i) => sum + i.offer_price_cents * i.quantity,
      0
    );

    const total_payout_cents =
      payout_type === "credit"
        ? Math.round(total_offer_cents * (1 + (credit_bonus_percent || 0) / 100))
        : total_offer_cents;

    // Use transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Create trade-in record
      const tradeIn = await tx.posTradeIn.create({
        data: {
          store_id: storeId,
          customer_id,
          staff_id: staff.id,
          total_offer_cents,
          total_payout_cents,
          payout_type,
          credit_bonus_percent: credit_bonus_percent || 0,
          status: "completed",
          notes,
          completed_at: new Date(),
        },
      });

      // Create trade-in items
      await tx.posTradeInItem.createMany({
        data: items.map((i) => ({
          trade_in_id: tradeIn.id,
          name: i.name,
          category: i.category,
          attributes: i.attributes as Record<string, string>,
          quantity: i.quantity,
          market_price_cents: i.market_price_cents,
          offer_price_cents: i.offer_price_cents,
        })),
      });

      // Create ledger entry (negative amount = cash going out)
      await tx.posLedgerEntry.create({
        data: {
          store_id: storeId,
          type: "trade_in",
          amount_cents: -total_payout_cents,
          description: `Trade-in: ${items.length} item(s) — ${payout_type}`,
          customer_id,
          staff_id: staff.id,
          metadata: JSON.parse(JSON.stringify({
            ...(client_tx_id ? { client_tx_id } : {}),
          })),
        },
      });

      // If store credit, update customer credit balance (scoped by store)
      if (payout_type === "credit") {
        await tx.posCustomer.update({
          where: { id: customer_id, store_id: storeId },
          data: {
            credit_balance_cents: { increment: total_payout_cents },
          },
        });
      }

      // Earn loyalty points for trade-in
      const storeRecord = await tx.posStore.findUnique({
        where: { id: storeId },
        select: { settings: true },
      });
      const tradeInPoints = calculateTradeInPoints(
        storeRecord?.settings as Record<string, unknown> ?? null
      );
      if (tradeInPoints > 0 && customer_id) {
        await earnPoints(tx, {
          storeId,
          customerId: customer_id,
          type: "earn_trade_in",
          points: tradeInPoints,
          description: `Trade-in bonus: ${items.length} item(s)`,
          referenceId: tradeIn.id,
        });
      }

      return tradeIn;
    });

    opLog({
      storeId,
      eventType: "trade_in.complete",
      message: `Trade-in ${formatCents(total_payout_cents)} · ${items.length} item(s) · ${payout_type} · ${staff.name}`,
      metadata: {
        trade_in_id: result.id,
        total_offer_cents,
        total_payout_cents,
        payout_type,
        item_count: items.length,
        customer_id,
      },
      staffName: staff.name,
      userId: staff.user_id,
    });

    return NextResponse.json(
      { id: result.id, total_offer_cents, total_payout_cents },
      { status: 201 }
    );
  } catch (error) {
    return handleAuthError(error);
  }
}
