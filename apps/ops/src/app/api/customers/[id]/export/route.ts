import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/customers/[id]/export                                     */
/*  GDPR/CCPA data export — right to portability                       */
/* ------------------------------------------------------------------ */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { db } = await requirePermission("customers.view");

    // Fetch customer record
    const customer = await db.posCustomer.findFirst({ where: { id } });
    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    // Gather all related data in parallel
    const [
      ledgerEntries,
      loyaltyEntries,
      eventCheckins,
      tradeIns,
      giftCards,
      orders,
      customerNotes,
      tabs,
      consignmentItems,
      preorders,
      gameCheckouts,
      tournamentPlayers,
    ] = await Promise.all([
      db.posLedgerEntry.findMany({
        where: { customer_id: id },
        orderBy: { created_at: "desc" },
      }),
      db.posLoyaltyEntry.findMany({
        where: { customer_id: id },
        orderBy: { created_at: "desc" },
      }),
      db.posEventCheckin.findMany({
        where: { customer_id: id },
        orderBy: { checked_in_at: "desc" },
        include: {
          event: {
            select: { name: true, event_type: true, starts_at: true },
          },
        },
      }),
      db.posTradeIn.findMany({
        where: { customer_id: id },
        orderBy: { created_at: "desc" },
        include: {
          items: {
            select: {
              name: true,
              offer_price_cents: true,
              market_price_cents: true,
              quantity: true,
            },
          },
        },
      }),
      db.posGiftCard.findMany({
        where: { purchased_by_customer_id: id },
        select: {
          id: true,
          code: true,
          initial_balance_cents: true,
          balance_cents: true,
          created_at: true,
        },
      }),
      db.posOrder.findMany({
        where: { customer_id: id },
        orderBy: { created_at: "desc" },
        include: {
          items: {
            select: {
              id: true,
              name: true,
              quantity: true,
              price_cents: true,
              total_cents: true,
            },
          },
        },
      }),
      db.posCustomerNote.findMany({
        where: { customer_id: id },
        orderBy: { created_at: "desc" },
      }),
      db.posTab.findMany({
        where: { customer_id: id },
        orderBy: { opened_at: "desc" },
        select: {
          id: true,
          table_label: true,
          status: true,
          total_cents: true,
          opened_at: true,
          closed_at: true,
        },
      }),
      db.posConsignmentItem.findMany({
        where: { consignor_id: id },
        orderBy: { listed_at: "desc" },
        select: {
          id: true,
          asking_price_cents: true,
          commission_percent: true,
          status: true,
          listed_at: true,
          sold_at: true,
          payout_cents: true,
        },
      }),
      db.posPreorder.findMany({
        where: { customer_id: id },
        orderBy: { created_at: "desc" },
      }),
      db.posGameCheckout.findMany({
        where: { customer_id: id },
        orderBy: { checked_out_at: "desc" },
      }),
      db.posTournamentPlayer.findMany({
        where: { customer_id: id },
        orderBy: { created_at: "desc" },
        include: {
          tournament: {
            select: { name: true, format: true, created_at: true },
          },
        },
      }),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        credit_balance_cents: customer.credit_balance_cents,
        loyalty_points: customer.loyalty_points,
        notes: customer.notes,
        tags: customer.tags,
        afterroar_user_id: customer.afterroar_user_id,
        created_at: customer.created_at,
        updated_at: customer.updated_at,
      },
      purchase_history: ledgerEntries,
      loyalty_points_history: loyaltyEntries,
      event_attendance: eventCheckins.map((ci) => ({
        id: ci.id,
        event_name: ci.event?.name,
        event_type: ci.event?.event_type,
        checked_in_at: ci.checked_in_at,
        fee_paid: ci.fee_paid,
      })),
      trade_in_history: tradeIns,
      gift_cards_purchased: giftCards,
      orders,
      notes: customerNotes,
      cafe_tabs: tabs,
      consignment_items: consignmentItems,
      preorders,
      game_checkouts: gameCheckouts,
      tournament_history: tournamentPlayers,
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="customer-data-${id}.json"`,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
