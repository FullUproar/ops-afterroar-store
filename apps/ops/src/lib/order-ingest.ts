import { prisma } from "@/lib/prisma";
import { syncOrderToShipStation } from "@/lib/shipstation";

/* ------------------------------------------------------------------ */
/*  ingestOrder() — shared order ingestion logic                       */
/*  Used by: HQ bridge, Shopify webhook, generic API, future sources   */
/*                                                                     */
/*  One code path for all external orders. Handles:                    */
/*    - Idempotency (dedup by order_number per store)                  */
/*    - Customer resolution (afterroar_user_id → email → auto-create) */
/*    - SKU → inventory matching + stock deduction                     */
/*    - Order + items creation                                         */
/*    - ShipStation sync                                               */
/* ------------------------------------------------------------------ */

export interface IngestOrderPayload {
  /** External order ID (for reference in notes) */
  external_id?: string;
  order_number: string;
  source: string; // hq_website, shopify, custom, woocommerce, etc.
  customer?: {
    name: string;
    email?: string | null;
    phone?: string | null;
    afterroar_user_id?: string | null;
  };
  shipping_address?: {
    street?: string;
    street1?: string;
    street2?: string;
    apartment?: string;
    city?: string;
    state?: string;
    zip?: string;
    postalCode?: string;
    country?: string;
  };
  items: Array<{
    name: string;
    sku?: string;
    quantity: number;
    price_cents: number;
    weight_oz?: number;
    fulfillment_type?: string; // merchant (default), pod, 3pl
    fulfillment_provider?: string;
  }>;
  shipping_method?: {
    carrier?: string;
    carrier_code?: string;
    service?: string;
    service_code?: string;
    cost_cents?: number;
  };
  total_cents: number;
  shipping_cents?: number;
  tax_cents?: number;
  paid_at?: string;
  notes?: string;
}

export interface IngestOrderResult {
  ok: boolean;
  order_id?: string;
  order_number?: string;
  deduplicated?: boolean;
  skipped?: boolean;
  reason?: string;
  shipstation_synced?: boolean;
  stock_warnings?: string[];
}

