/**
 * Transactional Email System
 *
 * Sends order confirmations, shipping notifications, and receipts.
 * Provider: Resend (via RESEND_API_KEY env var).
 * All emails are fire-and-forget — never block the caller.
 */

const RESEND_API_URL = "https://api.resend.com/emails";

interface EmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[Email] No RESEND_API_KEY — skipping: "${params.subject}" to ${params.to}`);
    return false;
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: params.from || process.env.EMAIL_FROM || "Afterroar Store <noreply@afterroar.store>",
        to: params.to,
        subject: params.subject,
        html: params.html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[Email] Resend error (${res.status}):`, err);
      return false;
    }

    console.log(`[Email] Sent: "${params.subject}" to ${params.to}`);
    return true;
  } catch (err) {
    console.error("[Email] Send failed:", err);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Email templates                                                     */
/* ------------------------------------------------------------------ */

function baseTemplate(storeName: string, content: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f5f5f5; color: #1a1a1a; }
  .container { max-width: 560px; margin: 0 auto; background: #fff; }
  .header { background: #1a1a2e; color: #fff; padding: 24px; text-align: center; }
  .header h1 { margin: 0; font-size: 20px; font-weight: 600; }
  .body { padding: 24px; }
  .footer { padding: 16px 24px; font-size: 12px; color: #999; text-align: center; border-top: 1px solid #eee; }
  .btn { display: inline-block; padding: 12px 24px; background: #FF8200; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 8px 0; }
  .item-row td { border-bottom: 1px solid #f0f0f0; }
  .total-row td { font-weight: 700; font-size: 16px; border-top: 2px solid #1a1a2e; padding-top: 12px; }
  .mono { font-family: 'Courier New', Courier, monospace; }
  .muted { color: #666; font-size: 14px; }
  .accent { color: #FF8200; }
</style>
</head><body>
<div class="container">
  <div class="header"><h1>${storeName}</h1></div>
  <div class="body">${content}</div>
  <div class="footer">
    Powered by Afterroar Store Ops<br>
    This is an automated message. Please do not reply.
  </div>
</div>
</body></html>`;
}

/* ------------------------------------------------------------------ */
/*  Order Confirmation                                                  */
/* ------------------------------------------------------------------ */

export interface OrderConfirmationData {
  storeName: string;
  orderNumber: string;
  customerName: string;
  items: Array<{ name: string; quantity: number; price_cents: number }>;
  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
  shippingAddress?: {
    street1?: string;
    street2?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  receiptUrl?: string;
}

export async function sendOrderConfirmation(to: string, data: OrderConfirmationData): Promise<boolean> {
  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const itemRows = data.items
    .map(
      (i) =>
        `<tr class="item-row"><td>${i.name}</td><td class="mono" style="text-align:right">${i.quantity > 1 ? `${i.quantity} × ` : ""}${fmt(i.price_cents)}</td></tr>`,
    )
    .join("");

  const addressBlock = data.shippingAddress
    ? `<div style="margin-top:16px;padding:12px;background:#f9f9f9;border-radius:8px">
        <div class="muted" style="margin-bottom:4px">Ships to:</div>
        <div>${data.customerName}</div>
        <div>${data.shippingAddress.street1 || ""}</div>
        ${data.shippingAddress.street2 ? `<div>${data.shippingAddress.street2}</div>` : ""}
        <div>${data.shippingAddress.city || ""}, ${data.shippingAddress.state || ""} ${data.shippingAddress.zip || ""}</div>
      </div>`
    : "";

  const content = `
    <h2 style="margin:0 0 4px">Order Confirmed</h2>
    <p class="muted">Thank you, ${data.customerName}! Your order has been received.</p>
    <p class="mono" style="font-size:14px;color:#666">Order #${data.orderNumber}</p>

    <table style="margin-top:16px">
      ${itemRows}
      <tr><td class="muted">Subtotal</td><td class="mono" style="text-align:right">${fmt(data.subtotalCents)}</td></tr>
      ${data.taxCents > 0 ? `<tr><td class="muted">Tax</td><td class="mono" style="text-align:right">${fmt(data.taxCents)}</td></tr>` : ""}
      ${data.shippingCents > 0 ? `<tr><td class="muted">Shipping</td><td class="mono" style="text-align:right">${fmt(data.shippingCents)}</td></tr>` : ""}
      <tr class="total-row"><td>Total</td><td class="mono" style="text-align:right">${fmt(data.totalCents)}</td></tr>
    </table>

    ${addressBlock}

    ${data.receiptUrl ? `<div style="margin-top:20px;text-align:center"><a href="${data.receiptUrl}" class="btn">View Receipt</a></div>` : ""}
  `;

  return sendEmail({
    to,
    subject: `Order Confirmed — #${data.orderNumber}`,
    html: baseTemplate(data.storeName, content),
  });
}

/* ------------------------------------------------------------------ */
/*  Shipping Notification                                               */
/* ------------------------------------------------------------------ */

export interface ShippingNotificationData {
  storeName: string;
  orderNumber: string;
  customerName: string;
  trackingNumber: string;
  carrier: string;
  trackingUrl?: string;
  estimatedDelivery?: string;
}

export async function sendShippingNotification(to: string, data: ShippingNotificationData): Promise<boolean> {
  const carrierTrackingUrls: Record<string, string> = {
    usps: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${data.trackingNumber}`,
    ups: `https://www.ups.com/track?tracknum=${data.trackingNumber}`,
    fedex: `https://www.fedex.com/fedextrack/?trknbr=${data.trackingNumber}`,
    dhl: `https://www.dhl.com/en/express/tracking.html?AWB=${data.trackingNumber}`,
  };

  const trackUrl = data.trackingUrl || carrierTrackingUrls[data.carrier.toLowerCase()] || null;

  const content = `
    <h2 style="margin:0 0 4px">Your Order Has Shipped!</h2>
    <p class="muted">Great news, ${data.customerName}! Your order is on its way.</p>
    <p class="mono" style="font-size:14px;color:#666">Order #${data.orderNumber}</p>

    <div style="margin-top:16px;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px">
      <div style="font-weight:600;margin-bottom:8px">Tracking Details</div>
      <div class="muted">Carrier: <strong>${data.carrier.toUpperCase()}</strong></div>
      <div class="mono" style="font-size:16px;margin-top:4px">${data.trackingNumber}</div>
      ${data.estimatedDelivery ? `<div class="muted" style="margin-top:4px">Estimated delivery: <strong>${data.estimatedDelivery}</strong></div>` : ""}
    </div>

    ${trackUrl ? `<div style="margin-top:20px;text-align:center"><a href="${trackUrl}" class="btn">Track Your Package</a></div>` : ""}
  `;

  return sendEmail({
    to,
    subject: `Your Order Has Shipped — #${data.orderNumber}`,
    html: baseTemplate(data.storeName, content),
  });
}

/* ------------------------------------------------------------------ */
/*  Gift Card Delivery                                                  */
/* ------------------------------------------------------------------ */

export async function sendGiftCardEmail(
  to: string,
  data: { storeName: string; code: string; balanceCents: number; fromName?: string },
): Promise<boolean> {
  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const content = `
    <h2 style="margin:0 0 4px">You Received a Gift Card!</h2>
    ${data.fromName ? `<p class="muted">${data.fromName} sent you a gift card.</p>` : ""}

    <div style="margin-top:16px;padding:24px;background:#fffbeb;border:2px solid #fbbf24;border-radius:12px;text-align:center">
      <div class="muted" style="margin-bottom:8px">Gift Card Code</div>
      <div class="mono" style="font-size:28px;font-weight:700;letter-spacing:4px">${data.code}</div>
      <div style="font-size:24px;font-weight:700;color:#16a34a;margin-top:8px">${fmt(data.balanceCents)}</div>
    </div>

    <p class="muted" style="margin-top:16px;text-align:center">Present this code at checkout to redeem.</p>
  `;

  return sendEmail({
    to,
    subject: `Your ${data.storeName} Gift Card — ${fmt(data.balanceCents)}`,
    html: baseTemplate(data.storeName, content),
  });
}
