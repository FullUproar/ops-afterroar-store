'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/page-header';

interface StockCountItem {
  id: string;
  stock_count_id: string;
  inventory_item_id: string;
  system_quantity: number;
  counted_quantity: number | null;
  variance: number | null;
  counted_at: string | null;
  notes: string | null;
  inventory_item: {
    id: string;
    name: string;
    category: string;
    sku: string | null;
    barcode: string | null;
  };
}

interface StockCount {
  id: string;
  store_id: string;
  staff_id: string | null;
  status: string;
  category_filter: string | null;
  started_at: string;
  completed_at: string | null;
  total_items: number;
  variances: number;
  notes: string | null;
  staff?: { name: string } | null;
  _count?: { items: number };
  items?: StockCountItem[];
}

const CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: 'tcg_single', label: 'TCG Singles' },
  { value: 'sealed', label: 'Sealed' },
  { value: 'board_game', label: 'Board Games' },
  { value: 'miniature', label: 'Miniatures' },
  { value: 'accessory', label: 'Accessories' },
  { value: 'food_drink', label: 'Food & Drink' },
  { value: 'other', label: 'Other' },
];

export default function StockCountsPage() {
  const [counts, setCounts] = useState<StockCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [creating, setCreating] = useState(false);

  // Active count view
  const [activeCount, setActiveCount] = useState<StockCount | null>(null);
  const [countItems, setCountItems] = useState<StockCountItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [savingItem, setSavingItem] = useState<string | null>(null);

  const loadCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/stock-counts');
      if (res.ok) setCounts(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch('/api/stock-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_filter: categoryFilter !== 'all' ? categoryFilter : null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowNew(false);
        loadCounts();
        openCount(data.id);
      }
    } finally {
      setCreating(false);
    }
  }

  async function openCount(id: string) {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/stock-counts/${id}`);
      if (res.ok) {
        const data = await res.json();
        setActiveCount(data);
        setCountItems(data.items || []);
      }
    } finally {
      setLoadingDetail(false);
    }
  }

  async function updateItemCount(itemId: string, countedQuantity: number) {
    setSavingItem(itemId);
    try {
      const res = await fetch(`/api/stock-counts/${activeCount!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, counted_quantity: countedQuantity }),
      });
      if (res.ok) {
        setCountItems((prev) =>
          prev.map((i) =>
            i.id === itemId
              ? { ...i, counted_quantity: countedQuantity, variance: countedQuantity - i.system_quantity, counted_at: new Date().toISOString() }
              : i
          )
        );
      }
    } finally {
      setSavingItem(null);
    }
  }

  async function handleComplete() {
    if (!activeCount) return;
    setCompleting(true);
    try {
      const res = await fetch(`/api/stock-counts/${activeCount.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' }),
      });
      if (res.ok) {
        setActiveCount(null);
        loadCounts();
      }
    } finally {
      setCompleting(false);
    }
  }

  function getVarianceColor(variance: number | null) {
    if (variance === null) return 'text-muted';
    if (variance === 0) return 'text-green-400';
    if (Math.abs(variance) <= 2) return 'text-yellow-400';
    return 'text-red-400';
  }

  // If viewing an active count
  if (activeCount) {
    const counted = countItems.filter((i) => i.counted_quantity !== null).length;
    const totalVariances = countItems.filter(
      (i) => i.counted_quantity !== null && (i.counted_quantity - i.system_quantity) !== 0
    ).length;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <PageHeader title="Stock Count" backHref="/dashboard/stock-counts" />
            <p className="text-sm text-muted mt-1">
              Started {new Date(activeCount.started_at).toLocaleString()}
              {activeCount.category_filter && ` | Category: ${activeCount.category_filter}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">
              {counted}/{countItems.length} counted | {totalVariances} variances
            </span>
            {activeCount.status === 'in_progress' && (
              <button
                onClick={handleComplete}
                disabled={completing || counted === 0}
                className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-foreground rounded text-sm font-medium"
              >
                {completing ? 'Completing...' : 'Complete Count'}
              </button>
            )}
            {activeCount.status === 'completed' && (
              <span className="px-3 py-1 bg-green-900 text-green-300 rounded text-sm">Completed</span>
            )}
          </div>
        </div>

        {loadingDetail ? (
          <p className="text-muted">Loading...</p>
        ) : (
          <>
            {/* Mobile card view */}
            <div className="md:hidden space-y-2">
              {countItems.map((item) => {
                const variance = item.counted_quantity !== null ? item.counted_quantity - item.system_quantity : null;
                return (
                  <div key={item.id} className="rounded-xl border border-card-border bg-card p-3">
                    <div className="font-medium text-foreground text-sm truncate">{item.inventory_item.name}</div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-muted">System: {item.system_quantity}</span>
                      <div className="flex items-center gap-3">
                        {activeCount.status === 'in_progress' ? (
                          <input
                            type="number"
                            min={0}
                            value={item.counted_quantity ?? ''}
                            onChange={(e) => {
                              const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                              setCountItems((prev) =>
                                prev.map((i) =>
                                  i.id === item.id
                                    ? { ...i, counted_quantity: val, variance: val !== null ? val - i.system_quantity : null }
                                    : i
                                )
                              );
                            }}
                            onBlur={(e) => {
                              const val = e.target.value;
                              if (val !== '') {
                                updateItemCount(item.id, parseInt(val, 10));
                              }
                            }}
                            disabled={savingItem === item.id}
                            className="w-20 bg-card-hover border border-input-border rounded px-2 py-2 text-foreground text-sm text-center"
                            placeholder="Count"
                          />
                        ) : (
                          <span className="text-sm text-foreground">{item.counted_quantity ?? '--'}</span>
                        )}
                        <span className={`text-sm font-medium min-w-8 text-right ${getVarianceColor(variance)}`}>
                          {variance !== null ? (variance > 0 ? `+${variance}` : variance) : '--'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block bg-card border border-card-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-card-border text-muted text-left">
                    <th className="px-4 py-3 font-medium">Item</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">SKU/Barcode</th>
                    <th className="px-4 py-3 font-medium text-center">System Qty</th>
                    <th className="px-4 py-3 font-medium text-center">Counted</th>
                    <th className="px-4 py-3 font-medium text-center">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {countItems.map((item) => {
                    const variance = item.counted_quantity !== null ? item.counted_quantity - item.system_quantity : null;
                    return (
                      <tr key={item.id} className="border-b border-card-border text-foreground hover:bg-card-hover">
                        <td className="px-4 py-3 font-medium">{item.inventory_item.name}</td>
                        <td className="px-4 py-3 text-muted">{item.inventory_item.category}</td>
                        <td className="px-4 py-3 text-muted text-xs">
                          {item.inventory_item.sku || item.inventory_item.barcode || '--'}
                        </td>
                        <td className="px-4 py-3 text-center text-foreground/70">{item.system_quantity}</td>
                        <td className="px-4 py-3 text-center">
                          {activeCount.status === 'in_progress' ? (
                            <input
                              type="number"
                              min={0}
                              value={item.counted_quantity ?? ''}
                              onChange={(e) => {
                                const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                                setCountItems((prev) =>
                                  prev.map((i) =>
                                    i.id === item.id
                                      ? { ...i, counted_quantity: val, variance: val !== null ? val - i.system_quantity : null }
                                      : i
                                  )
                                );
                              }}
                              onBlur={(e) => {
                                const val = e.target.value;
                                if (val !== '') {
                                  updateItemCount(item.id, parseInt(val, 10));
                                }
                              }}
                              disabled={savingItem === item.id}
                              className="w-20 bg-card-hover border border-input-border rounded px-2 py-1 text-foreground text-sm text-center"
                            />
                          ) : (
                            <span>{item.counted_quantity ?? '--'}</span>
                          )}
                        </td>
                        <td className={`px-4 py-3 text-center font-medium ${getVarianceColor(variance)}`}>
                          {variance !== null ? (variance > 0 ? `+${variance}` : variance) : '--'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <PageHeader
        title="Stock Counts"
        action={
          <button
            onClick={() => setShowNew(!showNew)}
            className="px-4 py-2 bg-accent hover:opacity-90 text-foreground rounded text-sm font-medium"
          >
            {showNew ? 'Cancel' : 'New Count'}
          </button>
        }
      />

      {showNew && (
        <div className="bg-card border border-card-border rounded-xl p-4 space-y-4">
          <div>
            <label className="block text-sm text-muted mb-1">Category Filter</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full max-w-xs bg-card-hover border border-input-border rounded px-3 py-2 text-foreground text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-4 py-2 bg-accent hover:opacity-90 disabled:opacity-50 text-foreground rounded text-sm font-medium"
          >
            {creating ? 'Starting...' : 'Start Count'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-muted">Loading...</p>
      ) : counts.length === 0 ? (
        <p className="text-muted">No stock counts yet. Start one to begin.</p>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="md:hidden space-y-2">
            {counts.map((count) => (
              <button
                key={count.id}
                onClick={() => openCount(count.id)}
                className="w-full rounded-xl border border-card-border bg-card p-3 text-left min-h-11 active:bg-card-hover"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{count.category_filter || 'All Categories'}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    count.status === 'completed'
                      ? 'bg-green-900 text-green-300'
                      : 'bg-yellow-900 text-yellow-300'
                  }`}>
                    {count.status === 'in_progress' ? 'In Progress' : 'Completed'}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted">
                  <span>{count.total_items} items &middot; {count.variances} variances</span>
                  <span>{new Date(count.started_at).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-card border border-card-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border text-muted text-left">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Staff</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium text-center">Items</th>
                  <th className="px-4 py-3 font-medium text-center">Variances</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {counts.map((count) => (
                  <tr
                    key={count.id}
                    onClick={() => openCount(count.id)}
                    className="border-b border-card-border hover:bg-card-hover cursor-pointer text-foreground"
                  >
                    <td className="px-4 py-3">{new Date(count.started_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-foreground/70">{count.staff?.name || '--'}</td>
                    <td className="px-4 py-3 text-foreground/70">{count.category_filter || 'All'}</td>
                    <td className="px-4 py-3 text-center text-foreground/70">{count.total_items}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={count.variances > 0 ? 'text-yellow-400' : 'text-muted'}>
                        {count.variances}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        count.status === 'completed'
                          ? 'bg-green-900 text-green-300'
                          : 'bg-yellow-900 text-yellow-300'
                      }`}>
                        {count.status === 'in_progress' ? 'In Progress' : 'Completed'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
