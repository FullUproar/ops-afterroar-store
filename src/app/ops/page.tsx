"use client";

import { useEffect, useState, useCallback, useRef } from "react";

/* ------------------------------------------------------------------ */
/*  /ops — Ops Monitor PWA Dashboard                                    */
/*  Mobile-first dark theme. Real-time health monitoring.              */
/*  Installable as standalone PWA with push notifications.             */
/* ------------------------------------------------------------------ */

interface ServiceCheck {
  ok: boolean;
  ms: number;
  error?: string;
}

interface LiveHealth {
  status: string;
  response_ms: number;
  checks: Record<string, ServiceCheck>;
  version: string;
  timestamp: string;
}

interface SyntheticResult {
  created_at: string;
  severity: string;
  message: string;
  metadata: {
    results?: Array<{ test: string; ok: boolean; ms: number; error?: string }>;
    summary?: { all_passed: boolean; avg_ms: number; max_ms: number; timestamp: string };
  } | null;
}

interface HistoricalData {
  uptime_percent: number;
  avg_response_ms: number;
  checks_24h: number;
  healthy_24h: number;
  last_check: string | null;
  recent: SyntheticResult[];
}

const SERVICE_LABELS: Record<string, string> = {
  database: "Database",
  stripe: "Payments",
  email: "Email",
  shipping: "Shipping",
};

const REFRESH_INTERVAL = 30_000; // 30 seconds

