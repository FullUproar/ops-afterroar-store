/* ------------------------------------------------------------------ */
/*  Receipt Template — legal-compliant, customizable receipt builder   */
/*                                                                     */
/*  Legal requirements (union of all US states):                       */
/*  REQUIRED (cannot be hidden):                                       */
/*    - Business name                                                  */
/*    - Business address (city, state, zip minimum)                    */
/*    - Date and time of transaction                                   */
/*    - Itemized list with individual prices                           */
/*    - Tax amount (separate line, with rate if CA/NY/TX)              */
/*    - Total amount                                                   */
/*    - Payment method indicator                                       */
/*                                                                     */
/*  State-specific notes:                                              */
/*    - CA: Must show tax rate and tax-inclusive pricing if applicable  */
/*    - NY: Sales tax must be shown as separate line                   */
/*    - TX: Must include seller's name and address                     */
/*    - FL: No state income tax receipt requirements (sales tax only)  */
/*    - Most states: no specific receipt format mandated for retail    */
/*                                                                     */
/*  Our approach: single spec that satisfies ALL states by including   */
/*  everything. Stores can customize optional sections but cannot      */
/*  remove legally required elements.                                  */
/* ------------------------------------------------------------------ */

export interface ReceiptConfig {
  // Required (from store settings, always shown)
  store_name: string;
  store_address: string | null; // "123 Main St, City, ST 12345"
  store_phone: string | null;
  store_website: string | null;

  // Optional header/footer (customizable)
  receipt_header: string; // Additional text below store name
  receipt_footer: string; // "Thank you" message, return policy, etc.

  // Tax display
  tax_rate_percent: number;
  tax_included_in_price: boolean;

  // Optional sections (toggle in settings)
  show_barcode: boolean;        // Barcode for receipt number
  show_qr_code: boolean;        // QR code for digital receipt
  show_loyalty_balance: boolean; // Show loyalty points earned/balance
  show_savings: boolean;         // "You saved $X" line
  show_return_policy: boolean;   // Return policy text
  return_policy_text: string;
}

export interface ReceiptData {
  receipt_number: string;
  receipt_token: string | null;
  date: string; // ISO
  items: Array<{
    name: string;
    quantity: number;
    price_cents: number;
    total_cents: number;
  }>;
  subtotal_cents: number;
  tax_cents: number;
  discount_cents: number;
  credit_applied_cents: number;
  gift_card_applied_cents: number;
  loyalty_discount_cents: number;
  total_cents: number;
  payment_method: string;
  amount_tendered_cents: number;
  change_cents: number;
  // Card details (from Stripe)
  card_brand: string | null;  // "visa", "mastercard", etc.
  card_last4: string | null;  // "4242"
  // Customer
  customer_name: string | null;
  // Loyalty
  loyalty_points_earned: number;
  loyalty_balance: number;
  // Staff
  staff_name: string | null;
}

function fc(cents: number): string {
  return "$" + (Math.abs(cents) / 100).toFixed(2);
}

function paymentLabel(method: string, brand: string | null, last4: string | null): string {
  if (method === "cash") return "Cash";
  if (method === "store_credit") return "Store Credit";
  if (method === "gift_card") return "Gift Card";
  if (method === "card" || method === "split") {
    if (brand && last4) {
      const brandName = brand.charAt(0).toUpperCase() + brand.slice(1);
      return `${brandName} ****${last4}`;
    }
    return "Card";
  }
  return method.charAt(0).toUpperCase() + method.slice(1);
}

/* ------------------------------------------------------------------ */
/*  Thermal Print HTML (280px, monospace)                               */
/* ------------------------------------------------------------------ */

