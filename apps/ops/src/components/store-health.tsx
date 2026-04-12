"use client";

import { useState, useEffect } from "react";
import { formatCents } from "@/lib/types";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/*  Store Health Dashboard — submarine combat readiness model           */
/*                                                                      */
/*  Mixed paradigms:                                                    */
/*    HEALTH: status dots (green/yellow/red) — "needs attention?"       */
/*    METRICS: big numbers + context — "how are we doing?"              */
/*    ACTIONS: buttons — "what can I do?"                               */
/*                                                                      */
/*  Drill-down works the same everywhere:                               */
/*  click a card → see detail → back to overview.                       */
/* ------------------------------------------------------------------ */

type Status = "green" | "yellow" | "red";

interface HealthItem {
  id?: string;
  label: string;
  status: Status;
  detail: string;
  action?: string;
  actionHref?: string;
}

interface HealthDetail {
  key: string;
  label: string;
  status: Status;
  summary: string;
  items?: HealthItem[];
}

interface HealthDomain {
  key: string;
  label: string;
  icon: string;
  status: Status;
  summary: string;
  details: HealthDetail[];
}

interface StoreHealthData {
  overall: Status;
  domains: HealthDomain[];
  timestamp: string;
}

const STATUS_DOT: Record<Status, string> = {
  green: "bg-green-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
};

const STATUS_BORDER: Record<Status, string> = {
  green: "border-green-500/30",
  yellow: "border-amber-500/30",
  red: "border-red-500/30",
};

const STATUS_BG: Record<Status, string> = {
  green: "bg-green-500/5",
  yellow: "bg-amber-500/5",
  red: "bg-red-500/5",
};

/** A11Y: never rely on color alone — dot + shape + aria-label */
const STATUS_ICON: Record<Status, string> = {
  green: "✓",
  yellow: "⚠",
  red: "✗",
};

const STATUS_ARIA: Record<Status, string> = {
  green: "OK",
  yellow: "Needs attention",
  red: "Action required",
};

