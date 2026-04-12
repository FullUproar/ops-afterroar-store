import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pushInventoryToShopify } from "@/lib/shopify-sync";
import crypto from "crypto";

/* ------------------------------------------------------------------ */
/*  POST /api/webhooks/shopify/orders — Shopify orders/create webhook  */
/*                                                                     */
/*  When a sale happens on Shopify, this webhook:                      */
/*    1. Verifies the HMAC signature                                   */
/*    2. Finds the matching store by shop domain                       */
/*    3. Decrements inventory for each line item                       */
/*    4. Creates a sale ledger entry                                   */
/*    5. Pushes updated quantities back to Shopify                     */
/* ------------------------------------------------------------------ */

function verifyShopifyHmac(
  rawBody: string,
  hmacHeader: string | null,
): boolean {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret || !hmacHeader) return false;

  const computed = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  // Timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(hmacHeader),
    );
  } catch {
    return false;
  }
}

/* ---------- Shopify order types (subset we care about) ------------ */

interface ShopifyLineItem {
  variant_id: number | null;
  quantity: number;
  price: string;       // e.g. "29.99"
  title: string;
  sku: string | null;
}

interface ShopifyOrder {
  id: number;
  name: string;        // e.g. "#1001"
  order_number: number;
  financial_status: string;
  line_items: ShopifyLineItem[];
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  currency: string;
  created_at: string;
  customer?: {
    email?: string;
    first_name?: string;
    last_name?: string;
  };
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const hmac = request.headers.get("x-shopify-hmac-sha256");
  const shopDomain = request.headers.get("x-shopify-shop-domain");

  // Verify HMAC signature
  if (!verifyShopifyHmac(rawBody, hmac)) {
    console.warn("[Shopify Webhook] HMAC verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let order: ShopifyOrder;
  try {
    order = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only process paid orders
  if (order.financial_status !== "paid" && order.financial_status !== "partially_paid") {
    return NextResponse.json({ ok: true, skipped: "not_paid" });
  }

  // Find the store by matching the shop domain to stored shopify_url
  if (!shopDomain) {
    return NextResponse.json({ error: "Missing shop domain header" }, { status: 400 });
  }

  // Normalize domain: strip protocol and trailing slash
  const normalizedDomain = shopDomain
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .toLowerCase();

  // Search all stores for a matching shopify_url
  const allStores = await prisma.posStore.findMany({
    where: {
      settings: { not: undefined },
    },
    select: { id: true, name: true, settings: true },
  });

  const store = allStores.find((s) => {
    const settings = (s.settings ?? {}) as Record<string, unknown>;
    const storeShopUrl = (settings.shopify_url as string) || "";
    const normalized = storeShopUrl
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "")
      .toLowerCase();
    return normalized === normalizedDomain;
  });

  if (!store) {
    console.warn(`[Shopify Webhook] No store found for shop domain: ${shopDomain}`);
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  const storeId = store.id;
  const orderNumber = `SHOPIFY-${order.name.replace("#", "")}`;

  // Idempotency: check if we already processed this order
  const existing = await prisma.posLedgerEntry.findFirst({
    where: {
      store_id: storeId,
      type: "sale",
      metadata: { path: ["shopify_order_id"], equals: order.id },
    },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json({ ok: true, deduplicated: true, ledger_entry_id: existing.id });
  }

  // Match line items to inventory by shopify_variant_id
  const variantIds = order.line_items
    .map((li) => li.variant_id)
    .filter((v): v is number => v !== null)
    .map(String);

  const inventoryItems = variantIds.length > 0
    ? await prisma.posInventoryItem.findMany({
        where: {
          store_id: storeId,
          shopify_variant_id: { in: variantIds },
          active: true,
        },
        select: {
          id: true,
          name: true,
          quantity: true,
          price_cents: true,
          cost_cents: true,
          shopify_variant_id: true,
        },
      })
    : [];

  const invByVariant = new Map(
    inventoryItems.map((i) => [i.shopify_variant_id!, i]),
  );

  // Process in a transaction
  const subtotalCents = Math.round(parseFloat(order.subtotal_price) * 100);
  const taxCents = Math.round(parseFloat(order.total_tax) * 100);
  const totalCents = Math.round(parseFloat(order.total_price) * 100);

  const itemDescriptions: string[] = [];
  let cogsCents = 0;

  const result = await prisma.$transaction(async (tx) => {
    // Decrement inventory for matched items
    for (const lineItem of order.line_items) {
      if (!lineItem.variant_id) continue;

      const inv = invByVariant.get(String(lineItem.variant_id));
      if (!inv) continue;

      await tx.posInventoryItem.update({
        where: { id: inv.id },
        data: {
          quantity: { decrement: lineItem.quantity },
          updated_at: new Date(),
        },
      });

      itemDescriptions.push(`${inv.name} x${lineItem.quantity}`);
      cogsCents += (inv.cost_cents ?? 0) * lineItem.quantity;
    }

    // Fallback descriptions for unmatched items
    for (const lineItem of order.line_items) {
      if (lineItem.variant_id && invByVariant.has(String(lineItem.variant_id))) {
        continue; // Already described above
      }
      itemDescriptions.push(`${lineItem.title} x${lineItem.quantity} (unmatched)`);
    }

    // Create ledger entry
    const description = itemDescriptions.length > 0
      ? `Shopify sale ${order.name}: ${itemDescriptions.join(", ")}`
      : `Shopify sale ${order.name}`;

    const marginCents = subtotalCents - cogsCents;
    const marginPercent = subtotalCents > 0
      ? ((marginCents / subtotalCents) * 100).toFixed(1)
      : "0.0";

    const ledgerEntry = await tx.posLedgerEntry.create({
      data: {
        store_id: storeId,
        type: "sale",
        amount_cents: subtotalCents,
        description,
        metadata: JSON.parse(JSON.stringify({
          source: "shopify",
          shopify_order_id: order.id,
          shopify_order_name: order.name,
          order_number: orderNumber,
          tax_cents: taxCents,
          total_cents: totalCents,
          payment_method: "shopify",
          items: order.line_items.map((li) => ({
            variant_id: li.variant_id,
            title: li.title,
            quantity: li.quantity,
            price_cents: Math.round(parseFloat(li.price) * 100),
          })),
          ...(cogsCents > 0 ? { cogs_cents: cogsCents, margin_cents: marginCents, margin_percent: marginPercent } : {}),
          ...(order.customer?.email ? { customer_email: order.customer.email } : {}),
        })),
      },
    });

    return { ledgerEntry };
  });

  // Fire-and-forget: push updated inventory to Shopify for all matched items
  for (const lineItem of order.line_items) {
    if (!lineItem.variant_id) continue;
    const inv = invByVariant.get(String(lineItem.variant_id));
    if (inv) {
      pushInventoryToShopify(storeId, inv.id).catch(() => {});
    }
  }

  console.log(
    `[Shopify Webhook] Order ${order.name} processed for store ${store.name}: ` +
      `${inventoryItems.length} items matched, ledger ${result.ledgerEntry.id}`,
  );

  return NextResponse.json({
    ok: true,
    ledger_entry_id: result.ledgerEntry.id,
    items_matched: inventoryItems.length,
    items_unmatched: order.line_items.length - inventoryItems.length,
  });
}
