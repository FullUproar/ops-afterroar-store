'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatCents } from '@/lib/types';
import { PageHeader } from '@/components/page-header';
import { FeatureGate } from '@/components/feature-gate';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type AdvancedSegment =
  | 'top_spenders'
  | 'tcg_buyers'
  | 'board_game_buyers'
  | 'event_regulars'
  | 'lapsed'
  | 'new_customers'
  | 'loyalty_active'
  | 'high_credit'
  | 'vip'
  | 'at_risk'
  | 'cafe_regulars'
  | 'tournament_players';

interface SegmentCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  lifetime_spend_cents: number;
  last_purchase_at: string | null;
  visit_count: number;
  loyalty_points: number;
  tags: string[];
}

interface SummaryStats {
  total_customers: number;
  with_email: number;
  without_email: number;
  active_30d: number;
  avg_lifetime_value_cents: number;
  retention_rate: number; // % who made 2+ purchases
}

/* ------------------------------------------------------------------ */
/*  Segment config                                                     */
/* ------------------------------------------------------------------ */

const SEGMENT_CONFIG: Record<AdvancedSegment, {
  label: string;
  icon: string;
  description: string;
  color: string;
  bgColor: string;
}> = {
  top_spenders: {
    label: 'Top Spenders',
    icon: '\u2605',
    description: 'Top 20% by lifetime spend',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
  },
  tcg_buyers: {
    label: 'TCG Buyers',
    icon: '\u2660',
    description: 'Bought singles or sealed product',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
  },
  board_game_buyers: {
    label: 'Board Game Buyers',
    icon: '\u265C',
    description: 'Purchased board games',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  event_regulars: {
    label: 'Event Regulars',
    icon: '\u2606',
    description: '3+ event check-ins in window',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
  },
  lapsed: {
    label: 'Lapsed',
    icon: '\u23F8',
    description: '60+ days since last visit, 2+ prior purchases',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
  },
  new_customers: {
    label: 'New Customers',
    icon: '\u271A',
    description: 'First purchase within last 30 days',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
  },
  loyalty_active: {
    label: 'Loyalty Active',
    icon: '\u25C6',
    description: 'Have loyalty points balance > 0',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
  },
  high_credit: {
    label: 'High Credit',
    icon: '\u25A0',
    description: 'Store credit balance over $10',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
  },
  vip: {
    label: 'VIP',
    icon: '\u25C8',
    description: 'Lifetime spend over $500',
    color: 'text-amber-300',
    bgColor: 'bg-amber-400/10',
  },
  at_risk: {
    label: 'At Risk',
    icon: '\u26A0',
    description: 'Were regular but no activity in 30+ days',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
  },
  cafe_regulars: {
    label: 'Cafe Regulars',
    icon: '\u2615',
    description: '5+ cafe tab closes',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
  },
  tournament_players: {
    label: 'Tournament Players',
    icon: '\u2694',
    description: 'Participated in tournaments',
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
  },
};

const ALL_SEGMENTS = Object.keys(SEGMENT_CONFIG) as AdvancedSegment[];

/* ------------------------------------------------------------------ */
/*  Quick export presets                                                */
/* ------------------------------------------------------------------ */

interface QuickExport {
  label: string;
  icon: string;
  description: string;
  action: () => void;
}

/* ------------------------------------------------------------------ */
/*  Sort helpers                                                       */
/* ------------------------------------------------------------------ */

type SortKey = 'name' | 'email' | 'last_purchase_at' | 'lifetime_spend_cents' | 'loyalty_points';
type SortDir = 'asc' | 'desc';

function sortCustomers(list: SegmentCustomer[], key: SortKey, dir: SortDir): SegmentCustomer[] {
  return [...list].sort((a, b) => {
    let cmp = 0;
    if (key === 'name') {
      cmp = a.name.localeCompare(b.name);
    } else if (key === 'email') {
      cmp = (a.email || '').localeCompare(b.email || '');
    } else if (key === 'last_purchase_at') {
      const da = a.last_purchase_at ? new Date(a.last_purchase_at).getTime() : 0;
      const db = b.last_purchase_at ? new Date(b.last_purchase_at).getTime() : 0;
      cmp = da - db;
    } else if (key === 'lifetime_spend_cents') {
      cmp = a.lifetime_spend_cents - b.lifetime_spend_cents;
    } else if (key === 'loyalty_points') {
      cmp = a.loyalty_points - b.loyalty_points;
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function CustomerInsightsPage() {
  const [segmentCounts, setSegmentCounts] = useState<Record<AdvancedSegment, number> | null>(null);
  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSegment, setSelectedSegment] = useState<AdvancedSegment | null>(null);
  const [customers, setCustomers] = useState<SegmentCustomer[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('lifetime_spend_cents');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [exporting, setExporting] = useState(false);

  // Load segment counts + summary stats
  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/customers/segments?advanced=true');
      if (res.ok) {
        const data = await res.json();
        setSegmentCounts(data.segments);
      }

      // Also load summary from the POST endpoint with a special summary call
      const summaryRes = await fetch('/api/customers/insights/summary');
      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        setSummary(summaryData);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load customers for a segment
  const loadSegment = useCallback(async (segment: AdvancedSegment) => {
    setSelectedSegment(segment);
    setLoadingList(true);
    try {
      const res = await fetch('/api/customers/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment }),
      });
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.customers ?? []);
      }
    } finally {
      setLoadingList(false);
    }
  }, []);

  // Export a segment as CSV
  const exportSegmentCSV = useCallback(async (segment: AdvancedSegment, opts?: { has_email?: boolean }) => {
    setExporting(true);
    try {
      const res = await fetch('/api/customers/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment, format: 'csv', ...opts }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `customers-${segment}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setExporting(false);
    }
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'email' ? 'asc' : 'desc');
    }
  };

  const sorted = sortCustomers(customers, sortKey, sortDir);

  const quickExports: QuickExport[] = [
    {
      label: 'Email Campaign List',
      icon: '\u2709',
      description: 'All customers with email, sorted by spend',
      action: () => exportSegmentCSV('top_spenders', { has_email: true }),
    },
    {
      label: 'Lapsed Customers',
      icon: '\u23F8',
      description: 'At-risk + lapsed for win-back campaigns',
      action: () => exportSegmentCSV('lapsed'),
    },
    {
      label: 'VIP List',
      icon: '\u25C8',
      description: 'Top spenders for special promotions',
      action: () => exportSegmentCSV('vip'),
    },
    {
      label: 'Tournament Players',
      icon: '\u2694',
      description: 'Players for event announcements',
      action: () => exportSegmentCSV('tournament_players'),
    },
  ];

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' \u2191' : ' \u2193';
  };

  return (
    <FeatureGate module="intelligence">
      <div className="space-y-6">
        <PageHeader
          title="Customer Intelligence"
          backHref="/dashboard/customers"
        />

        {loading ? (
          <p className="text-muted">Loading customer intelligence...</p>
        ) : (
          <>
            {/* Summary Cards */}
            {summary && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <SummaryCard
                  label="Total Customers"
                  value={String(summary.total_customers)}
                  sub={`${summary.with_email} with email, ${summary.without_email} without`}
                />
                <SummaryCard
                  label="Active (30 days)"
                  value={String(summary.active_30d)}
                  sub={`${summary.total_customers > 0 ? Math.round((summary.active_30d / summary.total_customers) * 100) : 0}% of total`}
                />
                <SummaryCard
                  label="Avg Lifetime Value"
                  value={formatCents(summary.avg_lifetime_value_cents)}
                  sub="Per customer"
                />
                <SummaryCard
                  label="Retention Rate"
                  value={`${summary.retention_rate}%`}
                  sub="Made 2+ purchases"
                />
              </div>
            )}

            {/* Segment Browser */}
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-3">Segments</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {ALL_SEGMENTS.map((seg) => {
                  const config = SEGMENT_CONFIG[seg];
                  const count = segmentCounts?.[seg] ?? 0;
                  const isSelected = selectedSegment === seg;

                  return (
                    <div
                      key={seg}
                      className={`rounded-xl border p-4 transition-colors ${
                        isSelected
                          ? 'border-accent bg-accent/5'
                          : 'border-card-border bg-card hover:border-input-border'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-lg ${config.color}`}>{config.icon}</span>
                        <span className="font-semibold text-foreground text-sm">{config.label}</span>
                        <span className="ml-auto text-lg font-bold text-foreground tabular-nums">
                          {count}
                        </span>
                      </div>
                      <p className="text-xs text-muted mb-3">{config.description}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => loadSegment(seg)}
                          className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            isSelected
                              ? 'bg-accent text-white'
                              : 'bg-card-hover text-foreground hover:bg-input-border'
                          }`}
                        >
                          View
                        </button>
                        <button
                          onClick={() => exportSegmentCSV(seg)}
                          disabled={exporting || count === 0}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-card-border text-muted hover:text-foreground hover:border-input-border transition-colors disabled:opacity-40"
                        >
                          Export CSV
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Exports */}
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-3">Quick Exports</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {quickExports.map((qe) => (
                  <button
                    key={qe.label}
                    onClick={qe.action}
                    disabled={exporting}
                    className="rounded-xl border border-card-border bg-card p-4 text-left hover:border-input-border hover:bg-card-hover transition-colors disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{qe.icon}</span>
                      <span className="font-semibold text-foreground text-sm">{qe.label}</span>
                    </div>
                    <p className="text-xs text-muted">{qe.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Customer List (when segment selected) */}
            {selectedSegment && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-foreground">
                    {SEGMENT_CONFIG[selectedSegment].label}
                    <span className="text-muted font-normal ml-2 text-sm">
                      {customers.length} customers
                    </span>
                  </h2>
                  <button
                    onClick={() => exportSegmentCSV(selectedSegment)}
                    disabled={exporting || customers.length === 0}
                    className="px-4 py-2 border border-card-border bg-card hover:bg-card-hover text-muted rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                  >
                    {exporting ? 'Exporting...' : 'Export This List'}
                  </button>
                </div>

                {loadingList ? (
                  <p className="text-muted">Loading...</p>
                ) : customers.length === 0 ? (
                  <div className="rounded-xl border border-card-border bg-card p-8 text-center">
                    <p className="text-muted">No customers in this segment</p>
                  </div>
                ) : (
                  <>
                    {/* Mobile card view */}
                    <div className="md:hidden space-y-3">
                      {sorted.map((c) => (
                        <div
                          key={c.id}
                          className="rounded-xl border border-card-border bg-card p-4"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-foreground truncate">{c.name}</span>
                            <span className="text-sm font-medium text-foreground tabular-nums">
                              {formatCents(c.lifetime_spend_cents)}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-muted">
                            {c.email || 'No email'}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {c.tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-block rounded-md bg-card-hover border border-card-border px-1.5 py-0.5 text-[10px] text-muted"
                              >
                                {tag.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop table */}
                    <div className="hidden md:block bg-card border border-card-border rounded-xl overflow-hidden shadow-sm dark:shadow-none">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-card-border text-muted text-left">
                            <th
                              className="px-4 py-3 font-medium cursor-pointer hover:text-foreground"
                              onClick={() => handleSort('name')}
                            >
                              Name{sortArrow('name')}
                            </th>
                            <th
                              className="px-4 py-3 font-medium cursor-pointer hover:text-foreground"
                              onClick={() => handleSort('email')}
                            >
                              Email{sortArrow('email')}
                            </th>
                            <th
                              className="px-4 py-3 font-medium text-right cursor-pointer hover:text-foreground"
                              onClick={() => handleSort('last_purchase_at')}
                            >
                              Last Purchase{sortArrow('last_purchase_at')}
                            </th>
                            <th
                              className="px-4 py-3 font-medium text-right cursor-pointer hover:text-foreground"
                              onClick={() => handleSort('lifetime_spend_cents')}
                            >
                              Lifetime Spend{sortArrow('lifetime_spend_cents')}
                            </th>
                            <th
                              className="px-4 py-3 font-medium text-right cursor-pointer hover:text-foreground"
                              onClick={() => handleSort('loyalty_points')}
                            >
                              Loyalty Points{sortArrow('loyalty_points')}
                            </th>
                            <th className="px-4 py-3 font-medium">Tags</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map((c) => (
                            <tr
                              key={c.id}
                              className="border-b border-card-border hover:bg-card-hover text-foreground"
                            >
                              <td className="px-4 py-3 font-medium">{c.name}</td>
                              <td className="px-4 py-3 text-muted">{c.email || '-'}</td>
                              <td className="px-4 py-3 text-right text-muted tabular-nums">
                                {c.last_purchase_at
                                  ? new Date(c.last_purchase_at).toLocaleDateString()
                                  : 'Never'}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">
                                {c.lifetime_spend_cents > 0
                                  ? formatCents(c.lifetime_spend_cents)
                                  : '-'}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">
                                {c.loyalty_points}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {c.tags.map((tag) => (
                                    <span
                                      key={tag}
                                      className="inline-block rounded-md bg-card-hover border border-card-border px-1.5 py-0.5 text-[10px] text-muted"
                                    >
                                      {tag.replace(/_/g, ' ')}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </FeatureGate>
  );
}

/* ------------------------------------------------------------------ */
/*  Summary card component                                             */
/* ------------------------------------------------------------------ */

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-card-border bg-card p-4">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
      <p className="text-xs text-muted mt-1">{sub}</p>
    </div>
  );
}
