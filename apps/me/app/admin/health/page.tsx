/**
 * /admin/health — sit-rep across all four FU Platform surfaces.
 *
 * Server-renders by polling each app's /api/health in parallel. Auto-
 * refreshes every 30s via meta-refresh. Latency budget per check is
 * 6s; anything slower is reported as degraded but doesn't block the
 * page render.
 *
 * Authoritative alerting lives in Sentry Uptime Monitors + the phone-
 * native watchdog. This page is for at-a-glance visibility, not paging.
 */

import { auth } from "@/lib/auth-config";
import { isAdmin } from "@/lib/admin";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SURFACES: { name: string; url: string; visit: string }[] = [
  { name: "Store Ops",         url: "https://www.afterroar.store/api/health", visit: "https://www.afterroar.store" },
  { name: "Passport",          url: "https://www.afterroar.me/api/health",    visit: "https://www.afterroar.me" },
  { name: "Game Night HQ",     url: "https://hq.fulluproar.com/api/health",   visit: "https://hq.fulluproar.com" },
  { name: "FU Site",           url: "https://www.fulluproar.com/api/health?basic=true", visit: "https://www.fulluproar.com" },
];

interface ProbeResult {
  name: string;
  visit: string;
  status: "healthy" | "degraded" | "unhealthy" | "unreachable";
  httpStatus: number | null;
  latencyMs: number;
  detail?: string;
  version?: string;
}

async function probe(s: { name: string; url: string; visit: string }): Promise<ProbeResult> {
  const start = Date.now();
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(s.url, {
      cache: "no-store",
      signal: ctrl.signal,
      headers: { "User-Agent": "afterroar-health-dashboard/1.0" },
    });
    const latencyMs = Date.now() - start;
    let body: { status?: string; checks?: Record<string, { ok: boolean; error?: string }>; version?: string } = {};
    try { body = await res.json(); } catch {}
    const reportedStatus = body.status;
    const status: ProbeResult["status"] =
      res.status >= 200 && res.status < 300
        ? reportedStatus === "degraded" ? "degraded" : "healthy"
        : res.status === 503
        ? "unhealthy"
        : "unreachable";
    const failingChecks = body.checks
      ? Object.entries(body.checks)
          .filter(([, v]) => v.ok === false)
          .map(([k, v]) => `${k}${v.error ? `: ${v.error}` : ""}`)
          .join("; ")
      : undefined;
    return {
      name: s.name,
      visit: s.visit,
      status,
      httpStatus: res.status,
      latencyMs,
      detail: failingChecks,
      version: body.version,
    };
  } catch (err) {
    return {
      name: s.name,
      visit: s.visit,
      status: "unreachable",
      httpStatus: null,
      latencyMs: Date.now() - start,
      detail: err instanceof Error ? err.message.slice(0, 200) : "fetch failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export default async function HealthPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/admin/health");
  if (!isAdmin(session.user.email)) {
    return (
      <main style={{ maxWidth: "32rem", margin: "0 auto", padding: "4rem 1.5rem", textAlign: "center", color: "#e2e8f0" }}>
        <h1 style={{ color: "#ef4444", fontSize: "1.5rem", fontWeight: 900 }}>Not authorized</h1>
        <Link href="/" style={{ color: "#FF8200" }}>← Back</Link>
      </main>
    );
  }

  const results = await Promise.all(SURFACES.map(probe));
  const overall: ProbeResult["status"] = results.some((r) => r.status === "unhealthy" || r.status === "unreachable")
    ? "unhealthy"
    : results.some((r) => r.status === "degraded")
    ? "degraded"
    : "healthy";

  const overallColor = overall === "healthy" ? "#10b981" : overall === "degraded" ? "#fbbf24" : "#ef4444";
  const overallLabel = overall === "healthy" ? "All systems operational" : overall === "degraded" ? "Some surfaces degraded" : "Outage";

  return (
    <>
      <meta httpEquiv="refresh" content="30" />
      <main style={{ maxWidth: "1000px", margin: "0 auto", padding: "2rem 1.5rem", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>
        <header style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h1 style={{ color: "#FBDB65", fontSize: "1.75rem", fontWeight: 900, margin: 0 }}>Platform Health</h1>
            <p style={{ color: "#6b7280", fontSize: "0.85rem", margin: "0.25rem 0 0" }}>
              Auto-refresh every 30s · Sentry Uptime Monitors are the source of alerts; this page is for visibility.
            </p>
          </div>
          <div style={{
            padding: "0.5rem 1rem",
            background: `${overallColor}20`,
            border: `1px solid ${overallColor}`,
            borderRadius: "0.5rem",
            color: overallColor,
            fontWeight: 800,
            fontSize: "0.9rem",
          }}>
            ● {overallLabel}
          </div>
        </header>

        <section style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          {results.map((r) => {
            const color = r.status === "healthy" ? "#10b981" : r.status === "degraded" ? "#fbbf24" : "#ef4444";
            const label = r.status === "healthy" ? "Healthy" : r.status === "degraded" ? "Degraded" : r.status === "unhealthy" ? "Unhealthy" : "Unreachable";
            return (
              <div
                key={r.name}
                style={{
                  background: "linear-gradient(135deg, rgba(31, 41, 55, 0.85), rgba(17, 24, 39, 0.95))",
                  border: `1px solid ${color}40`,
                  borderRadius: "0.75rem",
                  padding: "1rem 1.25rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ width: "0.75rem", height: "0.75rem", borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}80`, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flexWrap: "wrap" }}>
                    <span style={{ color: "#FBDB65", fontWeight: 800, fontSize: "1rem" }}>{r.name}</span>
                    <span style={{ color, fontWeight: 700, fontSize: "0.78rem" }}>{label}</span>
                    {r.version && (
                      <code style={{ color: "#6b7280", fontSize: "0.7rem", fontFamily: "monospace" }}>v{r.version}</code>
                    )}
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: "0.78rem", marginTop: "0.25rem" }}>
                    {r.httpStatus ? `HTTP ${r.httpStatus} · ` : ""}{r.latencyMs}ms
                    {r.detail ? ` · ${r.detail}` : ""}
                  </div>
                </div>
                <a
                  href={r.visit}
                  target="_blank"
                  rel="noopener"
                  style={{ color: "#FF8200", fontSize: "0.78rem", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}
                >
                  Visit ↗
                </a>
              </div>
            );
          })}
        </section>

        <section style={{ marginTop: "2.5rem", padding: "1rem 1.25rem", background: "rgba(0, 0, 0, 0.3)", border: "1px solid #374151", borderRadius: "0.75rem", color: "#94a3b8", fontSize: "0.85rem", lineHeight: 1.6 }}>
          <strong style={{ color: "#FBDB65" }}>What this page is and isn't:</strong>
          <ul style={{ marginTop: "0.5rem", paddingLeft: "1.25rem" }}>
            <li><strong>This page</strong> = visibility. If you can load it, the failure isn't catastrophic.</li>
            <li><strong>Sentry Uptime Monitors</strong> = the system of record + SMS alerts. Configure once, paged forever.</li>
            <li><strong>Phone-native watchdog (Capacitor app)</strong> = belt-and-suspenders alerting that survives total cloud outage.</li>
          </ul>
        </section>
      </main>
    </>
  );
}
