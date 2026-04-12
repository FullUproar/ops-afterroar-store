import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  POST /api/inventory/receive — bulk receive inventory                */
/*  Accepts an array of items to add or increment.                      */
/*  Used by: scan-to-receive, invoice import, AI batch.                 */
/*                                                                      */
/*  For each item:                                                      */
/*    - If barcode/SKU matches existing → increment quantity             */
/*    - If no match → create new inventory item                         */
/*  Creates an "adjustment" ledger entry per batch for audit trail.     */
/* ------------------------------------------------------------------ */

interface ReceiveItem {
  /** Existing inventory item ID (if known) */
  inventory_item_id?: string;
  /** Match by barcode */
  barcode?: string;
  /** Match by SKU */
  sku?: string;
  /** Item name (for new items) */
  name: string;
  /** Category */
  category?: string;
  /** Quantity to add */
  quantity: number;
  /** Retail price in cents (for new items or price update) */
  price_cents?: number;
  /** Cost price in cents */
  cost_cents?: number;
  /** Additional attributes (TCG data, etc.) */
  attributes?: Record<string, unknown>;
}

interface ReceiveBody {
  items: ReceiveItem[];
  source?: string; // "scan", "invoice", "manual", "ai_photo"
  invoice_reference?: string; // distributor invoice number
  notes?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { staff, storeId, db } = await requirePermission("inventory.adjust");

    let body: ReceiveBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { items, source, invoice_reference, notes } = body;
    if (!items?.length) {
      return NextResponse.json({ error: "At least one item is required" }, { status: 400 });
    }

    // Pre-load existing items for matching
    const barcodes = items.map((i) => i.barcode).filter(Boolean) as string[];
    const skus = items.map((i) => i.sku).filter(Boolean) as string[];

    const existingByBarcode = barcodes.length > 0
      ? await db.posInventoryItem.findMany({
          where: { barcode: { in: barcodes } },
          select: { id: true, barcode: true, name: true, quantity: true },
        })
      : [];

    const existingBySku = skus.length > 0
      ? await db.posInventoryItem.findMany({
          where: { sku: { in: skus } },
          select: { id: true, sku: true, name: true, quantity: true },
        })
      : [];

    const barcodeMap = new Map(existingByBarcode.filter((i) => i.barcode).map((i) => [i.barcode!, i]));
    const skuMap = new Map(existingBySku.filter((i) => i.sku).map((i) => [i.sku!, i]));

    // Process items
    let created = 0;
    let updated = 0;
    let totalUnitsReceived = 0;
    const errors: Array<{ index: number; message: string }> = [];

    const result = await prisma.$transaction(async (tx) => {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        try {
          // Try to match existing item
          let existingId: string | undefined = item.inventory_item_id;

          if (!existingId && item.barcode) {
            existingId = barcodeMap.get(item.barcode)?.id;
          }
          if (!existingId && item.sku) {
            existingId = skuMap.get(item.sku)?.id;
          }

          if (existingId) {
            // Increment existing item
            await tx.posInventoryItem.update({
              where: { id: existingId, store_id: storeId },
              data: {
                quantity: { increment: item.quantity },
                ...(item.cost_cents !== undefined ? { cost_cents: item.cost_cents } : {}),
                ...(item.price_cents !== undefined ? { price_cents: item.price_cents } : {}),
              },
            });
            updated++;
          } else {
            // Create new item
            if (!item.name) {
              errors.push({ index: i, message: "Name is required for new items" });
              continue;
            }

            const newItem = await tx.posInventoryItem.create({
              data: {
                store_id: storeId,
                name: item.name,
                category: item.category ?? "other",
                sku: item.sku ?? null,
                barcode: item.barcode ?? null,
                price_cents: item.price_cents ?? 0,
                cost_cents: item.cost_cents ?? 0,
                quantity: item.quantity,
                attributes: item.attributes ? JSON.parse(JSON.stringify(item.attributes)) : {},
                active: true,
              },
            });

            // Update maps for subsequent dedup within same batch
            if (item.barcode) barcodeMap.set(item.barcode, { id: newItem.id, barcode: item.barcode, name: item.name, quantity: item.quantity });
            if (item.sku) skuMap.set(item.sku, { id: newItem.id, sku: item.sku, name: item.name, quantity: item.quantity });
            created++;
          }

          totalUnitsReceived += item.quantity;
        } catch (err) {
          errors.push({
            index: i,
            message: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }

      // Create a single adjustment ledger entry for the whole batch
      await tx.posLedgerEntry.create({
        data: {
          store_id: storeId,
          type: "adjustment",
          amount_cents: 0,
          staff_id: staff.id,
          description: `Received ${totalUnitsReceived} units (${created} new, ${updated} existing)`,
          metadata: JSON.parse(JSON.stringify({
            source: source ?? "manual",
            invoice_reference: invoice_reference ?? null,
            notes: notes ?? null,
            items_created: created,
            items_updated: updated,
            total_units: totalUnitsReceived,
            errors: errors.length,
          })),
        },
      });

      return { created, updated, totalUnitsReceived };
    });

    return NextResponse.json({
      ...result,
      errors,
      total_items: items.length,
    }, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
