'use client';

import { useEffect, useState, useRef } from 'react';
import { useStore } from '@/lib/store-context';
import { formatCents } from '@/lib/types';
import { PageHeader } from '@/components/page-header';
import { IntelligenceFeed } from '@/components/intelligence-feed';

/* ---------- types ---------- */

interface LedgerAgg {
  sales_revenue_cents: number;
  event_fees_cents: number;
  gross_revenue_cents: number;
  trade_in_payouts_cents: number;
  refunds_cents: number;
  total_payouts_cents: number;
  net_cash_flow_cents: number;
  credit_issued_cents: number;
  credit_redeemed_cents: number;
}

interface CategoryRow {
  category: string;
  item_count: number;
  total_units: number;
  cost_basis_cents: number;
  retail_value_cents: number;
  potential_margin_cents: number;
  margin_percent: number;
  zero_stock_items: number;
}

interface DeadStockRow {
  id: string;
  name: string;
  category: string;
  quantity: number;
  cost_trapped_cents: number;
  retail_value_cents: number;
  last_sale_date: string | null;
  days_since_sale: number | null;
}

interface FastMoverRow {
  id: string;
  name: string;
  category: string;
  units_sold_30d: number;
  sales_per_week: number;
  current_stock: number;
  days_of_stock: number | null;
}

interface DailyRevenueRow {
  date: string;
  revenue_cents: number;
  payout_cents: number;
  net_cents: number;
  day_of_week: number;
}

interface MarginRow {
  category: string;
  revenue_cents: number;
  cost_cents: number;
  profit_cents: number;
  margin_percent: number;
  units_sold: number;
}

interface CashFlowData {
  today: LedgerAgg;
  this_week: LedgerAgg;
  this_month: LedgerAgg;
  all_time: LedgerAgg;
  month_trend: {
    revenue_change_cents: number;
    revenue_change_percent: number | null;
    payout_change_cents: number;
  };
  daily_revenue: DailyRevenueRow[];
  inventory: {
    total_skus: number;
    total_units: number;
    cost_basis_cents: number;
    retail_value_cents: number;
    potential_margin_cents: number;
    zero_stock_count: number;
  };
  category_breakdown: CategoryRow[];
  dead_stock: DeadStockRow[];
  dead_stock_summary: {
    count_30d: number;
    value_30d: number;
    count_60d: number;
    value_60d: number;
    count_90d: number;
    value_90d: number;
  };
  fast_movers: FastMoverRow[];
  avg_days_to_sell: Record<string, number | null>;
  margin_analysis: MarginRow[];
  trade_in_roi: {
    total_cost_cents: number;
    total_items_received: number;
    estimated_revenue_cents: number;
    outstanding_value_cents: number;
    roi_percent: number;
  };
  trade_ins: {
    count: number;
    total_offer_cents: number;
    total_payout_cents: number;
    cash_payouts: number;
    credit_payouts: number;
  };
  returns: {
    count: number;
    total_refunded_cents: number;
    restocking_fees_collected_cents: number;
    cash_refunds: number;
    credit_refunds: number;
  };
  outstanding_credit: {
    total_cents: number;
    customer_count: number;
  };
  total_customers: number;
}

/* ---------- helpers ---------- */

const CATEGORY_LABELS: Record<string, string> = {
  tcg_single: 'TCG Singles',
  sealed: 'Sealed Product',
  board_game: 'Board Games',
  miniature: 'Miniatures',
  accessory: 'Accessories',
  food_drink: 'Cafe / Food',
  other: 'Other',
};

const CATEGORY_COLORS: Record<string, string> = {
  tcg_single: 'bg-violet-500',
  sealed: 'bg-blue-500',
  board_game: 'bg-emerald-500',
  miniature: 'bg-amber-500',
  accessory: 'bg-rose-500',
  food_drink: 'bg-cyan-500',
  other: 'bg-zinc-500',
};

type Period = 'today' | 'this_week' | 'this_month' | 'all_time';

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  this_week: 'This Week',
  this_month: 'This Month',
  all_time: 'All Time',
};

