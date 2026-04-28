/**
 * POST /api/sales/[id]/email-receipt
 *
 * Email a receipt for a single sale ledger entry. Source of truth is the
 * existing pos_ledger_entries.metadata blob — same shape the register and
 * /dashboard/checkout already write.
 *
 * Auth: session-based (any staff with checkout access).
 * Body: { email: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import {
  buildEmailReceiptHtml,
  buildReceiptConfig,
  type ReceiptData,
} from "@/lib/receipt-template";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: saleId } = await ctx.params;
  try {
    const { db, storeId } = await requireStaff();

    let body: { email?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const email = body.email?.trim();
    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    const entry = await db.posLedgerEntry.findFirst({
      where: { id: saleId, store_id: storeId },
      include: {
        staff: { select: { name: true } },
        customer: { select: { name: true, email: true } },
      },
    });
    if (!entry) {
      return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    }

    const meta = (entry.metadata ?? {}) as Record<string, unknown>;
    const rawItems = (meta.items ?? []) as Array<Record<string, unknown>>;

    // Resolve item names from inventory if metadata only has IDs
    const itemIds = rawItems
      .map((i) => (i.inventory_item_id ?? i.inventoryItemId) as string | undefined)
      .filter((id): id is string => !!id);
    const invItems = itemIds.length > 0
      ? await prisma.posInventoryItem.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameMap = new Map(invItems.map((i) => [i.id, i.name]));

    const items = rawItems.map((i) => {
      const id = (i.inventory_item_id ?? i.inventoryItemId) as string | undefined;
      const name = (i.name as string) || (id ? nameMap.get(id) : undefined) || "Item";
      const quantity = (i.quantity ?? i.qty) as number;
      const price_cents = (i.price_cents ?? i.priceCents) as number;
      return {
        name,
        quantity,
        price_cents,
        total_cents: quantity * price_cents,
      };
    });

    const store = await db.posStore.findFirst({ select: { name: true, settings: true } });
    const settings = (store?.settings ?? {}) as Record<string, unknown>;
    const config = buildReceiptConfig(store?.name ?? "Store", settings);

    const subtotalCents = (meta.subtotalCents ?? meta.subtotal_cents ?? entry.amount_cents) as number;
    const discountCents = (meta.discountCents ?? meta.discount_cents ?? 0) as number;
    const taxCents = (meta.taxCents ?? meta.tax_cents ?? 0) as number;
    const totalCents = entry.amount_cents;
    const paymentMethod = (meta.paymentMethod ?? meta.payment_method ?? "card") as string;

    const receiptData: ReceiptData = {
      receipt_number: (meta.receipt_number as string) ?? entry.id.slice(-6).toUpperCase(),
      receipt_token: (meta.receipt_token as string) ?? null,
      date: entry.created_at.toISOString(),
      items,
      subtotal_cents: subtotalCents,
      tax_cents: taxCents,
      discount_cents: discountCents,
      credit_applied_cents: 0,
      gift_card_applied_cents: 0,
      loyalty_discount_cents: 0,
      total_cents: totalCents,
      payment_method: paymentMethod,
      amount_tendered_cents: 0,
      change_cents: 0,
      card_brand: null,
      card_last4: null,
      customer_name: entry.customer?.name ?? null,
      loyalty_points_earned: 0,
      loyalty_balance: 0,
      staff_name: entry.staff?.name ?? null,
    };

    const html = buildEmailReceiptHtml(config, receiptData);

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "Email service not configured (RESEND_API_KEY missing)" },
        { status: 503 },
      );
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "receipts@afterroar.store",
        to: email,
        subject: `Receipt from ${config.store_name}`,
        html,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("Resend error:", errText);
      return NextResponse.json({ error: "Failed to send" }, { status: 502 });
    }

    return NextResponse.json({ success: true, sentTo: email });
  } catch (error) {
    return handleAuthError(error);
  }
}
