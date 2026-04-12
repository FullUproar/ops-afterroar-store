/* ------------------------------------------------------------------ */
/*  Import Execution Engine                                             */
/*  Applies mapped data to pos_* tables with deduplication.             */
/*  Supports dry-run mode (preview without writing).                    */
/* ------------------------------------------------------------------ */

import { prisma } from "@/lib/prisma";
import { getTenantClient } from "@/lib/tenant-prisma";

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

interface MappedRow {
  [key: string]: unknown;
}

/** Execute an import job — either dry run or commit */
export async function executeImport(
  storeId: string,
  entityType: "inventory" | "customers",
  rows: MappedRow[],
  dryRun: boolean
): Promise<ImportResult> {
  const db = getTenantClient(storeId);
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  if (entityType === "inventory") {
    await executeInventoryImport(db, storeId, rows, dryRun, result);
  } else if (entityType === "customers") {
    await executeCustomerImport(db, storeId, rows, dryRun, result);
  }

  return result;
}

async function executeInventoryImport(
  db: ReturnType<typeof getTenantClient>,
  storeId: string,
  rows: MappedRow[],
  dryRun: boolean,
  result: ImportResult
) {
  // Pre-load existing items for dedup
  const existingItems = await db.posInventoryItem.findMany({
    select: { id: true, sku: true, barcode: true, name: true },
  });

  const skuMap = new Map(existingItems.filter((i) => i.sku).map((i) => [i.sku!, i.id]));
  const barcodeMap = new Map(existingItems.filter((i) => i.barcode).map((i) => [i.barcode!, i.id]));

  // Classify rows into creates vs updates
  const toCreate: Array<{
    store_id: string; name: string; category: string; sku: string | null;
    barcode: string | null; price_cents: number; cost_cents: number;
    quantity: number; attributes: Record<string, unknown>;
    external_id: string | null; active: boolean;
  }> = [];
  const toUpdate: Array<{ id: string; data: Record<string, unknown> }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const name = String(row.name ?? "").trim();
      if (!name) {
        result.errors.push({ row: i + 1, message: "Missing name" });
        continue;
      }

      const attributes: Record<string, unknown> = {};
      if (typeof row.attributes === "object" && row.attributes) {
        Object.assign(attributes, row.attributes);
      }

      const data = {
        store_id: storeId,
        name,
        category: String(row.category ?? "other"),
        sku: row.sku ? String(row.sku).trim() : null,
        barcode: row.barcode ? String(row.barcode).trim() : null,
        price_cents: Number(row.price_cents) || 0,
        cost_cents: Number(row.cost_cents) || 0,
        quantity: Math.max(0, Math.round(Number(row.quantity) || 0)),
        attributes,
        external_id: row.external_id ? String(row.external_id) : null,
        active: true,
      };

      let existingId: string | undefined;
      if (data.sku) existingId = skuMap.get(data.sku);
      if (!existingId && data.barcode) existingId = barcodeMap.get(data.barcode);

      if (existingId) {
        toUpdate.push({
          id: existingId,
          data: {
            name: data.name, category: data.category,
            price_cents: data.price_cents, cost_cents: data.cost_cents,
            quantity: data.quantity, attributes: data.attributes,
            barcode: data.barcode, external_id: data.external_id,
          },
        });
        result.updated++;
      } else {
        toCreate.push(data);
        // Update maps for dedup within same batch
        if (data.sku) skuMap.set(data.sku, `pending_${i}`);
        if (data.barcode) barcodeMap.set(data.barcode, `pending_${i}`);
        result.created++;
      }
    } catch (err) {
      result.errors.push({
        row: i + 1,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  // Execute in batches (not per-item)
  if (!dryRun) {
    // Batch create — single DB call for all new items
    if (toCreate.length > 0) {
      await db.posInventoryItem.createMany({
        data: toCreate.map((item) => ({
          ...item,
          attributes: JSON.parse(JSON.stringify(item.attributes)),
        })),
      });
    }

    // Parallel updates — concurrent but separate calls (Prisma limitation)
    // Process in chunks of 50 to avoid connection pool exhaustion
    const CHUNK_SIZE = 50;
    for (let i = 0; i < toUpdate.length; i += CHUNK_SIZE) {
      const chunk = toUpdate.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map((u) =>
          db.posInventoryItem.update({
            where: { id: u.id },
            data: {
              ...u.data,
              attributes: u.data.attributes
                ? JSON.parse(JSON.stringify(u.data.attributes))
                : undefined,
            },
          })
        )
      );
    }
  }
}

async function executeCustomerImport(
  db: ReturnType<typeof getTenantClient>,
  storeId: string,
  rows: MappedRow[],
  dryRun: boolean,
  result: ImportResult
) {
  // Pre-load existing customers for dedup
  const existingCustomers = await db.posCustomer.findMany({
    select: { id: true, email: true, name: true, phone: true },
  });

  const emailMap = new Map(
    existingCustomers.filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c.id])
  );

  const toCreate: Array<{
    store_id: string; name: string; email: string | null;
    phone: string | null; credit_balance_cents: number; notes: string | null;
  }> = [];
  const toUpdate: Array<{ id: string; data: Record<string, unknown> }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const name = String(row.name ?? "").trim();
      if (!name) {
        result.errors.push({ row: i + 1, message: "Missing name" });
        continue;
      }

      const email = row.email ? String(row.email).trim().toLowerCase() : null;
      const phone = row.phone ? String(row.phone).trim() : null;
      const creditBalance = Number(row.credit_balance_cents) || 0;
      const notes = row.notes ? String(row.notes).trim() : null;

      let existingId: string | undefined;
      if (email) existingId = emailMap.get(email);

      if (existingId) {
        toUpdate.push({
          id: existingId,
          data: { name, phone, notes, credit_balance_cents: creditBalance },
        });
        result.updated++;
      } else {
        toCreate.push({ store_id: storeId, name, email, phone, credit_balance_cents: creditBalance, notes });
        if (email) emailMap.set(email, `pending_${i}`);
        result.created++;
      }
    } catch (err) {
      result.errors.push({
        row: i + 1,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  if (!dryRun) {
    if (toCreate.length > 0) {
      await db.posCustomer.createMany({ data: toCreate });
    }

    const CHUNK_SIZE = 50;
    for (let i = 0; i < toUpdate.length; i += CHUNK_SIZE) {
      const chunk = toUpdate.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map((u) => db.posCustomer.update({ where: { id: u.id }, data: u.data }))
      );
    }
  }
}
