"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/page-header";
import { formatCents } from "@/lib/types";
import { FeatureGate } from "@/components/feature-gate";
import { StatCard, SectionHeader, EmptyState } from "@/components/shared/ui";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MarginSummary {
  revenue_cents: number;
  cogs_cents: number;
  margin_cents: number;
  margin_percent: number;
  transaction_count: number;
}

interface CategoryMargin {
  category: string;
  revenue_cents: number;
  cogs_cents: number;
  margin_percent: number;
  item_count: number;
}

interface ItemMargin {
  name: string;
  category: string;
  price_cents: number;
  cost_cents: number;
  margin_percent: number;
  profit_cents: number;
  units_sold: number;
}

interface MarginData {
  period: { from: string; to: string };
  summary: MarginSummary;
  by_category: CategoryMargin[];
  top_margin: ItemMargin[];
  low_margin: ItemMargin[];
}

/* ------------------------------------------------------------------ */
/*  Period helpers                                                      */
/* ------------------------------------------------------------------ */

type PeriodKey = "today" | "7d" | "30d" | "custom";

function getPeriodDates(key: PeriodKey): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);

  if (key === "today") {
    return { from: to, to };
  }
  if (key === "7d") {
    const d = new Date(now.getTime() - 7 * 86400000);
    return { from: d.toISOString().slice(0, 10), to };
  }
  // 30d default
  const d = new Date(now.getTime() - 30 * 86400000);
  return { from: d.toISOString().slice(0, 10), to };
}

