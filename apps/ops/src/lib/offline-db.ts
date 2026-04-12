import { openDB, type IDBPDatabase } from "idb";

/* ------------------------------------------------------------------ */
/*  IndexedDB schema for offline POS                                   */
/* ------------------------------------------------------------------ */

const DB_NAME = "afterroar-pos";
const DB_VERSION = 1;

interface OfflineDB {
  inventory: {
    key: string;
    value: {
      id: string;
      name: string;
      category: string;
      sku: string | null;
      barcode: string | null;
      price_cents: number;
      cost_cents: number;
      quantity: number;
      attributes: Record<string, unknown>;
      active: boolean;
    };
    indexes: {
      "by-name": string;
      "by-barcode": string;
      "by-sku": string;
      "by-category": string;
    };
  };
  customers: {
    key: string;
    value: {
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      credit_balance_cents: number;
    };
    indexes: {
      "by-name": string;
    };
  };
  txQueue: {
    key: number;
    value: {
      localId?: number;
      clientTxId: string;
      type: "checkout" | "trade_in" | "return";
      createdAt: string;
      status: "pending" | "syncing" | "synced" | "failed";
      retryCount: number;
      lastError: string | null;
      payload: Record<string, unknown>;
      receipt: Record<string, unknown> | null;
    };
    indexes: {
      "by-status": string;
      "by-type": string;
    };
  };
  priceCache: {
    key: string;
    value: {
      cardName: string;
      setCode: string | null;
      priceCents: number;
      source: string;
      fetchedAt: string;
    };
    indexes: {
      "by-fetched": string;
    };
  };
  meta: {
    key: string;
    value: {
      key: string;
      value: unknown;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<OfflineDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<OfflineDB>> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB not available on server"));
  }
  if (!dbPromise) {
    dbPromise = openDB<OfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Inventory store
        if (!db.objectStoreNames.contains("inventory")) {
          const inv = db.createObjectStore("inventory", { keyPath: "id" });
          inv.createIndex("by-name", "name");
          inv.createIndex("by-barcode", "barcode");
          inv.createIndex("by-sku", "sku");
          inv.createIndex("by-category", "category");
        }

        // Customers store
        if (!db.objectStoreNames.contains("customers")) {
          const cust = db.createObjectStore("customers", { keyPath: "id" });
          cust.createIndex("by-name", "name");
        }

        // Transaction queue
        if (!db.objectStoreNames.contains("txQueue")) {
          const tx = db.createObjectStore("txQueue", {
            keyPath: "localId",
            autoIncrement: true,
          });
          tx.createIndex("by-status", "status");
          tx.createIndex("by-type", "type");
        }

        // TCG price cache
        if (!db.objectStoreNames.contains("priceCache")) {
          const pc = db.createObjectStore("priceCache", { keyPath: "cardName" });
          pc.createIndex("by-fetched", "fetchedAt");
        }

        // Meta (sync timestamps, etc.)
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      },
    });
  }
  return dbPromise;
}

/* ------------------------------------------------------------------ */
/*  Meta helpers                                                       */
/* ------------------------------------------------------------------ */

export async function getMeta(key: string): Promise<unknown> {
  const db = await getDB();
  const record = await db.get("meta", key);
  return record?.value;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put("meta", { key, value });
}

/* ------------------------------------------------------------------ */
/*  Inventory helpers                                                  */
/* ------------------------------------------------------------------ */

export async function cacheInventory(
  items: OfflineDB["inventory"]["value"][]
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("inventory", "readwrite");
  // Clear and replace
  await tx.store.clear();
  for (const item of items) {
    await tx.store.put(item);
  }
  await tx.done;
  await setMeta("inventory_synced_at", new Date().toISOString());
}

/** Merge delta inventory changes into existing cache (instead of full replace) */
export async function mergeInventoryDelta(
  updated: OfflineDB["inventory"]["value"][],
  deactivatedIds: string[]
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("inventory", "readwrite");
  // Upsert changed items
  for (const item of updated) {
    await tx.store.put(item);
  }
  // Remove deactivated items
  for (const id of deactivatedIds) {
    await tx.store.delete(id);
  }
  await tx.done;
  await setMeta("inventory_synced_at", new Date().toISOString());
}

/** Merge delta customer changes into existing cache */
export async function mergeCustomerDelta(
  updated: OfflineDB["customers"]["value"][]
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("customers", "readwrite");
  for (const customer of updated) {
    await tx.store.put(customer);
  }
  await tx.done;
  await setMeta("customers_synced_at", new Date().toISOString());
}

export async function searchInventoryLocal(
  query: string
): Promise<OfflineDB["inventory"]["value"][]> {
  const db = await getDB();
  const all = await db.getAll("inventory");
  const q = query.toLowerCase();

  // Barcode exact match first
  const barcodeMatch = all.filter(
    (i) => i.barcode && i.barcode === query && i.quantity > 0
  );
  if (barcodeMatch.length > 0) return barcodeMatch;

  // Fuzzy name/sku search
  return all
    .filter(
      (i) =>
        i.quantity > 0 &&
        i.active &&
        (i.name.toLowerCase().includes(q) ||
          (i.sku && i.sku.toLowerCase().includes(q)))
    )
    .slice(0, 20);
}

