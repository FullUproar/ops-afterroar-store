import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { prisma } from "@/lib/prisma";
import { buildEmailReceiptHtml, buildReceiptConfig, type ReceiptData as TemplateReceiptData } from "@/lib/receipt-template";

interface ReceiptItem {
  name: string;
  quantity: number;
  price_cents: number;
  total_cents: number;
}

interface ReceiptData {
  store_name: string;
  date: string;
  items: ReceiptItem[];
  subtotal_cents: number;
  tax_cents?: number;
  discount_cents?: number;
  credit_applied_cents: number;
  gift_card_applied_cents?: number;
  loyalty_discount_cents?: number;
  payment_method: string;
  total_cents: number;
  change_cents: number;
  customer_name: string | null;
  card_brand?: string | null;
  card_last4?: string | null;
  receipt_number?: string;
  receipt_token?: string;
  staff_name?: string | null;
  loyalty_points_earned?: number;
  loyalty_balance?: number;
}

interface EmailReceiptBody {
  customer_email?: string;
  email?: string; // alias
  receipt?: ReceiptData;
  receipt_token?: string;
}

export async function POST(request: NextRequest) {
  try {
    await requireStaff();

    let body: EmailReceiptBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const customerEmail = body.customer_email || body.email;

    if (!customerEmail?.trim()) {
      return NextResponse.json(
        { error: "email is required" },
        { status: 400 }
      );
    }

    let receipt = body.receipt;

    // If receipt_token provided, look up the receipt from the ledger
    if (!receipt && body.receipt_token) {
      const { db } = await requireStaff();
      const entry = await db.posLedgerEntry.findFirst({
        where: { metadata: { path: ["receipt_token"], equals: body.receipt_token } },
        include: { staff: { select: { name: true } }, customer: { select: { name: true } } },
      });

      if (entry) {
        const meta = (entry.metadata ?? {}) as Record<string, unknown>;
        const items = (meta.items ?? []) as Array<{
          inventory_item_id?: string;
          name?: string;
          quantity: number;
          price_cents: number;
        }>;
        const store = await db.posStore.findFirst({ select: { name: true, settings: true } });
        const storeSettings = (store?.settings ?? {}) as Record<string, unknown>;
        const storeName = (storeSettings.store_display_name as string) || store?.name || "Store";

        // Resolve item names from inventory (items in metadata only have IDs)
        const itemIds = items
          .map((i) => i.inventory_item_id)
          .filter((id): id is string => !!id);
        const invItems = itemIds.length > 0
          ? await prisma.posInventoryItem.findMany({
              where: { id: { in: itemIds } },
              select: { id: true, name: true },
            })
          : [];
        const nameMap = new Map(invItems.map((i) => [i.id, i.name]));

        receipt = {
          store_name: storeName,
          date: entry.created_at.toISOString(),
          items: items.map((i) => {
            const name = i.name
              || (i.inventory_item_id ? nameMap.get(i.inventory_item_id) : null)
              || "Item";
            return {
              name,
              quantity: i.quantity,
              price_cents: i.price_cents,
              total_cents: i.price_cents * i.quantity,
            };
          }),
          subtotal_cents: entry.amount_cents,
          tax_cents: (meta.tax_cents as number) || 0,
          discount_cents: (meta.discount_cents as number) || 0,
          credit_applied_cents: entry.credit_amount_cents || 0,
          gift_card_applied_cents: (meta.gift_card_amount_cents as number) || 0,
          loyalty_discount_cents: (meta.loyalty_discount_cents as number) || 0,
          payment_method: (meta.payment_method as string) || "card",
          total_cents: entry.amount_cents + ((meta.tax_cents as number) || 0),
          change_cents: 0,
          customer_name: entry.customer?.name ?? null,
          staff_name: entry.staff?.name ?? null,
          receipt_number: (meta.receipt_number as string) || undefined,
          receipt_token: body.receipt_token,
        };
      }
    }

    if (!receipt) {
      return NextResponse.json(
        { error: "receipt data is required" },
        { status: 400 }
      );
    }

    // Use the shared receipt template for consistent formatting
    const { db } = await requireStaff();
    const store = await db.posStore.findFirst({ select: { name: true, settings: true } });
    const storeSettings = (store?.settings ?? {}) as Record<string, unknown>;
    const config = buildReceiptConfig(
      (storeSettings.store_display_name as string) || store?.name || receipt.store_name,
      storeSettings,
    );

    const templateData: TemplateReceiptData = {
      receipt_number: receipt.receipt_number || "",
      receipt_token: receipt.receipt_token || null,
      date: receipt.date,
      items: receipt.items,
      subtotal_cents: receipt.subtotal_cents,
      tax_cents: receipt.tax_cents || 0,
      discount_cents: receipt.discount_cents || 0,
      credit_applied_cents: receipt.credit_applied_cents || 0,
      gift_card_applied_cents: receipt.gift_card_applied_cents || 0,
      loyalty_discount_cents: receipt.loyalty_discount_cents || 0,
      total_cents: receipt.total_cents,
      payment_method: receipt.payment_method,
      amount_tendered_cents: 0,
      change_cents: receipt.change_cents || 0,
      card_brand: receipt.card_brand || null,
      card_last4: receipt.card_last4 || null,
      customer_name: receipt.customer_name,
      loyalty_points_earned: receipt.loyalty_points_earned || 0,
      loyalty_balance: receipt.loyalty_balance || 0,
      staff_name: receipt.staff_name || null,
    };

    const receiptHtml = buildEmailReceiptHtml(config, templateData);

    // Send via Resend if API key is configured
    if (process.env.RESEND_API_KEY) {
      try {
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "receipts@afterroar.store",
            to: customerEmail.trim(),
            subject: `Receipt from ${config.store_name}`,
            html: receiptHtml,
          }),
        });

        if (!resendRes.ok) {
          const err = await resendRes.text();
          console.error("Resend API error:", err);
          return NextResponse.json(
            { error: "Failed to send email" },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          message: "Receipt email sent",
        });
      } catch (err) {
        console.error("Resend fetch error:", err);
        return NextResponse.json(
          { error: "Email service unavailable" },
          { status: 500 }
        );
      }
    }

    // No email provider configured — log and return success stub
    console.log("Receipt email to:", customerEmail, "(no RESEND_API_KEY configured)");

    return NextResponse.json({
      success: true,
      message: "Receipt queued (email provider not configured)",
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
