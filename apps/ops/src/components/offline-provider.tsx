'use client';

import { useEffect, createContext, useContext } from 'react';
import { useDataSync, type DataSyncStatus } from '@/lib/use-data-sync';
import { startSyncEngine, stopSyncEngine } from '@/lib/tx-sync';

/* ------------------------------------------------------------------ */
/*  Offline Provider                                                   */
/*  Wraps the dashboard to:                                            */
/*  1. Register the service worker                                     */
/*  2. Start the data sync (cache priming)                             */
/*  3. Start the transaction sync engine                               */
/* ------------------------------------------------------------------ */

const DataSyncContext = createContext<DataSyncStatus | null>(null);

export function useOfflineData(): DataSyncStatus {
  const ctx = useContext(DataSyncContext);
  if (!ctx) {
    throw new Error("useOfflineData must be used within OfflineProvider");
  }
  return ctx;
}

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const dataSync = useDataSync();

  // Register service worker + request persistent storage
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.log("[PWA] SW registration failed:", err);
      });
    }

    // Request persistent storage so iOS/Android don't evict IndexedDB
    // Critical for crash resilience — queued transactions must survive
    if (navigator.storage?.persist) {
      navigator.storage.persist().then((granted) => {
        if (!granted) {
          console.log("[PWA] Persistent storage not granted — data may be evicted under pressure");
        }
      });
    }
  }, []);

  // Start/stop transaction sync engine
  useEffect(() => {
    startSyncEngine();
    return () => stopSyncEngine();
  }, []);

  return (
    <DataSyncContext.Provider value={dataSync}>
      {children}
    </DataSyncContext.Provider>
  );
}
