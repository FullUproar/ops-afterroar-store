'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatCents, parseDollars } from '@/lib/types';
import { PageHeader } from '@/components/page-header';
import { SuggestedReorders } from '@/components/purchase-orders/suggested-reorders';

interface POItem {
  id: string;
  purchase_order_id: string;
  inventory_item_id: string | null;
  name: string;
  sku: string | null;
  quantity_ordered: number;
  quantity_received: number;
  cost_cents: number;
  inventory_item?: { id: string; name: string; quantity: number } | null;
}

interface PurchaseOrder {
  id: string;
  store_id: string;
  supplier_id: string | null;
  supplier_name: string;
  status: string;
  order_date: string;
  expected_delivery: string | null;
  total_cost_cents: number;
  freight_cents?: number;
  tax_cents?: number;
  other_fees_cents?: number;
  cost_allocation?: string;
  notes: string | null;
  item_count: number;
  items: POItem[];
  supplier?: { id: string; name: string } | null;
}

interface Supplier {
  id: string;
  name: string;
}

interface InventorySearchItem {
  id: string;
  name: string;
  sku: string | null;
  cost_cents: number;
}

const STATUS_STYLES: Record<string, React.CSSProperties> = {
  draft: { background: 'var(--panel-hi)', color: 'var(--ink-soft)' },
  submitted: { background: 'var(--orange-mute)', color: 'var(--orange)' },
  partially_received: { background: 'var(--yellow-mute)', color: 'var(--yellow)' },
  received: { background: 'var(--teal-mute)', color: 'var(--teal)' },
  cancelled: { background: 'var(--red-mute)', color: 'var(--red)' },
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  partially_received: 'Partial',
  received: 'Received',
  cancelled: 'Cancelled',
};

