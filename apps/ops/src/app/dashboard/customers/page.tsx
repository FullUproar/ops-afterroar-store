'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { formatCents } from '@/lib/types';
import { StatusBadge } from '@/components/mobile-card';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/shared/ui';
import { useFormDraft } from '@/hooks/use-form-draft';
import { useUnsavedChangesWarning } from '@/hooks/use-unsaved-changes-warning';

/* ------------------------------------------------------------------ */
/*  Form-draft pattern reference                                       */
/*                                                                     */
/*  Every multi-field form should follow this contract:               */
/*    1. const { value, setValue, hasDraft, clearDraft } =            */
/*         useFormDraft("<unique-key>", initialValues);                */
/*    2. const dirty = JSON.stringify(value) !==                       */
/*         JSON.stringify(initialValues);                              */
/*    3. useUnsavedChangesWarning(dirty);                              */
/*    4. On successful submit: clearDraft();                           */
/*                                                                     */
/*  This keeps work safe across:                                      */
/*    - Mode toggles (dashboard ↔ register) — confirm prompt           */
/*    - Tab close / browser navigation — beforeunload prompt           */
/*    - Accidental nav back — auto-restore on remount                  */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Customer Segments                                                   */
/* ------------------------------------------------------------------ */

type CustomerSegment = 'vip' | 'regular' | 'new' | 'at_risk' | 'dormant' | 'active';

interface SegmentedCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  credit_balance_cents: number;
  created_at: string;
  segment: CustomerSegment;
  lifetime_spend_cents: number;
  purchases_30d: number;
  last_purchase_date: string | null;
}

interface SegmentCounts {
  vip: number;
  regular: number;
  new: number;
  at_risk: number;
  dormant: number;
  active: number;
  total: number;
}

const SEGMENT_CONFIG: Record<CustomerSegment, {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  vip: {
    label: 'VIP',
    icon: '\u{1F31F}',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
  },
  regular: {
    label: 'Regular',
    icon: '\u{1F504}',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
  },
  new: {
    label: 'New',
    icon: '\u{1F195}',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
  },
  at_risk: {
    label: 'At Risk',
    icon: '\u26A0\uFE0F',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
  },
  dormant: {
    label: 'Dormant',
    icon: '\u{1F4A4}',
    color: 'text-zinc-400',
    bgColor: 'bg-zinc-500/10',
    borderColor: 'border-zinc-500/30',
  },
  active: {
    label: 'Active',
    icon: '\u2713',
    color: 'text-foreground/70',
    bgColor: 'bg-card-hover',
    borderColor: 'border-card-border',
  },
};