function catLabel(cat: string) {
  return CATEGORY_LABELS[cat] ?? cat;
}

function catColor(cat: string) {
  return CATEGORY_COLORS[cat] ?? 'bg-zinc-500';
}

function trendArrow(change: number) {
  if (change > 0) return '\u2191';
  if (change < 0) return '\u2193';
  return '\u2192';
}

function trendColor(change: number, positiveIsGood = true) {
  if (change === 0) return 'text-muted';
  const isPositive = change > 0;
  return (isPositive === positiveIsGood) ? 'text-green-400' : 'text-red-400';
}

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatDayLabel(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/* ---------- Collapsible Section ---------- */

function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = false,
  children,
  borderAccent,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  borderAccent?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`rounded-xl border ${borderAccent ?? 'border-card-border'} bg-card/80 shadow-lg backdrop-blur-sm overflow-hidden`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-card-hover/30"
        type="button"
      >
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        <svg
          className={`h-5 w-5 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="border-t border-card-border px-5 pb-5 pt-4">{children}</div>}
    </div>
  );
}

/* ---------- Stat Row ---------- */

function StatRow({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent?: 'green' | 'red' | 'yellow' | 'muted';
  sub?: string;
}) {
  const colorMap = {
    green: 'text-green-400',
    red: 'text-red-400',
    yellow: 'text-yellow-400',
    muted: 'text-muted',
  };
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <span className="text-sm text-muted">{label}</span>
      <div className="text-right">
        <span className={`text-sm font-medium tabular-nums ${colorMap[accent ?? 'muted'] || 'text-foreground'}`}>
          {value}
        </span>
        {sub && <span className="ml-2 text-xs text-muted">{sub}</span>}
      </div>
    </div>
  );
}

/* ---------- Revenue Chart ---------- */

function RevenueChart({ data }: { data: DailyRevenueRow[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  if (data.length === 0) return null;

  const maxRevenue = Math.max(...data.map(d => Math.max(d.revenue_cents, d.payout_cents)), 1);
  const chartHeight = 200;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Revenue Flow</h3>
          <p className="text-xs text-muted">Last 30 days -- daily revenue vs payouts</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm bg-indigo-500" />
            <span className="text-muted">Revenue</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm bg-rose-500/60" />
            <span className="text-muted">Payouts</span>
          </div>
        </div>
      </div>

      {/* Hovered day tooltip */}
      <div className="h-8 mb-3">
        {hoveredIdx !== null && data[hoveredIdx] && (
          <div className="rounded-xl bg-card-hover/80 px-3 py-2 text-xs">
            <span className="font-medium text-foreground">{formatDayLabel(data[hoveredIdx].date)}</span>
            <span className="mx-2 text-zinc-600">|</span>
            <span className="text-indigo-400">Revenue: {formatCents(data[hoveredIdx].revenue_cents)}</span>
            <span className="mx-2 text-zinc-600">|</span>
            <span className="text-rose-400">Payouts: {formatCents(data[hoveredIdx].payout_cents)}</span>
            <span className="mx-2 text-zinc-600">|</span>
            <span className={data[hoveredIdx].net_cents >= 0 ? 'text-green-400' : 'text-red-400'}>
              Net: {formatCents(data[hoveredIdx].net_cents)}
            </span>
          </div>
        )}
      </div>

      <div ref={containerRef} className="relative flex items-end gap-px" style={{ height: chartHeight }}>
        {data.map((day, i) => {
          const barArea = chartHeight - 24;
          const revenueH = (day.revenue_cents / maxRevenue) * barArea;
          const payoutH = (day.payout_cents / maxRevenue) * barArea;
          const isWeekend = day.day_of_week === 0 || day.day_of_week === 6;
          const isHovered = hoveredIdx === i;

          const dayDate = new Date(day.date + 'T12:00:00Z');
          const isMonday = dayDate.getUTCDay() === 1;
          const showLabel = isMonday || i === 0 || i === data.length - 1;

          return (
            <div
              key={day.date}
              className="group relative flex flex-1 flex-col items-center justify-end"
              style={{ height: chartHeight }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <div className="flex w-full items-end justify-center gap-px" style={{ height: barArea }}>
                <div
                  className={`flex-1 rounded-t transition-all ${
                    isHovered
                      ? 'bg-indigo-400'
                      : isWeekend
                        ? 'bg-indigo-500/50'
                        : 'bg-indigo-500/80'
                  }`}
                  style={{ height: Math.max(revenueH, 1) }}
                />
                <div
                  className={`flex-1 rounded-t transition-all ${
                    isHovered ? 'bg-rose-400' : 'bg-rose-500/50'
                  }`}
                  style={{ height: Math.max(payoutH, 1) }}
                />
              </div>
              <div className="h-4 flex items-center justify-center">
                {showLabel && (
                  <span className="text-[9px] text-zinc-500 tabular-nums whitespace-nowrap">
                    {formatShortDate(day.date)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Category Bar ---------- */

function CategoryBars({ categories, totalCost }: { categories: CategoryRow[]; totalCost: number }) {
  return (
    <div className="space-y-3">
      {categories.map((cat) => {
        const pct = totalCost > 0 ? (cat.cost_basis_cents / totalCost) * 100 : 0;
        return (
          <div key={cat.category}>
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-medium text-zinc-200 truncate">{catLabel(cat.category)}</span>
                <span className="shrink-0 text-[10px] text-muted/50 cursor-default" title={`${cat.item_count.toLocaleString()} SKUs -- ${formatCents(cat.cost_basis_cents)} at cost`}>{"\u24D8"}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-medium text-foreground tabular-nums">{formatCents(cat.cost_basis_cents)}</span>
                <span className="w-10 text-right text-xs text-muted tabular-nums">{pct.toFixed(0)}%</span>
              </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-card-hover">
              <div
                className={`h-full rounded-full transition-all ${catColor(cat.category)}`}
                style={{ width: `${Math.max(pct, 0.5)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Cash Flow AI Recommendations ---------- */

function CashFlowInsights({ data, totalDeadStockValue }: { data: CashFlowData; totalDeadStockValue: number }) {
  const recommendations: Array<{ icon: string; text: string; borderColor: string }> = [];

  if (data.dead_stock.length > 0 && totalDeadStockValue > 0) {
    recommendations.push({
      icon: '\u{1F4E6}',
      text: `You have ${formatCents(totalDeadStockValue)} trapped in ${data.dead_stock.length} slow-moving items. A 15-20% markdown or a "clearance bin" promotion could free up to ${formatCents(Math.round(totalDeadStockValue * 0.85))} in cash to reinvest in what actually sells.`,
      borderColor: 'border-l-amber-500',
    });
  }

  const urgentMovers = data.fast_movers.filter(m => m.days_of_stock !== null && m.days_of_stock <= 14);
  if (urgentMovers.length > 0) {
    const top = urgentMovers[0];
    recommendations.push({
      icon: '\u{1F6A8}',
      text: `Your top seller "${top.name}" has only ${top.days_of_stock} days of stock left at current velocity (${top.sales_per_week}/week). Reorder now to avoid losing sales.${urgentMovers.length > 1 ? ` ${urgentMovers.length - 1} more fast-movers are also running low.` : ''}`,
      borderColor: 'border-l-red-500',
    });
  }

  if (data.outstanding_credit.total_cents > 0) {
    recommendations.push({
      icon: '\u{1F4B0}',
      text: `${formatCents(data.outstanding_credit.total_cents)} in store credit across ${data.outstanding_credit.customer_count} customers is a liability on your books. Run a "use your credit" event or bonus weekend to convert these into sales.`,
      borderColor: 'border-l-amber-500',
    });
  }

  if (data.margin_analysis.length >= 2) {
    const sorted = [...data.margin_analysis].sort((a, b) => a.margin_percent - b.margin_percent);
    const lowest = sorted[0];
    const highest = sorted[sorted.length - 1];
    if (lowest.margin_percent < 30 && lowest.revenue_cents > 0) {
      recommendations.push({
        icon: '\u{1F4CA}',
        text: `Your ${catLabel(lowest.category)} margin is only ${lowest.margin_percent}%, while ${catLabel(highest.category)} earns ${highest.margin_percent}%. Consider adjusting pricing or shifting inventory dollars toward higher-margin categories.`,
        borderColor: 'border-l-indigo-500',
      });
    }
  }

  if (data.category_breakdown.length > 0) {
    const topCat = data.category_breakdown[0];
    const topCatPct = data.inventory.cost_basis_cents > 0
      ? Math.round((topCat.cost_basis_cents / data.inventory.cost_basis_cents) * 100)
      : 0;
    const topCatSales = data.margin_analysis.find(m => m.category === topCat.category);
    const totalSalesRev = data.margin_analysis.reduce((s, m) => s + m.revenue_cents, 0);
    const topCatSalesPct = topCatSales && totalSalesRev > 0
      ? Math.round((topCatSales.revenue_cents / totalSalesRev) * 100)
      : 0;

    if (topCatPct > 0 && topCatSalesPct > 0 && topCatPct > topCatSalesPct + 15) {
      recommendations.push({
        icon: '\u{1F4B5}',
        text: `${catLabel(topCat.category)} holds ${topCatPct}% of your inventory capital but only generates ${topCatSalesPct}% of revenue. Your money might work harder in a different category.`,
        borderColor: 'border-l-indigo-500',
      });
    }
  }

  if (data.trade_in_roi.total_cost_cents > 0) {
    if (data.trade_in_roi.roi_percent > 50) {
      recommendations.push({
        icon: '\u{1F3C6}',
        text: `Your trade-in program is generating ${data.trade_in_roi.roi_percent}% ROI. Trade-ins are one of the best ways to acquire inventory cheaply. Keep pushing credit-based payouts for even better margins.`,
        borderColor: 'border-l-green-500',
      });
    } else if (data.trade_in_roi.roi_percent < 0) {
      recommendations.push({
        icon: '\u26A0\uFE0F',
        text: `Your trade-in program is currently at ${data.trade_in_roi.roi_percent}% ROI. Review your offer prices -- you may be paying too much for items that aren't selling through.`,
        borderColor: 'border-l-red-500',
      });
    }
  }

  if (recommendations.length === 0) {
    recommendations.push({
      icon: '\u2728',
      text: 'Your cash flow looks healthy. Keep monitoring velocity and margins to stay ahead.',
      borderColor: 'border-l-green-500',
    });
  }

  return (
    <div className="space-y-6">
      {/* Sentence-based recommendations */}
      <div className="rounded-xl border border-card-border bg-card/80 p-5 shadow-lg backdrop-blur-sm">
        <h2 className="text-base font-semibold text-foreground">Smart Recommendations</h2>
        <p className="mt-0.5 text-xs text-muted">Actionable advice based on your data</p>
        <div className="mt-4 space-y-3">
          {recommendations.map((rec, i) => (
            <div
              key={i}
              className={`rounded-xl border border-card-border border-l-4 ${rec.borderColor} bg-background/50 p-4`}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-lg shrink-0">{rec.icon}</span>
                <p className="text-sm text-foreground/90 leading-relaxed">{rec.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Full Intelligence Feed */}
      <div className="rounded-xl border border-card-border bg-card/80 p-5 shadow-lg backdrop-blur-sm">
        <h2 className="text-base font-semibold text-foreground">Store Intelligence</h2>
        <p className="mt-0.5 text-xs text-muted">All actionable insights across your store</p>
        <div className="mt-4">
          <IntelligenceFeed />
        </div>
      </div>
    </div>
  );
}

/* ---------- main component ---------- */

export default function CashFlowPage() {
  const { can } = useStore();
  const [data, setData] = useState<CashFlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<Period>('this_week');

  useEffect(() => {
    fetch('/api/reports/cash-flow')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load cash flow data');
        return res.json();
      })
      .then((d) => setData(d))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (!can('cash_flow')) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted">You don&apos;t have permission to view cash flow data.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-muted">Loading store intelligence...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-400">
        {error || 'Failed to load data'}
      </div>
    );
  }

  const agg = data[period];
  const totalDeadStockValue = data.dead_stock.reduce((s, d) => s + d.cost_trapped_cents, 0);

  return (
    <div className="space-y-6 pb-12">
      {/* ---- HEADER + PERIOD SELECTOR ---- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <PageHeader title="Store Intelligence" />
          <p className="mt-1 text-sm text-muted">Cash flow, inventory health, and actionable insights.</p>
        </div>
        <div className="flex gap-1 rounded-xl bg-card-hover/80 p-1 shadow-inner">
          {(['today', 'this_week', 'this_month', 'all_time'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-xl px-3 py-1.5 text-sm font-medium transition-all ${
                period === p
                  ? 'bg-accent text-foreground shadow-md'
                  : 'text-muted hover:text-foreground hover:bg-card-hover/50'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* ==== SECTION 1: CASH FLOW (always expanded, not collapsible) ==== */}
      <div className="rounded-xl border border-card-border bg-card/80 shadow-lg backdrop-blur-sm">
        <div className="px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">Cash Flow</h2>
          <p className="mt-0.5 text-xs text-muted">{PERIOD_LABELS[period]} summary</p>
        </div>
        <div className="border-t border-card-border px-5 pb-5 pt-4">
          {/* Primary metrics as dense rows */}
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <div>
              <StatRow
                label="Revenue"
                value={formatCents(agg.gross_revenue_cents)}
                accent="green"
                sub={agg.event_fees_cents > 0 ? `(events: ${formatCents(agg.event_fees_cents)})` : undefined}
              />
              <StatRow
                label="Payouts"
                value={`-${formatCents(agg.total_payouts_cents)}`}
                accent="red"
                sub={agg.refunds_cents > 0 ? `(refunds: ${formatCents(agg.refunds_cents)})` : undefined}
              />
              <div className="border-t border-card-border mt-1 pt-1">
                <StatRow
                  label="Net Cash Flow"
                  value={formatCents(agg.net_cash_flow_cents)}
                  accent={agg.net_cash_flow_cents >= 0 ? 'green' : 'red'}
                />
              </div>
            </div>
            <div>
              <StatRow
                label="Credit Issued"
                value={formatCents(agg.credit_issued_cents)}
                accent="yellow"
              />
              <StatRow
                label="Credit Redeemed"
                value={formatCents(agg.credit_redeemed_cents)}
                accent="muted"
              />
              {data.inventory.cost_basis_cents > 0 && (
                <div className="border-t border-card-border mt-1 pt-1">
                  <StatRow
                    label="Capital in Inventory"
                    value={formatCents(data.inventory.cost_basis_cents)}
                    accent="muted"
                    sub={`${data.inventory.total_skus} SKUs`}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Month trend inline */}
          {data.month_trend.revenue_change_percent !== null && (
            <div className="mt-4 rounded-xl bg-card-hover/50 px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                <span className="text-muted font-medium">Month-over-month</span>
                <span className={trendColor(data.month_trend.revenue_change_cents)}>
                  {trendArrow(data.month_trend.revenue_change_cents)} Revenue{' '}
                  {data.month_trend.revenue_change_percent > 0 ? '+' : ''}
                  {data.month_trend.revenue_change_percent}%
                  <span className="ml-1 text-xs opacity-70">({formatCents(Math.abs(data.month_trend.revenue_change_cents))})</span>
                </span>
                <span className={trendColor(data.month_trend.payout_change_cents, false)}>
                  {trendArrow(data.month_trend.payout_change_cents)} Payouts{' '}
                  <span className="text-xs opacity-70">{formatCents(Math.abs(data.month_trend.payout_change_cents))}</span>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ==== SECTION 2: REVENUE BREAKDOWN (collapsible, default open) ==== */}
      <CollapsibleSection
        title="Revenue Breakdown"
        subtitle="Revenue chart and margin analysis"
        defaultOpen
      >
        {/* Revenue Flow Chart */}
        <RevenueChart data={data.daily_revenue} />

        {/* Margin Analysis Table */}
        {data.margin_analysis.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Margin Analysis by Category</h3>
            <div className="overflow-x-auto rounded-xl scroll-visible">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-card-border text-muted">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Category</th>
                    <th className="px-3 py-2.5 font-medium text-right">Units</th>
                    <th className="px-3 py-2.5 font-medium text-right">Revenue</th>
                    <th className="px-3 py-2.5 font-medium text-right">Cost</th>
                    <th className="px-3 py-2.5 font-medium text-right">Profit</th>
                    <th className="px-3 py-2.5 font-medium text-right">Margin</th>
                    <th className="px-3 py-2.5 font-medium text-right">Avg Days</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {data.margin_analysis.map((row) => (
                    <tr key={row.category} className="text-foreground transition-colors hover:bg-card-hover/30">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className={`h-2.5 w-2.5 rounded-full ${catColor(row.category)}`} />
                          <span className="font-medium">{catLabel(row.category)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground/70">{row.units_sold}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatCents(row.revenue_cents)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted">{formatCents(row.cost_cents)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-green-400">{formatCents(row.profit_cents)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                          row.margin_percent >= 40 ? 'bg-green-500/10 text-green-400' :
                          row.margin_percent >= 20 ? 'bg-yellow-500/10 text-yellow-400' :
                          'bg-red-500/10 text-red-400'
                        }`}>
                          {row.margin_percent}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                        {data.avg_days_to_sell[row.category] !== null && data.avg_days_to_sell[row.category] !== undefined
                          ? `${data.avg_days_to_sell[row.category]}d`
                          : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* ==== SECTION 3: INVENTORY CAPITAL (collapsible) ==== */}
      <CollapsibleSection
        title="Inventory Capital"
        subtitle={`${formatCents(data.inventory.cost_basis_cents)} locked across ${data.inventory.total_skus} SKUs`}
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left: Category breakdown with bars */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-foreground">By Category</h3>
            <CategoryBars categories={data.category_breakdown} totalCost={data.inventory.cost_basis_cents} />
            <div className="mt-4 space-y-0.5 border-t border-card-border pt-3">
              <StatRow label="Total cost basis" value={formatCents(data.inventory.cost_basis_cents)} />
              <StatRow label="Total retail value" value={formatCents(data.inventory.retail_value_cents)} />
              <StatRow label="Potential margin" value={formatCents(data.inventory.potential_margin_cents)} accent="green" />
              <StatRow
                label="Out of stock"
                value={`${data.inventory.zero_stock_count}`}
                accent={data.inventory.zero_stock_count > 0 ? 'red' : 'muted'}
                sub={`of ${data.inventory.total_skus} SKUs`}
              />
            </div>
          </div>

          {/* Right: Dead stock + fast movers */}
          <div className="space-y-5">
            {/* Dead Stock */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">Dead Stock</h3>
              {data.dead_stock.length === 0 ? (
                <p className="text-sm text-muted">No dead stock detected. Everything is moving.</p>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap gap-2 text-xs">
                    <div className="rounded-lg bg-yellow-500/10 px-2.5 py-1.5 text-yellow-400">
                      {data.dead_stock_summary.count_30d} items / {formatCents(data.dead_stock_summary.value_30d)} stuck 30d+
                    </div>
                    {data.dead_stock_summary.count_90d > 0 && (
                      <div className="rounded-lg bg-red-500/10 px-2.5 py-1.5 text-red-400">
                        {data.dead_stock_summary.count_90d} items / {formatCents(data.dead_stock_summary.value_90d)} stuck 90d+
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {data.dead_stock.slice(0, 5).map((item, i) => (
                      <div key={item.id} className="flex items-center gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-yellow-500/10 text-xs font-bold text-yellow-400">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-zinc-200">{item.name}</p>
                          <p className="text-xs text-muted">
                            {catLabel(item.category)} &middot; qty {item.quantity}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-yellow-400 tabular-nums">{formatCents(item.cost_trapped_cents)}</p>
                          <p className="text-xs text-muted tabular-nums">
                            {item.days_since_sale !== null
                              ? `${item.days_since_sale}d ago`
                              : 'Never sold'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {totalDeadStockValue > 0 && (
                    <div className="mt-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-300">
                      Top {data.dead_stock.length} dead items = {formatCents(totalDeadStockValue)} trapped capital.
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Fast Movers */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">Fast Movers</h3>
              {data.fast_movers.length === 0 ? (
                <p className="text-sm text-muted">No sales data yet for velocity analysis.</p>
              ) : (
                <div className="space-y-2">
                  {data.fast_movers.slice(0, 5).map((item, i) => (
                    <div key={item.id} className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-green-500/10 text-xs font-bold text-green-400">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-200">{item.name}</p>
                        <p className="text-xs text-muted">{catLabel(item.category)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-green-400 tabular-nums">{item.sales_per_week}/wk</p>
                        <p className="text-xs text-muted tabular-nums">
                          {item.current_stock} left
                          {item.days_of_stock !== null && item.days_of_stock <= 14 && (
                            <span className="ml-1 text-yellow-400">({item.days_of_stock}d)</span>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* ==== SECTION 4: CUSTOMER HEALTH (collapsible) ==== */}
      <CollapsibleSection
        title="Customer Health"
        subtitle={`${data.total_customers} total customers`}
      >
        <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          <div>
            <StatRow label="Total Customers" value={data.total_customers.toLocaleString()} />
            <StatRow
              label="Outstanding Credit"
              value={formatCents(data.outstanding_credit.total_cents)}
              accent="yellow"
              sub={`${data.outstanding_credit.customer_count} customers`}
            />
          </div>
          <div>
            <StatRow label="Returns This Month" value={`${data.returns.count}`} />
            <StatRow
              label="Refunded"
              value={formatCents(data.returns.total_refunded_cents)}
              accent="red"
              sub={`Cash: ${data.returns.cash_refunds} / Credit: ${data.returns.credit_refunds}`}
            />
            {data.returns.restocking_fees_collected_cents > 0 && (
              <StatRow
                label="Restocking Fees"
                value={formatCents(data.returns.restocking_fees_collected_cents)}
                accent="green"
              />
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* ==== SECTION 5: TRADE-INS (collapsible) ==== */}
      <CollapsibleSection
        title="Trade-Ins"
        subtitle={`ROI: ${data.trade_in_roi.roi_percent > 0 ? '+' : ''}${data.trade_in_roi.roi_percent}% all-time`}
      >
        <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          {/* All-time ROI */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">All-Time ROI</h3>
            <StatRow label="Spent on trade-ins" value={formatCents(data.trade_in_roi.total_cost_cents)} accent="red" />
            <StatRow label="Sold from trade-ins" value={formatCents(data.trade_in_roi.estimated_revenue_cents)} accent="green" />
            <StatRow label="Outstanding inventory" value={formatCents(data.trade_in_roi.outstanding_value_cents)} accent="yellow" />
            <div className="border-t border-card-border mt-1 pt-1">
              <div className="flex items-baseline justify-between py-1.5">
                <span className="text-sm font-medium text-foreground/70">ROI</span>
                <span className={`text-lg font-bold tabular-nums ${
                  data.trade_in_roi.roi_percent >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {data.trade_in_roi.roi_percent > 0 ? '+' : ''}{data.trade_in_roi.roi_percent}%
                </span>
              </div>
              <p className="text-xs text-muted">{data.trade_in_roi.total_items_received} items received all-time</p>
            </div>
          </div>

          {/* This month */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">This Month</h3>
            <StatRow label="Count" value={`${data.trade_ins.count}`} />
            <StatRow label="Total Offer Value" value={formatCents(data.trade_ins.total_offer_cents)} />
            <StatRow label="Total Paid Out" value={formatCents(data.trade_ins.total_payout_cents)} accent="red" />
            <StatRow
              label="Cash / Credit"
              value={`${data.trade_ins.cash_payouts} / ${data.trade_ins.credit_payouts}`}
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* ==== AI RECOMMENDATIONS + INTELLIGENCE ==== */}
      <CashFlowInsights data={data} totalDeadStockValue={totalDeadStockValue} />
    </div>
  );
}
