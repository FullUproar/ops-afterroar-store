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

/* ---------- sub-components ---------- */

function StatCard({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: 'green' | 'red' | 'yellow' | 'default' | 'indigo';
  icon?: string;
}) {
  const accentBorder = {
    green: 'border-green-500/20',
    red: 'border-red-500/20',
    yellow: 'border-yellow-500/20',
    indigo: 'border-indigo-500/20',
    default: 'border-card-border',
  };
  const accentText = {
    green: 'text-green-400',
    red: 'text-red-400',
    yellow: 'text-yellow-400',
    indigo: 'text-indigo-400',
    default: 'text-foreground',
  };
  const accentGlow = {
    green: 'shadow-green-500/5',
    red: 'shadow-red-500/5',
    yellow: 'shadow-yellow-500/5',
    indigo: 'shadow-indigo-500/5',
    default: '',
  };
  return (
    <div className={`rounded-xl border ${accentBorder[accent ?? 'default']} bg-card/80 p-5 shadow-lg ${accentGlow[accent ?? 'default']} backdrop-blur-sm transition-all hover:border-input-border`}>
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-muted">{label}</p>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <p className={`mt-2 text-2xl font-bold tabular-nums tracking-tight ${accentText[accent ?? 'default']}`}>
        {value}
      </p>
      {sub && <p className="mt-1.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function SectionHeader({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground">{children}</h2>
      {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
    </div>
  );
}

/* ---------- Revenue Chart ---------- */

function RevenueChart({ data, onHover }: { data: DailyRevenueRow[]; onHover?: (day: DailyRevenueRow | null) => void }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  if (data.length === 0) return null;

  const maxRevenue = Math.max(...data.map(d => Math.max(d.revenue_cents, d.payout_cents)), 1);
  const chartHeight = 200;

  return (
    <div className="rounded-xl border border-card-border bg-card/80 p-5 shadow-lg backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Revenue Flow</h3>
          <p className="text-xs text-muted">Last 30 days — daily revenue vs payouts</p>
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

      {/* Hovered day tooltip — fixed height so bars don't shift */}
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

          // Show date label on Mondays, or first/last day
          const dayDate = new Date(day.date + 'T12:00:00Z');
          const isMonday = dayDate.getUTCDay() === 1;
          const showLabel = isMonday || i === 0 || i === data.length - 1;

          return (
            <div
              key={day.date}
              className="group relative flex flex-1 flex-col items-center justify-end"
              style={{ height: chartHeight }}
              onMouseEnter={() => {
                setHoveredIdx(i);
                onHover?.(day);
              }}
              onMouseLeave={() => {
                setHoveredIdx(null);
                onHover?.(null);
              }}
            >
              {/* Bar pair: revenue (left half) + payout (right half) */}
              <div className="flex w-full items-end justify-center gap-px" style={{ height: barArea }}>
                {/* Revenue bar */}
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
                {/* Payout bar */}
                <div
                  className={`flex-1 rounded-t transition-all ${
                    isHovered ? 'bg-rose-400' : 'bg-rose-500/50'
                  }`}
                  style={{ height: Math.max(payoutH, 1) }}
                />
              </div>
              {/* Date label — Mondays + first/last */}
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
                <span className="shrink-0 text-[10px] text-muted/50 cursor-default" title={`${cat.item_count.toLocaleString()} SKUs — ${formatCents(cat.cost_basis_cents)} at cost`}>{"\u24D8"}</span>
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
  // Generate cash-flow-specific sentence-based insights
  const recommendations: Array<{ icon: string; text: string; borderColor: string }> = [];

  // Dead stock insight
  if (data.dead_stock.length > 0 && totalDeadStockValue > 0) {
    recommendations.push({
      icon: '\u{1F4E6}',
      text: `You have ${formatCents(totalDeadStockValue)} trapped in ${data.dead_stock.length} slow-moving items. A 15-20% markdown or a "clearance bin" promotion could free up to ${formatCents(Math.round(totalDeadStockValue * 0.85))} in cash to reinvest in what actually sells.`,
      borderColor: 'border-l-amber-500',
    });
  }

  // Fast mover stockout risk
  const urgentMovers = data.fast_movers.filter(m => m.days_of_stock !== null && m.days_of_stock <= 14);
  if (urgentMovers.length > 0) {
    const top = urgentMovers[0];
    recommendations.push({
      icon: '\u{1F6A8}',
      text: `Your top seller "${top.name}" has only ${top.days_of_stock} days of stock left at current velocity (${top.sales_per_week}/week). Reorder now to avoid losing sales.${urgentMovers.length > 1 ? ` ${urgentMovers.length - 1} more fast-movers are also running low.` : ''}`,
      borderColor: 'border-l-red-500',
    });
  }

  // Outstanding credit liability
  if (data.outstanding_credit.total_cents > 0) {
    recommendations.push({
      icon: '\u{1F4B0}',
      text: `${formatCents(data.outstanding_credit.total_cents)} in store credit across ${data.outstanding_credit.customer_count} customers is a liability on your books. Run a "use your credit" event or bonus weekend to convert these into sales.`,
      borderColor: 'border-l-amber-500',
    });
  }

  // Margin by category
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

  // Capital allocation
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

  // Trade-in ROI
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
        <SectionHeader sub="Actionable advice based on your data">Smart Recommendations</SectionHeader>
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
        <SectionHeader sub="All actionable insights across your store">Store Intelligence</SectionHeader>
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
  const [period, setPeriod] = useState<'today' | 'this_week' | 'this_month'>('this_week');

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
          <p className="text-muted">Loading cash flow intelligence...</p>
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
  const periodLabels = {
    today: 'Today',
    this_week: 'This Week',
    this_month: 'This Month',
  };

  const totalDeadStockValue = data.dead_stock.reduce((s, d) => s + d.cost_trapped_cents, 0);

  return (
    <div className="space-y-8 pb-12">
      {/* ---- HEADER ---- */}
      <div className="flex items-center justify-between">
        <div>
          <PageHeader title="Cash Flow Intelligence" />
          <p className="mt-1 text-sm text-muted">Where your money is, where it&apos;s going, and where it&apos;s stuck.</p>
        </div>
        <div className="flex gap-1 rounded-xl bg-card-hover/80 p-1 shadow-inner">
          {(['today', 'this_week', 'this_month'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-xl px-3 py-1.5 text-sm font-medium transition-all ${
                period === p
                  ? 'bg-accent text-foreground shadow-md'
                  : 'text-muted hover:text-foreground hover:bg-card-hover/50'
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
      </div>

      {/* ---- TOP STAT CARDS ---- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Capital in Inventory"
          value={formatCents(data.inventory.cost_basis_cents)}
          sub={`${data.inventory.total_skus} SKUs across ${data.category_breakdown.length} categories`}
          icon="$"
          accent="indigo"
        />
        <StatCard
          label={`${periodLabels[period]} Revenue`}
          value={formatCents(agg.gross_revenue_cents)}
          sub={`Sales ${formatCents(agg.sales_revenue_cents)} + Events ${formatCents(agg.event_fees_cents)}`}
          icon="+"
          accent="green"
        />
        <StatCard
          label={`${periodLabels[period]} Payouts`}
          value={formatCents(agg.total_payouts_cents)}
          sub={`Trade-ins ${formatCents(agg.trade_in_payouts_cents)} + Refunds ${formatCents(agg.refunds_cents)}`}
          icon="-"
          accent="red"
        />
        <StatCard
          label={`${periodLabels[period]} Net Cash Flow`}
          value={formatCents(agg.net_cash_flow_cents)}
          sub={agg.net_cash_flow_cents >= 0 ? 'Cash positive' : 'More going out than in'}
          icon="="
          accent={agg.net_cash_flow_cents >= 0 ? 'green' : 'red'}
        />
      </div>

      {/* ---- MONTH TREND ---- */}
      {data.month_trend.revenue_change_percent !== null && (
        <div className="rounded-xl border border-card-border bg-card/80 px-5 py-3 shadow-lg backdrop-blur-sm">
          <div className="flex items-center gap-6 text-sm">
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

      {/* ---- REVENUE CHART ---- */}
      <RevenueChart data={data.daily_revenue} />

      {/* ---- INVENTORY BY CATEGORY + VELOCITY ---- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Inventory by Category */}
        <div className="rounded-xl border border-card-border bg-card/80 p-5 shadow-lg backdrop-blur-sm">
          <SectionHeader sub="Cost basis — how much cash is locked in each category">Inventory by Category</SectionHeader>
          <div className="mt-5">
            <CategoryBars categories={data.category_breakdown} totalCost={data.inventory.cost_basis_cents} />
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-card-border pt-4 text-sm">
            <span className="text-muted">Total cost basis</span>
            <span className="font-semibold text-foreground tabular-nums">{formatCents(data.inventory.cost_basis_cents)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Total retail value</span>
            <span className="text-foreground/70 tabular-nums">{formatCents(data.inventory.retail_value_cents)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Potential margin</span>
            <span className="text-green-400 tabular-nums">{formatCents(data.inventory.potential_margin_cents)}</span>
          </div>
        </div>

        {/* Right: Velocity */}
        <div className="space-y-6">
          {/* Fast Movers */}
          <div className="rounded-xl border border-green-500/10 bg-card/80 p-5 shadow-lg backdrop-blur-sm">
            <SectionHeader sub="Top sellers in the last 30 days">Fast Movers</SectionHeader>
            {data.fast_movers.length === 0 ? (
              <p className="mt-4 text-sm text-muted">No sales data yet for velocity analysis.</p>
            ) : (
              <div className="mt-4 space-y-2.5">
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

          {/* Dead Stock */}
          <div className="rounded-xl border border-yellow-500/10 bg-card/80 p-5 shadow-lg backdrop-blur-sm">
            <SectionHeader sub="Items with no sales in 30+ days">Dead Stock</SectionHeader>
            {data.dead_stock.length === 0 ? (
              <p className="mt-4 text-sm text-muted">No dead stock detected. Everything is moving.</p>
            ) : (
              <>
                <div className="mt-3 mb-4 flex gap-3 text-xs">
                  <div className="rounded-xl bg-yellow-500/10 px-2.5 py-1.5 text-yellow-400">
                    {data.dead_stock_summary.count_30d} items / {formatCents(data.dead_stock_summary.value_30d)} stuck 30d+
                  </div>
                  {data.dead_stock_summary.count_90d > 0 && (
                    <div className="rounded-xl bg-red-500/10 px-2.5 py-1.5 text-red-400">
                      {data.dead_stock_summary.count_90d} items / {formatCents(data.dead_stock_summary.value_90d)} stuck 90d+
                    </div>
                  )}
                </div>
                <div className="space-y-2.5">
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
                  <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-300">
                    Top {data.dead_stock.length} dead items = {formatCents(totalDeadStockValue)} trapped capital.
                    Consider markdowns to free this cash.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ---- MARGIN ANALYSIS ---- */}
      <div className="rounded-xl border border-card-border bg-card/80 p-5 shadow-lg backdrop-blur-sm">
        <SectionHeader sub="Actual margins from the last 30 days of sales">Margin Analysis by Category</SectionHeader>
        {data.margin_analysis.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No sales data yet for margin analysis.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-card-border text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium text-right">Units Sold</th>
                  <th className="px-4 py-3 font-medium text-right">Revenue</th>
                  <th className="px-4 py-3 font-medium text-right">Cost</th>
                  <th className="px-4 py-3 font-medium text-right">Profit</th>
                  <th className="px-4 py-3 font-medium text-right">Margin</th>
                  <th className="px-4 py-3 font-medium text-right">Avg Days to Sell</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {data.margin_analysis.map((row) => (
                  <tr key={row.category} className="text-foreground transition-colors hover:bg-card-hover/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`h-2.5 w-2.5 rounded-full ${catColor(row.category)}`} />
                        <span className="font-medium">{catLabel(row.category)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground/70">{row.units_sold}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCents(row.revenue_cents)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">{formatCents(row.cost_cents)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-green-400">{formatCents(row.profit_cents)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                        row.margin_percent >= 40 ? 'bg-green-500/10 text-green-400' :
                        row.margin_percent >= 20 ? 'bg-yellow-500/10 text-yellow-400' :
                        'bg-red-500/10 text-red-400'
                      }`}>
                        {row.margin_percent}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {data.avg_days_to_sell[row.category] !== null && data.avg_days_to_sell[row.category] !== undefined
                        ? `${data.avg_days_to_sell[row.category]}d`
                        : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- TRADE-IN ROI + WHERE YOUR MONEY IS ---- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Trade-In ROI */}
        <div className="rounded-xl border border-card-border bg-card/80 p-5 shadow-lg backdrop-blur-sm">
          <SectionHeader sub="All-time trade-in performance">Trade-In ROI</SectionHeader>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Spent on trade-ins</span>
              <span className="text-sm font-medium text-red-400 tabular-nums">{formatCents(data.trade_in_roi.total_cost_cents)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Sold from trade-ins</span>
              <span className="text-sm font-medium text-green-400 tabular-nums">{formatCents(data.trade_in_roi.estimated_revenue_cents)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Outstanding inventory</span>
              <span className="text-sm font-medium text-yellow-400 tabular-nums">{formatCents(data.trade_in_roi.outstanding_value_cents)}</span>
            </div>
            <div className="border-t border-card-border pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground/70">ROI</span>
                <span className={`text-lg font-bold tabular-nums ${
                  data.trade_in_roi.roi_percent >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {data.trade_in_roi.roi_percent > 0 ? '+' : ''}{data.trade_in_roi.roi_percent}%
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                {data.trade_in_roi.total_items_received} items received all-time
              </p>
            </div>
          </div>
        </div>

        {/* Trade-Ins This Month */}
        <div className="rounded-xl border border-card-border bg-card/80 p-5 shadow-lg backdrop-blur-sm">
          <SectionHeader sub="Incoming inventory via trade-ins">Trade-Ins This Month</SectionHeader>
          <div className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Count</span>
              <span className="text-foreground tabular-nums">{data.trade_ins.count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Total Offer Value</span>
              <span className="text-foreground tabular-nums">{formatCents(data.trade_ins.total_offer_cents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Total Paid Out</span>
              <span className="text-red-400 tabular-nums">{formatCents(data.trade_ins.total_payout_cents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Cash / Credit</span>
              <span className="text-foreground/70 tabular-nums">
                {data.trade_ins.cash_payouts} / {data.trade_ins.credit_payouts}
              </span>
            </div>
          </div>
        </div>

        {/* Returns This Month */}
        <div className="rounded-xl border border-card-border bg-card/80 p-5 shadow-lg backdrop-blur-sm">
          <SectionHeader sub="Refunds and restocking">Returns This Month</SectionHeader>
          <div className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Count</span>
              <span className="text-foreground tabular-nums">{data.returns.count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Total Refunded</span>
              <span className="text-red-400 tabular-nums">{formatCents(data.returns.total_refunded_cents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Restocking Fees Collected</span>
              <span className="text-green-400 tabular-nums">{formatCents(data.returns.restocking_fees_collected_cents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Cash / Credit</span>
              <span className="text-foreground/70 tabular-nums">
                {data.returns.cash_refunds} / {data.returns.credit_refunds}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ---- LIABILITIES ---- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Outstanding Store Credit"
          value={formatCents(data.outstanding_credit.total_cents)}
          sub={`${data.outstanding_credit.customer_count} customers with balances`}
          accent="yellow"
        />
        <StatCard
          label="Potential Margin (if all sold)"
          value={formatCents(data.inventory.potential_margin_cents)}
          sub={`Retail ${formatCents(data.inventory.retail_value_cents)} - Cost ${formatCents(data.inventory.cost_basis_cents)}`}
          accent="green"
        />
        <StatCard
          label="Out of Stock Items"
          value={`${data.inventory.zero_stock_count}`}
          sub={`of ${data.inventory.total_skus} total SKUs need reordering`}
          accent={data.inventory.zero_stock_count > 0 ? 'red' : 'default'}
        />
      </div>

      {/* ---- AI RECOMMENDATIONS ---- */}
      <CashFlowInsights data={data} totalDeadStockValue={totalDeadStockValue} />
    </div>
  );
}