export async function decrementLocalInventory(
  itemId: string,
  qty: number
): Promise<void> {
  const db = await getDB();
  const item = await db.get("inventory", itemId);
  if (item) {
    item.quantity = Math.max(0, item.quantity - qty);
    await db.put("inventory", item);
  }
}

export async function incrementLocalInventory(
  itemId: string,
  qty: number
): Promise<void> {
  const db = await getDB();
  const item = await db.get("inventory", itemId);
  if (item) {
    item.quantity += qty;
    await db.put("inventory", item);
  }
}

/* ------------------------------------------------------------------ */
/*  Customer helpers                                                   */
/* ------------------------------------------------------------------ */

export async function cacheCustomers(
  customers: OfflineDB["customers"]["value"][]
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("customers", "readwrite");
  await tx.store.clear();
  for (const c of customers) {
    await tx.store.put(c);
  }
  await tx.done;
  await setMeta("customers_synced_at", new Date().toISOString());
}

export async function searchCustomersLocal(
  query: string
): Promise<OfflineDB["customers"]["value"][]> {
  const db = await getDB();
  const all = await db.getAll("customers");
  const q = query.toLowerCase();
  return all
    .filter((c) => c.name.toLowerCase().includes(q))
    .slice(0, 20);
}

export async function updateLocalCustomerCredit(
  customerId: string,
  deltaCents: number
): Promise<void> {
  const db = await getDB();
  const customer = await db.get("customers", customerId);
  if (customer) {
    customer.credit_balance_cents = Math.max(
      0,
      customer.credit_balance_cents + deltaCents
    );
    await db.put("customers", customer);
  }
}

/* ------------------------------------------------------------------ */
/*  Transaction queue helpers                                          */
/* ------------------------------------------------------------------ */

export async function enqueueTx(
  tx: Omit<OfflineDB["txQueue"]["value"], "localId">
): Promise<number> {
  const db = await getDB();
  const key = await db.add("txQueue", tx as OfflineDB["txQueue"]["value"]);
  return key as number;
}

export async function getPendingTxs(): Promise<
  OfflineDB["txQueue"]["value"][]
> {
  const db = await getDB();
  return db.getAllFromIndex("txQueue", "by-status", "pending");
}

export async function getAllTxs(): Promise<OfflineDB["txQueue"]["value"][]> {
  const db = await getDB();
  return db.getAll("txQueue");
}

export async function updateTxStatus(
  localId: number,
  status: OfflineDB["txQueue"]["value"]["status"],
  lastError?: string
): Promise<void> {
  const db = await getDB();
  const tx = await db.get("txQueue", localId);
  if (tx) {
    tx.status = status;
    if (lastError !== undefined) tx.lastError = lastError;
    if (status === "syncing") tx.retryCount++;
    await db.put("txQueue", tx);
  }
}

export async function removeTx(localId: number): Promise<void> {
  const db = await getDB();
  await db.delete("txQueue", localId);
}

export async function clearSyncedTxs(): Promise<void> {
  const db = await getDB();
  const synced = await db.getAllFromIndex("txQueue", "by-status", "synced");
  const tx = db.transaction("txQueue", "readwrite");
  for (const item of synced) {
    if (item.localId !== undefined) {
      await tx.store.delete(item.localId);
    }
  }
  await tx.done;
}

/* ------------------------------------------------------------------ */
/*  Price cache helpers (for TCG valuation offline)                    */
/* ------------------------------------------------------------------ */

export async function cachePrices(
  prices: OfflineDB["priceCache"]["value"][]
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("priceCache", "readwrite");
  for (const p of prices) {
    await tx.store.put(p);
  }
  await tx.done;
}

export async function getCachedPrice(
  cardName: string
): Promise<OfflineDB["priceCache"]["value"] | undefined> {
  const db = await getDB();
  return db.get("priceCache", cardName);
}

export async function pruneOldPrices(maxAgeDays: number): Promise<void> {
  const db = await getDB();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);
  const cutoffStr = cutoff.toISOString();

  const all = await db.getAll("priceCache");
  const tx = db.transaction("priceCache", "readwrite");
  for (const p of all) {
    if (p.fetchedAt < cutoffStr) {
      await tx.store.delete(p.cardName);
    }
  }
  await tx.done;
}

/* ------------------------------------------------------------------ */
/*  Cache readiness check                                              */
/* ------------------------------------------------------------------ */

export async function isCacheReady(): Promise<{
  ready: boolean;
  inventoryCount: number;
  customerCount: number;
  inventorySyncedAt: string | null;
  customersSyncedAt: string | null;
}> {
  const db = await getDB();
  const inventoryCount = await db.count("inventory");
  const customerCount = await db.count("customers");
  const inventorySyncedAt = (await getMeta("inventory_synced_at")) as string | null;
  const customersSyncedAt = (await getMeta("customers_synced_at")) as string | null;

  return {
    ready: inventoryCount > 0 && customerCount > 0,
    inventoryCount,
    customerCount,
    inventorySyncedAt: inventorySyncedAt ?? null,
    customersSyncedAt: customersSyncedAt ?? null,
  };
}
