"use client";

import { useState, useEffect } from "react";
import { formatCents } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Store Health Dashboard — submarine combat readiness model           */
/*                                                                      */
/*  Level 0: Overall status (one line)                                  */
/*  Level 1: Domain cards (Sales, Inventory, People, Money, Events)     */
/*  Level 2: Sub-domain details (Low Stock, Churn Risk, etc.)           */
/*  Level 3: Individual items (specific items, specific customers)       */
/*                                                                      */
/*  Every level fits in one viewport. No scroll.                        */
/*  Drill down by clicking. "Back" to zoom out.                         */
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

interface StoreHealth {
  overall: Status;
  domains: HealthDomain[];
  timestamp: string;
}

const STATUS_DOT: Record<Status, string> = {
  green: "bg-green-500 shadow-green-500/50",
  yellow: "bg-amber-500 shadow-amber-500/50",
  red: "bg-red-500 shadow-red-500/50",
};

const STATUS_BORDER: Record<Status, string> = {
  green: "border-green-500/30 hover:border-green-500/50",
  yellow: "border-amber-500/30 hover:border-amber-500/50",
  red: "border-red-500/30 hover:border-red-500/50",
};

const STATUS_BG: Record<Status, string> = {
  green: "bg-green-500/5",
  yellow: "bg-amber-500/5",
  red: "bg-red-500/5",
};

const STATUS_LABEL: Record<Status, string> = {
  green: "Operational",
  yellow: "Needs Attention",
  red: "Action Required",
};

function StatusDot({ status, size = "md" }: { status: Status; size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "sm" ? "w-2 h-2" : size === "lg" ? "w-4 h-4" : "w-3 h-3";
  return (
    <span className={`inline-block rounded-full ${sizeClass} ${STATUS_DOT[status]} shadow-sm`} />
  );
}

export function StoreHealth() {
  const [data, setData] = useState<StoreHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Navigation state: [null] = top level, [domain] = domain view, [domain, detail] = detail view
  const [drillPath, setDrillPath] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/health/store")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted">
        <span className="inline-block h-5 w-5 rounded-full border-2 border-accent border-t-transparent animate-spin mr-3" />
        Loading store health...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
        Unable to load store health. {error}
      </div>
    );
  }

  const currentDomain = drillPath.length >= 1
    ? data.domains.find((d) => d.key === drillPath[0])
    : null;
  const currentDetail = drillPath.length >= 2 && currentDomain
    ? currentDomain.details.find((d) => d.key === drillPath[1])
    : null;

  // ── Level 3: Individual items ──
  if (currentDetail?.items && currentDetail.items.length > 0 && drillPath.length >= 2) {
    return (
      <div className="space-y-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setDrillPath([])}
            className="text-accent hover:underline"
          >
            Health
          </button>
          <span className="text-muted">/</span>
          <button
            onClick={() => setDrillPath([drillPath[0]])}
            className="text-accent hover:underline"
          >
            {currentDomain?.label}
          </button>
          <span className="text-muted">/</span>
          <span className="text-foreground font-medium">{currentDetail.label}</span>
        </div>

        {/* Status header */}
        <div className="flex items-center gap-3">
          <StatusDot status={currentDetail.status} size="lg" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">{currentDetail.label}</h2>
            <p className="text-sm text-muted">{currentDetail.summary}</p>
          </div>
        </div>

        {/* Items */}
        <div className="space-y-2">
          {currentDetail.items.map((item, i) => (
            <div
              key={item.id ?? i}
              className={`flex items-center justify-between rounded-xl border ${STATUS_BORDER[item.status]} ${STATUS_BG[item.status]} px-4 py-3`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <StatusDot status={item.status} size="sm" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{item.label}</div>
                  <div className="text-xs text-muted">{item.detail}</div>
                </div>
              </div>
              {item.action && item.actionHref && (
                <a
                  href={item.actionHref}
                  className="shrink-0 rounded-lg bg-accent/10 border border-accent/30 px-3 py-1 text-xs font-medium text-accent hover:bg-accent/20 transition-colors"
                >
                  {item.action}
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Level 2: Domain detail (sub-domains) ──
  if (currentDomain && drillPath.length >= 1) {
    return (
      <div className="space-y-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setDrillPath([])}
            className="text-accent hover:underline"
          >
            Health
          </button>
          <span className="text-muted">/</span>
          <span className="text-foreground font-medium">{currentDomain.label}</span>
        </div>

        {/* Domain status header */}
        <div className="flex items-center gap-3">
          <StatusDot status={currentDomain.status} size="lg" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {currentDomain.icon} {currentDomain.label}
            </h2>
            <p className="text-sm text-muted">{currentDomain.summary}</p>
          </div>
        </div>

        {/* Sub-domain cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {currentDomain.details.map((detail) => {
            const hasItems = detail.items && detail.items.length > 0;
            return (
              <button
                key={detail.key}
                onClick={() => hasItems ? setDrillPath([currentDomain.key, detail.key]) : undefined}
                disabled={!hasItems}
                className={`rounded-xl border ${STATUS_BORDER[detail.status]} ${STATUS_BG[detail.status]} p-4 text-left transition-all ${
                  hasItems ? "cursor-pointer active:scale-[0.98]" : "cursor-default opacity-80"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <StatusDot status={detail.status} size="sm" />
                  <span className="text-sm font-semibold text-foreground">{detail.label}</span>
                  {hasItems && (
                    <span className="ml-auto text-xs text-muted">→</span>
                  )}
                </div>
                <p className="text-xs text-muted">{detail.summary}</p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Level 1: Top-level domain cards (the "single slide") ──
  return (
    <div className="space-y-4">
      {/* Overall status banner */}
      <div className={`flex items-center gap-3 rounded-xl border ${STATUS_BORDER[data.overall]} ${STATUS_BG[data.overall]} px-4 py-3`}>
        <StatusDot status={data.overall} size="lg" />
        <div>
          <span className="text-sm font-bold text-foreground">
            Store Health: {STATUS_LABEL[data.overall]}
          </span>
        </div>
        <span className="ml-auto text-xs text-muted">
          {new Date(data.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      {/* Domain cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {data.domains.map((domain) => (
          <button
            key={domain.key}
            onClick={() => setDrillPath([domain.key])}
            className={`rounded-xl border ${STATUS_BORDER[domain.status]} ${STATUS_BG[domain.status]} p-4 text-left transition-all hover:shadow-md active:scale-[0.97]`}
          >
            <div className="flex items-center gap-2 mb-2">
              <StatusDot status={domain.status} />
              <span className="text-lg">{domain.icon}</span>
            </div>
            <div className="text-sm font-semibold text-foreground">{domain.label}</div>
            <p className="text-xs text-muted mt-1 leading-relaxed line-clamp-2">{domain.summary}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
