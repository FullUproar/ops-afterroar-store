import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff, requirePermission, handleAuthError } from "@/lib/require-staff";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await requireStaff();

    const customer = await db.posCustomer.findFirst({
      where: { id },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const [ledger_entries, trade_ins, loyalty_entries, event_checkins, customer_notes] = await Promise.all([
      db.posLedgerEntry.findMany({
        where: { customer_id: id },
        orderBy: { created_at: "desc" },
        take: 50,
      }),
      db.posTradeIn.findMany({
        where: { customer_id: id },
        orderBy: { created_at: "desc" },
        take: 50,
        include: {
          items: { select: { name: true, offer_price_cents: true, market_price_cents: true, quantity: true } },
        },
      }),
      db.posLoyaltyEntry.findMany({
        where: { customer_id: id },
        orderBy: { created_at: "desc" },
        take: 50,
      }),
      // Event attendance history
      db.posEventCheckin.findMany({
        where: { customer_id: id },
        orderBy: { checked_in_at: "desc" },
        take: 50,
        include: {
          event: { select: { name: true, event_type: true, starts_at: true } },
        },
      }),
      // Customer notes
      db.posCustomerNote.findMany({
        where: { customer_id: id },
        orderBy: { created_at: "desc" },
        take: 50,
      }),
    ]);

    // Derive format tags from event types
    const formatSet = new Set<string>();
    for (const ci of event_checkins) {
      if (ci.event?.event_type) formatSet.add(ci.event.event_type);
    }

    return NextResponse.json({
      ...customer,
      formats: [...formatSet],
      ledger_entries,
      trade_ins,
      loyalty_entries,
      event_checkins: event_checkins.map((ci) => ({
        id: ci.id,
        event_name: ci.event?.name,
        event_type: ci.event?.event_type,
        checked_in_at: ci.checked_in_at,
        fee_paid: ci.fee_paid,
      })),
      customer_notes,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await requireStaff();

    const body = await request.json();

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.email !== undefined) updates.email = body.email;
    if (body.phone !== undefined) updates.phone = body.phone;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.tags !== undefined) updates.tags = body.tags;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const data = await db.posCustomer.update({
      where: { id },
      data: updates,
    });

    return NextResponse.json(data);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { staff, storeId, db } = await requireStaff();

    const body = await request.json();

    // Verify customer belongs to this store before modifying
    const customer = await db.posCustomer.findFirst({
      where: { id },
    });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    if (body.action === "adjust_credit") {
      // Require customers.credit permission for credit adjustments
      const ctx = await requirePermission("customers.credit");

      const { amount_cents, description } = body;
      if (!amount_cents || typeof amount_cents !== "number") {
        return NextResponse.json(
          { error: "amount_cents is required and must be a number" },
          { status: 400 }
        );
      }

      // Cap single adjustment at $500 — larger adjustments require manager approval
      if (Math.abs(amount_cents) > 50000) {
        return NextResponse.json(
          { error: "Adjustment exceeds $500 limit — manager approval required" },
          { status: 403 }
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        await tx.posLedgerEntry.create({
          data: {
            store_id: storeId,
            customer_id: id,
            type: amount_cents > 0 ? "credit_issue" : "credit_deduct",
            amount_cents,
            description: description || null,
          },
        });

        return tx.posCustomer.update({
          where: { id, store_id: storeId },
          data: {
            credit_balance_cents: { increment: amount_cents },
          },
        });
      });

      return NextResponse.json(updated);
    }

    if (body.action === "adjust_loyalty") {
      const { points, description } = body;
      if (!points || typeof points !== "number") {
        return NextResponse.json(
          { error: "points is required and must be a number" },
          { status: 400 }
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        const updatedCustomer = await tx.posCustomer.update({
          where: { id, store_id: storeId },
          data: { loyalty_points: { increment: points } },
          select: { loyalty_points: true },
        });

        await tx.posLoyaltyEntry.create({
          data: {
            store_id: storeId,
            customer_id: id,
            type: "adjust",
            points,
            balance_after: updatedCustomer.loyalty_points,
            description: description || `Manual adjustment: ${points > 0 ? '+' : ''}${points}`,
          },
        });

        return updatedCustomer;
      });

      return NextResponse.json(updated);
    }

    if (body.action === "add_note") {
      const { content } = body;
      if (!content?.trim()) {
        return NextResponse.json({ error: "Note content is required" }, { status: 400 });
      }

      const note = await db.posCustomerNote.create({
        data: {
          store_id: storeId,
          customer_id: id,
          staff_name: staff.name,
          content: content.trim(),
        },
      });

      return NextResponse.json(note, { status: 201 });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return handleAuthError(error);
  }
}
