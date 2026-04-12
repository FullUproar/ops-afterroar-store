import { NextRequest, NextResponse } from "next/server";
import { requirePermissionAndFeature, handleAuthError } from "@/lib/require-staff";
import { getStoreSettings } from "@/lib/store-settings-shared";
import { getShipStation, DEFAULT_BOX, parseAddressString, type ShipWeight } from "@/lib/shipstation";

/* ------------------------------------------------------------------ */
/*  POST /api/shipping/labels — create a shipping label via ShipStation */
/*  DELETE /api/shipping/labels — void a label                          */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const { db, storeId } = await requirePermissionAndFeature("manage_orders", "ecommerce");

    const body = await request.json();
    const {
      order_id,
      carrier_code,
      service_code,
      package_code,
      weight_oz,
      dimensions,
    } = body as {
      order_id: string;
      carrier_code: string;
      service_code: string;
      package_code?: string;
      weight_oz?: number;
      dimensions?: { length: number; width: number; height: number };
    };

    if (!order_id || !carrier_code || !service_code) {
      return NextResponse.json(
        { error: "order_id, carrier_code, and service_code required" },
        { status: 400 },
      );
    }

    const order = await db.posOrder.findFirst({
      where: { id: order_id },
      select: {
        id: true,
        order_number: true,
        shipping_address: true,
        weight_oz: true,
        customer: { select: { name: true, email: true, phone: true } },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Get store shipping address
    const store = await db.posStore.findFirst({
      select: { name: true, settings: true, address: true },
    });
    const settings = getStoreSettings((store?.settings ?? {}) as Record<string, unknown>);
    const storeAddress = (store?.address ?? {}) as Record<string, string>;

    const shipFrom = {
      name: store?.name || "Store",
      street1: settings.warehouse_street || storeAddress.street || "",
      city: settings.warehouse_city || storeAddress.city || "",
      state: settings.warehouse_state || storeAddress.state || "",
      postalCode: settings.warehouse_zip || storeAddress.zip || "",
      country: "US",
    };

    // Parse destination address
    const shippingAddr = order.shipping_address as Record<string, string> | null;
    let shipTo = {
      name: order.customer?.name || "Customer",
      street1: "",
      city: "",
      state: "",
      postalCode: "",
      country: "US",
      phone: order.customer?.phone || undefined,
      residential: true as boolean,
    };

    if (shippingAddr) {
      if (shippingAddr.street1 || shippingAddr.street) {
        shipTo.street1 = shippingAddr.street1 || shippingAddr.street || "";
        shipTo.city = shippingAddr.city || "";
        shipTo.state = shippingAddr.state || "";
        shipTo.postalCode = shippingAddr.zip || shippingAddr.postalCode || "";
        shipTo.country = shippingAddr.country || "US";
      } else if (typeof shippingAddr === "string") {
        const parsed = parseAddressString(shippingAddr as unknown as string);
        shipTo = { ...shipTo, ...parsed };
      }
    }

    const effectiveWeight = weight_oz || order.weight_oz || 16;
    const weight: ShipWeight = { value: effectiveWeight, units: "ounces" };

    const ss = getShipStation();
    if (!ss) {
      return NextResponse.json({ error: "ShipStation not configured" }, { status: 503 });
    }

    const label = await ss.createLabel({
      carrierCode: carrier_code,
      serviceCode: service_code,
      packageCode: package_code || "package",
      shipDate: new Date().toISOString().split("T")[0],
      weight,
      dimensions: dimensions
        ? { ...dimensions, units: "inches" as const }
        : DEFAULT_BOX,
      shipFrom,
      shipTo,
      testLabel: process.env.NODE_ENV !== "production",
    });

    // Save the label to our DB
    const savedLabel = await db.posShippingLabel.create({
      data: {
        store_id: storeId,
        order_id,
        shipstation_shipment_id: String(label.shipmentId),
        carrier_code: label.carrierCode,
        service_code: label.serviceCode,
        tracking_number: label.trackingNumber,
        label_data: label.labelData,
        label_format: "pdf",
        shipment_cost_cents: Math.round(label.shipmentCost * 100),
        weight_oz: effectiveWeight,
        length_in: dimensions?.length || DEFAULT_BOX.length,
        width_in: dimensions?.width || DEFAULT_BOX.width,
        height_in: dimensions?.height || DEFAULT_BOX.height,
        ship_date: new Date(label.shipDate),
      },
    });

    // Update the order
    await db.posOrder.update({
      where: { id: order_id },
      data: {
        tracking_number: label.trackingNumber,
        shipping_carrier: label.carrierCode,
        label_url: savedLabel.id, // reference to the label record
        ship_date: new Date(label.shipDate),
        fulfillment_status: "packed",
        updated_at: new Date(),
      },
    });

    return NextResponse.json({
      label: {
        id: savedLabel.id,
        tracking_number: label.trackingNumber,
        carrier: label.carrierCode,
        service: label.serviceCode,
        cost_cents: Math.round(label.shipmentCost * 100),
        ship_date: label.shipDate,
        has_label_data: !!label.labelData,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { db } = await requirePermissionAndFeature("manage_orders", "ecommerce");

    const { label_id } = await request.json();
    if (!label_id) {
      return NextResponse.json({ error: "label_id required" }, { status: 400 });
    }

    const label = await db.posShippingLabel.findFirst({
      where: { id: label_id, voided: false },
      select: { id: true, shipstation_shipment_id: true },
    });

    if (!label) {
      return NextResponse.json({ error: "Label not found" }, { status: 404 });
    }

    // Void in ShipStation
    const ss = getShipStation();
    if (ss && label.shipstation_shipment_id) {
      try {
        await ss.voidLabel(Number(label.shipstation_shipment_id));
      } catch (err) {
        console.error("[Shipping] Failed to void label in ShipStation:", err);
      }
    }

    // Mark voided in our DB
    await db.posShippingLabel.update({
      where: { id: label_id },
      data: { voided: true, voided_at: new Date() },
    });

    return NextResponse.json({ voided: true });
  } catch (error) {
    return handleAuthError(error);
  }
}
