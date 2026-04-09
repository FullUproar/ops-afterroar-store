"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */
interface LogEntry {
  id: string;
  store_id: string;
  event_type: string;
  severity: string;
  message: string;
  metadata: Record<string, unknown>;
  user_id: string | null;
  staff_name: string | null;
  device_info: string | null;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */
const EVENT_TYPES = [
  "auth.login", "auth.logout", "auth.failed",
  "payment.success", "payment.failed", "payment.refund",
  "terminal.connected", "terminal.disconnected", "terminal.timeout", "terminal.reset",
  "scanner.success", "scanner.error", "scanner.learn",
  "inventory.adjust", "inventory.import", "inventory.price_change",
  "settings.changed",
  "checkout.complete", "checkout.failed", "checkout.void",
  "trade_in.complete",
  "issue.flagged", "issue.resolved",
  "sync.failed", "sync.retry",
  "system.error", "system.startup",
] as const;

const SEVERITY_OPTIONS = ["info", "warn", "error", "critical"] as const;

const TIME_RANGES: { label: string; hours: number }[] = [
  { label: "Last hour", hours: 1 },
  { label: "Last 4 hours", hours: 4 },
  { label: "Last 24 hours", hours: 24 },
  { label: "Last 7 days", hours: 168 },
  { label: "Last 30 days", hours: 720 },
];

const SEVERITY_STYLES: Record<string, { dot: string; text: string }> = {
  info: { dot: "text-muted", text: "text-muted" },
  warn: { dot: "text-amber-400", text: "text-amber-400" },
  error: { dot: "text-red-400", text: "text-red-400" },
  critical: { dot: "text-red-500 font-bold", text: "text-red-500 font-bold" },
};

const SEVERITY_ICONS: Record<string, string> = {
  info: "\u25cf",
  warn: "\u26a0",
  error: "\u2715",
  critical: "\ud83d\udd34",
};

/* ------------------------------------------------------------------ */
/*  Page                                                                */
/* ------------------------------------------------------------------ */
export default function OpsLogPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [timeRange, setTimeRange] = useState(24);
  const [search, setSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const buildUrl = useCallback(
    (before?: string) => {
      const since = new Date(Date.now() - timeRange * 60 * 60 * 1000).toISOString();
      const params = new URLSearchParams({ since, limit: "100" });
      if (eventTypeFilter) params.set("event_type", eventTypeFilter);
      if (severityFilter) params.set("severity", severityFilter);
      if (search.trim()) params.set("q", search.trim());
      if (before) params.set("before", before);
      return `/api/logs?${params}`;
    },
    [eventTypeFilter, severityFilter, timeRange, search]
  );

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(buildUrl());
      if (res.ok) {
        const data: LogEntry[] = await res.json();
        setLogs(data);
        setHasMore(data.length === 100);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  // Initial load + refetch on filter change
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchLogs, 10_000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchLogs]);

