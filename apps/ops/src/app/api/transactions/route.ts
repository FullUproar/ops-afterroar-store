import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

export async function GET(request: NextRequest) {
  try {
    const { storeId, db } = await requireStaff();

    const url = request.nextUrl;
    const q = url.searchParams.get("q")?.trim() || "";
    const customerId = url.searchParams.get("customer_id") || "";
    const dateStr = url.searchParams.get("date") || "";
    const fromStr = url.searchParams.get("from") || "";
    const toStr = url.searchParams.get("to") || "";
    const type = url.searchParams.get("type") || "";
    const staffId = url.searchParams.get("staff_id") || "";
    const paymentMethod = url.searchParams.get("payment_method") || "";
    const sourceFilter = url.searchParams.get("source") || ""; // 'register' | 'online' | ''
    const format = url.searchParams.get("format") || "json"; // 'json' | 'csv'
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") || "20", 10), 1),
      format === "csv" ? 5000 : 100,
    );
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

    // Staff filter
    if (staffId) {
      where.staff_id = staffId;
    }

    // Date filter — `date=` (single day) OR `from=`/`to=` (range, both optional)
    if (dateStr) {
      const date = new Date(dateStr + "T00:00:00");
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      where.created_at = {
        gte: date,
        lt: nextDay,
      };
    } else if (fromStr || toStr) {
      const range: Record<string, Date> = {};
      if (fromStr) range.gte = new Date(fromStr + "T00:00:00");
      if (toStr) {
        const toDate = new Date(toStr + "T00:00:00");
        toDate.setDate(toDate.getDate() + 1);
        range.lt = toDate;
      }
      where.created_at = range;
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

    let transactions = entries.map((entry) => {
      const meta = (entry.metadata ?? {}) as Record<string, unknown>;
      const itemArr = Array.isArray(meta.items) ? (meta.items as Array<Record<string, unknown>>) : [];
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
        payment_method: ((meta.payment_method ?? meta.paymentMethod) as string) ?? null,
        // 'register' if this came from the offline register sync; 'online' otherwise.
        source: meta.source === "register_offline" ? "register" : "online",
        item_count: itemArr.length,
        metadata: meta,
        created_at: entry.created_at.toISOString(),
      };
    });

    if (paymentMethod) {
      transactions = transactions.filter((t) => t.payment_method === paymentMethod);
    }
    if (sourceFilter) {
      transactions = transactions.filter((t) => t.source === sourceFilter);
    }

    if (format === "csv") {
      const headers = [
        "Date",
        "Type",
        "Source",
        "Staff",
        "Customer",
        "Items",
        "Payment",
        "Amount",
        "Description",
      ];
      const escape = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [headers.join(",")];
      for (const t of transactions) {
        lines.push(
          [
            t.created_at,
            t.type,
            t.source,
            t.staff_name ?? "",
            t.customer_name ?? "",
            t.item_count,
            t.payment_method ?? "",
            (t.amount_cents / 100).toFixed(2),
            t.description ?? "",
          ]
            .map(escape)
            .join(","),
        );
      }
      return new NextResponse(lines.join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="sales-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({ transactions, total, limit, offset });
  } catch (error) {
    return handleAuthError(error);
  }
}
