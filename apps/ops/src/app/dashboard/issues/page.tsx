"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/page-header";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */
interface Issue {
  id: string;
  description: string;
  created_at: string;
  metadata: {
    issue_type: string;
    issue_description: string;
    related_item_id?: string;
    related_barcode?: string;
    status: string;
    staff_name: string;
    resolved_by?: string;
    resolved_at?: string;
    resolution_notes?: string;
  };
}

const TYPE_LABELS: Record<string, string> = {
  wrong_price: "Wrong Price",
  wrong_stock_count: "Wrong Stock Count",
  item_missing: "Item Missing",
  scanner_issue: "Scanner Issue",
  system_error: "System Error",
  other: "Other",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-red-500/15 text-red-400 border-red-500/30",
  resolved: "bg-green-500/15 text-green-400 border-green-500/30",
};

/* ------------------------------------------------------------------ */
/*  Issues Page                                                         */
/* ------------------------------------------------------------------ */
export default function IssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"open" | "resolved" | "all">("open");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [resolveNotes, setResolveNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function fetchIssues() {
    setLoading(true);
    try {
      const res = await fetch(`/api/issues?status=${statusFilter}`);
      if (res.ok) {
        const data = await res.json();
        setIssues(data);
      }
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    fetchIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function resolveIssue(id: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/issues", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status: "resolved",
          resolution_notes: resolveNotes.trim() || undefined,
        }),
      });
      if (res.ok) {
        setResolveId(null);
        setResolveNotes("");
        fetchIssues();
      }
    } catch {}
    setSaving(false);
  }

  function getTimeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  const filtered = issues.filter((issue) => {
    if (typeFilter !== "all" && issue.metadata.issue_type !== typeFilter) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-8">
      <PageHeader title="Issues" backHref="/dashboard" />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          {(["open", "resolved", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === s ? "bg-accent text-foreground" : "bg-card-hover text-muted hover:text-foreground"
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-input-border bg-card px-3 py-1.5 text-sm text-foreground focus:border-accent focus:outline-none"
        >
          <option value="all">All Types</option>
          {Object.entries(TYPE_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>

      {/* Issues list */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted text-sm">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading issues...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-card-border bg-card p-8 text-center">
          <p className="text-muted text-sm">
            {statusFilter === "open" ? "No open issues. Nice work!" : "No issues found."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((issue) => {
            const meta = issue.metadata;
            const isOpen = meta.status === "open";
            return (
              <div key={issue.id} className="rounded-xl border border-card-border bg-card overflow-hidden">
                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[meta.status] || STATUS_COLORS.open}`}>
                        {meta.status}
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {TYPE_LABELS[meta.issue_type] || meta.issue_type}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted shrink-0">
                      {getTimeAgo(issue.created_at)}
                    </span>
                  </div>

                  <p className="text-sm text-muted leading-relaxed">
                    &quot;{meta.issue_description}&quot;
                  </p>

                  <div className="text-[11px] text-muted">
                    Flagged by {meta.staff_name}
                    {meta.resolved_by && (
                      <span> &middot; Resolved by {meta.resolved_by}</span>
                    )}
                  </div>

                  {meta.resolution_notes && (
                    <div className="text-xs text-muted italic border-l-2 border-green-500/30 pl-2">
                      {meta.resolution_notes}
                    </div>
                  )}

                  {/* Resolve form */}
                  {isOpen && resolveId === issue.id && (
                    <div className="space-y-2 pt-1">
                      <input
                        type="text"
                        placeholder="Resolution notes (optional)"
                        value={resolveNotes}
                        onChange={(e) => setResolveNotes(e.target.value)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") resolveIssue(issue.id);
                          if (e.key === "Escape") { setResolveId(null); setResolveNotes(""); }
                        }}
                        autoFocus
                        className="w-full rounded-lg border border-input-border bg-card-hover px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => resolveIssue(issue.id)}
                          disabled={saving}
                          className="rounded-lg bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                          {saving ? "Saving..." : "Resolve"}
                        </button>
                        <button
                          onClick={() => { setResolveId(null); setResolveNotes(""); }}
                          className="rounded-lg border border-card-border px-4 py-1.5 text-xs font-medium text-muted hover:text-foreground transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  {isOpen && resolveId !== issue.id && (
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => setResolveId(issue.id)}
                        className="rounded-lg border border-card-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-card-hover transition-colors"
                      >
                        Resolve
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