  async function loadEarlier() {
    if (!logs.length || loadingMore) return;
    setLoadingMore(true);
    try {
      const oldest = logs[logs.length - 1];
      const res = await fetch(buildUrl(oldest.created_at));
      if (res.ok) {
        const data: LogEntry[] = await res.json();
        setLogs((prev) => [...prev, ...data]);
        setHasMore(data.length === 100);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false);
    }
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "Today";
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  // Group logs by date
  const groupedLogs: { date: string; entries: LogEntry[] }[] = [];
  let currentDate = "";
  for (const log of logs) {
    const date = formatDate(log.created_at);
    if (date !== currentDate) {
      currentDate = date;
      groupedLogs.push({ date, entries: [] });
    }
    groupedLogs[groupedLogs.length - 1].entries.push(log);
  }

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-4xl">
      <PageHeader
        title="Operational Log"
        action={
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
              autoRefresh
                ? "border-green-500/50 bg-green-500/10 text-green-400"
                : "border-card-border bg-card text-muted hover:text-foreground"
            )}
          >
            {autoRefresh ? "Auto-refresh ON" : "Auto-refresh"}
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={eventTypeFilter}
          onChange={(e) => setEventTypeFilter(e.target.value)}
          className="rounded-md border border-card-border bg-card px-3 py-1.5 text-sm text-foreground"
        >
          <option value="">All Types</option>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="rounded-md border border-card-border bg-card px-3 py-1.5 text-sm text-foreground"
        >
          <option value="">All Severities</option>
          {SEVERITY_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={timeRange}
          onChange={(e) => setTimeRange(Number(e.target.value))}
          className="rounded-md border border-card-border bg-card px-3 py-1.5 text-sm text-foreground"
        >
          {TIME_RANGES.map((r) => (
            <option key={r.hours} value={r.hours}>{r.label}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Search messages..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[160px] rounded-md border border-card-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted"
        />
      </div>

      {/* Log entries */}
      {loading && logs.length === 0 ? (
        <div className="py-12 text-center text-muted text-sm">Loading...</div>
      ) : logs.length === 0 ? (
        <div className="py-12 text-center text-muted text-sm">
          No log entries found for the selected filters.
        </div>
      ) : (
        <div className="space-y-4">
          {groupedLogs.map((group) => (
            <div key={group.date}>
              <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm py-1 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {group.date}
                </span>
              </div>

              <div className="space-y-0.5">
                {group.entries.map((log) => {
                  const sev = SEVERITY_STYLES[log.severity] ?? SEVERITY_STYLES.info;
                  const icon = SEVERITY_ICONS[log.severity] ?? SEVERITY_ICONS.info;
                  const isExpanded = expandedId === log.id;
                  const hasMeta = log.metadata && Object.keys(log.metadata).length > 0;

                  return (
                    <div key={log.id}>
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        className={cn(
                          "w-full text-left rounded-md px-3 py-2 transition-colors hover:bg-card-hover",
                          isExpanded && "bg-card"
                        )}
                      >
                        {/* Desktop layout */}
                        <div className="hidden md:flex items-start gap-3">
                          <span className="w-16 shrink-0 text-xs text-muted tabular-nums pt-0.5">
                            {formatTime(log.created_at)}
                          </span>
                          <span className={cn("w-4 shrink-0 text-center pt-0.5", sev.dot)}>
                            {icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <span className={cn("text-xs font-mono", sev.text)}>
                              {log.event_type}
                            </span>
                            <p className="text-sm text-foreground/80 truncate">
                              {log.message}
                            </p>
                          </div>
                          {hasMeta && (
                            <span className="text-xs text-muted shrink-0">
                              {isExpanded ? "\u25BE" : "\u25B8"}
                            </span>
                          )}
                        </div>

                        {/* Mobile card layout */}
                        <div className="md:hidden space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={cn("text-sm", sev.dot)}>{icon}</span>
                            <span className={cn("text-xs font-mono", sev.text)}>
                              {log.event_type}
                            </span>
                            <span className="ml-auto text-xs text-muted tabular-nums">
                              {formatTime(log.created_at)}
                            </span>
                          </div>
                          <p className="text-sm text-foreground/80">
                            {log.message}
                          </p>
                        </div>
                      </button>

                      {/* Expanded metadata */}
                      {isExpanded && hasMeta && (
                        <div className="mx-3 md:ml-[5.75rem] mb-2 rounded-md bg-card border border-card-border p-3">
                          <pre className="text-xs text-muted overflow-x-auto whitespace-pre-wrap break-all scroll-visible">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                          {log.staff_name && (
                            <p className="mt-2 text-xs text-muted">
                              Staff: {log.staff_name}
                            </p>
                          )}
                          {log.device_info && (
                            <p className="text-xs text-muted">
                              Device: {log.device_info}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Load Earlier */}
          {hasMore && (
            <div className="text-center py-4">
              <button
                onClick={loadEarlier}
                disabled={loadingMore}
                className="rounded-md border border-card-border bg-card px-4 py-2 text-sm text-muted hover:text-foreground hover:bg-card-hover transition-colors disabled:opacity-50"
              >
                {loadingMore ? "Loading..." : "Load Earlier"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
