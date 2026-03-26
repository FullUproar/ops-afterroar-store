"use client";

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store-context";
import { formatCents, parseDollars } from "@/lib/types";

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
        <p className="text-zinc-500">You don&apos;t have permission to manage the drawer.</p>
      </div>
    );
  }

  if (loading) {
    return <p className="text-zinc-400 py-12 text-center">Loading drawer status...</p>;
  }

  // Z-Report view after closing
  if (zReport) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-white">Z-Report</h1>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-zinc-400">Opened By</div>
              <div className="text-white font-medium">{zReport.opened_by}</div>
            </div>
            <div>
              <div className="text-zinc-400">Closed By</div>
              <div className="text-white font-medium">{zReport.closed_by}</div>
            </div>
            <div>
              <div className="text-zinc-400">Opened At</div>
              <div className="text-white">{new Date(zReport.opened_at).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-zinc-400">Closed At</div>
              <div className="text-white">{new Date(zReport.closed_at).toLocaleString()}</div>
            </div>
          </div>

          <div className="border-t border-zinc-800 pt-4 space-y-2">
            <h3 className="text-sm font-semibold text-zinc-300">Sales Summary</h3>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Total Sales ({zReport.sale_count} transactions)</span>
              <span className="text-white font-mono">{formatCents(zReport.total_sales_cents)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Cash Sales</span>
              <span className="text-white font-mono">{formatCents(zReport.cash_sales_cents)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Card Sales</span>
              <span className="text-white font-mono">{formatCents(zReport.card_sales_cents)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Store Credit Sales</span>
              <span className="text-white font-mono">{formatCents(zReport.credit_sales_cents)}</span>
            </div>
          </div>

          <div className="border-t border-zinc-800 pt-4 space-y-2">
            <h3 className="text-sm font-semibold text-zinc-300">Cash Drawer</h3>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Opening Amount</span>
              <span className="text-white font-mono">{formatCents(zReport.opening_amount_cents)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Expected Cash</span>
              <span className="text-white font-mono">{formatCents(zReport.expected_cash_cents)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Actual Cash Counted</span>
              <span className="text-white font-mono">{formatCents(zReport.closing_amount_cents)}</span>
            </div>
            <div className="flex justify-between text-sm font-medium">
              <span className="text-zinc-300">Variance</span>
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
          className="w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
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
        <h1 className="text-2xl font-bold text-white">Cash Drawer</h1>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 space-y-4">
          <div className="text-center">
            <div className="text-4xl mb-2">▣</div>
            <p className="text-zinc-400">No drawer is currently open.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">
              Opening Cash Amount
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-zinc-500">$</span>
              <input
                type="text"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 pl-7 pr-4 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <button
            onClick={handleOpenDrawer}
            disabled={opening}
            className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            {opening ? "Opening..." : "Open Drawer"}
          </button>
        </div>
      </div>
    );
  }

  // Drawer IS open
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Cash Drawer</h1>
        <span className="rounded-full bg-emerald-900/50 px-3 py-1 text-xs font-medium text-emerald-400">
          Open
        </span>
      </div>

      {session && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-zinc-400">Opened By</div>
              <div className="text-white font-medium">{session.opened_by}</div>
            </div>
            <div>
              <div className="text-zinc-400">Opened At</div>
              <div className="text-white">{new Date(session.opened_at).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-zinc-400">Opening Amount</div>
              <div className="text-white font-mono">{formatCents(session.opening_amount_cents)}</div>
            </div>
            <div>
              <div className="text-zinc-400">Sales</div>
              <div className="text-white font-medium">{session.sale_count} transactions</div>
            </div>
          </div>

          <div className="border-t border-zinc-800 pt-3 grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-zinc-400">Cash Sales</div>
              <div className="text-white font-mono">{formatCents(session.cash_sales_cents)}</div>
            </div>
            <div>
              <div className="text-zinc-400">Card Sales</div>
              <div className="text-white font-mono">{formatCents(session.card_sales_cents)}</div>
            </div>
            <div>
              <div className="text-zinc-400">Credit Sales</div>
              <div className="text-white font-mono">{formatCents(session.credit_sales_cents)}</div>
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
        className="w-full rounded-lg bg-red-600 py-3 text-sm font-bold text-white hover:bg-red-500 transition-colors"
      >
        Close Drawer
      </button>

      {/* Close Drawer Modal */}
      {showCloseModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setShowCloseModal(false)}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white mb-4">Count the Drawer</h2>

            <label className="flex items-center gap-2 text-sm text-zinc-400 mb-4">
              <input
                type="checkbox"
                checked={blindClose}
                onChange={(e) => setBlindClose(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-950"
              />
              Blind close (hide expected amount until submitted)
            </label>

            <div className="space-y-2 mb-4">
              {DENOMINATIONS.map((d) => (
                <div key={d.label} className="flex items-center justify-between gap-3">
                  <label className="text-sm text-zinc-300 w-28">{d.label}</label>
                  <input
                    type="number"
                    min={0}
                    value={denomCounts[d.label] || ""}
                    onChange={(e) =>
                      setDenomCounts({ ...denomCounts, [d.label]: e.target.value })
                    }
                    placeholder="0"
                    className="w-20 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-white text-center focus:border-blue-500 focus:outline-none"
                  />
                  <span className="text-sm text-zinc-500 font-mono w-20 text-right">
                    {formatCents(
                      (parseInt(denomCounts[d.label] || "0", 10) || 0) * d.value
                    )}
                  </span>
                </div>
              ))}
            </div>

            <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-4 mb-4 space-y-2">
              <div className="flex justify-between text-sm font-medium">
                <span className="text-zinc-300">Total Counted</span>
                <span className="text-white font-mono text-lg">{formatCents(countedTotal)}</span>
              </div>
              {!blindClose && session && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Expected Cash</span>
                    <span className="text-white font-mono">
                      {formatCents(session.expected_cash_cents)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-medium">
                    <span className="text-zinc-300">Variance</span>
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
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Notes (optional)
              </label>
              <textarea
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none resize-none"
                placeholder="Any notes about the drawer count..."
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCloseModal(false)}
                className="flex-1 rounded-lg border border-zinc-700 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCloseDrawer}
                disabled={closing}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50 transition-colors"
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
