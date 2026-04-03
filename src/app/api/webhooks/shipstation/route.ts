import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getShipStation } from "@/lib/shipstation";
import crypto from "crypto";

/* ------------------------------------------------------------------ */
/*  POST /api/webhooks/shipstation — ShipStation SHIP_NOTIFY webhook   */
/*  Called when a label is created / order is shipped.                  */
/*  Routes to the correct store via order tags (customField1 = storeId)*/
/* ------------------------------------------------------------------ */

function verifySignature(body: string, signature: string | null): boolean {
  const secret = process.env.SHIPSTATION_WEBHOOK_SECRET;
  if (!secret || !signature) return true; // Skip verification if no secret configured
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64");
  return signature === expected;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-shipstation-hmac-sha256");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: { resource_url?: string; resource_type?: string };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { resource_url, resource_type } = body;

  if (resource_type !== "SHIP_NOTIFY" || !resource_url) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Fetch the full shipment data from ShipStation
  const ss = getShipStation();
  if (!ss) {
    return NextResponse.json({ error: "ShipStation not configured" }, { status: 503 });
  }

  try {
    // Validate URL before fetching (SSRF protection)
    const url = new URL(resource_url);
    if (!url.hostname.endsWith("shipstation.com") || url.protocol !== "https:") {
      return NextResponse.json({ error: "Invalid resource URL" }, { status: 400 });
    }

    const shipmentRes = await fetch(resource_url, {
      headers: {
        "Authorization": `Basic ${Buffer.from(`${process.env.SHIPSTATION_API_KEY}:${process.env.SHIPSTATION_API_SECRET}`).toString("base64")}`,
      },
    });

    if (!shipmentRes.ok) {
      return NextResponse.json({ error: "Failed to fetch shipment" }, { status: 502 });
    }

    const data = await shipmentRes.json();
    const shipments = data.shipments || [data];

    for (const shipment of shipments) {
      const trackingNumber = shipment.trackingNumber;
      const carrierCode = shipment.carrierCode;
      const shipDate = shipment.shipDate;

      // Find the store via customField1 (storeId) on the order
      const orderNumber = shipment.orderNumber;
      if (!orderNumber) continue;

      // Look up the order in our DB
      const order = await prisma.posOrder.findFirst({
        where: { order_number: orderNumber },
        select: { id: true, store_id: true, customer_id: true },
      });

      if (!order) continue;

      // Estimate delivery
      const estimatedDays = estimateDeliveryDays(carrierCode, shipment.serviceCode);
      const estimatedDelivery = new Date(shipDate || Date.now());
      for (let i = 0; i < estimatedDays; i++) {
        estimatedDelivery.setDate(estimatedDelivery.getDate() + 1);
        // Skip weekends
        if (estimatedDelivery.getDay() === 0) estimatedDelivery.setDate(estimatedDelivery.getDate() + 1);
        if (estimatedDelivery.getDay() === 6) estimatedDelivery.setDate(estimatedDelivery.getDate() + 2);
      }

      // Update order
      await prisma.posOrder.update({
        where: { id: order.id },
        data: {
          tracking_number: trackingNumber,
          status: "shipped",
          shipped_at: shipDate ? new Date(shipDate) : new Date(),
          delivered_at: estimatedDelivery,
          shipping_method: `${carrierCode}:${shipment.serviceCode || ""}`,
          updated_at: new Date(),
        },
      });

      // Log
      console.log(`[ShipStation] Order ${orderNumber} shipped via ${carrierCode}, tracking: ${trackingNumber}`);
    }

    return NextResponse.json({ ok: true, processed: shipments.length });
  } catch (err) {
    console.error("[ShipStation webhook] Error:", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

function estimateDeliveryDays(carrier: string, service: string): number {
  const s = `${carrier}_${service}`.toLowerCase();
  if (s.includes("express") || s.includes("next_day") || s.includes("overnight")) return 1;
  if (s.includes("priority") && s.includes("express")) return 2;
  if (s.includes("priority")) return 3;
  if (s.includes("2day") || s.includes("two_day")) return 2;
  if (s.includes("ground")) return 5;
  return 5; // Default
}