const CATEGORY_LABELS: Record<string, string> = {
  board_game: "Board Games",
  tcg_single: "TCG Singles",
  sealed: "Sealed Product",
  miniature: "Miniatures",
  accessory: "Accessories",
  food_drink: "Food & Drink",
  other: "Other",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MarginsPage() {
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [data, setData] = useState<MarginData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    let from: string, to: string;
    if (period === "custom" && customFrom && customTo) {
      from = customFrom;
      to = customTo;
    } else if (period === "custom") {
      setLoading(false);
      return;
    } else {
      ({ from, to } = getPeriodDates(period));
    }

    try {
      const res = await fetch(`/api/reports/margins?from=${from}&to=${to}`);
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
    <FeatureGate module="advanced_reports">
      <div className="space-y-6">
        <PageHeader
          title="COGS & Margins"
          backHref="/dashboard/reports"
        />

        {/* Period selector */}
        <div className="flex flex-wrap items-end gap-2">
          {(["today", "7d", "30d", "custom"] as PeriodKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                period === key
                  ? "bg-accent text-white"
                  : "bg-card border border-card-border text-muted hover:text-foreground"
              }`}
            >
              {key === "today" ? "Today" : key === "7d" ? "7 Days" : key === "30d" ? "30 Days" : "Custom"}
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

        {/* Loading / error states */}
        {loading && (
          <div className="rounded-xl border border-card-border bg-card p-8 text-center">
            <p className="text-muted">Loading margin data...</p>
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
              <StatCard label="Revenue" value={formatCents(data.summary.revenue_cents)} />
              <StatCard label="COGS" value={formatCents(data.summary.cogs_cents)} />
              <StatCard
                label="Gross Margin"
                value={`${data.summary.margin_percent}%`}
                accent={data.summary.margin_percent >= 40 ? "green" : data.summary.margin_percent < 25 && data.summary.margin_percent > 0 ? "amber" : "default"}
              />
              <StatCard label="Gross Profit" value={formatCents(data.summary.margin_cents)} />
            </div>

            <div className="text-xs text-muted">
              {data.summary.transaction_count} transactions in period
            </div>

            {/* By category */}
            <section className="space-y-3">
              <SectionHeader>Margin by Category</SectionHeader>
              {data.by_category.length === 0 ? (
                <p className="text-sm text-muted">No category data for this period.</p>
              ) : (
                <>
                  {/* Mobile */}
                  <div className="md:hidden space-y-2">
                    {data.by_category.map((cat) => (
                      <div key={cat.category} className="rounded-xl border border-card-border bg-card p-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground">
                            {CATEGORY_LABELS[cat.category] || cat.category}
                          </span>
                          <MarginBadge percent={cat.margin_percent} />
                        </div>
                        <div className="mt-1 flex items-center justify-between text-xs text-muted">
                          <span>Revenue: {formatCents(cat.revenue_cents)}</span>
                          <span>COGS: {formatCents(cat.cogs_cents)}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted">{cat.item_count} unique items</div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop */}
                  <div className="hidden md:block overflow-x-auto rounded-xl border border-card-border scroll-visible">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-card-border bg-card">
                        <tr>
                          <th className="px-4 py-3 text-muted">Category</th>
                          <th className="px-4 py-3 text-right text-muted">Revenue</th>
                          <th className="px-4 py-3 text-right text-muted">COGS</th>
                          <th className="px-4 py-3 text-right text-muted">Margin %</th>
                          <th className="px-4 py-3 text-right text-muted">Items</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800 bg-background">
                        {data.by_category.map((cat) => (
                          <tr key={cat.category}>
                            <td className="px-4 py-3 font-medium text-foreground">
                              {CATEGORY_LABELS[cat.category] || cat.category}
                            </td>
                            <td className="px-4 py-3 text-right text-foreground">{formatCents(cat.revenue_cents)}</td>
                            <td className="px-4 py-3 text-right text-foreground/70">{formatCents(cat.cogs_cents)}</td>
                            <td className="px-4 py-3 text-right">
                              <MarginBadge percent={cat.margin_percent} />
                            </td>
                            <td className="px-4 py-3 text-right text-foreground/70">{cat.item_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>

            {/* Top margin items */}
            <ItemTable title="Top Margin Items" subtitle="Highest profit per item" items={data.top_margin} />

            {/* Low margin items */}
            <ItemTable title="Low Margin Items" subtitle="Lowest margin — review pricing" items={data.low_margin} />
          </>
        )}

        {!loading && !error && data && data.summary.transaction_count === 0 && (
          <EmptyState
            icon={"\u25B3"}
            title="No sales with COGS data in this period"
            description="Margin tracking requires cost_cents on inventory items and COGS metadata on sales."
          />
        )}
      </div>
    </FeatureGate>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                      */
/* ------------------------------------------------------------------ */

function MarginBadge({ percent }: { percent: number }) {
  const color =
    percent >= 50
      ? "text-green-400"
      : percent >= 30
        ? "text-foreground"
        : percent >= 0
          ? "text-amber-400"
          : "text-red-400";
  return <span className={`text-sm font-medium ${color}`}>{percent}%</span>;
}

function ItemTable({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: ItemMargin[];
}) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>

      {/* Mobile */}
      <div className="md:hidden space-y-2">
        {items.map((item, i) => (
          <div key={`${item.name}-${i}`} className="rounded-xl border border-card-border bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-foreground truncate mr-2">{item.name}</span>
              <MarginBadge percent={item.margin_percent} />
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted">
              <span>
                {formatCents(item.cost_cents)} cost / {formatCents(item.price_cents)} price
              </span>
              <span>{item.units_sold} sold</span>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-card-border scroll-visible">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-card-border bg-card">
            <tr>
              <th className="px-4 py-3 text-muted">Item</th>
              <th className="px-4 py-3 text-muted">Category</th>
              <th className="px-4 py-3 text-right text-muted">Cost</th>
              <th className="px-4 py-3 text-right text-muted">Price</th>
              <th className="px-4 py-3 text-right text-muted">Margin %</th>
              <th className="px-4 py-3 text-right text-muted">Profit</th>
              <th className="px-4 py-3 text-right text-muted">Units</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-background">
            {items.map((item, i) => (
              <tr key={`${item.name}-${i}`}>
                <td className="px-4 py-3 font-medium text-foreground max-w-50 truncate">{item.name}</td>
                <td className="px-4 py-3">
                  <span className="rounded bg-card-hover px-2 py-0.5 text-xs text-foreground/70">
                    {CATEGORY_LABELS[item.category] || item.category}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-foreground/70">{formatCents(item.cost_cents)}</td>
                <td className="px-4 py-3 text-right text-foreground">{formatCents(item.price_cents)}</td>
                <td className="px-4 py-3 text-right">
                  <MarginBadge percent={item.margin_percent} />
                </td>
                <td className="px-4 py-3 text-right text-foreground">{formatCents(item.profit_cents)}</td>
                <td className="px-4 py-3 text-right text-foreground/70">{item.units_sold}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
