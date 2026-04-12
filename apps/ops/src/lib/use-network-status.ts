"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getPendingTxs } from "./offline-db";

export type ConnectionState = "online" | "offline" | "syncing" | "degraded";

export interface NetworkStatus {
  /** Current connection state */
  state: ConnectionState;
  /** True if the browser reports online */
  browserOnline: boolean;
  /** True if we can reach the server (heartbeat) */
  serverReachable: boolean;
  /** Number of pending transactions in the queue */
  pendingTxCount: number;
  /** Number of failed transactions that need attention */
  failedTxCount: number;
  /** When the offline period started (null if online) */
  offlineSince: Date | null;
  /** How long we've been offline in minutes */
  offlineMinutes: number;
  /** Whether cache is primed and offline-ready */
  cacheReady: boolean;
  /** Force a status refresh */
  refresh: () => void;
}

const HEARTBEAT_INTERVAL_MS = 10_000; // 10s when online
const HEARTBEAT_OFFLINE_INTERVAL_MS = 5_000; // 5s when offline (check more often)
const DEGRADED_THRESHOLD_MINUTES = 60; // After 1 hour, consider cache stale

export function useNetworkStatus(): NetworkStatus {
  const [browserOnline, setBrowserOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [serverReachable, setServerReachable] = useState(true);
  const [pendingTxCount, setPendingTxCount] = useState(0);
  const [failedTxCount, setFailedTxCount] = useState(0);
  const [offlineSince, setOfflineSince] = useState<Date | null>(null);
  const [cacheReady, setCacheReady] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Heartbeat: try to reach the server
  const checkServer = useCallback(async () => {
    try {
      const res = await fetch("/api/me", {
        method: "HEAD",
        cache: "no-store",
      });
      setServerReachable(res.ok);
      if (res.ok && offlineSince) {
        setOfflineSince(null);
      }
    } catch {
      setServerReachable(false);
      if (!offlineSince) {
        setOfflineSince(new Date());
      }
    }
  }, [offlineSince]);

  // Check pending transactions
  const checkQueue = useCallback(async () => {
    try {
      const pending = await getPendingTxs();
      const { getAllTxs } = await import("./offline-db");
      const all = await getAllTxs();
      setPendingTxCount(pending.length);
      setFailedTxCount(all.filter((t) => t.status === "failed").length);
    } catch {
      // IndexedDB not available
    }
  }, []);

  // Check cache readiness
  const checkCache = useCallback(async () => {
    try {
      const { isCacheReady } = await import("./offline-db");
      const status = await isCacheReady();
      setCacheReady(status.ready);
    } catch {
      setCacheReady(false);
    }
  }, []);

  const refresh = useCallback(() => {
    checkServer();
    checkQueue();
    checkCache();
  }, [checkServer, checkQueue, checkCache]);

  // Browser online/offline events
  useEffect(() => {
    const handleOnline = () => setBrowserOnline(true);
    const handleOffline = () => {
      setBrowserOnline(false);
      setOfflineSince((prev) => prev ?? new Date());
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Periodic heartbeat + queue check
  useEffect(() => {
    // Initial check
    refresh();

    const interval = browserOnline
      ? HEARTBEAT_INTERVAL_MS
      : HEARTBEAT_OFFLINE_INTERVAL_MS;

    heartbeatRef.current = setInterval(refresh, interval);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [browserOnline, refresh]);

  // Compute derived state
  const offlineMinutes = offlineSince
    ? Math.floor((Date.now() - offlineSince.getTime()) / 60_000)
    : 0;

  const isOnline = browserOnline && serverReachable;
  let state: ConnectionState;

  if (isOnline && pendingTxCount > 0) {
    state = "syncing";
  } else if (isOnline) {
    state = "online";
  } else if (offlineMinutes >= DEGRADED_THRESHOLD_MINUTES) {
    state = "degraded";
  } else {
    state = "offline";
  }

  return {
    state,
    browserOnline,
    serverReachable,
    pendingTxCount,
    failedTxCount,
    offlineSince,
    offlineMinutes,
    cacheReady,
    refresh,
  };
}
