"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/page-header";
import { formatCents } from "@/lib/types";
import { StatCard, SectionHeader, EmptyState, MonoValue } from "@/components/shared/ui";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Summary {
  total_skus: number;
  total_cost_cents: number;
  total_retail_cents: number;
  avg_margin_pct: number;
}

interface DeadStockItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  cost_trapped_cents: number;
  retail_value_cents: number;
  days_since_sale: number | null;
}

interface VelocityItem {
  id: string;
  name: string;
  category: string;
  units_sold: number;
  units_per_week: number;
  current_stock: number;
  weeks_of_supply: number | null;
}

interface ReorderItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  threshold: number;
  reorder_point: number | null;
}

interface CategoryItem {
  category: string;
  cost_cents: number;
  retail_cents: number;
  count: number;
  units_sold: number;
  pct_of_value: number;
  turn_rate: number;
}

interface OverstockItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  units_per_week: number;
  months_of_supply: number;
  retail_value_cents: number;
}

interface HealthData {
  period_days: number;
  summary: Summary;
  dead_stock: DeadStockItem[];
  dead_stock_total_cents: number;
  dead_stock_count: number;
  dead_stock_days: number;
  fastest_movers: VelocityItem[];
  slowest_movers: VelocityItem[];
  reorder_alerts: ReorderItem[];
  reorder_count: number;
  category_mix: CategoryItem[];
  overstock: OverstockItem[];
  overstock_count: number;
}

/* ------------------------------------------------------------------ */
/*  Category label map                                                  */
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

/* ------------------------------------------------------------------ */
/*  Period selector                                                     */
/* ------------------------------------------------------------------ */

