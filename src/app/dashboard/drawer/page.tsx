"use client";

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store-context";
import { formatCents, parseDollars } from "@/lib/types";
import { PageHeader } from "@/components/page-header";

interface DrawerSession {
  id: string;
  opened_at: string;
  opened_by: string;
  opening_amount_cents: number;
  sale_count: number;
  total_sales_cents: number;
  cash_sales_cents: number;
  card_sales_cents: number;
  credit_sales_cents: number;
  expected_cash_cents: number;
}

interface ZReport {
  opened_at: string;
  closed_at: string;
  opened_by: string;
  closed_by: string;
  opening_amount_cents: number;
  closing_amount_cents: number;
  expected_cash_cents: number;
  variance_cents: number;
  sale_count: number;
  total_sales_cents: number;
  cash_sales_cents: number;
  card_sales_cents: number;
  credit_sales_cents: number;
}

const DENOMINATIONS = [
  { label: "$100 bills", value: 10000 },
  { label: "$50 bills", value: 5000 },
  { label: "$20 bills", value: 2000 },
  { label: "$10 bills", value: 1000 },
  { label: "$5 bills", value: 500 },
  { label: "$1 bills", value: 100 },
  { label: "Quarters", value: 25 },
  { label: "Dimes", value: 10 },
  { label: "Nickels", value: 5 },
  { label: "Pennies", value: 1 },
];

