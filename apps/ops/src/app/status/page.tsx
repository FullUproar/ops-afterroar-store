"use client";

import { useEffect, useState } from "react";

/* ------------------------------------------------------------------ */
/*  /status — Public system status page                                 */
/*  Shows uptime, response times, and recent health checks.             */
/*  No auth required. Light theme (public-facing).                      */
/* ------------------------------------------------------------------ */

interface HealthData {
  uptime_percent: number;
  avg_response_ms: number;
  checks_24h: number;
  healthy_24h: number;
  last_check: string | null;
  recent: Array<{
    created_at: string;
    severity: string;
    message: string;
  }>;
}

interface LiveHealth {
  status: string;
  response_ms: number;
  checks: Record<string, { ok: boolean; ms: number }>;
  version: string;
}

export default function StatusPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [live, setLive] = useState<LiveHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/health/synthetic").then((r) => r.ok ? r.json() : null),
      fetch("/api/health").then((r) => r.json()),
    ]).then(([historical, liveData]) => {
      setData(historical);
      setLive(liveData);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const uptimeColor = (pct: number) =>
    pct >= 99.9 ? "#22c55e" : pct >= 99 ? "#eab308" : "#ef4444";

  const statusLabel = live?.status === "healthy" ? "All Systems Operational" : "Degraded Performance";
  const statusColor = live?.status === "healthy" ? "#22c55e" : "#eab308";

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", maxWidth: 640, margin: "0 auto", padding: "32px 16px", color: "#1a1a2e", background: "#ffffff", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            <span style={{ color: "#FF8200" }}>Afterroar</span> System Status
          </div>
        </div>
        <a href="/" style={{ fontSize: 13, color: "#999", textDecoration: "none" }}>Back to site</a>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 48, color: "#999" }}>Checking systems...</div>
      ) : (
        <>
          {/* Current status banner */}
          <div style={{
            padding: "16px 20px", borderRadius: 12, marginBottom: 24,
            background: `${statusColor}10`, border: `1px solid ${statusColor}40`,
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: statusColor }} />
            <div style={{ fontWeight: 600, fontSize: 16, color: statusColor === "#22c55e" ? "#166534" : "#92400e" }}>
              {statusLabel}
            </div>
          </div>

          {/* Service checks */}
          {live?.checks && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Services</div>
              {Object.entries(live.checks).map(([name, check]) => (
                <div key={name} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 0", borderBottom: "1px solid #f3f4f6",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: check.ok ? "#22c55e" : "#ef4444" }} />
                    <span style={{ fontSize: 14, textTransform: "capitalize" }}>{name.replace(/_/g, " ")}</span>
                  </div>
                  <span style={{ fontSize: 13, color: "#999", fontFamily: "monospace" }}>
                    {check.ok ? `${check.ms}ms` : "Down"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Uptime + response time */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
            <div style={{ padding: 16, borderRadius: 12, border: "1px solid #e5e7eb", textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: uptimeColor(data?.uptime_percent ?? 100), fontFamily: "monospace" }}>
                {data?.uptime_percent?.toFixed(2) ?? "—"}%
              </div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>Uptime (24h)</div>
            </div>
            <div style={{ padding: 16, borderRadius: 12, border: "1px solid #e5e7eb", textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#1a1a2e", fontFamily: "monospace" }}>
                {data?.avg_response_ms ?? live?.response_ms ?? "—"}ms
              </div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>Avg Response</div>
            </div>
          </div>

          {/* Recent checks timeline */}
          {data?.recent && data.recent.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Recent Checks</div>
              <div style={{ display: "flex", gap: 2, marginBottom: 8 }}>
                {data.recent.map((check, i) => (
                  <div
                    key={i}
                    title={`${new Date(check.created_at).toLocaleTimeString()} — ${check.severity}`}
                    style={{
                      flex: 1, height: 24, borderRadius: 3,
                      background: check.severity === "info" ? "#22c55e" : "#ef4444",
                      opacity: 0.8,
                    }}
                  />
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#999" }}>
                <span>1 hour ago</span>
                <span>Now</span>
              </div>
            </div>
          )}

          {/* Version + last check */}
          <div style={{ marginTop: 32, textAlign: "center", fontSize: 12, color: "#ccc" }}>
            {live?.version && <span>Version: {live.version}</span>}
            {data?.last_check && <span> &middot; Last check: {new Date(data.last_check).toLocaleTimeString()}</span>}
          </div>
        </>
      )}

      <div style={{ marginTop: 32, textAlign: "center", fontSize: 11, color: "#ddd" }}>
        Afterroar Store Ops by Full Uproar Games
      </div>
    </div>
  );
}