type PeriodKey = "30d" | "90d" | "1y";
const PERIOD_LABELS: Record<PeriodKey, string> = { "30d": "30 Days", "90d": "90 Days", "1y": "1 Year" };
const PERIOD_DAYS: Record<PeriodKey, number> = { "30d": 30, "90d": 90, "1y": 365 };

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function InventoryHealthPage() {
  const [period, setPeriod] = useState<PeriodKey>("90d");
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/inventory-health?days=${PERIOD_DAYS[period]}`);
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
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Estimate rent context (rough: $2000/mo = $500/wk)
  const weeksOfRent = (cents: number) => {
    const weeks = Math.round(cents / 50000);
    if (weeks <= 0) return "";
    return `That\u2019s roughly ${weeks} week${weeks !== 1 ? "s" : ""} of rent sitting on your shelf`;
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <PageHeader title="Inventory Health" backHref="/dashboard/reports" />

      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-2">
        {(["30d", "90d", "1y"] as PeriodKey[]).map((key) => (
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
      </div>

      {loading && (
        <div className="rounded-xl border border-card-border bg-card p-8 text-center">
          <p className="text-muted">Loading inventory data...</p>
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
            <StatCard label="Total SKUs" value={data.summary.total_skus.toLocaleString()} />
            <StatCard label="Inventory (Cost)" value={formatCents(data.summary.total_cost_cents)} />
            <StatCard label="Inventory (Retail)" value={formatCents(data.summary.total_retail_cents)} />
            <StatCard
              label="Avg Markup"
              value={`${data.summary.avg_margin_pct}%`}
              accent={data.summary.avg_margin_pct >= 40 ? "green" : data.summary.avg_margin_pct >= 25 ? "default" : "amber"}
            />
          </div>

          {/* Dead Stock */}
          <section className="space-y-3">
            <SectionHeader count={data.dead_stock_count}>Dead Stock</SectionHeader>
            <p className="text-sm text-muted">
              Items with no sales in the last {data.dead_stock_days} days.
              {data.dead_stock_count > 0 && (
                <>
                  {" "}You have{" "}
                  <MonoValue size="sm" className="text-red-400">{formatCents(data.dead_stock_total_cents)}</MonoValue>
                  {" "}in cost tied up.
                  {weeksOfRent(data.dead_stock_total_cents) && (
                    <span className="text-amber-400"> {weeksOfRent(data.dead_stock_total_cents)}.</span>
                  )}
                </>
              )}
            </p>
            {data.dead_stock.length === 0 ? (
              <p className="text-sm text-green-400">No dead stock found. Nice work keeping things moving!</p>
            ) : (
              <>
                {/* Mobile */}
                <div className="md:hidden space-y-2">
                  {data.dead_stock.map((item) => (
                    <div key={item.id} className="rounded-xl border border-card-border bg-card p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground truncate mr-2">{item.name}</span>
                        <MonoValue size="sm" className="text-red-400">{formatCents(item.cost_trapped_cents)}</MonoValue>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-muted">
                        <span>{catLabel(item.category)}</span>
                        <span>Qty: {item.quantity}</span>
                      </div>
                      {item.days_since_sale && (
                        <p className="mt-1 text-xs text-amber-400">Last sold {item.days_since_sale} days ago</p>
                      )}
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
                        <th className="px-4 py-3 text-right text-muted">Qty</th>
                        <th className="px-4 py-3 text-right text-muted">Cost Trapped</th>
                        <th className="px-4 py-3 text-right text-muted">Last Sold</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800 bg-background">
                      {data.dead_stock.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-3 font-medium text-foreground max-w-50 truncate">{item.name}</td>
                          <td className="px-4 py-3 text-foreground/70">{catLabel(item.category)}</td>
                          <td className="px-4 py-3 text-right text-foreground/70">{item.quantity}</td>
                          <td className="px-4 py-3 text-right text-red-400 font-mono">{formatCents(item.cost_trapped_cents)}</td>
                          <td className="px-4 py-3 text-right text-muted">
                            {item.days_since_sale ? `${item.days_since_sale}d ago` : "Never"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          {/* Velocity Rankings */}
          <section className="space-y-3">
            <SectionHeader>Velocity Rankings</SectionHeader>
            <p className="text-sm text-muted">How fast your products move off the shelf.</p>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Fastest */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-green-400">Fastest Movers</h3>
                {data.fastest_movers.length === 0 ? (
                  <p className="text-sm text-muted">No sales data yet.</p>
                ) : (
                  data.fastest_movers.map((item, i) => (
                    <div key={item.id} className="rounded-lg border border-card-border bg-card p-3 flex items-center justify-between">
                      <div className="min-w-0">
                        <span className="text-xs text-muted mr-1">#{i + 1}</span>
                        <span className="font-medium text-foreground truncate">{item.name}</span>
                        <p className="text-xs text-muted">{catLabel(item.category)}</p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="text-sm font-mono font-bold text-green-400">{item.units_per_week}/wk</p>
                        <p className="text-xs text-muted">{item.current_stock} in stock</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Slowest */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-amber-400">Slowest Movers</h3>
                {data.slowest_movers.length === 0 ? (
                  <p className="text-sm text-muted">No sales data yet.</p>
                ) : (
                  data.slowest_movers.map((item, i) => (
                    <div key={item.id} className="rounded-lg border border-card-border bg-card p-3 flex items-center justify-between">
                      <div className="min-w-0">
                        <span className="text-xs text-muted mr-1">#{i + 1}</span>
                        <span className="font-medium text-foreground truncate">{item.name}</span>
                        <p className="text-xs text-muted">{catLabel(item.category)}</p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="text-sm font-mono font-bold text-amber-400">{item.units_per_week}/wk</p>
                        <p className="text-xs text-muted">
                          {item.weeks_of_supply ? `${item.weeks_of_supply} weeks supply` : `${item.current_stock} left`}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* Reorder Alerts */}
          {data.reorder_count > 0 && (
            <section className="space-y-3">
              <SectionHeader count={data.reorder_count}>Reorder Alerts</SectionHeader>
              <p className="text-sm text-muted">Items below their reorder point or low-stock threshold. Time to call your distributor.</p>
              <div className="space-y-2">
                {data.reorder_alerts.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-lg border p-3 flex items-center justify-between ${
                      item.quantity === 0
                        ? "border-red-500/30 bg-red-500/5"
                        : "border-amber-500/30 bg-amber-500/5"
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="font-medium text-foreground truncate">{item.name}</span>
                      <p className="text-xs text-muted">{catLabel(item.category)}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className={`text-sm font-mono font-bold ${item.quantity === 0 ? "text-red-400" : "text-amber-400"}`}>
                        {item.quantity} left
                      </p>
                      <p className="text-xs text-muted">
                        Threshold: {item.reorder_point ?? item.threshold}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Category Mix */}
          <section className="space-y-3">
            <SectionHeader>Category Mix</SectionHeader>
            <p className="text-sm text-muted">Where your inventory dollars are allocated.</p>
            <div className="space-y-2">
              {data.category_mix.map((cat) => (
                <div key={cat.category} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground font-medium">{catLabel(cat.category)}</span>
                    <span className="text-muted">
                      {formatCents(cat.retail_cents)} &middot; {cat.pct_of_value}%
                    </span>
                  </div>
                  <div className="h-4 rounded-full bg-card-hover overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-500"
                      style={{ width: `${Math.min(cat.pct_of_value, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>{cat.count} SKUs &middot; {cat.units_sold} units sold</span>
                    <span>Turn rate: {cat.turn_rate}x/yr</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Overstock Warnings */}
          {data.overstock_count > 0 && (
            <section className="space-y-3">
              <SectionHeader count={data.overstock_count}>Overstock Warnings</SectionHeader>
              <p className="text-sm text-muted">
                Items with 6+ months of supply based on current sales velocity.
                Consider running a sale or listing these online.
              </p>
              <div className="space-y-2">
                {data.overstock.map((item) => (
                  <div key={item.id} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <span className="font-medium text-foreground truncate">{item.name}</span>
                      <p className="text-xs text-muted">{catLabel(item.category)} &middot; {item.quantity} units</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-sm font-mono font-bold text-amber-400">{item.months_of_supply} months</p>
                      <p className="text-xs text-muted">{formatCents(item.retail_value_cents)} retail</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Turn Rate by Category */}
          <section className="space-y-3">
            <SectionHeader>Turn Rate by Category</SectionHeader>
            <p className="text-sm text-muted">
              How many times you sell through your inventory per year. Higher is better.
              Most healthy game stores target 4-6x for board games, 8-12x for singles.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {data.category_mix.map((cat) => (
                <div key={cat.category} className="rounded-xl border border-card-border bg-card p-4 text-center">
                  <p className="text-xs text-muted uppercase tracking-wide">{catLabel(cat.category)}</p>
                  <p className={`mt-1 text-2xl font-bold font-mono tabular-nums ${
                    cat.turn_rate >= 6 ? "text-green-400" : cat.turn_rate >= 3 ? "text-foreground" : cat.turn_rate > 0 ? "text-amber-400" : "text-muted"
                  }`}>
                    {cat.turn_rate}x
                  </p>
                  <p className="text-xs text-muted mt-1">per year</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {!loading && !error && data && data.summary.total_skus === 0 && (
        <EmptyState
          icon={"\u25A3"}
          title="No inventory items found"
          description="Add products to your inventory to see health metrics."
          action={{ label: "Go to Inventory", href: "/dashboard/inventory" }}
        />
      )}
    </div>
  );
}
