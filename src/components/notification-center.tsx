"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/* ------------------------------------------------------------------ */
/*  NotificationCenter — bell icon with dropdown notifications          */
/*  Generates alerts from live data: low stock, overdue checkouts,      */
/*  today's events, pending POs.                                        */
/* ------------------------------------------------------------------ */

interface Notification {
  id: string;
  type: "low_stock" | "overdue_checkout" | "event_today" | "po_pending";
  title: string;
  detail: string;
  href: string;
}

const DISMISSED_KEY = "afterroar-notifications-dismissed";

function getDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { ids: string[]; ts: number };
    // Auto-expire dismissed after 24 hours
    if (Date.now() - parsed.ts > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(DISMISSED_KEY);
      return new Set();
    }
    return new Set(parsed.ids);
  } catch {
    return new Set();
  }
}

function setDismissed(ids: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify({ ids: [...ids], ts: Date.now() }));
  } catch {}
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [allNotifications, setAllNotifications] = useState<Notification[]>([]);
  const [dismissed, setDismissedState] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Load dismissed state after mount
  useEffect(() => {
    setDismissedState(getDismissed());
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setAllNotifications(data);
      }
    } catch {
      // Network error — silently ignore
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }, []);

  // Fetch on mount (so badge shows proactively)
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(fetchNotifications, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Filter out dismissed
  const notifications = allNotifications.filter((n) => !dismissed.has(n.id));
  const unreadCount = notifications.length;

  function dismissOne(id: string) {
    const next = new Set(dismissed);
    next.add(id);
    setDismissedState(next);
    setDismissed(next);
  }

  function dismissAll() {
    const next = new Set(dismissed);
    for (const n of allNotifications) next.add(n.id);
    setDismissedState(next);
    setDismissed(next);
  }

  const typeIcon = (type: Notification["type"]) => {
    switch (type) {
      case "low_stock": return "▦";
      case "overdue_checkout": return "♜";
      case "event_today": return "★";
      case "po_pending": return "⊞";
    }
  };

  const typeColor = (type: Notification["type"]) => {
    switch (type) {
      case "low_stock": return "text-amber-400";
      case "overdue_checkout": return "text-red-400";
      case "event_today": return "text-blue-400";
      case "po_pending": return "text-emerald-400";
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-xl p-2 text-muted hover:text-foreground hover:bg-card-hover transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="Notifications"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-[70vh] rounded-xl border border-card-border bg-card shadow-2xl overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-card-border">
            <h3 className="text-sm font-bold text-foreground">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={dismissAll}
                  className="text-xs text-muted hover:text-foreground transition-colors"
                >
                  Clear all
                </button>
              )}
              <button
                onClick={fetchNotifications}
                className="text-xs text-muted hover:text-foreground transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="overflow-y-auto max-h-80 scroll-visible">
            {loading && !fetched && (
              <div className="px-4 py-6 text-center text-sm text-muted">Loading...</div>
            )}

            {fetched && notifications.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted">
                All clear — no alerts right now.
              </div>
            )}

            {notifications.map((n) => (
              <div
                key={n.id}
                className="flex items-start gap-3 px-4 py-3 hover:bg-card-hover transition-colors border-b border-card-border/50 last:border-b-0 group"
              >
                <button
                  onClick={() => {
                    dismissOne(n.id);
                    setOpen(false);
                    router.push(n.href);
                  }}
                  className="flex items-start gap-3 flex-1 text-left min-w-0"
                >
                  <span className={`text-lg mt-0.5 shrink-0 ${typeColor(n.type)}`}>
                    {typeIcon(n.type)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground truncate">{n.title}</div>
                    <div className="text-xs text-muted truncate">{n.detail}</div>
                  </div>
                </button>
                <button
                  onClick={() => dismissOne(n.id)}
                  className="shrink-0 text-muted hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity text-xs mt-1"
                  title="Dismiss"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
