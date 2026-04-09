"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/page-header";
import { formatCents } from "@/lib/types";
import { StatCard, SectionHeader, EmptyState, MonoValue } from "@/components/shared/ui";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SalesSummary {
  revenue_cents: number;
  transaction_count: number;
  avg_transaction_cents: number;
  items_per_transaction: number;
  tips_cents: number;
}

interface DailyRevenue {
  date: string;
  revenue_cents: number;
}

interface PaymentMethod {
  method: string;
  amount_cents: number;
  pct: number;
}

interface TopItem {
  name: string;
  category: string;
  revenue_cents: number;
  units: number;
}

interface CategoryBreakdown {
  category: string;
  revenue_cents: number;
  pct: number;
}

interface PeakHour {
  hour: number;
  count: number;
  intensity: number;
}

interface SalesData {
  period: { from: string; to: string };
  summary: SalesSummary;
  daily_revenue: DailyRevenue[];
  daily_avg_cents: number;
  best_day: { date: string; revenue_cents: number };
  payment_breakdown: PaymentMethod[];
  top_by_revenue: TopItem[];
  top_by_units: TopItem[];
  category_breakdown: CategoryBreakdown[];
  peak_hours: PeakHour[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const CATEGORY_LABELS: Record<string, string> = {
  board_game: "Board Games",
  tcg_single: "TCG Singles",
  sealed: "Sealed Product",
  miniature: "Miniatures",
  accessory: "Accessories",
  food_drink: "Food & Drink",
  other: "Other",
};

function catLabel(cat: string) {
  return CATEGORY_LABELS[cat] || cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const PAYMENT_LABELS: Record<string, string> = {
  card: "Card",
  cash: "Cash",
  credit: "Store Credit",
  gift_card: "Gift Card",
  other: "Other",
};

const PAYMENT_COLORS: Record<string, string> = {
  card: "bg-blue-500",
  cash: "bg-green-500",
  credit: "bg-purple-500",
  gift_card: "bg-amber-500",
  other: "bg-zinc-500",
};

function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatHour(hour: number) {
  if (hour === 0) return "12a";
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return "12p";
  return `${hour - 12}p`;
}

/* ------------------------------------------------------------------ */
/*  Period                                                              */
/* ------------------------------------------------------------------ */

type PeriodKey = "today" | "7d" | "30d" | "90d" | "custom";
const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Today",
  "7d": "7 Days",
  "30d": "30 Days",
  "90d": "90 Days",
  custom: "Custom",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SalesPage() {
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    let url = `/api/reports/sales?period=${period}`;
    if (period === "custom") {
      if (!customFrom || !customTo) {
        setLoading(false);
        return;
      }
      url = `/api/reports/sales?period=custom&from=${customFrom}&to=${customTo}`;
    }

    try {
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [period, customFrom, customTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <PageHeader title="Sales Analysis" backHref="/dashboard/reports" />

      {/* Period selector */}
      <div className="flex flex-wrap items-end gap-2">
        {(["today", "7d", "30d", "90d", "custom"] as PeriodKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              period === key
                ? "bg-accent text-white"
                : "bg-card border border-card-border text-muted hover:text-foreground"
            }`}
          >
            {PERIOD_LABELS[key]}
          </button>
        ))}

        {period === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-md border border-card-border bg-card px-2 py-1.5 text-sm text-foreground"
            />
            <span className="text-muted text-sm">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-md border border-card-border bg-card px-2 py-1.5 text-sm text-foreground"
            />
          </div>
        )}
      </div>

      {loading && (
        <div className="rounded-xl border border-card-border bg-card p-8 text-center">
          <p className="text-muted">Loading sales data...</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Revenue" value={formatCents(data.summary.revenue_cents)} accent="green" />
            <StatCard label="Transactions" value={data.summary.transaction_count.toLocaleString()} />
            <StatCard label="Avg Transaction" value={formatCents(data.summary.avg_transaction_cents)} />
            <StatCard label="Items per Sale" value={data.summary.items_per_transaction.toString()} />
          </div>

          {/* Daily average callout */}
          <div className="rounded-xl border border-card-border bg-card p-4">
            <p className="text-sm text-foreground">
              You average <MonoValue size="sm" className="text-green-400">{formatCents(data.daily_avg_cents)}</MonoValue> per day.
              {data.best_day.date && (
                <>
                  {" "}Your best day was <span className="font-medium">{formatDate(data.best_day.date)}</span> at{" "}
                  <MonoValue size="sm" className="text-green-400">{formatCents(data.best_day.revenue_cents)}</MonoValue>.
                </>
              )}
              {data.summary.tips_cents > 0 && (
                <>
                  {" "}Tips collected: <MonoValue size="sm">{formatCents(data.summary.tips_cents)}</MonoValue>.
                </>
              )}
            </p>
          </div>

          {/* Revenue by Day */}
          {data.daily_revenue.length > 0 && (
            <section className="space-y-3">
              <SectionHeader>Revenue by Day</SectionHeader>
              <div className="rounded-xl border border-card-border bg-card p-4 overflow-x-auto scroll-visible">
                <div className="flex items-end gap-1 min-w-fit" style={{ height: 120 }}>
                  {(() => {
                    const maxRev = Math.max(...data.daily_revenue.map((d) => d.revenue_cents), 1);
                    return data.daily_revenue.map((day) => {
                      const pct = (day.revenue_cents / maxRev) * 100;
                      return (
                        <div
                          key={day.date}
                          className="group relative flex flex-col items-center"
                          style={{ minWidth: data.daily_revenue.length > 30 ? 8 : 16, flex: 1 }}
                        >
                          <div
                            className="w-full rounded-t bg-accent hover:bg-accent/80 transition-colors cursor-default"
                            style={{ height: `${Math.max(pct, 2)}%` }}
                            title={`${formatDate(day.date)}: ${formatCents(day.revenue_cents)}`}
                          />
                          {data.daily_revenue.length <= 14 && (
                            <span className="text-[9px] text-muted mt-1 truncate">
                              {new Date(day.date + "T00:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}
                            </span>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </section>
          )}

          {/* Payment Method Breakdown */}
          {data.payment_breakdown.length > 0 && (
            <section className="space-y-3">
              <SectionHeader>Payment Methods</SectionHeader>
              {/* Stacked bar */}
              <div className="rounded-xl border border-card-border bg-card p-4 space-y-3">
                <div className="h-6 rounded-full overflow-hidden flex">
                  {data.payment_breakdown.map((pm) => (
                    <div
                      key={pm.method}
                      className={`${PAYMENT_COLORS[pm.method] || "bg-zinc-500"} transition-all`}
                      style={{ width: `${pm.pct}%` }}
                      title={`${PAYMENT_LABELS[pm.method] || pm.method}: ${pm.pct}%`}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-3">
                  {data.payment_breakdown.map((pm) => (
                    <div key={pm.method} className="flex items-center gap-2 text-sm">
                      <div className={`w-3 h-3 rounded-full ${PAYMENT_COLORS[pm.method] || "bg-zinc-500"}`} />
                      <span className="text-foreground">{PAYMENT_LABELS[pm.method] || pm.method}</span>
                      <span className="text-muted">{pm.pct}%</span>
                      <span className="text-muted font-mono text-xs">{formatCents(pm.amount_cents)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Top Selling Items */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* By revenue */}
            <section className="space-y-3">
              <SectionHeader>Top Sellers (Revenue)</SectionHeader>
              {data.top_by_revenue.length === 0 ? (
                <p className="text-sm text-muted">No item data.</p>
              ) : (
                <div className="space-y-2">
                  {data.top_by_revenue.map((item, i) => (
                    <div key={`rev-${i}`} className="rounded-lg border border-card-border bg-card p-3 flex items-center justify-between">
                      <div className="min-w-0">
                        <span className="text-xs text-muted mr-1">#{i + 1}</span>
                        <span className="font-medium text-foreground truncate">{item.name}</span>
                        <p className="text-xs text-muted">{catLabel(item.category)}</p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="text-sm font-mono font-bold text-green-400">{formatCents(item.revenue_cents)}</p>
                        <p className="text-xs text-muted">{item.units} sold</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* By units */}
            <section className="space-y-3">
              <SectionHeader>Top Sellers (Units)</SectionHeader>
              {data.top_by_units.length === 0 ? (
                <p className="text-sm text-muted">No item data.</p>
              ) : (
                <div className="space-y-2">
                  {data.top_by_units.map((item, i) => (
                    <div key={`unit-${i}`} className="rounded-lg border border-card-border bg-card p-3 flex items-center justify-between">
                      <div className="min-w-0">
                        <span className="text-xs text-muted mr-1">#{i + 1}</span>
                        <span className="font-medium text-foreground truncate">{item.name}</span>
                        <p className="text-xs text-muted">{catLabel(item.category)}</p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="text-sm font-mono font-bold">{item.units} units</p>
                        <p className="text-xs text-muted">{formatCents(item.revenue_cents)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Sales by Category */}
          {data.category_breakdown.length > 0 && (
            <section className="space-y-3">
              <SectionHeader>Sales by Category</SectionHeader>
              <div className="space-y-2">
                {data.category_breakdown.map((cat) => (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground font-medium">{catLabel(cat.category)}</span>
                      <span className="text-muted">
                        {formatCents(cat.revenue_cents)} &middot; {cat.pct}%
                      </span>
                    </div>
                    <div className="h-3 rounded-full bg-card-hover overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-500"
                        style={{ width: `${Math.min(cat.pct, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Peak Hours */}
          <section className="space-y-3">
            <SectionHeader>Peak Hours</SectionHeader>
            <p className="text-sm text-muted">When your customers are shopping. Darker means busier.</p>
            <div className="rounded-xl border border-card-border bg-card p-4">
              <div className="grid grid-cols-8 md:grid-cols-12 gap-1">
                {data.peak_hours
                  .filter((h) => h.hour >= 8 && h.hour <= 22)
                  .map((h) => (
                    <div
                      key={h.hour}
                      className="aspect-square rounded-lg flex flex-col items-center justify-center cursor-default transition-colors"
                      style={{
                        backgroundColor: h.intensity > 0
                          ? `rgba(255, 130, 0, ${0.1 + (h.intensity / 100) * 0.7})`
                          : "rgba(255,255,255,0.03)",
                      }}
                      title={`${formatHour(h.hour)}: ${h.count} transactions`}
                    >
                      <span className="text-[10px] text-muted">{formatHour(h.hour)}</span>
                      <span className={`text-xs font-bold ${h.count > 0 ? "text-foreground" : "text-muted/50"}`}>
                        {h.count}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </section>
        </>
      )}

      {!loading && !error && data && data.summary.transaction_count === 0 && (
        <EmptyState
          icon={"\u25C6"}
          title="No sales in this period"
          description="Make some sales and come back to see your analytics."
        />
      )}
    </div>
  );
}
