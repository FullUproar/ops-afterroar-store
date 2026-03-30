import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Customer self-service info capture from receipt page.
 * No auth required — the receipt token IS the auth.
 *
 * POST /api/r/[token]/capture
 * Body: { email: string } or { phone: string }
 *
 * - Looks up receipt by token to get store_id
 * - Finds or creates a pos_customer with that email/phone
 * - Links customer to the ledger entry (adds customer_id to metadata)
 * - Sends receipt email via Resend (if configured)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token || token.length < 6 || token.length > 12) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  let body: { email?: string; phone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const phone = body.phone?.trim();

  if (!email && !phone) {
    return NextResponse.json({ error: "email or phone is required" }, { status: 400 });
  }

  // Basic email validation
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  // Basic phone validation (at least 7 digits)
  if (phone && phone.replace(/\D/g, "").length < 7) {
    return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
  }

  // Look up receipt
  const entry = await prisma.posLedgerEntry.findFirst({
    where: {
      type: "sale",
      metadata: { path: ["receipt_token"], equals: token },
    },
    include: {
      store: { select: { name: true, settings: true } },
    },
  });

  if (!entry) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  const storeId = entry.store_id;

  // Find or create customer
  let customer = email
    ? await prisma.posCustomer.findFirst({ where: { store_id: storeId, email } })
    : phone
    ? await prisma.posCustomer.findFirst({ where: { store_id: storeId, phone } })
    : null;

  if (!customer) {
    customer = await prisma.posCustomer.create({
      data: {
        store_id: storeId,
        name: email ? email.split("@")[0] : `Customer ${phone}`,
        email: email || null,
        phone: phone || null,
      },
    });
  } else {
    // Update missing fields
    const updates: Record<string, string> = {};
    if (email && !customer.email) updates.email = email;
    if (phone && !customer.phone) updates.phone = phone;
    if (Object.keys(updates).length > 0) {
      await prisma.posCustomer.update({
        where: { id: customer.id },
        data: updates,
      });
    }
  }

  // Link customer to ledger entry if not already linked
  if (!entry.customer_id) {
    await prisma.posLedgerEntry.update({
      where: { id: entry.id },
      data: { customer_id: customer.id },
    });
  }

  // Send receipt email if email was provided
  if (email && process.env.RESEND_API_KEY) {
    const meta = (entry.metadata ?? {}) as Record<string, unknown>;
    const items = (meta.items as Array<{
      inventory_item_id?: string;
      quantity?: number;
      price_cents?: number;
    }>) ?? [];

    // Resolve item names
    const itemIds = items.map((i) => i.inventory_item_id).filter((id): id is string => !!id);
    const invItems = itemIds.length > 0
      ? await prisma.posInventoryItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true } })
      : [];
    const nameMap = new Map(invItems.map((i) => [i.id, i.name]));

    const storeSettings = (entry.store?.settings ?? {}) as Record<string, unknown>;
    const storeName = (storeSettings.store_display_name as string) || entry.store?.name || "Store";

    const taxCents = (meta.tax_cents as number) ?? 0;
    const totalCents = entry.amount_cents + taxCents;
    const paymentMethod = (meta.payment_method as string) ?? "unknown";

    const itemLines = items.map((i) => {
      const qty = i.quantity ?? 1;
      const price = i.price_cents ?? 0;
      const name = (i.inventory_item_id ? nameMap.get(i.inventory_item_id) : null) || "Item";
      return `<tr><td style="padding:4px 0;color:#333;">${name}${qty > 1 ? ` x${qty}` : ""}</td><td style="padding:4px 0;text-align:right;color:#333;">$${(price * qty / 100).toFixed(2)}</td></tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:500px;margin:0 auto;padding:20px;background:#fff;">
      <div style="text-align:center;margin-bottom:20px;"><h1 style="font-size:20px;color:#111;margin:0;">${storeName}</h1><p style="color:#666;font-size:14px;margin:4px 0;">${entry.created_at.toLocaleString()}</p></div>
      <hr style="border:none;border-top:1px dashed #ccc;margin:16px 0;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">${itemLines}</table>
      <hr style="border:none;border-top:1px dashed #ccc;margin:16px 0;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:4px 0;color:#666;">Subtotal</td><td style="padding:4px 0;text-align:right;color:#333;">$${(entry.amount_cents / 100).toFixed(2)}</td></tr>
        ${taxCents > 0 ? `<tr><td style="padding:4px 0;color:#666;">Tax</td><td style="padding:4px 0;text-align:right;color:#333;">$${(taxCents / 100).toFixed(2)}</td></tr>` : ""}
        <tr><td style="padding:4px 0;color:#666;">Payment</td><td style="padding:4px 0;text-align:right;color:#333;">${paymentMethod === "cash" ? "Cash" : paymentMethod === "card" ? "Card" : paymentMethod}</td></tr>
        <tr style="border-top:1px solid #ddd;"><td style="padding:8px 0;font-weight:bold;font-size:16px;color:#111;">Total</td><td style="padding:8px 0;text-align:right;font-weight:bold;font-size:16px;color:#111;">$${(totalCents / 100).toFixed(2)}</td></tr>
      </table>
      <hr style="border:none;border-top:1px dashed #ccc;margin:16px 0;">
      <p style="text-align:center;color:#999;font-size:12px;">Thank you for shopping at ${storeName}!</p>
    </body></html>`;

    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "receipts@afterroar.store",
          to: email,
          subject: `Receipt from ${storeName}`,
          html,
        }),
      });
    } catch (err) {
      console.error("Failed to send receipt email:", err);
    }
  }

  return NextResponse.json({
    success: true,
    customer_id: customer.id,
    method: email ? "email" : "phone",
  });
}
