import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

export async function GET(request: NextRequest) {
  try {
    const { storeId, db } = await requireStaff();

    const url = request.nextUrl;
    const q = url.searchParams.get("q")?.trim() || "";
    const customerId = url.searchParams.get("customer_id") || "";
    const dateStr = url.searchParams.get("date") || "";
    const type = url.searchParams.get("type") || "";
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20", 10), 1), 100);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10), 0);

    // Build where clause
    const where: Record<string, unknown> = {
      store_id: storeId,
    };

    // Type filter
    if (type) {
      where.type = type;
    } else {
      // Default: show meaningful transaction types
      where.type = { in: ["sale", "trade_in", "refund", "void", "event_fee", "gift_card_sale"] };
    }

    // Customer filter
    if (customerId) {
      where.customer_id = customerId;
    }

    // Date filter
    if (dateStr) {
      const date = new Date(dateStr + "T00:00:00");
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      where.created_at = {
        gte: date,
        lt: nextDay,
      };
    }

    // Text/amount search
    if (q) {
      // Check if query looks like a dollar amount (e.g. "$25", "25.67", "$25.67")
      const amountMatch = q.match(/^\$?(\d+(?:\.\d{0,2})?)$/);
      if (amountMatch) {
        const amountCents = Math.round(parseFloat(amountMatch[1]) * 100);
        // Search within +/- $1 range
        const rangeCents = 100;
        where.amount_cents = {
          gte: Math.max(0, amountCents - rangeCents),
          lte: amountCents + rangeCents,
        };
      } else {
        // Text search on description or customer name via OR
        where.OR = [
          { description: { contains: q, mode: "insensitive" } },
          { customer: { name: { contains: q, mode: "insensitive" } } },
        ];
      }
    }

    const [entries, total] = await Promise.all([
      db.posLedgerEntry.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, email: true } },
          staff: { select: { id: true, name: true } },
        },
        orderBy: { created_at: "desc" },
        take: limit,
        skip: offset,
      }),
      db.posLedgerEntry.count({ where }),
    ]);

    const transactions = entries.map((entry) => {
      const meta = (entry.metadata ?? {}) as Record<string, unknown>;
      return {
        id: entry.id,
        type: entry.type,
        amount_cents: entry.amount_cents,
        credit_amount_cents: entry.credit_amount_cents,
        description: entry.description,
        customer_name: entry.customer?.name ?? null,
        customer_id: entry.customer?.id ?? null,
        customer_email: entry.customer?.email ?? null,
        staff_name: entry.staff?.name ?? null,
        payment_method: (meta.payment_method as string) ?? null,
        metadata: meta,
        created_at: entry.created_at.toISOString(),
      };
    });

    return NextResponse.json({ transactions, total, limit, offset });
  } catch (error) {
    return handleAuthError(error);
  }
}
