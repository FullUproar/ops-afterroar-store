'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/shared/ui';

interface ImportJob {
  id: string;
  source_system: string;
  entity_type: string;
  status: string;
  file_name: string;
  row_count: number;
  created_at: string;
  committed_at: string | null;
}

const statusColors: Record<string, string> = {
  draft: 'bg-zinc-500/20 text-muted border-zinc-500/30',
  mapping: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  validated: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  previewing: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  committed: 'bg-green-500/20 text-green-400 border-green-500/30',
  partial: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  failed: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export default function ImportPage() {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/import')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load imports');
        return res.json();
      })
      .then((data) => setJobs(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-full gap-4">
      <PageHeader
        title="Data Import"
        action={
          <Link
            href="/dashboard/import/new"
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-foreground hover:opacity-90 transition-colors"
          >
            New Import
          </Link>
        }
      />

      {/* ── Direct Import Connectors ── */}
      <DirectImportSection />

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-muted">Loading imports...</div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-card-border bg-card p-8 text-center text-muted">
          <p className="text-lg font-medium">No imports yet</p>
          <p className="mt-2 text-sm">
            Import your inventory and customers from another POS system.
            We support BinderPOS, Square, Lightspeed, Shopify, SortSwift, ShadowPOS, and generic CSV.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-card-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-card-border text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">File</th>
                <th className="px-4 py-3 font-medium text-right">Rows</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {jobs.map((job) => (
                <tr key={job.id} className="text-foreground hover:bg-card-hover transition-colors">
                  <td className="px-4 py-3 text-foreground/70">
                    {new Date(job.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 capitalize">{job.source_system}</td>
                  <td className="px-4 py-3 capitalize">{job.entity_type}</td>
                  <td className="px-4 py-3 text-foreground/70">{job.file_name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{job.row_count}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${statusColors[job.status] ?? ''}`}
                    >
                      {job.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Direct Import Connectors                                           */
/* ------------------------------------------------------------------ */

const CONNECTORS = [
  { key: "shopify", label: "Shopify", icon: "◈", status: "ready" as const, fields: ["store_url", "access_token"] },
  { key: "square", label: "Square", icon: "◻", status: "coming" as const, fields: [] },
  { key: "lightspeed", label: "Lightspeed", icon: "◎", status: "coming" as const, fields: [] },
  { key: "binderpos", label: "BinderPOS", icon: "▤", status: "coming" as const, fields: [] },
  { key: "tcgplayer", label: "TCGplayer", icon: "♠", status: "coming" as const, fields: [] },
];

function DirectImportSection() {
  const [active, setActive] = useState<string | null>(null);
  const [storeUrl, setStoreUrl] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; details?: Record<string, number> } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  async function handleShopifyImport() {
    if (!storeUrl || !accessToken) {
      setImportError("Store URL and access token are required.");
      return;
    }

    setImporting(true);
    setImportError(null);
    setResult(null);

    try {
      const res = await fetch("/api/integrations/shopify/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopify_url: storeUrl.includes(".myshopify.com") ? storeUrl : `${storeUrl}.myshopify.com`,
          access_token: accessToken,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        const created = data.imported ?? data.created ?? 0;
        const skipped = data.skipped ?? 0;
        const errCount = data.errors?.length ?? 0;
        setResult({
          success: true,
          message: `Imported ${created} products, skipped ${skipped} duplicates.${errCount > 0 ? ` ${errCount} errors.` : ""}`,
          details: { created, skipped, updated: data.updated ?? 0 },
        });
        if (data.errors?.length) console.log("[Import errors]", data.errors);
      } else {
        setImportError(data.error || "Import failed.");
      }
    } catch {
      setImportError("Network error. Try again.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="rounded-xl border border-card-border bg-card p-6 shadow-sm dark:shadow-none">
      <h2 className="text-sm font-semibold text-foreground">Import from POS / E-Commerce</h2>
      <p className="mt-0.5 text-xs text-muted">Connect directly to pull your product catalog, inventory, and customers.</p>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        {CONNECTORS.map((c) => (
          <button
            key={c.key}
            onClick={() => c.status === "ready" ? setActive(active === c.key ? null : c.key) : undefined}
            disabled={c.status === "coming"}
            className={`rounded-lg border p-3 text-center transition-colors ${
              active === c.key
                ? "border-accent bg-accent/10 text-foreground"
                : c.status === "coming"
                  ? "border-card-border bg-card-hover text-muted/50 cursor-not-allowed"
                  : "border-card-border bg-card-hover text-muted hover:text-foreground hover:border-accent/30"
            }`}
          >
            <span className="text-lg block">{c.icon}</span>
            <span className="text-xs font-medium block mt-1">{c.label}</span>
            {c.status === "coming" && <span className="text-[9px] text-muted/40 block">Coming soon</span>}
          </button>
        ))}
      </div>

      {/* Shopify Form */}
      {active === "shopify" && (
        <div className="mt-4 space-y-3 p-4 rounded-lg border border-card-border bg-card-hover">
          <div>
            <label className="block text-xs text-muted mb-1">Shopify Store URL</label>
            <input
              type="text"
              value={storeUrl}
              onChange={(e) => setStoreUrl(e.target.value)}
              placeholder="your-store.myshopify.com"
              className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Admin API Access Token</label>
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="shpat_..."
              className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none font-mono"
            />
            <p className="mt-1 text-[11px] text-muted/70">
              Create a custom app in Shopify Dev Dashboard with read_products + read_inventory scopes.
            </p>
          </div>

          {importError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">{importError}</div>
          )}

          {result && (
            <div className={`rounded-lg border p-3 text-xs ${result.success ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>
              <p className="font-medium">{result.message}</p>
              {result.details && (
                <p className="mt-1 text-muted">
                  Created: {result.details.created ?? 0} · Skipped: {result.details.skipped ?? 0} · Updated: {result.details.updated ?? 0}
                </p>
              )}
            </div>
          )}

          <button
            onClick={handleShopifyImport}
            disabled={importing || !storeUrl || !accessToken}
            className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {importing ? "Importing..." : "Import from Shopify"}
          </button>
        </div>
      )}
    </div>
  );
}
