import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

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
}

interface EmailReceiptBody {
  customer_email?: string;
  email?: string; // alias
  receipt?: ReceiptData;
  receipt_token?: string;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function buildReceiptHtml(receipt: ReceiptData): string {
  const itemRows = receipt.items
    .map(
      (item) =>
        `<tr>
          <td style="padding:4px 0;color:#333;">${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ""}</td>
          <td style="padding:4px 0;text-align:right;color:#333;">${formatCents(item.total_cents)}</td>
        </tr>`
    )
    .join("");

  const lines: string[] = [];
  lines.push(
    `<tr><td style="padding:4px 0;color:#666;">Subtotal</td><td style="padding:4px 0;text-align:right;color:#333;">${formatCents(receipt.subtotal_cents)}</td></tr>`
  );

  if (receipt.discount_cents && receipt.discount_cents > 0) {
    lines.push(
      `<tr><td style="padding:4px 0;color:#b45309;">Discount</td><td style="padding:4px 0;text-align:right;color:#b45309;">-${formatCents(receipt.discount_cents)}</td></tr>`
    );
  }

  if (receipt.tax_cents && receipt.tax_cents > 0) {
    lines.push(
      `<tr><td style="padding:4px 0;color:#666;">Tax</td><td style="padding:4px 0;text-align:right;color:#333;">${formatCents(receipt.tax_cents)}</td></tr>`
    );
  }

  if (receipt.loyalty_discount_cents && receipt.loyalty_discount_cents > 0) {
    lines.push(
      `<tr><td style="padding:4px 0;color:#7c3aed;">Loyalty Discount</td><td style="padding:4px 0;text-align:right;color:#7c3aed;">-${formatCents(receipt.loyalty_discount_cents)}</td></tr>`
    );
  }

  if (receipt.gift_card_applied_cents && receipt.gift_card_applied_cents > 0) {
    lines.push(
      `<tr><td style="padding:4px 0;color:#0d9488;">Gift Card</td><td style="padding:4px 0;text-align:right;color:#0d9488;">-${formatCents(receipt.gift_card_applied_cents)}</td></tr>`
    );
  }

  if (receipt.credit_applied_cents > 0) {
    lines.push(
      `<tr><td style="padding:4px 0;color:#b45309;">Store Credit</td><td style="padding:4px 0;text-align:right;color:#b45309;">-${formatCents(receipt.credit_applied_cents)}</td></tr>`
    );
  }

  const paymentLabel =
    receipt.payment_method === "cash"
      ? "Cash"
      : receipt.payment_method === "card"
      ? "Card"
      : receipt.payment_method === "store_credit"
      ? "Store Credit"
      : receipt.payment_method;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:500px;margin:0 auto;padding:20px;background:#fff;">
  <div style="text-align:center;margin-bottom:20px;">
    <h1 style="font-size:20px;color:#111;margin:0;">${receipt.store_name}</h1>
    <p style="color:#666;font-size:14px;margin:4px 0;">${new Date(receipt.date).toLocaleString()}</p>
    ${receipt.customer_name ? `<p style="color:#333;font-size:14px;margin:4px 0;">Customer: ${receipt.customer_name}</p>` : ""}
  </div>

  <hr style="border:none;border-top:1px dashed #ccc;margin:16px 0;">

  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    ${itemRows}
  </table>

  <hr style="border:none;border-top:1px dashed #ccc;margin:16px 0;">

  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    ${lines.join("")}
    <tr>
      <td style="padding:4px 0;color:#666;">Payment</td>
      <td style="padding:4px 0;text-align:right;color:#333;">${paymentLabel}</td>
    </tr>
    <tr style="border-top:1px solid #ddd;">
      <td style="padding:8px 0;font-weight:bold;font-size:16px;color:#111;">Total</td>
      <td style="padding:8px 0;text-align:right;font-weight:bold;font-size:16px;color:#111;">${formatCents(receipt.total_cents)}</td>
    </tr>
    ${
      receipt.change_cents > 0
        ? `<tr><td style="padding:4px 0;color:#059669;font-weight:600;">Change</td><td style="padding:4px 0;text-align:right;color:#059669;font-weight:600;">${formatCents(receipt.change_cents)}</td></tr>`
        : ""
    }
  </table>

  <hr style="border:none;border-top:1px dashed #ccc;margin:16px 0;">

  <p style="text-align:center;color:#999;font-size:12px;">
    Thank you for shopping at ${receipt.store_name}!
  </p>
</body>
</html>`;
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
        const items = (meta.items ?? []) as Array<{ inventory_item_id: string; quantity: number; price_cents: number }>;
        const store = await db.posStore.findFirst({ select: { name: true, settings: true } });
        const storeName = (store?.settings as Record<string, unknown>)?.store_display_name as string || store?.name || "Store";

        receipt = {
          store_name: storeName,
          date: entry.created_at.toISOString(),
          items: items.map((i) => ({ name: i.inventory_item_id, quantity: i.quantity, price_cents: i.price_cents, total_cents: i.price_cents * i.quantity })),
          subtotal_cents: entry.amount_cents,
          tax_cents: (meta.tax_cents as number) || 0,
          discount_cents: (meta.discount_cents as number) || 0,
          credit_applied_cents: entry.credit_amount_cents || 0,
          payment_method: (meta.payment_method as string) || "card",
          total_cents: entry.amount_cents + ((meta.tax_cents as number) || 0),
          change_cents: 0,
          customer_name: entry.customer?.name ?? null,
        };
      }
    }

    if (!receipt) {
      return NextResponse.json(
        { error: "receipt data is required" },
        { status: 400 }
      );
    }

    const customer_email = customerEmail;
    const receiptHtml = buildReceiptHtml(receipt);

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
            to: customer_email.trim(),
            subject: `Receipt from ${receipt.store_name}`,
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
    console.log("Receipt email to:", customer_email, "(no RESEND_API_KEY configured)");

    return NextResponse.json({
      success: true,
      message: "Receipt queued (email provider not configured)",
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
