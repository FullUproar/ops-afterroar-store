import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { getStoreSettings } from "@/lib/store-settings-shared";
import {
  getShipStation,
  calculateOrderWeight,
  calculateFallbackRates,
  DEFAULT_BOX,
  type ShipWeight,
} from "@/lib/shipstation";

/* ------------------------------------------------------------------ */
/*  POST /api/shipping/rates — get shipping rates for an order         */
/*  Body: { items, to_zip, to_state, to_country }                     */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const { db } = await requireStaff();

    const body = await request.json();
    const { items, to_zip, to_state, to_country } = body as {
      items: Array<{ category: string; quantity: number; weight_oz?: number }>;
      to_zip: string;
      to_state?: string;
      to_country?: string;
    };

    if (!items || !to_zip) {
      return NextResponse.json({ error: "items and to_zip required" }, { status: 400 });
    }

    // Get store's warehouse ZIP
    const store = await db.posStore.findFirst({ select: { settings: true } });
    const settings = getStoreSettings((store?.settings ?? {}) as Record<string, unknown>);
    const fromZip = settings.warehouse_zip || "10001";

    // Calculate weight
    const weight = calculateOrderWeight(items);

    // Try ShipStation first
    const ss = getShipStation();
    if (ss) {
      try {
        const carriers = ["fedex", "usps", "ups"];
        const allRates: Array<{ carrier: string; name: string; code: string; totalCents: number }> = [];

        for (const carrier of carriers) {
          try {
            const rates = await ss.getRates({
              carrierCode: carrier,
              fromPostalCode: fromZip,
              toPostalCode: to_zip,
              toCountry: to_country || "US",
              toState: to_state,
              weight,
              dimensions: DEFAULT_BOX,
            });

            for (const rate of rates) {
              allRates.push({
                carrier,
                name: rate.serviceName,
                code: rate.serviceCode,
                totalCents: Math.round((rate.shipmentCost + rate.otherCost) * 100),
              });
            }
          } catch {
            // Skip carriers that fail
          }
        }

        if (allRates.length > 0) {
          allRates.sort((a, b) => a.totalCents - b.totalCents);

          // Check free shipping threshold
          const freeThreshold = settings.shipping_free_threshold_cents || 0;

          return NextResponse.json({
            rates: allRates,
            weight_oz: weight.value,
            source: "shipstation",
            free_shipping_threshold_cents: freeThreshold,
          });
        }
      } catch {
        // Fall through to fallback rates
      }
    }

    // Fallback calculated rates
    const fallback = calculateFallbackRates(weight.value);

    return NextResponse.json({
      rates: fallback.map((r) => ({
        carrier: r.code.split("_")[0],
        name: r.name,
        code: r.code,
        totalCents: r.totalCents,
      })),
      weight_oz: weight.value,
      source: "calculated",
      free_shipping_threshold_cents: settings.shipping_free_threshold_cents || 0,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
