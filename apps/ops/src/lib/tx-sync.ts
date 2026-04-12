"use client";

import {
  getPendingTxs,
  updateTxStatus,
  clearSyncedTxs,
} from "./offline-db";

/* ------------------------------------------------------------------ */
/*  Transaction Sync Engine                                            */
/*  Drains the IndexedDB queue when online.                            */
/*  Supports checkout, trade-in, and return transactions.              */
/* ------------------------------------------------------------------ */

const API_ENDPOINTS: Record<string, string> = {
  checkout: "/api/checkout",
  trade_in: "/api/trade-ins",
  return: "/api/returns",
};

const SYNC_INTERVAL_MS = 5_000; // Check every 5 seconds
const MAX_RETRIES = 5;

let syncInterval: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;

/** Start the sync engine (call once from a top-level component) */
export function startSyncEngine(): void {
  if (syncInterval) return; // Already running
  syncInterval = setInterval(drainQueue, SYNC_INTERVAL_MS);
  // Also run immediately
  drainQueue();
}

/** Stop the sync engine */
export function stopSyncEngine(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

/** Attempt to drain all pending transactions */
async function drainQueue(): Promise<void> {
  // Guard against concurrent runs
  if (isSyncing) return;
  if (!navigator.onLine) return;

  isSyncing = true;

  try {
    const pending = await getPendingTxs();
    if (pending.length === 0) {
      // Clean up any old synced records
      await clearSyncedTxs();
      return;
    }

    for (const tx of pending) {
      if (!navigator.onLine) break; // Stop if we go offline mid-drain

      const localId = tx.localId;
      if (localId === undefined) continue;

      // Skip if too many retries
      if (tx.retryCount >= MAX_RETRIES) {
        await updateTxStatus(localId, "failed", "Max retries exceeded");
        continue;
      }

      const endpoint = API_ENDPOINTS[tx.type];
      if (!endpoint) {
        await updateTxStatus(localId, "failed", `Unknown transaction type: ${tx.type}`);
        continue;
      }

      await updateTxStatus(localId, "syncing");

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tx.payload),
        });

        if (res.ok) {
          await updateTxStatus(localId, "synced");
        } else if (res.status === 401) {
          // Auth expired — stop syncing, user needs to re-login
          await updateTxStatus(localId, "pending", "Session expired — please sign in again");
          break;
        } else {
          const data = await res.json().catch(() => ({}));
          const error = data.error || `Server error: ${res.status}`;
          await updateTxStatus(localId, "failed", error);
        }
      } catch {
        // Network error during sync — put back to pending
        await updateTxStatus(localId, "pending", "Network error during sync");
        break; // Stop trying, wait for next interval
      }
    }

    // Clean up synced transactions
    await clearSyncedTxs();
  } finally {
    isSyncing = false;
  }
}

/** Manually retry a failed transaction */
export async function retryTx(localId: number): Promise<void> {
  await updateTxStatus(localId, "pending", undefined);
  // Trigger immediate drain
  drainQueue();
}
