/**
 * POST /api/register/email-receipt
 *
 * Register-side receipt sender. The register passes inline receipt data
 * (so it works whether or not the sale event has synced yet) plus the
 * destination email. We render the same template the dashboard uses and
 * fire it through Resend.
 *
 * Auth: API key with `register:write` scope.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiKey } from "@/lib/api-middleware";
import { resolveRegisterStoreId } from "@/lib/register-auth";
import {
  buildEmailReceiptHtml,
  buildReceiptConfig,
  type ReceiptData,
} from "@/lib/receipt-template";

interface ReceiptItem {
  name: string;
  quantity: number;
  price_cents: number;
}

interface RequestBody {
  email: string;
  items: ReceiptItem[];
  subtotal_cents: number;
  discount_cents?: number;
  tax_cents?: number;
  total_cents: number;
  payment_method: "cash" | "card" | "store_credit";
  customer_name?: string | null;
  staff_name?: string | null;
  receipt_number?: string;
  date?: string;
}

export const POST = withApiKey<Record<string, never>>(async (req, { apiKey }) => {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "Email service not configured (RESEND_API_KEY missing)" },
      { status: 503 },
    );
  }

  const storeId = await resolveRegisterStoreId(apiKey);
  if (!storeId) {
    return NextResponse.json({ error: "API key has no associated store" }, { status: 403 });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.email?.trim()) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  if (!body.items?.length || typeof body.total_cents !== "number") {
    return NextResponse.json({ error: "items and total_cents are required" }, { status: 400 });
  }

  const store = await prisma.posStore.findUnique({
    where: { id: storeId },
    select: { name: true, settings: true },
  });
  const settings = (store?.settings ?? {}) as Record<string, unknown>;
  const config = buildReceiptConfig(store?.name ?? "Store", settings);

  const items = body.items.map((i) => ({
    name: i.name,
    quantity: i.quantity,
    price_cents: i.price_cents,
    total_cents: i.quantity * i.price_cents,
  }));

  const receiptData: ReceiptData = {
    receipt_number: body.receipt_number ?? `R-${Date.now().toString(36).toUpperCase()}`,
    receipt_token: null,
    date: body.date ?? new Date().toISOString(),
    items,
    subtotal_cents: body.subtotal_cents,
    tax_cents: body.tax_cents ?? 0,
    discount_cents: body.discount_cents ?? 0,
    credit_applied_cents: 0,
    gift_card_applied_cents: 0,
    loyalty_discount_cents: 0,
    total_cents: body.total_cents,
    payment_method: body.payment_method,
    amount_tendered_cents: 0,
    change_cents: 0,
    card_brand: null,
    card_last4: null,
    customer_name: body.customer_name ?? null,
    loyalty_points_earned: 0,
    loyalty_balance: 0,
    staff_name: body.staff_name ?? null,
  };

  const html = buildEmailReceiptHtml(config, receiptData);

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "receipts@afterroar.store",
      to: body.email.trim(),
      subject: `Receipt from ${config.store_name}`,
      html,
    }),
  });
  if (!resendRes.ok) {
    const errText = await resendRes.text();
    console.error("Resend error:", errText);
    return NextResponse.json({ error: "Failed to send" }, { status: 502 });
  }

  return NextResponse.json({ success: true, sentTo: body.email.trim() });
}, "register:write");