interface NewPOItem {
  inventory_item_id?: string;
  name: string;
  sku?: string;
  quantity_ordered: number;
  cost_cents: number;
  cost_display: string;
}

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailPO, setDetailPO] = useState<PurchaseOrder | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // New PO form
  const [formSupplier, setFormSupplier] = useState('');
  const [formSupplierId, setFormSupplierId] = useState('');
  const [formDelivery, setFormDelivery] = useState('');
  const [formNotes, setFormNotes] = useState('');
  // Phase 2 landed-cost inputs
  const [formFreight, setFormFreight] = useState('');
  const [formTax, setFormTax] = useState('');
  const [formOtherFees, setFormOtherFees] = useState('');
  const [formCostAlloc, setFormCostAlloc] = useState<'by_cost' | 'by_weight' | 'even'>('by_cost');
  const [formItems, setFormItems] = useState<NewPOItem[]>([
    { name: '', quantity_ordered: 1, cost_cents: 0, cost_display: '' },
  ]);
  const [saving, setSaving] = useState(false);

  // Search inventory for adding items
  const [itemSearch, setItemSearch] = useState('');
  const [searchResults, setSearchResults] = useState<InventorySearchItem[]>([]);
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);

  // Receive modal
  const [receiveItem, setReceiveItem] = useState<POItem | null>(null);
  const [receiveQty, setReceiveQty] = useState('');
  const [receiving, setReceiving] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/purchase-orders');
      if (res.ok) setOrders(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    fetch('/api/suppliers')
      .then((r) => r.ok ? r.json() : [])
      .then(setSuppliers)
      .catch(() => {});
  }, [loadOrders]);

  useEffect(() => {
    if (!itemSearch || itemSearch.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/inventory/search?q=${encodeURIComponent(itemSearch)}`);
      if (res.ok) setSearchResults(await res.json());
    }, 300);
    return () => clearTimeout(timer);
  }, [itemSearch]);

  async function loadDetail(id: string) {
    const res = await fetch(`/api/purchase-orders/${id}`);
    if (res.ok) {
      const data = await res.json();
      setDetailPO(data);
      setExpandedId(id);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formSupplier.trim()) return;
    const validItems = formItems.filter((i) => i.name.trim());
    if (validItems.length === 0) return;

    setSaving(true);
    try {
      const toCents = (s: string) => {
        const n = parseFloat(s.replace(/[^0-9.]/g, ''));
        if (isNaN(n) || n < 0) return 0;
        return Math.round(n * 100);
      };
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: formSupplierId || null,
          supplier_name: formSupplier.trim(),
          expected_delivery: formDelivery || null,
          notes: formNotes || null,
          freight_cents: toCents(formFreight),
          tax_cents: toCents(formTax),
          other_fees_cents: toCents(formOtherFees),
          cost_allocation: formCostAlloc,
          items: validItems.map((i) => ({
            inventory_item_id: i.inventory_item_id || null,
            name: i.name,
            sku: i.sku || null,
            quantity_ordered: i.quantity_ordered,
            cost_cents: i.cost_cents,
          })),
        }),
      });
      if (res.ok) {
        resetForm();
        loadOrders();
      }
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setShowForm(false);
    setFormSupplier('');
    setFormSupplierId('');
    setFormDelivery('');
    setFormNotes('');
    setFormFreight('');
    setFormTax('');
    setFormOtherFees('');
    setFormCostAlloc('by_cost');
    setFormItems([{ name: '', quantity_ordered: 1, cost_cents: 0, cost_display: '' }]);
  }

  async function handleStatusChange(id: string, newStatus: string) {
    const res = await fetch(`/api/purchase-orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      loadOrders();
      if (expandedId === id) loadDetail(id);
    }
  }

  async function handleReceive() {
    if (!receiveItem || !detailPO) return;
    const qty = parseInt(receiveQty, 10);
    if (!qty || qty <= 0) return;

    setReceiving(true);
    try {
      const res = await fetch(`/api/purchase-orders/${detailPO.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'receive',
          item_id: receiveItem.id,
          quantity_received: qty,
        }),
      });
      if (res.ok) {
        setReceiveItem(null);
        setReceiveQty('');
        loadDetail(detailPO.id);
        loadOrders();
      }
    } finally {
      setReceiving(false);
    }
  }

  function selectSearchItem(item: InventorySearchItem, index: number) {
    const updated = [...formItems];
    updated[index] = {
      ...updated[index],
      inventory_item_id: item.id,
      name: item.name,
      sku: item.sku || '',
      cost_cents: item.cost_cents,
      cost_display: (item.cost_cents / 100).toFixed(2),
    };
    setFormItems(updated);
    setItemSearch('');
    setSearchResults([]);
    setActiveItemIndex(null);
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <PageHeader
        title="Purchase Orders"
        crumb="Console · Inventory"
        desc="Supplier orders — drafts, submitted POs, and receiving."
        action={
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-orange hover:opacity-90 text-void rounded text-sm font-display uppercase tracking-wider font-bold"
            style={{ minHeight: 48 }}
          >
            {showForm ? 'Cancel' : 'New PO'}
          </button>
        }
      />

      {showForm && (
        <form onSubmit={handleCreate} className="bg-card border border-card-border rounded-xl p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-muted mb-1">Supplier</label>
              <select
                value={formSupplierId}
                onChange={(e) => {
                  setFormSupplierId(e.target.value);
                  const s = suppliers.find((s) => s.id === e.target.value);
                  if (s) setFormSupplier(s.name);
                }}
                className="w-full bg-card-hover border border-input-border rounded px-3 py-2 text-foreground text-sm"
              >
                <option value="">-- Select or type below --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <input
                type="text"
                value={formSupplier}
                onChange={(e) => { setFormSupplier(e.target.value); setFormSupplierId(''); }}
                placeholder="Or type supplier name"
                className="mt-2 w-full bg-card-hover border border-input-border rounded px-3 py-2 text-foreground text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Expected Delivery</label>
              <input
                type="date"
                value={formDelivery}
                onChange={(e) => setFormDelivery(e.target.value)}
                className="w-full bg-card-hover border border-input-border rounded px-3 py-2 text-foreground text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-muted mb-1">Notes</label>
            <textarea
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              rows={2}
              className="w-full bg-card-hover border border-input-border rounded px-3 py-2 text-foreground text-sm"
            />
          </div>

          {/* Landed cost: freight, tax, other fees, allocation strategy */}
          <div className="border border-card-border rounded p-3 bg-card-hover/30 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Landed Cost (optional)</label>
              <span className="text-xs text-muted">Spreads fees across line items at receive time</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-muted mb-1">Freight</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formFreight}
                  onChange={(e) => setFormFreight(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-card border border-input-border rounded px-3 py-2 text-foreground text-sm font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Tax</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formTax}
                  onChange={(e) => setFormTax(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-card border border-input-border rounded px-3 py-2 text-foreground text-sm font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Other fees</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formOtherFees}
                  onChange={(e) => setFormOtherFees(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-card border border-input-border rounded px-3 py-2 text-foreground text-sm font-mono tabular-nums"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Allocation</label>
              <div className="inline-flex border border-input-border rounded overflow-hidden">
                {(
                  [
                    { value: 'by_cost', label: 'By cost (default)' },
                    { value: 'by_weight', label: 'By weight' },
                    { value: 'even', label: 'Evenly per unit' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormCostAlloc(opt.value)}
                    className={`px-3 py-1.5 text-xs transition-colors ${
                      formCostAlloc === opt.value
                        ? 'bg-orange text-void'
                        : 'bg-card text-muted hover:text-foreground'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-muted">Items</label>
              <button
                type="button"
                onClick={() =>
                  setFormItems([...formItems, { name: '', quantity_ordered: 1, cost_cents: 0, cost_display: '' }])
                }
                className="text-xs text-orange hover:opacity-80"
              >
                + Add Item
              </button>
            </div>
            <div className="space-y-2">
              {formItems.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-5 relative">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => {
                        const updated = [...formItems];
                        updated[i] = { ...updated[i], name: e.target.value, inventory_item_id: undefined };
                        setFormItems(updated);
                      }}
                      onFocus={() => setActiveItemIndex(i)}
                      placeholder="Item name (type to search)"
                      className="w-full bg-card-hover border border-input-border rounded px-3 py-2 text-foreground text-sm"
                    />
                    {activeItemIndex === i && item.name.length >= 2 && (
                      <div className="relative">
                        <input
                          type="text"
                          value={itemSearch}
                          onChange={(e) => setItemSearch(e.target.value)}
                          placeholder="Search inventory..."
                          className="w-full mt-1 bg-background border border-input-border rounded px-3 py-1 text-foreground text-xs"
                        />
                        {searchResults.length > 0 && (
                          <div className="absolute z-10 w-full bg-card-hover border border-input-border rounded mt-1 max-h-32 overflow-y-auto scroll-visible">
                            {searchResults.map((r) => (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => selectSearchItem(r, i)}
                                className="w-full text-left px-3 py-1.5 hover:bg-card-hover text-sm text-foreground"
                              >
                                {r.name} {r.sku && <span className="text-muted text-xs ml-1">({r.sku})</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min={1}
                      value={item.quantity_ordered}
                      onChange={(e) => {
                        const updated = [...formItems];
                        updated[i] = { ...updated[i], quantity_ordered: parseInt(e.target.value) || 1 };
                        setFormItems(updated);
                      }}
                      placeholder="Qty"
                      className="w-full bg-card-hover border border-input-border rounded px-3 py-2 text-foreground text-sm"
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      type="text"
                      value={item.cost_display}
                      onChange={(e) => {
                        const updated = [...formItems];
                        updated[i] = {
                          ...updated[i],
                          cost_display: e.target.value,
                          cost_cents: parseDollars(e.target.value),
                        };
                        setFormItems(updated);
                      }}
                      placeholder="Cost ($)"
                      className="w-full bg-card-hover border border-input-border rounded px-3 py-2 text-foreground text-sm"
                    />
                  </div>
                  <div className="col-span-2 flex items-center gap-1">
                    <span className="text-sm text-muted">
                      {formatCents(item.cost_cents * item.quantity_ordered)}
                    </span>
                    {formItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setFormItems(formItems.filter((_, j) => j !== i))}
                        className="text-red-fu hover:opacity-80 text-xs ml-1"
                      >
                        X
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-right text-sm text-foreground/70">
              Total: {formatCents(formItems.reduce((s, i) => s + i.cost_cents * i.quantity_ordered, 0))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-orange hover:opacity-90 disabled:opacity-50 text-void rounded text-sm font-display uppercase tracking-wider font-bold"
            >
              {saving ? 'Creating...' : 'Create PO'}
            </button>
            <button type="button" onClick={resetForm} className="px-4 py-2 bg-card-hover hover:bg-card-hover text-foreground rounded text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Auto-suggested reorders from items below their reorder_point */}
      <SuggestedReorders
        refreshKey={orders.length}
        onPOCreated={() => loadOrders()}
      />

      {loading ? (
        <p className="text-muted">Loading purchase orders...</p>
      ) : orders.length === 0 ? (
        <p className="text-muted">No purchase orders yet.</p>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="md:hidden space-y-2">
            {orders.map((po) => (
              <div key={po.id}>
                <button
                  onClick={() => expandedId === po.id ? setExpandedId(null) : loadDetail(po.id)}
                  className="w-full rounded-xl border border-card-border bg-card p-3 text-left min-h-11 active:bg-card-hover"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground truncate mr-2">{po.supplier_name}</span>
                    <span className="px-2 py-0.5 rounded text-xs font-mono uppercase tracking-wider font-bold" style={STATUS_STYLES[po.status] || STATUS_STYLES.draft}>
                      {STATUS_LABELS[po.status] || po.status}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted">
                    <span>{po.item_count} items</span>
                    <span className="text-foreground font-medium">{formatCents(po.total_cost_cents)}</span>
                  </div>
                </button>
                {expandedId === po.id && detailPO && (
                  <div className="bg-background border border-card-border border-t-0 rounded-b-lg px-3 py-3 space-y-3">
                    <div className="flex gap-2 flex-wrap">
                      {detailPO.status === 'draft' && (
                        <>
                          <button onClick={() => handleStatusChange(po.id, 'submitted')} className="px-3 py-1.5 bg-orange hover:opacity-90 text-void rounded text-xs min-h-11 font-mono uppercase tracking-wider font-bold">
                            Submit Order
                          </button>
                          <button onClick={() => handleStatusChange(po.id, 'cancelled')} className="px-3 py-1.5 rounded text-xs min-h-11 font-mono uppercase tracking-wider font-bold" style={{ background: 'var(--red)', color: 'var(--void)' }}>
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                    {detailPO.items.map((item) => (
                      <div key={item.id} className="rounded border border-card-border bg-card p-2 text-sm">
                        <div className="flex items-center justify-between text-foreground">
                          <span className="truncate mr-2">{item.name}</span>
                          <span className="text-muted whitespace-nowrap">{formatCents(item.cost_cents)}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-xs text-muted">
                          <span>Ordered: {item.quantity_ordered} / Received: <span className={item.quantity_received >= item.quantity_ordered ? 'text-teal' : item.quantity_received > 0 ? 'text-yellow' : 'text-ink-soft'}>{item.quantity_received}</span></span>
                          {['submitted', 'partially_received'].includes(detailPO.status) && item.quantity_received < item.quantity_ordered && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setReceiveItem(item); setReceiveQty(String(item.quantity_ordered - item.quantity_received)); }}
                              className="px-2 py-1.5 text-void font-mono uppercase tracking-wider font-bold rounded text-xs min-h-11 flex items-center"
                              style={{ background: 'var(--teal)' }}
                            >
                              Receive
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-card border border-card-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border text-muted text-left">
                  <th className="px-4 py-3 font-medium">Supplier</th>
                  <th className="px-4 py-3 font-medium">Items</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Delivery</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((po) => (
                  <>
                    <tr
                      key={po.id}
                      onClick={() => expandedId === po.id ? setExpandedId(null) : loadDetail(po.id)}
                      className="border-b border-card-border hover:bg-card-hover cursor-pointer text-foreground"
                    >
                      <td className="px-4 py-3 font-medium">{po.supplier_name}</td>
                      <td className="px-4 py-3 text-foreground/70">{po.item_count}</td>
                      <td className="px-4 py-3 text-foreground/70">{formatCents(po.total_cost_cents)}</td>
                      <td className="px-4 py-3 text-foreground/70">
                        {new Date(po.order_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-foreground/70">
                        {po.expected_delivery ? new Date(po.expected_delivery).toLocaleDateString() : '--'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-mono uppercase tracking-wider font-bold" style={STATUS_STYLES[po.status] || STATUS_STYLES.draft}>
                          {STATUS_LABELS[po.status] || po.status}
                        </span>
                      </td>
                    </tr>
                    {expandedId === po.id && detailPO && (
                      <tr key={`${po.id}-detail`}>
                        <td colSpan={6} className="bg-background px-4 py-4 border-b border-card-border">
                          <div className="space-y-4">
                            <div className="flex gap-2 flex-wrap">
                              {detailPO.status === 'draft' && (
                                <>
                                  <button onClick={() => handleStatusChange(po.id, 'submitted')} className="px-3 py-1 bg-orange hover:opacity-90 text-void rounded text-xs font-mono uppercase tracking-wider font-bold">
                                    Submit Order
                                  </button>
                                  <button onClick={() => handleStatusChange(po.id, 'cancelled')} className="px-3 py-1 rounded text-xs font-mono uppercase tracking-wider font-bold text-void" style={{ background: 'var(--red)' }}>
                                    Cancel
                                  </button>
                                </>
                              )}
                              {detailPO.status === 'submitted' && (
                                <button onClick={() => handleStatusChange(po.id, 'cancelled')} className="px-3 py-1 rounded text-xs font-mono uppercase tracking-wider font-bold text-void" style={{ background: 'var(--red)' }}>
                                  Cancel
                                </button>
                              )}
                            </div>
                            {detailPO.notes && (
                              <p className="text-sm text-muted">Notes: {detailPO.notes}</p>
                            )}
                            {/* Landed cost summary */}
                            {((detailPO.freight_cents ?? 0) > 0 ||
                              (detailPO.tax_cents ?? 0) > 0 ||
                              (detailPO.other_fees_cents ?? 0) > 0) && (
                              <div className="text-xs text-muted">
                                Landed cost:
                                {(detailPO.freight_cents ?? 0) > 0 && (
                                  <span className="ml-2 font-mono tabular-nums">
                                    Freight {formatCents(detailPO.freight_cents ?? 0)}
                                  </span>
                                )}
                                {(detailPO.tax_cents ?? 0) > 0 && (
                                  <span className="ml-2 font-mono tabular-nums">
                                    · Tax {formatCents(detailPO.tax_cents ?? 0)}
                                  </span>
                                )}
                                {(detailPO.other_fees_cents ?? 0) > 0 && (
                                  <span className="ml-2 font-mono tabular-nums">
                                    · Other {formatCents(detailPO.other_fees_cents ?? 0)}
                                  </span>
                                )}
                                <span className="ml-2 italic">
                                  (allocated {detailPO.cost_allocation === 'by_weight' ? 'by weight' : detailPO.cost_allocation === 'even' ? 'evenly' : 'by cost'})
                                </span>
                              </div>
                            )}
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-muted text-left text-xs">
                                  <th className="pb-2">Item</th>
                                  <th className="pb-2">SKU</th>
                                  <th className="pb-2 text-center">Ordered</th>
                                  <th className="pb-2 text-center">Received</th>
                                  <th className="pb-2 text-right">Unit Cost</th>
                                  <th className="pb-2 text-right">Line Total</th>
                                  {['submitted', 'partially_received'].includes(detailPO.status) && (
                                    <th className="pb-2 text-center">Actions</th>
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {detailPO.items.map((item) => (
                                  <tr key={item.id} className="border-t border-card-border text-foreground">
                                    <td className="py-2">{item.name}</td>
                                    <td className="py-2 text-muted">{item.sku || '--'}</td>
                                    <td className="py-2 text-center">{item.quantity_ordered}</td>
                                    <td className="py-2 text-center">
                                      <span className={item.quantity_received >= item.quantity_ordered ? 'text-teal' : item.quantity_received > 0 ? 'text-yellow' : 'text-ink-soft'}>
                                        {item.quantity_received}
                                      </span>
                                    </td>
                                    <td className="py-2 text-right text-foreground/70">{formatCents(item.cost_cents)}</td>
                                    <td className="py-2 text-right text-foreground/70">{formatCents(item.cost_cents * item.quantity_ordered)}</td>
                                    {['submitted', 'partially_received'].includes(detailPO.status) && (
                                      <td className="py-2 text-center">
                                        {item.quantity_received < item.quantity_ordered && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setReceiveItem(item); setReceiveQty(String(item.quantity_ordered - item.quantity_received)); }}
                                            className="px-2 py-1 text-void font-mono uppercase tracking-wider font-bold rounded text-xs"
                                            style={{ background: 'var(--teal)' }}
                                          >
                                            Receive
                                          </button>
                                        )}
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Receive Modal */}
      {receiveItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-bg" onClick={() => setReceiveItem(null)} onKeyDown={(e) => e.key === "Escape" && setReceiveItem(null)}>
          <div className="w-full max-w-sm bg-card border border-card-border rounded-xl p-6 shadow-2xl mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-semibold text-foreground">Receive Items</h2>
              <button onClick={() => setReceiveItem(null)} className="flex items-center justify-center h-8 w-8 rounded-full text-muted hover:text-foreground active:bg-card-hover transition-colors text-lg">&times;</button>
            </div>
            <p className="text-sm text-muted mb-4">{receiveItem.name}</p>
            <p className="text-xs text-muted mb-3">
              Ordered: {receiveItem.quantity_ordered} | Already received: {receiveItem.quantity_received} | Remaining: {receiveItem.quantity_ordered - receiveItem.quantity_received}
            </p>
            <input
              type="number"
              min={1}
              max={receiveItem.quantity_ordered - receiveItem.quantity_received}
              value={receiveQty}
              onChange={(e) => setReceiveQty(e.target.value)}
              className="w-full bg-card-hover border border-input-border rounded px-3 py-2 text-foreground text-sm mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={() => setReceiveItem(null)} className="flex-1 px-3 py-2 bg-card-hover hover:bg-card-hover text-foreground rounded text-sm">
                Cancel
              </button>
              <button onClick={handleReceive} disabled={receiving} className="flex-1 px-3 py-2 disabled:opacity-50 text-void font-mono uppercase tracking-wider font-bold rounded text-sm" style={{ background: 'var(--teal)' }}>
                {receiving ? 'Receiving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
