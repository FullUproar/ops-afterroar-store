"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store-context";

/* ------------------------------------------------------------------ */
/*  Daily Close — end-of-day summary + one-click close                 */
/*  Shows today's key numbers and lets the owner/manager close out.    */
/* ------------------------------------------------------------------ */

interface DaySummary {
  sales_count: number;
  revenue_cents: number;
  payouts_cents: number;
  net_cents: number;
  trade_ins: number;
  events_today: number;
  new_customers: number;
  top_seller: string | null;
}

function formatCents(cents: number): string {
  return "$" + (Math.abs(cents) / 100).toFixed(2);
}

export function DailyClose() {
  const { can } = useStore();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<DaySummary | null>(null);
  const [loading, setLoading] = useState(false);

  if (!can("reports")) return null;

  async function loadSummary() {
    setOpen(true);
    setLoading(true);
    try {
      const res = await fetch("/api/reports/daily-close");
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={loadSummary}
        className="flex items-center gap-2 rounded-xl border border-card-border bg-card px-4 py-3 text-sm text-muted hover:text-foreground hover:border-input-border transition-colors w-full"
      >
        <span className="text-lg">{"\u{1F319}"}</span>
        <span className="font-medium">End of Day Summary</span>
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-card-border bg-card shadow-sm dark:shadow-none overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-card-border">
        <h3 className="text-sm font-semibold text-foreground">Today&apos;s Summary</h3>
        <button
          onClick={() => setOpen(false)}
          className="text-muted hover:text-foreground text-lg"
        >
          {"\u00D7"}
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-muted">Loading...</div>
      ) : data ? (
        <div className="p-5 space-y-4">
          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Sales" value={String(data.sales_count)} />
            <Metric label="Revenue" value={formatCents(data.revenue_cents)} accent />
            <Metric label="Payouts" value={formatCents(data.payouts_cents)} />
            <Metric label="Net" value={formatCents(data.net_cents)} accent={data.net_cents >= 0} warn={data.net_cents < 0} />
          </div>

          {/* Activity */}
          <div className="space-y-2 text-sm">
            {data.trade_ins > 0 && (
              <div className="flex justify-between text-muted">
                <span>Trade-ins processed</span>
                <span className="text-foreground font-medium">{data.trade_ins}</span>
              </div>
            )}
            {data.events_today > 0 && (
              <div className="flex justify-between text-muted">
                <span>Events held</span>
                <span className="text-foreground font-medium">{data.events_today}</span>
              </div>
            )}
            {data.new_customers > 0 && (
              <div className="flex justify-between text-muted">
                <span>New customers</span>
                <span className="text-foreground font-medium">{data.new_customers}</span>
              </div>
            )}
            {data.top_seller && (
              <div className="flex justify-between text-muted">
                <span>Top seller</span>
                <span className="text-foreground font-medium truncate ml-4">{data.top_seller}</span>
              </div>
            )}
          </div>

          {/* Summary sentence */}
          <p className="text-xs text-muted italic">
            {data.sales_count === 0
              ? "No sales today. Slow day or not yet open?"
              : data.net_cents >= 0
                ? `Good day — ${formatCents(data.net_cents)} net after payouts.`
                : `Payouts exceeded revenue by ${formatCents(Math.abs(data.net_cents))}. Check trade-in volume.`}
          </p>
        </div>
      ) : (
        <div className="p-8 text-center text-sm text-muted">Unable to load summary</div>
      )}
    </div>
  );
}

function Metric({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-card-hover px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${warn ? "text-red-400" : accent ? "text-accent" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}
