"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store-context";

/* ------------------------------------------------------------------ */
/*  Intelligence Feed                                                   */
/*  AI-powered actionable insights for game store owners.              */
/*  Sentences, not charts. Actions, not data.                          */
/* ------------------------------------------------------------------ */

interface Insight {
  id: string;
  type: "action" | "warning" | "opportunity" | "celebration";
  priority: "high" | "medium" | "low";
  icon: string;
  title: string;
  message: string;
  metric?: string;
  action?: { label: string; href: string };
  category: "inventory" | "customers" | "events" | "cash_flow" | "pricing" | "staff";
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function priorityBorder(priority: string, type: string) {
  if (type === "celebration") return "border-l-green-500";
  switch (priority) {
    case "high": return "border-l-red-500";
    case "medium": return "border-l-amber-500";
    case "low": return "border-l-green-500";
    default: return "border-l-card-border";
  }
}

function InsightCard({ insight }: { insight: Insight }) {
  const borderClass = priorityBorder(insight.priority, insight.type);

  return (
    <div
      className={`rounded-xl border border-card-border border-l-4 ${borderClass} bg-card/80 p-4 md:p-5 shadow-sm dark:shadow-none backdrop-blur-sm transition-all hover:border-input-border`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-xl shrink-0" aria-hidden="true">
          {insight.icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground leading-snug text-sm md:text-base">
            {insight.title}
          </h3>
          <p className="mt-1 text-sm text-muted leading-relaxed">
            {insight.message}
          </p>
          {insight.action && (
            <Link
              href={insight.action.href}
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
            >
              {insight.action.label}
              <span aria-hidden="true">{"\u2192"}</span>
            </Link>
          )}
        </div>
        {insight.metric && (
          <div className="shrink-0 text-right">
            <span className="text-lg font-bold tabular-nums text-foreground">
              {insight.metric}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function IntelligenceFeed({ compact }: { compact?: boolean }) {
  const { staff, can } = useStore();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadInsights = useCallback(async (refresh = false) => {
    try {
      setLoadError(null);
      if (refresh) setRefreshing(true);
      const qs = refresh ? "?refresh=1" : "";
      const res = await fetch(`/api/intelligence${qs}`);
      if (!res.ok) {
        setLoadError("Unable to load insights. Try again.");
        return;
      }
      const data = await res.json();
      setInsights(data.insights ?? []);
      setGeneratedAt(data.generated_at ?? null);
    } catch {
      setLoadError("Unable to load insights. Try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (can("reports")) {
      loadInsights();
    } else {
      setLoading(false);
    }
  }, [can, loadInsights]);

  if (!can("reports")) return null;

  const greeting = getGreeting();
  const firstName = staff?.name?.split(" ")[0] ?? "there";

  const displayInsights = compact ? insights.slice(0, 4) : insights;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg md:text-xl font-semibold text-foreground">
            {greeting}, {firstName}
          </h2>
          {generatedAt && !loading && (
            <p className="text-xs text-muted mt-0.5">
              Updated {new Date(generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </p>
          )}
        </div>
        <button
          onClick={() => loadInsights(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-card-border bg-card px-3 py-1.5 text-sm text-muted hover:text-foreground hover:border-input-border transition-colors disabled:opacity-50"
          title="Refresh insights"
        >
          <span className={refreshing ? "animate-spin" : ""} aria-hidden="true">
            {"\u21BB"}
          </span>
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Content */}
      {loadError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
          <p className="text-sm text-red-400">{loadError}</p>
          <button
            onClick={() => { setLoadError(null); loadInsights(); }}
            className="mt-2 text-xs text-red-300 underline hover:text-red-200"
          >
            Try again
          </button>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <p className="text-sm text-muted">Analyzing your store...</p>
          </div>
        </div>
      ) : insights.length === 0 ? (
        <div className="rounded-xl border border-card-border bg-card/80 p-8 text-center shadow-sm dark:shadow-none">
          <p className="text-3xl mb-3" aria-hidden="true">{"\u2728"}</p>
          <p className="text-foreground font-medium">Everything looks good</p>
          <p className="text-sm text-muted mt-1">
            No urgent actions right now. Check back later for fresh insights.
          </p>
        </div>
      ) : (
        <>
          {/* Insights Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
            {displayInsights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>

          {/* Show more link when compact */}
          {compact && insights.length > 4 && (
            <div className="text-center">
              <Link
                href="/dashboard/cash-flow"
                className="text-sm text-accent hover:underline font-medium"
              >
                View all {insights.length} insights {"\u2192"}
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Reorder Alerts Widget                                              */
/*  Compact view for dashboard showing items below threshold.          */
/* ------------------------------------------------------------------ */

interface ReorderItem {
  id: string;
  name: string;
  quantity: number;
  velocity: number;
  daysUntilStockout: number | null;
}

export function ReorderAlerts() {
  const { can } = useStore();
  const [items, setItems] = useState<ReorderItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!can("inventory.view")) {
      setLoading(false);
      return;
    }
    fetch("/api/intelligence")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.insights) return;
        // Extract reorder data from insights
        const reorderInsight = data.insights.find(
          (i: Insight) => i.id === "reorder-alert"
        );
        if (reorderInsight) {
          // We'll show the insight card for now; full item list requires inventory API
          setItems([]);
        }
      })
      .finally(() => setLoading(false));
  }, [can]);

  if (!can("inventory.view") || loading) return null;

  // The reorder info is already shown in the intelligence feed
  // This component is a placeholder for future per-item reorder view
  return null;
}
