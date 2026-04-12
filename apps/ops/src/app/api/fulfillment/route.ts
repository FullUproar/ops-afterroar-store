import { NextRequest, NextResponse } from "next/server";
import { requirePermissionAndFeature, handleAuthError } from "@/lib/require-staff";
import { enqueueHQ } from "@/lib/hq-outbox";

/* ------------------------------------------------------------------ */
/*  /api/fulfillment — Fulfillment queue management                    */
/*  GET: list orders needing fulfillment                               */
/*  PATCH: update fulfillment status on an order                       */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { db } = await requirePermissionAndFeature("manage_orders", "ecommerce");

    const url = request.nextUrl;
    const status = url.searchParams.get("status") || "unfulfilled";
    const source = url.searchParams.get("source"); // filter by source (online, shopify, etc.)
    const fulfillmentType = url.searchParams.get("type"); // merchant, pod, 3pl
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    const where: Record<string, unknown> = {};

    // Support comma-separated statuses
    if (status.includes(",")) {
      where.fulfillment_status = { in: status.split(",") };
    } else if (status === "all") {
      // No filter
    } else {
      where.fulfillment_status = status;
    }

    // Only show orders that need shipping (not POS walk-in sales)
    if (source) {
      where.source = source;
    } else {
      where.source = { not: "pos" };
    }

    if (fulfillmentType) {
      where.fulfillment_type = fulfillmentType;
    }

    const [orders, total] = await Promise.all([
      db.posOrder.findMany({
        where,
        orderBy: { created_at: "asc" }, // oldest first (FIFO)
        take: limit,
        skip: offset,
        select: {
          id: true,
          order_number: true,
          source: true,
          status: true,
          fulfillment_status: true,
          fulfillment_type: true,
          total_cents: true,
          shipping_cents: true,
          shipping_method: true,
          shipping_carrier: true,
          shipping_address: true,
          tracking_number: true,
          weight_oz: true,
          notes: true,
          created_at: true,
          shipped_at: true,
          customer: {
            select: { id: true, name: true, email: true, phone: true },
          },
          items: {
            select: {
              id: true,
              name: true,
              quantity: true,
              price_cents: true,
              fulfilled: true,
              fulfillment_type: true,
              fulfillment_provider: true,
              inventory_item: {
                select: {
                  id: true,
                  sku: true,
                  barcode: true,
                  image_url: true,
                  category: true,
                  weight_oz: true,
                },
              },
            },
          },
          shipping_labels: {
            where: { voided: false },
            select: {
              id: true,
              carrier_code: true,
              service_code: true,
              tracking_number: true,
              shipment_cost_cents: true,
              created_at: true,
            },
          },
        },
      }),
      db.posOrder.count({ where }),
    ]);

    // Summary counts
    const counts = await db.posOrder.groupBy({
      by: ["fulfillment_status"],
      where: { source: { not: "pos" } },
      _count: true,
    });

    const summary = {
      unfulfilled: 0,
      picking: 0,
      packed: 0,
      shipped: 0,
      delivered: 0,
    };
    for (const c of counts) {
      const key = c.fulfillment_status as keyof typeof summary;
      if (key in summary) summary[key] = c._count;
    }

    return NextResponse.json({ orders, total, summary });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { db } = await requirePermissionAndFeature("manage_orders", "ecommerce");

    const body = await request.json();
    const { order_id, fulfillment_status, tracking_number, shipping_carrier, notes } = body as {
      order_id: string;
      fulfillment_status?: string;
      tracking_number?: string;
      shipping_carrier?: string;
      notes?: string;
    };

    if (!order_id) {
      return NextResponse.json({ error: "order_id required" }, { status: 400 });
    }

    const order = await db.posOrder.findFirst({
      where: { id: order_id },
      select: { id: true, fulfillment_status: true, source: true, order_number: true, notes: true, store_id: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = { updated_at: new Date() };

    if (fulfillment_status) {
      data.fulfillment_status = fulfillment_status;

      if (fulfillment_status === "shipped") {
        data.status = "shipped";
        data.shipped_at = new Date();
      } else if (fulfillment_status === "delivered") {
        data.status = "delivered";
        data.delivered_at = new Date();
        data.fulfilled_at = new Date();
      }
    }

    if (tracking_number) data.tracking_number = tracking_number;
    if (shipping_carrier) data.shipping_carrier = shipping_carrier;
    if (notes !== undefined) data.notes = notes;

    const updated = await db.posOrder.update({
      where: { id: order_id },
      data,
      select: {
        id: true,
        order_number: true,
        fulfillment_status: true,
        status: true,
        tracking_number: true,
        shipping_carrier: true,
      },
    });

    // If marking items as fulfilled, update all items
    if (fulfillment_status === "shipped" || fulfillment_status === "delivered") {
      await db.posOrderItem.updateMany({
        where: { order_id, fulfillment_type: "merchant" },
        data: { fulfilled: true },
      });
    }

    // If this order came from HQ, notify HQ that it shipped
    if (fulfillment_status === "shipped" && order.source === "hq_website") {
      // Extract HQ order ID from notes ("External: {id}") or use order_number
      const notesMatch = order.notes?.match(/External:\s*(\S+)/);
      const hqOrderId = notesMatch?.[1] ?? order.order_number;
      await enqueueHQ(order.store_id, "order_shipped", {
        hq_order_id: hqOrderId,
        tracking_number: tracking_number ?? null,
        carrier: shipping_carrier ?? null,
        shipped_at: new Date().toISOString(),
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return handleAuthError(error);
  }
}