export default function OpsMonitorPage() {
  const [live, setLive] = useState<LiveHealth | null>(null);
  const [historical, setHistorical] = useState<HistoricalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [testSending, setTestSending] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch health data
  const fetchData = useCallback(async () => {
    try {
      const [liveRes, histRes] = await Promise.all([
        fetch("/api/health").then((r) => r.json()),
        fetch("/api/health/synthetic").then((r) => (r.ok ? r.json() : null)),
      ]);
      setLive(liveRes);
      setHistorical(histRes);
      setLastRefresh(new Date());
    } catch {
      // Silent fail — will retry on next interval
    } finally {
      setLoading(false);
    }
  }, []);

  // Register service worker + check push state
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw-ops.js")
        .then((reg) => {
          setSwRegistration(reg);
          // Check existing push subscription
          reg.pushManager.getSubscription().then((sub) => {
            setPushEnabled(!!sub);
          });
        })
        .catch(() => {});
    }
    setPushSupported("PushManager" in window);

    // Capture install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Initial fetch + auto-refresh
  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  // Toggle push notifications
  const togglePush = async () => {
    if (!swRegistration || !pushSupported) return;

    if (pushEnabled) {
      // Unsubscribe
      const sub = await swRegistration.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setPushEnabled(false);
    } else {
      // Subscribe
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;

      const vapidKey = await fetch("/api/push/vapid-key").then((r) =>
        r.ok ? r.json() : null,
      );
      if (!vapidKey?.key) {
        setPushError("Push not configured — VAPID keys needed in Vercel env vars");
        return;
      }

      try {
        const sub = await swRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey.key),
        });

        const subJson = sub.toJSON();
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: subJson.endpoint,
            keys: subJson.keys,
          }),
        });
        setPushEnabled(true);
        setPushError(null);
      } catch (err) {
        setPushError("Failed to enable push — try reinstalling the app");
      }
    }
  };

  // Send test notification
  const sendTestNotification = async () => {
    setTestSending(true);
    try {
      // Use local notification as test (no server round-trip needed)
      if (swRegistration && Notification.permission === "granted") {
        await swRegistration.showNotification("Afterroar Ops — Test", {
          body: "Push notifications are working correctly.",
          icon: "/logo-ring.png",
          badge: "/logo-ring-favicon.png",
          tag: "ops-test",
          requireInteraction: false,
          vibrate: [200, 100, 200],
        } as NotificationOptions);
      }
    } catch {
      // Silent
    } finally {
      setTimeout(() => setTestSending(false), 1000);
    }
  };

  // Install PWA
  const installPwa = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    setInstallPrompt(null);
  };

  // Derived state
  const allHealthy = live?.status === "healthy";
  const nextRefresh = lastRefresh
    ? new Date(lastRefresh.getTime() + REFRESH_INTERVAL)
    : null;
  const failingServices = live?.checks
    ? Object.entries(live.checks).filter(([, c]) => !c.ok)
    : [];

  // Response time chart data (last 24h synthetic results)
  const chartData = historical?.recent
    ? [...historical.recent].reverse().slice(-48)
    : [];

  return (
    <div
      style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        background: "#0a0a0a",
        color: "#e0e0e0",
        minHeight: "100dvh",
        padding: "0 0 env(safe-area-inset-bottom, 0px) 0",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 16px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #1a1a2e",
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            <span style={{ color: "#FF8200" }}>Afterroar</span> Ops
          </div>
          <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
            System Monitor
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {installPrompt && (
            <button
              onClick={installPwa}
              style={{
                background: "#FF8200",
                color: "#000",
                border: "none",
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Install
            </button>
          )}
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: loading ? "#666" : allHealthy ? "#22c55e" : "#ef4444",
              animation: loading ? "pulse 1.5s infinite" : undefined,
            }}
          />
        </div>
      </div>

      {loading ? (
        <div
          style={{
            textAlign: "center",
            padding: 64,
            color: "#666",
          }}
        >
          Checking systems...
        </div>
      ) : (
        <div style={{ padding: "16px", maxWidth: 480, margin: "0 auto" }}>
          {/* Status Banner */}
          <div
            style={{
              padding: "20px",
              borderRadius: 12,
              marginBottom: 16,
              background: allHealthy ? "#22c55e10" : "#ef444410",
              border: `1px solid ${allHealthy ? "#22c55e40" : "#ef444440"}`,
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: allHealthy ? "#22c55e20" : "#ef444420",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 12px",
                fontSize: 24,
              }}
            >
              {allHealthy ? "\u2713" : "\u2717"}
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: allHealthy ? "#22c55e" : "#ef4444",
              }}
            >
              {allHealthy ? "All Systems Go" : "Issue Detected"}
            </div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
              {lastRefresh && (
                <span>
                  Last check: {lastRefresh.toLocaleTimeString()}
                </span>
              )}
              {nextRefresh && (
                <span> &middot; Next: {nextRefresh.toLocaleTimeString()}</span>
              )}
            </div>
          </div>

          {/* Service Status Dots */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              marginBottom: 16,
            }}
          >
            {live?.checks &&
              Object.entries(live.checks).map(([name, check]) => (
                <div
                  key={name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "#111118",
                    border: "1px solid #1a1a2e",
                  }}
                >
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: check.ok ? "#22c55e" : "#ef4444",
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {SERVICE_LABELS[name] || name}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: check.ok ? "#666" : "#ef4444",
                        fontFamily: "monospace",
                      }}
                    >
                      {check.ok ? `${check.ms}ms` : "Down"}
                    </div>
                  </div>
                </div>
              ))}
          </div>

          {/* Response Time Graph */}
          {chartData.length > 0 && (
            <div
              style={{
                padding: "16px",
                borderRadius: 12,
                background: "#111118",
                border: "1px solid #1a1a2e",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#888",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 12,
                }}
              >
                Response Time (24h)
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 2,
                  height: 80,
                }}
              >
                {chartData.map((check, i) => {
                  const meta = check.metadata as SyntheticResult["metadata"];
                  const avgMs = meta?.summary?.avg_ms || 0;
                  const maxMs = Math.max(
                    ...chartData.map((c) => {
                      const m = c.metadata as SyntheticResult["metadata"];
                      return m?.summary?.avg_ms || 0;
                    }),
                    500,
                  );
                  const height = Math.max(4, (avgMs / maxMs) * 72);
                  const color =
                    avgMs > 1000
                      ? "#ef4444"
                      : avgMs > 500
                        ? "#eab308"
                        : check.severity === "info"
                          ? "#22c55e"
                          : "#ef4444";

                  return (
                    <div
                      key={i}
                      title={`${new Date(check.created_at).toLocaleTimeString()} — ${avgMs}ms`}
                      style={{
                        flex: 1,
                        height,
                        borderRadius: 2,
                        background: color,
                        opacity: 0.85,
                        minWidth: 3,
                        transition: "height 0.3s ease",
                      }}
                    />
                  );
                })}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 10,
                  color: "#555",
                  marginTop: 6,
                }}
              >
                <span>Oldest</span>
                <span>
                  {chartData.length > 0 && (
                    <>
                      <span style={{ color: "#22c55e" }}>&#9632;</span> &lt;500ms{" "}
                      <span style={{ color: "#eab308" }}>&#9632;</span> &lt;1s{" "}
                      <span style={{ color: "#ef4444" }}>&#9632;</span> &gt;1s
                    </>
                  )}
                </span>
                <span>Now</span>
              </div>
            </div>
          )}

          {/* Active Alerts */}
          {failingServices.length > 0 && (
            <div
              style={{
                padding: "16px",
                borderRadius: 12,
                background: "#ef444410",
                border: "1px solid #ef444430",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#ef4444",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 8,
                }}
              >
                Active Alerts
              </div>
              {failingServices.map(([name, check]) => (
                <div
                  key={name}
                  style={{
                    padding: "8px 0",
                    borderBottom: "1px solid #ef444420",
                    fontSize: 13,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ color: "#ef4444" }}>
                    {SERVICE_LABELS[name] || name} is down
                  </span>
                  <span style={{ color: "#666", fontFamily: "monospace", fontSize: 11 }}>
                    {check.error || "Unavailable"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Push Notifications Toggle */}
          <div
            style={{
              padding: "14px 16px",
              borderRadius: 12,
              background: "#111118",
              border: "1px solid #1a1a2e",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                Push Notifications
              </div>
              <div style={{ fontSize: 11, color: pushError ? "#ef4444" : "#666", marginTop: 2 }}>
                {pushError
                  ? pushError
                  : pushSupported
                    ? pushEnabled
                      ? "Alerts enabled"
                      : "Get notified when systems go down"
                    : "Not supported in this browser"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {pushEnabled && (
                <button
                  onClick={sendTestNotification}
                  disabled={testSending}
                  style={{
                    background: "transparent",
                    color: "#FF8200",
                    border: "1px solid #FF820040",
                    borderRadius: 6,
                    padding: "5px 10px",
                    fontSize: 11,
                    cursor: "pointer",
                    opacity: testSending ? 0.5 : 1,
                  }}
                >
                  {testSending ? "Sent" : "Test"}
                </button>
              )}
              {pushSupported && (
                <button
                  onClick={togglePush}
                  style={{
                    width: 44,
                    height: 24,
                    minHeight: 24,
                    maxHeight: 24,
                    borderRadius: 12,
                    border: "none",
                    padding: 0,
                    margin: 0,
                    cursor: "pointer",
                    background: pushEnabled ? "#22c55e" : "#333",
                    position: "relative",
                    transition: "background 0.2s",
                    display: "flex",
                    alignItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "#fff",
                      position: "absolute",
                      top: 3,
                      left: pushEnabled ? 23 : 3,
                      transition: "left 0.2s",
                    }}
                  />
                </button>
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                padding: "14px 12px",
                borderRadius: 10,
                background: "#111118",
                border: "1px solid #1a1a2e",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  fontFamily: "monospace",
                  color: "#FF8200",
                }}
              >
                {historical?.uptime_percent?.toFixed(1) ?? "--"}%
              </div>
              <div style={{ fontSize: 10, color: "#666", marginTop: 4 }}>
                Uptime 24h
              </div>
            </div>
            <div
              style={{
                padding: "14px 12px",
                borderRadius: 10,
                background: "#111118",
                border: "1px solid #1a1a2e",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  fontFamily: "monospace",
                  color: "#e0e0e0",
                }}
              >
                {historical?.avg_response_ms ?? live?.response_ms ?? "--"}
                <span style={{ fontSize: 12, color: "#666" }}>ms</span>
              </div>
              <div style={{ fontSize: 10, color: "#666", marginTop: 4 }}>
                Avg Response
              </div>
            </div>
            <div
              style={{
                padding: "14px 12px",
                borderRadius: 10,
                background: "#111118",
                border: "1px solid #1a1a2e",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  fontFamily: "monospace",
                  color: "#e0e0e0",
                }}
              >
                {historical?.checks_24h ?? "--"}
              </div>
              <div style={{ fontSize: 10, color: "#666", marginTop: 4 }}>
                Checks 24h
              </div>
            </div>
          </div>

          {/* Recent Checks Log */}
          {historical?.recent && historical.recent.length > 0 && (
            <div
              style={{
                padding: "16px",
                borderRadius: 12,
                background: "#111118",
                border: "1px solid #1a1a2e",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#888",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 10,
                }}
              >
                Recent Checks
              </div>
              {historical.recent.slice(0, 20).map((check, i) => {
                const meta = check.metadata as SyntheticResult["metadata"];
                const passed = meta?.results?.filter((r) => r.ok).length ?? 0;
                const total = meta?.results?.length ?? 0;
                const avgMs = meta?.summary?.avg_ms ?? 0;
                const allPassed = meta?.summary?.all_passed ?? check.severity === "info";

                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 0",
                      borderBottom:
                        i < Math.min(historical.recent.length, 20) - 1
                          ? "1px solid #1a1a2e"
                          : "none",
                      fontSize: 12,
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <div
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: allPassed ? "#22c55e" : "#ef4444",
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ color: "#888", fontFamily: "monospace" }}>
                        {new Date(check.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <span style={{ color: allPassed ? "#666" : "#ef4444" }}>
                        {passed}/{total}
                      </span>
                      <span
                        style={{
                          color: "#555",
                          fontFamily: "monospace",
                          minWidth: 48,
                          textAlign: "right",
                        }}
                      >
                        {avgMs}ms
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Version */}
          <div
            style={{
              textAlign: "center",
              fontSize: 11,
              color: "#333",
              padding: "8px 0 24px",
            }}
          >
            {live?.version && <span>v{live.version}</span>}
            <span> &middot; Auto-refresh: 30s</span>
            <span> &middot; Afterroar Store Ops</span>
          </div>
        </div>
      )}

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}