function SegmentBadge({ segment }: { segment: CustomerSegment }) {
  const config = SEGMENT_CONFIG[segment];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${config.color} ${config.bgColor} ${config.borderColor}`}
    >
      <span aria-hidden="true">{config.icon}</span>
      {config.label}
    </span>
  );
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<SegmentedCustomer[]>([]);
  const [counts, setCounts] = useState<SegmentCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<CustomerSegment | 'all'>('all');
  const [showForm, setShowForm] = useState(false);
  // Form draft is auto-persisted to localStorage per the contract above.
  // hasDraft lets us nudge the user that there's a recovered draft.
  const CUSTOMER_FORM_INITIAL = { name: '', email: '', phone: '' };
  const { value: form, setValue: setForm, hasDraft: hasFormDraft, clearDraft: clearFormDraft } =
    useFormDraft<{ name: string; email: string; phone: string }>(
      'customers-create',
      CUSTOMER_FORM_INITIAL,
    );
  // Dirty when any field differs from initial — drives the unsaved-
  // changes warning on mode switch + tab close.
  const formDirty =
    form.name !== CUSTOMER_FORM_INITIAL.name ||
    form.email !== CUSTOMER_FORM_INITIAL.email ||
    form.phone !== CUSTOMER_FORM_INITIAL.phone;
  useUnsavedChangesWarning(formDirty);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const PAGE_SIZE = 10;

  function handleSort(key: string) {
    if (sortKey === key) {
      if (sortDir === 'asc') {
        setSortDir('desc');
      } else {
        // Third click: turn off sorting
        setSortKey(null);
      }
    } else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'email' || key === 'segment' ? 'asc' : 'desc');
    }
    setPage(0);
  }

  function sortArrow(key: string) {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  const loadCustomers = useCallback(async () => {
    try {
      setLoadError(null);
      const res = await fetch('/api/customers/segments');
      if (!res.ok) {
        setLoadError('Failed to load customers. Try again.');
        return;
      }
      const data = await res.json();
      setCustomers(data.customers ?? []);
      setCounts(data.counts ?? null);
    } catch {
      setLoadError('Failed to load customers. Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Auto-open the form if there's a recovered draft so the cashier
  // sees their work-in-progress immediately.
  useEffect(() => {
    if (hasFormDraft && formDirty) setShowForm(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setForm({ name: '', email: '', phone: '' });
        // Drop the persisted draft now that it's been submitted.
        clearFormDraft();
        setShowForm(false);
        setCreateError(null);
        loadCustomers();
      } else {
        const body = await res.json().catch(() => ({ error: 'Failed to add customer' }));
        setCreateError(body.error || 'Failed to add customer');
      }
    } catch {
      setCreateError('Network error — could not add customer');
    } finally {
      setSaving(false);
    }
  }

  // Filter by search and segment
  const filtered = customers.filter((c) => {
    if (segmentFilter !== 'all' && c.segment !== segmentFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.email?.toLowerCase().includes(q) ?? false) ||
        (c.phone?.includes(q) ?? false)
      );
    }
    return true;
  });

  // Sort (null = no sort, use default order from API)
  const sorted = sortKey ? [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortKey as string) {
      case 'name': return dir * a.name.localeCompare(b.name);
      case 'email': return dir * (a.email || '').localeCompare(b.email || '');
      case 'segment': return dir * a.segment.localeCompare(b.segment);
      case 'lifetime_spend': return dir * (a.lifetime_spend_cents - b.lifetime_spend_cents);
      case 'credit': return dir * (a.credit_balance_cents - b.credit_balance_cents);
      case 'last_purchase': {
        const da = a.last_purchase_date ? new Date(a.last_purchase_date).getTime() : 0;
        const db = b.last_purchase_date ? new Date(b.last_purchase_date).getTime() : 0;
        return dir * (da - db);
      }
      default: return 0;
    }
  }) : filtered;

  // Pagination
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [search, segmentFilter]);

  const segmentButtons: Array<{ key: CustomerSegment | 'all'; label: string; count: number | null; tooltip: string }> = [
    { key: 'all', label: 'All', count: counts?.total ?? null, tooltip: 'All customers' },
    { key: 'vip', label: 'VIP', count: counts?.vip ?? null, tooltip: 'Lifetime spend $500+' },
    { key: 'regular', label: 'Regular', count: counts?.regular ?? null, tooltip: '3+ purchases in the last 30 days' },
    { key: 'new', label: 'New', count: counts?.new ?? null, tooltip: 'Created in the last 14 days' },
    { key: 'at_risk', label: 'At Risk', count: counts?.at_risk ?? null, tooltip: 'Spent $100+ but hasn\'t visited in 30-60 days' },
    { key: 'dormant', label: 'Dormant', count: counts?.dormant ?? null, tooltip: 'Spent $100+ but hasn\'t visited in 60+ days' },
  ];

  return (
    <div className="flex flex-col h-full gap-4">
      <PageHeader
        title="Customers"
        action={
          <div className="flex gap-2">
            <a
              href={`/api/customers/export${segmentFilter !== 'all' ? `?segment=${segmentFilter}` : ''}`}
              download
              className="px-3 py-2 border border-card-border bg-card hover:bg-card-hover text-muted rounded-lg text-sm font-medium transition-colors"
            >
              Export CSV
            </a>
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-4 py-2 bg-accent hover:opacity-90 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {showForm ? 'Cancel' : 'Add Customer'}
            </button>
          </div>
        }
      />

      {showForm && (
        <form onSubmit={handleCreate} className="bg-card border border-card-border rounded-xl p-4 space-y-4 shadow-sm dark:shadow-none">
          {hasFormDraft && formDirty && (
            <div className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-accent flex items-center justify-between gap-3">
              <span>Restored your unsaved draft.</span>
              <button
                type="button"
                onClick={() => { setForm({ name: '', email: '', phone: '' }); clearFormDraft(); }}
                className="text-xs underline hover:opacity-80"
              >
                Discard draft
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-muted mb-1">Name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-input-bg border border-input-border rounded-lg px-3 py-2 text-foreground text-sm focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full bg-input-bg border border-input-border rounded-lg px-3 py-2 text-foreground text-sm focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full bg-input-bg border border-input-border rounded-lg px-3 py-2 text-foreground text-sm focus:border-accent focus:outline-none"
              />
            </div>
          </div>
          {createError && (
            <p className="text-sm text-red-400">{createError}</p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-accent hover:opacity-90 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? 'Adding...' : 'Add Customer'}
          </button>
        </form>
      )}

      {/* Segment Filter Bar */}
      {counts && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-2">
            {segmentButtons.map((seg) => (
              <button
                key={seg.key}
                onClick={() => setSegmentFilter(seg.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  segmentFilter === seg.key
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-card-border bg-card text-muted hover:text-foreground hover:border-input-border'
                }`}
              >
                {seg.label}
                {seg.count !== null && (
                  <span className="text-xs opacity-70 tabular-nums">{seg.count}</span>
                )}
              </button>
            ))}
          </div>
          {segmentFilter !== 'all' && (
            <p className="text-xs text-muted">
              {segmentButtons.find(s => s.key === segmentFilter)?.tooltip}
              {' '}— auto-tagged based on purchase history
            </p>
          )}
        </div>
      )}

      {/* Search */}
      <div>
        <input
          type="text"
          placeholder="Search customers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md bg-input-bg border border-input-border rounded-lg px-3 py-2 text-foreground text-sm placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
          <p className="text-sm text-red-400">{loadError}</p>
          <button
            onClick={() => { setLoadError(null); loadCustomers(); }}
            className="mt-2 text-xs text-red-300 underline hover:text-red-200"
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-muted">Loading customers...</p>
      ) : filtered.length === 0 && !loadError ? (
        <EmptyState
          icon="&#x1F465;"
          title={search || segmentFilter !== 'all' ? 'No customers match your filters' : 'No customers yet'}
          action={!search && segmentFilter === 'all' ? { label: "Add Your First Customer", onClick: () => setShowForm(true) } : undefined}
        />
      ) : (
        <>
          {/* Result count */}
          <div className="shrink-0 flex items-center justify-between text-xs text-muted">
            <span>{filtered.length} customer{filtered.length !== 1 ? 's' : ''}{totalPages > 1 ? ` — page ${page + 1} of ${totalPages}` : ''}</span>
          </div>

          {/* Scrollable data area — this is the ONLY thing that scrolls */}
          <div className="flex-1 min-h-0 overflow-y-auto scroll-visible -mx-2 px-2">

          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {paginated.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/customers/${c.id}`}
                className="block rounded-xl border border-card-border bg-card p-4 min-h-11 active:bg-card-hover shadow-sm dark:shadow-none transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-foreground leading-snug truncate">{c.name}</span>
                    <SegmentBadge segment={c.segment} />
                  </div>
                  <StatusBadge variant="success">
                    {formatCents(c.credit_balance_cents ?? 0)}
                  </StatusBadge>
                </div>
                <div className="mt-1.5 flex items-center gap-3 text-xs text-muted">
                  <span>{c.email || c.phone || 'No contact info'}</span>
                  {c.lifetime_spend_cents > 0 && (
                    <span className="tabular-nums">{formatCents(c.lifetime_spend_cents)} lifetime</span>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-card border border-card-border rounded-xl shadow-sm dark:shadow-none">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border text-muted text-left">
                  <th className="px-4 py-3 font-medium cursor-pointer hover:text-foreground select-none transition-colors" onClick={() => handleSort('name')}>Name{sortArrow('name')}</th>
                  <th className="px-4 py-3 font-medium cursor-pointer hover:text-foreground select-none transition-colors" onClick={() => handleSort('segment')}>Segment{sortArrow('segment')}</th>
                  <th className="px-4 py-3 font-medium cursor-pointer hover:text-foreground select-none transition-colors" onClick={() => handleSort('email')}>Email{sortArrow('email')}</th>
                  <th className="px-4 py-3 font-medium text-right cursor-pointer hover:text-foreground select-none transition-colors" onClick={() => handleSort('lifetime_spend')}>Lifetime Spend{sortArrow('lifetime_spend')}</th>
                  <th className="px-4 py-3 font-medium text-right cursor-pointer hover:text-foreground select-none transition-colors" onClick={() => handleSort('credit')}>Store Credit{sortArrow('credit')}</th>
                  <th className="px-4 py-3 font-medium text-right cursor-pointer hover:text-foreground select-none transition-colors" onClick={() => handleSort('last_purchase')}>Last Purchase{sortArrow('last_purchase')}</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((c) => (
                  <Link
                    key={c.id}
                    href={`/dashboard/customers/${c.id}`}
                    className="contents"
                  >
                    <tr className="border-b border-card-border hover:bg-card-hover cursor-pointer text-foreground">
                      <td className="px-4 py-3 font-medium">{c.name}</td>
                      <td className="px-4 py-3">
                        <SegmentBadge segment={c.segment} />
                      </td>
                      <td className="px-4 py-3 text-muted">{c.email || '-'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {c.lifetime_spend_cents > 0 ? formatCents(c.lifetime_spend_cents) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <StatusBadge variant="success">
                          {formatCents(c.credit_balance_cents ?? 0)}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-right text-muted">
                        {c.last_purchase_date
                          ? new Date(c.last_purchase_date).toLocaleDateString()
                          : 'Never'}
                      </td>
                    </tr>
                  </Link>
                ))}
              </tbody>
            </table>
          </div>

          </div>{/* end scrollable data area */}

          {/* Pagination — fixed at bottom */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 rounded-lg border border-card-border bg-card text-sm text-muted hover:text-foreground disabled:opacity-30 transition-colors"
              >
                Previous
              </button>
              <div className="flex gap-1">
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  // Show pages around current page
                  let pageNum: number;
                  if (totalPages <= 7) {
                    pageNum = i;
                  } else if (page < 3) {
                    pageNum = i;
                  } else if (page > totalPages - 4) {
                    pageNum = totalPages - 7 + i;
                  } else {
                    pageNum = page - 3 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                        page === pageNum
                          ? 'bg-accent text-white'
                          : 'text-muted hover:text-foreground hover:bg-card-hover'
                      }`}
                    >
                      {pageNum + 1}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 rounded-lg border border-card-border bg-card text-sm text-muted hover:text-foreground disabled:opacity-30 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