export function buildThermalReceiptHtml(config: ReceiptConfig, data: ReceiptData): string {
  const items = data.items.map((i) =>
    `<tr>
      <td style="padding:1px 0;vertical-align:top">${i.name}${i.quantity > 1 ? ` <span style="color:#666">x${i.quantity}</span>` : ""}</td>
      <td style="text-align:right;padding:1px 0;white-space:nowrap">${fc(i.total_cents)}</td>
    </tr>`
  ).join("");

  const totalsLines: string[] = [];

  totalsLines.push(`<tr><td>Subtotal</td><td style="text-align:right">${fc(data.subtotal_cents)}</td></tr>`);

  if (data.discount_cents > 0) {
    totalsLines.push(`<tr style="color:#b45309"><td>Discount</td><td style="text-align:right">-${fc(data.discount_cents)}</td></tr>`);
  }

  if (data.credit_applied_cents > 0) {
    totalsLines.push(`<tr style="color:#b45309"><td>Store Credit</td><td style="text-align:right">-${fc(data.credit_applied_cents)}</td></tr>`);
  }

  if (data.gift_card_applied_cents > 0) {
    totalsLines.push(`<tr style="color:#0d9488"><td>Gift Card</td><td style="text-align:right">-${fc(data.gift_card_applied_cents)}</td></tr>`);
  }

  if (data.loyalty_discount_cents > 0) {
    totalsLines.push(`<tr style="color:#7c3aed"><td>Loyalty Points</td><td style="text-align:right">-${fc(data.loyalty_discount_cents)}</td></tr>`);
  }

  // Tax — LEGALLY REQUIRED as separate line
  const taxLabel = config.tax_rate_percent > 0
    ? `Tax (${config.tax_rate_percent}%)`
    : "Tax";
  totalsLines.push(`<tr><td>${taxLabel}</td><td style="text-align:right">${fc(data.tax_cents)}</td></tr>`);

  const payLabel = paymentLabel(data.payment_method, data.card_brand, data.card_last4);

  // Savings calculation
  const totalSavings = data.discount_cents + data.credit_applied_cents + data.gift_card_applied_cents + data.loyalty_discount_cents;

  return `<!DOCTYPE html><html><head><title>Receipt</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Courier New',Courier,monospace;font-size:11px;width:280px;margin:0 auto;padding:8px;color:#000;line-height:1.4}
  .center{text-align:center}
  .bold{font-weight:bold}
  .line{border-top:1px dashed #333;margin:6px 0}
  .dbl-line{border-top:2px solid #333;margin:6px 0}
  table{width:100%;border-collapse:collapse}
  td{padding:1px 0}
  .total-row td{padding:4px 0;font-weight:bold;font-size:14px}
  .small{font-size:9px;color:#666}
  @media print{
    body{width:auto;max-width:280px}
    @page{margin:0;size:80mm auto}
  }
</style></head><body>

  <!-- STORE HEADER — legally required: name + address -->
  <div class="center bold" style="font-size:14px">${config.store_name}</div>
  ${config.store_address ? `<div class="center small">${config.store_address}</div>` : ""}
  ${config.store_phone ? `<div class="center small">${config.store_phone}</div>` : ""}
  ${config.store_website ? `<div class="center small">${config.store_website}</div>` : ""}
  ${config.receipt_header ? `<div class="center small" style="margin-top:2px">${config.receipt_header}</div>` : ""}

  <div class="line"></div>

  <!-- DATE/TIME + RECEIPT NUMBER — legally required -->
  <div class="center">${new Date(data.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} ${new Date(data.date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
  <div class="center">Receipt #${data.receipt_number}</div>
  ${data.staff_name ? `<div class="center small">Served by: ${data.staff_name}</div>` : ""}
  ${data.customer_name ? `<div class="center">Customer: ${data.customer_name}</div>` : ""}

  <div class="line"></div>

  <!-- ITEMIZED LIST — legally required -->
  <table>${items}</table>

  <div class="line"></div>

  <!-- TOTALS — legally required: subtotal, tax (separate), total -->
  <table>
    ${totalsLines.join("")}
  </table>
  <div class="dbl-line"></div>
  <table>
    <tr class="total-row">
      <td>TOTAL</td>
      <td style="text-align:right">${fc(data.total_cents)}</td>
    </tr>
  </table>

  <div class="line"></div>

  <!-- PAYMENT — legally required: payment method -->
  <table>
    <tr><td>Payment</td><td style="text-align:right">${payLabel}</td></tr>
    ${data.payment_method === "cash" && data.amount_tendered_cents > 0 ? `
      <tr><td>Tendered</td><td style="text-align:right">${fc(data.amount_tendered_cents)}</td></tr>
      <tr class="bold"><td>Change</td><td style="text-align:right">${fc(data.change_cents)}</td></tr>
    ` : ""}
  </table>

  ${config.show_savings && totalSavings > 0 ? `
    <div class="line"></div>
    <div class="center bold" style="color:#059669">You saved ${fc(totalSavings)}!</div>
  ` : ""}

  ${config.show_loyalty_balance && data.loyalty_points_earned > 0 ? `
    <div class="line"></div>
    <div class="center">+${data.loyalty_points_earned} loyalty points earned</div>
    ${data.loyalty_balance > 0 ? `<div class="center small">Balance: ${data.loyalty_balance} points</div>` : ""}
  ` : ""}

  ${config.show_return_policy && config.return_policy_text ? `
    <div class="line"></div>
    <div class="center small">${config.return_policy_text}</div>
  ` : ""}

  <div class="line"></div>

  <!-- FOOTER -->
  ${config.receipt_footer ? `<div class="center small">${config.receipt_footer}</div>` : `<div class="center small">Thank you for shopping with us!</div>`}

  ${config.show_barcode && data.receipt_number ? `
    <div class="center" style="margin-top:8px">
      <svg id="barcode"></svg>
      <div class="small">${data.receipt_number}</div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
    <script>
      try { JsBarcode("#barcode", "${data.receipt_number}", { format: "CODE128", width: 1.5, height: 40, displayValue: false, margin: 0 }); } catch(e) {}
    </script>
  ` : ""}

</body></html>`;
}

