"use client";

/**
 * /dashboard/reconciliation — register sync conflict review queue.
 *
 * Shows events that didn't apply cleanly — oversold inventory, customer
 * balance going negative, deferred-capture declines (R3+), unknown event
 * types, anything the server flagged for owner attention.
 *
 * Stage 1: read-only list. The "resolve" workflow lands when there's
 * a real volume of conflicts to test against.
 */

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";

interface RecEvent {
  id: string;
  deviceId: string;
  type: string;
  wallTime: string;
  receivedAt: string;
  status: "conflict" | "rejected";
  conflictData: unknown;
  payload: unknown;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function ReconciliationPage() {
  const [events, setEvents] = useState<RecEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/reconciliation", { cache: "no-store" });
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      setEvents(data.events);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "load failed");
    }
  }

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader title="Reconciliation" />
      <p className="text-muted text-sm -mt-2">Register events that need owner attention</p>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {events === null ? (
        <div className="text-muted text-sm">Loading…</div>
      ) : events.length === 0 ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
          <p className="text-emerald-400 font-bold">All clear</p>
          <p className="text-muted text-sm mt-1">
            No register events flagged for review. Conflicts and rejections from
            offline-mode syncs will appear here when they happen.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((e) => (
            <details
              key={e.id}
              className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
            >
              <summary className="cursor-pointer flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                      e.status === "conflict"
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-red-500/20 text-red-300"
                    }`}
                  >
                    {e.status}
                  </span>
                  <span className="text-cream font-semibold text-sm truncate">{e.type}</span>
                  <span className="text-muted text-xs whitespace-nowrap">
                    {relTime(e.receivedAt)}
                  </span>
                </div>
                <code className="text-muted text-xs font-mono whitespace-nowrap">
                  {e.deviceId.slice(0, 12)}…
                </code>
              </summary>
              <div className="mt-3 space-y-2 text-xs">
                <div className="text-muted">
                  Wall time: {new Date(e.wallTime).toLocaleString()} · Received{" "}
                  {new Date(e.receivedAt).toLocaleString()}
                </div>
                {e.conflictData ? (
                  <div>
                    <div className="text-muted mb-1">Conflict:</div>
                    <pre className="whitespace-pre-wrap rounded bg-black/40 p-2 text-cream font-mono">
                      {JSON.stringify(e.conflictData, null, 2)}
                    </pre>
                  </div>
                ) : null}
                <div>
                  <div className="text-muted mb-1">Payload:</div>
                  <pre className="whitespace-pre-wrap rounded bg-black/40 p-2 text-cream font-mono max-h-48 overflow-y-auto">
                    {JSON.stringify(e.payload, null, 2)}
                  </pre>
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