function StatusDot({ status, size = "md" }: { status: Status; size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? "w-2 h-2" : size === "lg" ? "w-3.5 h-3.5" : "w-2.5 h-2.5";
  return (
    <span
      className={`inline-block rounded-full ${s} ${STATUS_DOT[status]}`}
      role="img"
      aria-label={STATUS_ARIA[status]}
      title={STATUS_ARIA[status]}
    />
  );
}

/** Use this when the dot needs a visible text label too (e.g., alert banners) */
function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border ${STATUS_BORDER[status]} ${STATUS_BG[status]} px-2 py-0.5 text-xs font-semibold`}>
      <span aria-hidden="true">{STATUS_ICON[status]}</span>
      <span>{STATUS_ARIA[status]}</span>
    </span>
  );
}

export function StoreHealth() {
  const [data, setData] = useState<StoreHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [drillPath, setDrillPath] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/health/store")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-muted text-sm">
        <span className="inline-block h-4 w-4 rounded-full border-2 border-accent border-t-transparent animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  if (!data) return null;

  const currentDomain = drillPath.length >= 1 ? data.domains.find((d) => d.key === drillPath[0]) : null;
  const currentDetail = drillPath.length >= 2 && currentDomain ? currentDomain.details.find((d) => d.key === drillPath[1]) : null;

  // ── Level 3: Individual items ──
  if (currentDetail?.items && currentDetail.items.length > 0 && drillPath.length >= 2) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => setDrillPath([])} className="text-accent hover:underline">Overview</button>
          <span className="text-muted">/</span>
          <button onClick={() => setDrillPath([drillPath[0]])} className="text-accent hover:underline">{currentDomain?.label}</button>
          <span className="text-muted">/</span>
          <span className="text-foreground font-medium">{currentDetail.label}</span>
        </div>

        <div className="flex items-center gap-2">
          <StatusDot status={currentDetail.status} size="lg" />
          <h2 className="text-base font-semibold text-foreground">{currentDetail.label}</h2>
          <span className="text-xs text-muted">— {currentDetail.summary}</span>
        </div>

        <div className="space-y-2">
          {currentDetail.items.map((item, i) => (
            <div key={item.id ?? i} className={`flex items-center justify-between rounded-xl border ${STATUS_BORDER[item.status]} ${STATUS_BG[item.status]} px-4 py-3`}>
              <div className="flex items-center gap-3 min-w-0">
                <StatusDot status={item.status} size="sm" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{item.label}</div>
                  <div className="text-xs text-muted">{item.detail}</div>
                </div>
              </div>
              {item.actionHref && (
                <Link href={item.actionHref} className="shrink-0 rounded-lg bg-accent/10 border border-accent/30 px-3 py-1 text-xs font-medium text-accent hover:bg-accent/20 transition-colors">
                  {item.action ?? "View"}
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Level 2: Domain drill-down ──
  if (currentDomain && drillPath.length >= 1) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => setDrillPath([])} className="text-accent hover:underline">Overview</button>
          <span className="text-muted">/</span>
          <span className="text-foreground font-medium">{currentDomain.label}</span>
        </div>

        <div className="flex items-center gap-2">
          <StatusDot status={currentDomain.status} size="lg" />
          <h2 className="text-base font-semibold text-foreground">{currentDomain.icon} {currentDomain.label}</h2>
          <span className="text-xs text-muted">— {currentDomain.summary}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {currentDomain.details.map((detail) => {
            const hasItems = detail.items && detail.items.length > 0;
            return (
              <button
                key={detail.key}
                onClick={() => hasItems ? setDrillPath([currentDomain.key, detail.key]) : undefined}
                disabled={!hasItems}
                className={`rounded-xl border ${STATUS_BORDER[detail.status]} ${STATUS_BG[detail.status]} p-4 text-left transition-all ${hasItems ? "active:scale-[0.98]" : "opacity-70"}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <StatusDot status={detail.status} size="sm" />
                  <span className="text-sm font-semibold text-foreground">{detail.label}</span>
                  {hasItems && <span className="ml-auto text-xs text-muted">→</span>}
                </div>
                <p className="text-xs text-muted">{detail.summary}</p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Level 1: The command center ──
  // Extract key metrics from domain data
  const sales = data.domains.find((d) => d.key === "sales");
  const inventory = data.domains.find((d) => d.key === "inventory");
  const people = data.domains.find((d) => d.key === "people");
  const money = data.domains.find((d) => d.key === "money");
  const events = data.domains.find((d) => d.key === "events");

  // Domains that need attention (yellow or red)
  const alerts = data.domains.filter((d) => d.status !== "green");

  return (
    <div className="space-y-4">

      {/* ── ROW 1: Health alerts (only if something needs attention) ── */}
      {alerts.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {alerts.map((domain) => (
            <button
              key={domain.key}
              onClick={() => setDrillPath([domain.key])}
              className={`flex items-center gap-2 rounded-xl border ${STATUS_BORDER[domain.status]} ${STATUS_BG[domain.status]} px-3 py-2 text-left transition-all active:scale-[0.97]`}
            >
              <span aria-hidden="true" className="text-xs">{STATUS_ICON[domain.status]}</span>
              <span className="text-sm font-medium text-foreground">{domain.icon} {domain.label}</span>
              <span className="text-xs text-muted">{domain.summary}</span>
              <span className="text-xs text-muted" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-2.5">
          <span aria-hidden="true" className="text-xs">✓</span>
          <span className="text-sm font-medium text-foreground">All systems operational</span>
          <span className="ml-auto text-xs text-muted">
            {new Date(data.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      )}

      {/* ── ROW 2: Today's metrics (numbers, not status) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {sales && (
          <div className="rounded-xl border border-card-border bg-card p-4">
            <div className="text-xs text-muted font-medium uppercase tracking-wider">Sales Today</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">
              {sales.summary.match(/^\d+/)?.[0] ?? "0"}
            </div>
            <div className="text-xs text-muted mt-0.5">
              {sales.summary.replace(/^\d+\s*sales?\s*·?\s*/, "")}
            </div>
          </div>
        )}
        {money && (
          <div className="rounded-xl border border-card-border bg-card p-4">
            <div className="text-xs text-muted font-medium uppercase tracking-wider">Revenue</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-foreground font-mono">
              {money.summary.match(/\+?\$[\d,.]+/)?.[0] ?? "$0"}
            </div>
            <div className="text-xs text-muted mt-0.5">today</div>
          </div>
        )}
        {people && (
          <button onClick={() => setDrillPath(["people"])} className="rounded-xl border border-card-border bg-card p-4 text-left hover:border-accent/30 transition-colors">
            <div className="text-xs text-muted font-medium uppercase tracking-wider">Customers</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">
              {people.summary.match(/^\d+/)?.[0] ?? "0"}
            </div>
            <div className="text-xs text-muted mt-0.5">{people.details.find((d) => d.key === "churn_risk")?.summary?.match(/^\d+/)?.[0] ?? "0"} at risk</div>
          </button>
        )}
        {events && (
          <div className="rounded-xl border border-card-border bg-card p-4">
            <div className="text-xs text-muted font-medium uppercase tracking-wider">Events</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">
              {events.summary.match(/^\d+/)?.[0] ?? "0"}
            </div>
            <div className="text-xs text-muted mt-0.5">upcoming</div>
          </div>
        )}
      </div>

      {/* ── ROW 3: Quick actions (buttons, not status) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Link
          href="/dashboard/register"
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-white active:bg-emerald-700 transition-colors"
        >
          <span className="text-lg">◈</span>
          <span className="text-sm font-semibold">Register</span>
        </Link>
        <Link
          href="/dashboard/trade-ins"
          className="flex items-center gap-2 rounded-xl border border-card-border bg-card px-4 py-3 text-foreground hover:bg-card-hover active:scale-[0.98] transition-all"
        >
          <span className="text-lg text-accent">⇄</span>
          <span className="text-sm font-semibold">Trade-Ins</span>
        </Link>
        <Link
          href="/dashboard/inventory/receive"
          className="flex items-center gap-2 rounded-xl border border-card-border bg-card px-4 py-3 text-foreground hover:bg-card-hover active:scale-[0.98] transition-all"
        >
          <span className="text-lg text-accent">⤓</span>
          <span className="text-sm font-semibold">Receive</span>
        </Link>
        <Link
          href="/dashboard/events"
          className="flex items-center gap-2 rounded-xl border border-card-border bg-card px-4 py-3 text-foreground hover:bg-card-hover active:scale-[0.98] transition-all"
        >
          <span className="text-lg text-accent">★</span>
          <span className="text-sm font-semibold">Events</span>
        </Link>
      </div>

      {/* ── ROW 4: Inventory health (only if there are issues, uses status) ── */}
      {inventory && inventory.status !== "green" && (
        <button
          onClick={() => setDrillPath(["inventory"])}
          className={`w-full flex items-center gap-3 rounded-xl border ${STATUS_BORDER[inventory.status]} ${STATUS_BG[inventory.status]} px-4 py-3 text-left transition-all active:scale-[0.99]`}
        >
          <StatusDot status={inventory.status} />
          <span className="text-sm font-medium text-foreground">▦ Inventory: {inventory.summary}</span>
          <span className="ml-auto text-xs text-muted">View details →</span>
        </button>
      )}
    </div>
  );
}