export async function ingestOrder(
  storeId: string,
  storeName: string,
  payload: IngestOrderPayload,
): Promise<IngestOrderResult> {
  // Idempotency
  const existing = await prisma.posOrder.findFirst({
    where: { store_id: storeId, order_number: payload.order_number },
    select: { id: true },
  });

  if (existing) {
    return { ok: true, order_id: existing.id, deduplicated: true };
  }

  // Resolve customer
  let customerId: string | null = null;
  if (payload.customer) {
    let customer = null;

    if (payload.customer.afterroar_user_id) {
      customer = await prisma.posCustomer.findFirst({
        where: { store_id: storeId, afterroar_user_id: payload.customer.afterroar_user_id },
        select: { id: true },
      });
    }

    if (!customer && payload.customer.email) {
      customer = await prisma.posCustomer.findFirst({
        where: { store_id: storeId, email: payload.customer.email },
        select: { id: true },
      });
    }

    if (!customer) {
      customer = await prisma.posCustomer.create({
        data: {
          store_id: storeId,
          name: payload.customer.name,
          email: payload.customer.email || null,
          phone: payload.customer.phone || null,
          afterroar_user_id: payload.customer.afterroar_user_id || null,
          credit_balance_cents: 0,
        },
        select: { id: true },
      });
    }

    customerId = customer.id;
  }

  // Filter to merchant-fulfillable items (default to merchant if not specified)
  const merchantItems = payload.items.filter(
    (i) => !i.fulfillment_type || i.fulfillment_type === "merchant",
  );

  if (merchantItems.length === 0) {
    return { ok: true, skipped: true, reason: "No merchant-fulfillable items" };
  }

  // Match SKUs to Store Ops inventory
  const skus = merchantItems.map((i) => i.sku).filter(Boolean) as string[];
  const inventoryBySku = new Map<string, { id: string; quantity: number; weight_oz: number | null }>();

  if (skus.length > 0) {
    const inventoryItems = await prisma.posInventoryItem.findMany({
      where: { store_id: storeId, sku: { in: skus }, active: true },
      select: { id: true, sku: true, quantity: true, weight_oz: true },
    });
    for (const inv of inventoryItems) {
      if (inv.sku) inventoryBySku.set(inv.sku, inv);
    }
  }

  // Weight calculation
  const totalWeightOz = merchantItems.reduce((sum, item) => {
    const inv = item.sku ? inventoryBySku.get(item.sku) : null;
    const weight = inv?.weight_oz || item.weight_oz || 16;
    return sum + weight * item.quantity;
  }, 0);

  const subtotalCents = merchantItems.reduce(
    (sum, item) => sum + item.price_cents * item.quantity,
    0,
  );

  // Deduct inventory
  const stockWarnings: string[] = [];
  for (const item of merchantItems) {
    const inv = item.sku ? inventoryBySku.get(item.sku) : null;
    if (inv) {
      if (inv.quantity < item.quantity) {
        stockWarnings.push(`${item.name}: requested ${item.quantity}, have ${inv.quantity}`);
      }
      await prisma.posInventoryItem.update({
        where: { id: inv.id },
        data: {
          quantity: { decrement: item.quantity },
          updated_at: new Date(),
        },
      });
    }
  }

  // Normalize shipping address
  const addr = payload.shipping_address;
  const shippingAddress = addr
    ? {
        street1: addr.street1 || addr.street || "",
        street2: addr.street2 || addr.apartment || "",
        city: addr.city || "",
        state: addr.state || "",
        zip: addr.zip || addr.postalCode || "",
        country: addr.country || "US",
      }
    : null;

  // Build notes
  const noteParts: string[] = [];
  if (payload.external_id) noteParts.push(`External: ${payload.external_id}`);
  if (payload.notes) noteParts.push(payload.notes);
  if (stockWarnings.length) noteParts.push(`Stock warnings: ${stockWarnings.join("; ")}`);

  // Create order
  const order = await prisma.posOrder.create({
    data: {
      store_id: storeId,
      customer_id: customerId,
      order_number: payload.order_number,
      source: payload.source,
      status: "processing",
      fulfillment_status: "unfulfilled",
      fulfillment_type: "merchant",
      subtotal_cents: subtotalCents,
      tax_cents: payload.tax_cents || 0,
      shipping_cents: payload.shipping_cents || 0,
      total_cents: payload.total_cents,
      shipping_method: payload.shipping_method
        ? `${payload.shipping_method.carrier_code || ""}:${payload.shipping_method.service_code || ""}`
        : null,
      shipping_carrier: payload.shipping_method?.carrier_code || null,
      shipping_address: shippingAddress || undefined,
      weight_oz: totalWeightOz,
      notes: noteParts.join(" | ") || null,
      items: {
        create: merchantItems.map((item) => {
          const inv = item.sku ? inventoryBySku.get(item.sku) : null;
          return {
            name: item.name,
            quantity: item.quantity,
            price_cents: item.price_cents,
            total_cents: item.price_cents * item.quantity,
            fulfillment_type: "merchant",
            inventory_item_id: inv?.id || null,
          };
        }),
      },
    },
    select: { id: true, order_number: true },
  });

  // Sync to ShipStation
  const ssOrder = {
    id: order.id,
    order_number: order.order_number,
    customer_name: payload.customer?.name || "Customer",
    customer_email: payload.customer?.email || null,
    customer_phone: payload.customer?.phone || null,
    shipping_address: (shippingAddress || {}) as Record<string, string>,
    items: merchantItems.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      price_cents: i.price_cents,
      sku: i.sku,
    })),
    subtotal_cents: subtotalCents,
    tax_cents: payload.tax_cents || 0,
    shipping_cents: payload.shipping_cents || 0,
    total_cents: payload.total_cents,
    status: "paid",
    created_at: payload.paid_at || new Date().toISOString(),
  };

  const synced = await syncOrderToShipStation(ssOrder, storeId, storeName);

  // Send order confirmation email (fire-and-forget)
  if (payload.customer?.email) {
    import("@/lib/email").then(({ sendOrderConfirmation }) => {
      sendOrderConfirmation(payload.customer!.email!, {
        storeName,
        orderNumber: order.order_number,
        customerName: payload.customer!.name,
        items: merchantItems.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          price_cents: i.price_cents,
        })),
        subtotalCents,
        taxCents: payload.tax_cents || 0,
        shippingCents: payload.shipping_cents || 0,
        totalCents: payload.total_cents,
        shippingAddress: shippingAddress || undefined,
      }).catch(() => {});
    }).catch(() => {});
  }

  console.log(
    `[OrderIngest] ${payload.source} order ${payload.order_number} → ${order.id}, ShipStation: ${synced}`,
  );

  return {
    ok: true,
    order_id: order.id,
    order_number: order.order_number,
    shipstation_synced: synced,
    stock_warnings: stockWarnings.length > 0 ? stockWarnings : undefined,
  };
}
