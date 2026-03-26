import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff, requirePermission, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/drawer — get current open drawer session for the store    */
/* ------------------------------------------------------------------ */
export async function GET() {
  try {
    const { storeId } = await requireStaff();

    // Find the most recent drawer_open that doesn't have a matching drawer_close
    const lastOpen = await prisma.posLedgerEntry.findFirst({
      where: { store_id: storeId, type: "drawer_open" },
      orderBy: { created_at: "desc" },
    });

    if (!lastOpen) {
      return NextResponse.json({ open: false, session: null });
    }

    // Check if there's a drawer_close after it
    const closeAfter = await prisma.posLedgerEntry.findFirst({
      where: {
        store_id: storeId,
        type: "drawer_close",
        created_at: { gte: lastOpen.created_at },
      },
    });

    if (closeAfter) {
      return NextResponse.json({ open: false, session: null, last_close: closeAfter });
    }

    // Drawer is open — count sales during session
    const salesDuringSession = await prisma.posLedgerEntry.findMany({
      where: {
        store_id: storeId,
        type: "sale",
        created_at: { gte: lastOpen.created_at },
      },
    });

    const meta = lastOpen.metadata as Record<string, unknown>;
    const staffName = meta.staff_name as string || "Unknown";

    // Calculate expected cash from sales
    let expectedCashCents = (meta.opening_amount_cents as number) || 0;
    let totalSalesCents = 0;
    let cashSalesCents = 0;
    let cardSalesCents = 0;
    let creditSalesCents = 0;

    for (const sale of salesDuringSession) {
      const saleMeta = sale.metadata as Record<string, unknown>;
      const paymentMethod = saleMeta.payment_method as string;
      totalSalesCents += sale.amount_cents;
      if (paymentMethod === "cash" || paymentMethod === "split") {
        // For split, approximate: amount_cents - credit applied goes to cash
        const creditApplied = sale.credit_amount_cents || 0;
        const cashPortion = sale.amount_cents - creditApplied;
        cashSalesCents += cashPortion;
        expectedCashCents += cashPortion;
      } else if (paymentMethod === "card") {
        cardSalesCents += sale.amount_cents;
      } else if (paymentMethod === "store_credit") {
        creditSalesCents += sale.amount_cents;
      }
    }

    return NextResponse.json({
      open: true,
      session: {
        id: lastOpen.id,
        opened_at: lastOpen.created_at,
        opened_by: staffName,
        opening_amount_cents: (meta.opening_amount_cents as number) || 0,
        sale_count: salesDuringSession.length,
        total_sales_cents: totalSalesCents,
        cash_sales_cents: cashSalesCents,
        card_sales_cents: cardSalesCents,
        credit_sales_cents: creditSalesCents,
        expected_cash_cents: expectedCashCents,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/drawer — open drawer                                     */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    const { staff, storeId } = await requirePermission("checkout");

    let body: { opening_amount_cents: number };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // Check if a drawer is already open
    const lastOpen = await prisma.posLedgerEntry.findFirst({
      where: { store_id: storeId, type: "drawer_open" },
      orderBy: { created_at: "desc" },
    });

    if (lastOpen) {
      const closeAfter = await prisma.posLedgerEntry.findFirst({
        where: {
          store_id: storeId,
          type: "drawer_close",
          created_at: { gte: lastOpen.created_at },
        },
      });

      if (!closeAfter) {
        return NextResponse.json(
          { error: "A drawer is already open. Close it before opening a new one." },
          { status: 400 }
        );
      }
    }

    const entry = await prisma.posLedgerEntry.create({
      data: {
        store_id: storeId,
        type: "drawer_open",
        staff_id: staff.id,
        amount_cents: body.opening_amount_cents || 0,
        description: `Drawer opened by ${staff.name}`,
        metadata: {
          opening_amount_cents: body.opening_amount_cents || 0,
          staff_name: staff.name,
        },
      },
    });

    return NextResponse.json({ success: true, entry }, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  PATCH /api/drawer — close drawer                                   */
/* ------------------------------------------------------------------ */
export async function PATCH(request: NextRequest) {
  try {
    const { staff, storeId } = await requirePermission("checkout");

    let body: {
      closing_amount_cents: number;
      denominations?: Record<string, number>;
      notes?: string;
      blind_close?: boolean;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // Find the open drawer
    const lastOpen = await prisma.posLedgerEntry.findFirst({
      where: { store_id: storeId, type: "drawer_open" },
      orderBy: { created_at: "desc" },
    });

    if (!lastOpen) {
      return NextResponse.json({ error: "No drawer is open" }, { status: 400 });
    }

    const closeAfter = await prisma.posLedgerEntry.findFirst({
      where: {
        store_id: storeId,
        type: "drawer_close",
        created_at: { gte: lastOpen.created_at },
      },
    });

    if (closeAfter) {
      return NextResponse.json({ error: "Drawer is already closed" }, { status: 400 });
    }

    // Calculate expected cash
    const salesDuringSession = await prisma.posLedgerEntry.findMany({
      where: {
        store_id: storeId,
        type: "sale",
        created_at: { gte: lastOpen.created_at },
      },
    });

    const openMeta = lastOpen.metadata as Record<string, unknown>;
    let expectedCashCents = (openMeta.opening_amount_cents as number) || 0;
    let totalSalesCents = 0;
    let cashSalesCents = 0;
    let cardSalesCents = 0;
    let creditSalesCents = 0;
    let saleCount = 0;

    for (const sale of salesDuringSession) {
      const saleMeta = sale.metadata as Record<string, unknown>;
      const paymentMethod = saleMeta.payment_method as string;
      totalSalesCents += sale.amount_cents;
      saleCount++;
      if (paymentMethod === "cash" || paymentMethod === "split") {
        const creditApplied = sale.credit_amount_cents || 0;
        const cashPortion = sale.amount_cents - creditApplied;
        cashSalesCents += cashPortion;
        expectedCashCents += cashPortion;
      } else if (paymentMethod === "card") {
        cardSalesCents += sale.amount_cents;
      } else if (paymentMethod === "store_credit") {
        creditSalesCents += sale.amount_cents;
      }
    }

    const varianceCents = body.closing_amount_cents - expectedCashCents;

    const closeEntry = await prisma.posLedgerEntry.create({
      data: {
        store_id: storeId,
        type: "drawer_close",
        staff_id: staff.id,
        amount_cents: body.closing_amount_cents,
        description: `Drawer closed by ${staff.name}`,
        metadata: {
          opening_amount_cents: (openMeta.opening_amount_cents as number) || 0,
          closing_amount_cents: body.closing_amount_cents,
          expected_cash_cents: expectedCashCents,
          variance_cents: varianceCents,
          denominations: body.denominations ?? null,
          notes: body.notes ?? null,
          sale_count: saleCount,
          total_sales_cents: totalSalesCents,
          cash_sales_cents: cashSalesCents,
          card_sales_cents: cardSalesCents,
          credit_sales_cents: creditSalesCents,
          opened_at: lastOpen.created_at.toISOString(),
          opened_by: String(openMeta.staff_name ?? "Unknown"),
          closed_by: staff.name,
          drawer_open_id: lastOpen.id,
        },
      },
    });

    return NextResponse.json({
      success: true,
      entry: closeEntry,
      z_report: {
        opened_at: lastOpen.created_at,
        closed_at: closeEntry.created_at,
        opened_by: openMeta.staff_name,
        closed_by: staff.name,
        opening_amount_cents: (openMeta.opening_amount_cents as number) || 0,
        closing_amount_cents: body.closing_amount_cents,
        expected_cash_cents: expectedCashCents,
        variance_cents: varianceCents,
        sale_count: saleCount,
        total_sales_cents: totalSalesCents,
        cash_sales_cents: cashSalesCents,
        card_sales_cents: cardSalesCents,
        credit_sales_cents: creditSalesCents,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