export default function DrawerPage() {
  const { can } = useStore();
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [session, setSession] = useState<DrawerSession | null>(null);

  // Open drawer state
  const [openingAmount, setOpeningAmount] = useState("");
  const [opening, setOpening] = useState(false);

  // Close drawer state
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [denomCounts, setDenomCounts] = useState<Record<string, string>>({});
  const [closeNotes, setCloseNotes] = useState("");
  const [blindClose, setBlindClose] = useState(true);
  const [closing, setClosing] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Z-report state
  const [zReport, setZReport] = useState<ZReport | null>(null);

  const loadDrawer = useCallback(async () => {
    try {
      const res = await fetch("/api/drawer");
      if (res.ok) {
        const data = await res.json();
        setDrawerOpen(data.open);
        setSession(data.session);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDrawer();
  }, [loadDrawer]);

  const countedTotal = DENOMINATIONS.reduce((sum, d) => {
    const count = parseInt(denomCounts[d.label] || "0", 10) || 0;
    return sum + count * d.value;
  }, 0);

  async function handleOpenDrawer() {
    if (opening) return;
    setOpening(true);
    try {
      const res = await fetch("/api/drawer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opening_amount_cents: parseDollars(openingAmount || "0"),
        }),
      });
      if (res.ok) {
        setOpeningAmount("");
        loadDrawer();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to open drawer");
      }
    } finally {
      setOpening(false);
    }
  }

  async function handleCloseDrawer() {
    if (closing) return;
    setClosing(true);
    try {
      const denominations: Record<string, number> = {};
      for (const d of DENOMINATIONS) {
        denominations[d.label] = parseInt(denomCounts[d.label] || "0", 10) || 0;
      }

      const res = await fetch("/api/drawer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          closing_amount_cents: countedTotal,
          denominations,
          notes: closeNotes.trim() || null,
          blind_close: blindClose,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setZReport(data.z_report);
        setSubmitted(true);
        setDrawerOpen(false);
        setSession(null);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to close drawer");
      }
    } finally {
      setClosing(false);
    }
  }

  if (!can("checkout")) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted">You don&apos;t have permission to manage the drawer.</p>
      </div>
    );
  }

  if (loading) {
    return <p className="text-muted py-12 text-center">Loading drawer status...</p>;
  }

  // Z-Report view after closing
  if (zReport) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <PageHeader title="Z-Report" />

        <div className="rounded-xl border border-card-border bg-card p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted">Opened By</div>
              <div className="text-foreground font-medium">{zReport.opened_by}</div>
            </div>
            <div>
              <div className="text-muted">Closed By</div>
              <div className="text-foreground font-medium">{zReport.closed_by}</div>
            </div>
            <div>
              <div className="text-muted">Opened At</div>
              <div className="text-foreground">{new Date(zReport.opened_at).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-muted">Closed At</div>
              <div className="text-foreground">{new Date(zReport.closed_at).toLocaleString()}</div>
            </div>
          </div>

          <div className="border-t border-card-border pt-4 space-y-2">
            <h3 className="text-sm font-semibold text-foreground/70">Sales Summary</h3>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Total Sales ({zReport.sale_count} transactions)</span>
              <span className="text-foreground font-mono">{formatCents(zReport.total_sales_cents)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Cash Sales</span>
              <span className="text-foreground font-mono">{formatCents(zReport.cash_sales_cents)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Card Sales</span>
              <span className="text-foreground font-mono">{formatCents(zReport.card_sales_cents)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Store Credit Sales</span>
              <span className="text-foreground font-mono">{formatCents(zReport.credit_sales_cents)}</span>
            </div>
          </div>

          <div className="border-t border-card-border pt-4 space-y-2">
            <h3 className="text-sm font-semibold text-foreground/70">Cash Drawer</h3>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Opening Amount</span>
              <span className="text-foreground font-mono">{formatCents(zReport.opening_amount_cents)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Expected Cash</span>
              <span className="text-foreground font-mono">{formatCents(zReport.expected_cash_cents)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Actual Cash Counted</span>
              <span className="text-foreground font-mono">{formatCents(zReport.closing_amount_cents)}</span>
            </div>
            <div className="flex justify-between text-sm font-medium">
              <span className="text-foreground/70">Variance</span>
              <span
                className={`font-mono ${
                  zReport.variance_cents === 0
                    ? "text-emerald-400"
                    : zReport.variance_cents > 0
                    ? "text-blue-400"
                    : "text-red-400"
                }`}
              >
                {zReport.variance_cents >= 0 ? "+" : ""}
                {formatCents(zReport.variance_cents)}
                {zReport.variance_cents > 0
                  ? " (over)"
                  : zReport.variance_cents < 0
                  ? " (short)"
                  : " (exact)"}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            setZReport(null);
            loadDrawer();
          }}
          className="w-full rounded-xl bg-accent py-3 text-sm font-medium text-foreground hover:opacity-90 transition-colors"
        >
          Done
        </button>
      </div>
    );
  }

  // Drawer NOT open
  if (!drawerOpen) {
    return (
      <div className="space-y-6 max-w-lg mx-auto">
        <PageHeader title="Cash Drawer" />

        <div className="rounded-xl border border-card-border bg-card p-6 space-y-4">
          <div className="text-center">
            <div className="text-4xl mb-2">▣</div>
            <p className="text-muted">No drawer is currently open.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-1">
              Opening Cash Amount
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-muted">$</span>
              <input
                type="text"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-card-border bg-background pl-7 pr-4 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <button
            onClick={handleOpenDrawer}
            disabled={opening}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-foreground hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            {opening ? "Opening..." : "Open Drawer"}
          </button>
        </div>
      </div>
    );
  }

  // Drawer IS open
  return (
    <div className="flex flex-col h-full gap-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <PageHeader title="Cash Drawer" />
        <span className="rounded-full bg-emerald-900/50 px-3 py-1 text-xs font-medium text-emerald-400">
          Open
        </span>
      </div>

      {session && (
        <div className="rounded-xl border border-card-border bg-card p-6 space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted">Opened By</div>
              <div className="text-foreground font-medium">{session.opened_by}</div>
            </div>
            <div>
              <div className="text-muted">Opened At</div>
              <div className="text-foreground">{new Date(session.opened_at).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-muted">Opening Amount</div>
              <div className="text-foreground font-mono">{formatCents(session.opening_amount_cents)}</div>
            </div>
            <div>
              <div className="text-muted">Sales</div>
              <div className="text-foreground font-medium">{session.sale_count} transactions</div>
            </div>
          </div>

          <div className="border-t border-card-border pt-3 grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-muted">Cash Sales</div>
              <div className="text-foreground font-mono">{formatCents(session.cash_sales_cents)}</div>
            </div>
            <div>
              <div className="text-muted">Card Sales</div>
              <div className="text-foreground font-mono">{formatCents(session.card_sales_cents)}</div>
            </div>
            <div>
              <div className="text-muted">Credit Sales</div>
              <div className="text-foreground font-mono">{formatCents(session.credit_sales_cents)}</div>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => {
          setShowCloseModal(true);
          setDenomCounts({});
          setCloseNotes("");
          setBlindClose(true);
          setSubmitted(false);
        }}
        className="w-full rounded-xl bg-red-600 py-3 text-sm font-semibold text-foreground hover:bg-red-500 transition-colors"
      >
        Close Drawer
      </button>

      {/* Close Drawer Modal */}
      {showCloseModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-bg"
          onClick={() => setShowCloseModal(false)}
          onKeyDown={(e) => e.key === "Escape" && setShowCloseModal(false)}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-card-border bg-card p-6 shadow-2xl mx-4 scroll-visible"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Count the Drawer</h2>
              <button
                onClick={() => setShowCloseModal(false)}
                className="flex items-center justify-center h-8 w-8 rounded-full text-muted hover:text-foreground active:bg-card-hover transition-colors text-lg"
              >
                &times;
              </button>
            </div>

            <label className="flex items-center gap-2 text-sm text-muted mb-4">
              <input
                type="checkbox"
                checked={blindClose}
                onChange={(e) => setBlindClose(e.target.checked)}
                className="rounded border-input-border bg-background"
              />
              Blind close (hide expected amount until submitted)
            </label>

            <div className="space-y-2 mb-4">
              {DENOMINATIONS.map((d) => (
                <div key={d.label} className="flex items-center justify-between gap-3">
                  <label className="text-sm text-foreground/70 w-28">{d.label}</label>
                  <input
                    type="number"
                    min={0}
                    value={denomCounts[d.label] || ""}
                    onChange={(e) =>
                      setDenomCounts({ ...denomCounts, [d.label]: e.target.value })
                    }
                    placeholder="0"
                    className="w-20 rounded border border-card-border bg-background px-2 py-1 text-sm text-foreground text-center focus:border-accent focus:outline-none"
                  />
                  <span className="text-sm text-muted font-mono w-20 text-right">
                    {formatCents(
                      (parseInt(denomCounts[d.label] || "0", 10) || 0) * d.value
                    )}
                  </span>
                </div>
              ))}
            </div>

            <div className="rounded-xl bg-background border border-card-border p-4 mb-4 space-y-2">
              <div className="flex justify-between text-sm font-medium">
                <span className="text-foreground/70">Total Counted</span>
                <span className="text-foreground font-mono text-lg">{formatCents(countedTotal)}</span>
              </div>
              {!blindClose && session && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Expected Cash</span>
                    <span className="text-foreground font-mono">
                      {formatCents(session.expected_cash_cents)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-medium">
                    <span className="text-foreground/70">Variance</span>
                    <span
                      className={`font-mono ${
                        countedTotal - session.expected_cash_cents === 0
                          ? "text-emerald-400"
                          : countedTotal - session.expected_cash_cents > 0
                          ? "text-blue-400"
                          : "text-red-400"
                      }`}
                    >
                      {countedTotal - session.expected_cash_cents >= 0 ? "+" : ""}
                      {formatCents(countedTotal - session.expected_cash_cents)}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-muted mb-1">
                Notes (optional)
              </label>
              <textarea
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-card-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none resize-none"
                placeholder="Any notes about the drawer count..."
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCloseModal(false)}
                className="flex-1 rounded-xl border border-input-border py-2 text-sm text-foreground/70 hover:bg-card-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCloseDrawer}
                disabled={closing}
                className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-semibold text-foreground hover:bg-red-500 disabled:opacity-50 transition-colors"
              >
                {closing ? "Closing..." : "Submit & Close"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
