"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  cacheInventory,
  cacheCustomers,
  getMeta,
  isCacheReady,
} from "./offline-db";

/* ------------------------------------------------------------------ */
/*  Data Sync Hook                                                     */
/*  Primes IndexedDB cache on first load, refreshes periodically.      */
/* ------------------------------------------------------------------ */

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // Refresh every 5 minutes

export interface DataSyncStatus {
  /** Whether the initial cache prime is complete */
  primed: boolean;
  /** Whether a sync is currently in progress */
  syncing: boolean;
  /** Inventory item count in cache */
  inventoryCount: number;
  /** Customer count in cache */
  customerCount: number;
  /** When inventory was last synced */
  inventorySyncedAt: string | null;
  /** When customers were last synced */
  customersSyncedAt: string | null;
  /** Last sync error */
  error: string | null;
  /** Manually trigger a sync */
  syncNow: () => void;
}

export function useDataSync(): DataSyncStatus {
  const [primed, setPrimed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [inventoryCount, setInventoryCount] = useState(0);
  const [customerCount, setCustomerCount] = useState(0);
  const [inventorySyncedAt, setInventorySyncedAt] = useState<string | null>(null);
  const [customersSyncedAt, setCustomersSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doSync = useCallback(async () => {
    if (!navigator.onLine) return;

    setSyncing(true);
    setError(null);

    try {
      // Delta sync: only fetch changes since last sync (saves ~144MB/day)
      const sinceInv = inventorySyncedAt ? `&since=${encodeURIComponent(inventorySyncedAt)}` : "";
      const sinceCust = customersSyncedAt ? `&since=${encodeURIComponent(customersSyncedAt)}` : "";

      const [invRes, custRes] = await Promise.all([
        fetch(`/api/inventory/bulk?_=${Date.now()}${sinceInv}`),
        fetch(`/api/customers/bulk?_=${Date.now()}${sinceCust}`),
      ]);

      if (invRes.ok) {
        const invData = await invRes.json();
        if (invData.full) {
          // First load or forced full sync — replace entire cache
          await cacheInventory(invData.items);
          setInventoryCount(invData.items.length);
        } else {
          // Delta sync — merge changes into existing cache
          const { mergeInventoryDelta } = await import("./offline-db");
          await mergeInventoryDelta(invData.items, invData.deactivated ?? []);
          // Update count from cache
          const { isCacheReady } = await import("./offline-db");
          const status = await isCacheReady();
          setInventoryCount(status.inventoryCount);
        }
        setInventorySyncedAt(invData.syncedAt);
      }

      if (custRes.ok) {
        const custData = await custRes.json();
        if (custData.full) {
          await cacheCustomers(custData.customers);
        } else {
          const { mergeCustomerDelta } = await import("./offline-db");
          await mergeCustomerDelta(custData.customers);
        }
        setCustomerCount(custData.customers.length);
        setCustomersSyncedAt(custData.syncedAt);
      }

      setPrimed(true);
    } catch (err) {
      // Network error — check if we have cached data
      const cacheStatus = await isCacheReady().catch(() => ({
        ready: false,
        inventoryCount: 0,
        customerCount: 0,
        inventorySyncedAt: null,
        customersSyncedAt: null,
      }));

      if (cacheStatus.ready) {
        // We have cached data, just can't refresh
        setPrimed(true);
        setInventoryCount(cacheStatus.inventoryCount);
        setCustomerCount(cacheStatus.customerCount);
        setInventorySyncedAt(cacheStatus.inventorySyncedAt);
        setCustomersSyncedAt(cacheStatus.customersSyncedAt);
      } else {
        setError("Failed to load offline data. Please connect to the internet.");
      }
    } finally {
      setSyncing(false);
    }
  }, []);

  // Check existing cache on mount, then sync
  useEffect(() => {
    async function init() {
      // Check if we already have cached data
      try {
        const status = await isCacheReady();
        if (status.ready) {
          setPrimed(true);
          setInventoryCount(status.inventoryCount);
          setCustomerCount(status.customerCount);
          setInventorySyncedAt(status.inventorySyncedAt);
          setCustomersSyncedAt(status.customersSyncedAt);
        }

        // Check how old the cache is
        const lastSync = (await getMeta("inventory_synced_at")) as string | null;
        const stale =
          !lastSync ||
          Date.now() - new Date(lastSync).getTime() > SYNC_INTERVAL_MS;

        if (stale && navigator.onLine) {
          doSync();
        }
      } catch {
        // No cached data, try to sync
        if (navigator.onLine) doSync();
      }
    }

    init();

    // Periodic refresh while online
    intervalRef.current = setInterval(() => {
      if (navigator.onLine) doSync();
    }, SYNC_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [doSync]);

  return {
    primed,
    syncing,
    inventoryCount,
    customerCount,
    inventorySyncedAt,
    customersSyncedAt,
    error,
    syncNow: doSync,
  };
}