/* ------------------------------------------------------------------ */
/*  Email Receipt HTML (styled, responsive)                            */
/* ------------------------------------------------------------------ */

export function buildEmailReceiptHtml(config: ReceiptConfig, data: ReceiptData): string {
  const items = data.items.map((i) =>
    `<tr>
      <td style="padding:6px 0;color:#333;border-bottom:1px solid #f0f0f0">${i.name}${i.quantity > 1 ? ` <span style="color:#999">x${i.quantity}</span>` : ""}</td>
      <td style="padding:6px 0;text-align:right;color:#333;border-bottom:1px solid #f0f0f0">${fc(i.total_cents)}</td>
    </tr>`
  ).join("");

  const totals: string[] = [];
  totals.push(`<tr><td style="padding:4px 0;color:#666">Subtotal</td><td style="padding:4px 0;text-align:right;color:#333">${fc(data.subtotal_cents)}</td></tr>`);

  if (data.discount_cents > 0)
    totals.push(`<tr><td style="padding:4px 0;color:#b45309">Discount</td><td style="padding:4px 0;text-align:right;color:#b45309">-${fc(data.discount_cents)}</td></tr>`);
  if (data.credit_applied_cents > 0)
    totals.push(`<tr><td style="padding:4px 0;color:#b45309">Store Credit</td><td style="padding:4px 0;text-align:right;color:#b45309">-${fc(data.credit_applied_cents)}</td></tr>`);
  if (data.gift_card_applied_cents > 0)
    totals.push(`<tr><td style="padding:4px 0;color:#0d9488">Gift Card</td><td style="padding:4px 0;text-align:right;color:#0d9488">-${fc(data.gift_card_applied_cents)}</td></tr>`);

  const taxLabel = config.tax_rate_percent > 0 ? `Tax (${config.tax_rate_percent}%)` : "Tax";
  totals.push(`<tr><td style="padding:4px 0;color:#666">${taxLabel}</td><td style="padding:4px 0;text-align:right;color:#333">${fc(data.tax_cents)}</td></tr>`);

  const payLabel = paymentLabel(data.payment_method, data.card_brand, data.card_last4);
  totals.push(`<tr><td style="padding:4px 0;color:#666">Payment</td><td style="padding:4px 0;text-align:right;color:#333">${payLabel}</td></tr>`);

  const receiptUrl = data.receipt_token ? `https://www.afterroar.store/r/${data.receipt_token}` : null;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:500px;margin:0 auto;padding:20px;background:#fff;color:#333">

  <div style="text-align:center;margin-bottom:16px">
    <h1 style="font-size:22px;color:#111;margin:0">${config.store_name}</h1>
    ${config.store_address ? `<p style="color:#999;font-size:13px;margin:4px 0">${config.store_address}</p>` : ""}
    ${config.store_phone ? `<p style="color:#999;font-size:13px;margin:2px 0">${config.store_phone}</p>` : ""}
  </div>

  <div style="text-align:center;margin-bottom:16px">
    <p style="color:#666;font-size:14px;margin:2px 0">${new Date(data.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
    <p style="color:#999;font-size:13px;margin:2px 0">Receipt #${data.receipt_number}</p>
    ${data.customer_name ? `<p style="color:#333;font-size:14px;margin:4px 0">Customer: ${data.customer_name}</p>` : ""}
  </div>

  <hr style="border:none;border-top:1px solid #e5e5e5;margin:16px 0">

  <table style="width:100%;border-collapse:collapse;font-size:14px">${items}</table>

  <hr style="border:none;border-top:1px solid #e5e5e5;margin:16px 0">

  <table style="width:100%;border-collapse:collapse;font-size:14px">
    ${totals.join("")}
    <tr style="border-top:2px solid #333">
      <td style="padding:8px 0;font-weight:bold;font-size:18px;color:#111">Total</td>
      <td style="padding:8px 0;text-align:right;font-weight:bold;font-size:18px;color:#111">${fc(data.total_cents)}</td>
    </tr>
    ${data.change_cents > 0 ? `<tr><td style="padding:4px 0;color:#059669;font-weight:600">Change</td><td style="padding:4px 0;text-align:right;color:#059669;font-weight:600">${fc(data.change_cents)}</td></tr>` : ""}
  </table>

  ${receiptUrl ? `
    <div style="text-align:center;margin:20px 0">
      <a href="${receiptUrl}" style="color:#FF8200;font-size:13px;text-decoration:none">View digital receipt</a>
    </div>
  ` : ""}

  ${config.receipt_footer ? `
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:16px 0">
    <p style="text-align:center;color:#999;font-size:12px">${config.receipt_footer}</p>
  ` : `
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:16px 0">
    <p style="text-align:center;color:#999;font-size:12px">Thank you for shopping at ${config.store_name}!</p>
  `}

</body></html>`;
}

/* ------------------------------------------------------------------ */
/*  Build ReceiptConfig from store settings                            */
/* ------------------------------------------------------------------ */

export function buildReceiptConfig(
  storeName: string,
  settings: Record<string, unknown>,
): ReceiptConfig {
  return {
    store_name: (settings.store_display_name as string) || storeName,
    store_address: (settings.receipt_header as string) || null, // receipt_header is used for address
    store_phone: (settings.store_phone as string) || null,
    store_website: (settings.store_website as string) || null,
    receipt_header: "", // address goes in store_address
    receipt_footer: (settings.receipt_footer as string) || "Thank you for shopping with us!",
    tax_rate_percent: (settings.tax_rate_percent as number) || 0,
    tax_included_in_price: !!(settings.tax_included_in_price),
    show_barcode: settings.receipt_show_barcode !== false, // default on
    show_qr_code: settings.receipt_show_qr !== false,
    show_loyalty_balance: !!(settings.loyalty_enabled),
    show_savings: settings.receipt_show_savings !== false,
    show_return_policy: !!(settings.receipt_show_return_policy),
    return_policy_text: (settings.return_policy_text as string) || `Returns accepted within ${(settings.return_window_days as number) || 30} days with receipt.`,
  };
}
