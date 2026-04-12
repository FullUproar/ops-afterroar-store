'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatCents, RETURN_REASONS, ReturnReason } from '@/lib/types';
import { useStoreSettings } from '@/lib/store-settings';
import { PageHeader } from '@/components/page-header';

/* ---------- types ---------- */

interface SaleItem {
  inventory_item_id: string;
  name: string;
  category: string | null;
  quantity: number;
  price_cents: number;
  already_returned: number;
  max_returnable: number;
}

interface SaleRow {
  id: string;
  created_at: string;
  customer_id: string | null;
  customer_name: string;
  amount_cents: number;
  payment_method: string;
  items: SaleItem[];
}

interface ReturnItem {
  inventory_item_id: string;
  name: string;
  category: string | null;
  price_cents: number;
  quantity: number;
  max_returnable: number;
  restock: boolean;
  selected: boolean;
}

/* ---------- component ---------- */

export default function NewReturnPage() {
  const storeSettings = useStoreSettings();
  const [step, setStep] = useState(1);

  // Step 1 — find sale
  const [searchQuery, setSearchQuery] = useState('');
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [selectedSale, setSelectedSale] = useState<SaleRow | null>(null);

  // Step 2 — select items
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [reason, setReason] = useState<ReturnReason>('changed_mind');
  const [reasonNotes, setReasonNotes] = useState('');

  // Step 3 — refund method
  const [refundMethod, setRefundMethod] = useState<'cash' | 'store_credit'>('cash');
  const [creditBonus, setCreditBonus] = useState(storeSettings.return_credit_bonus_percent);
  const [restockingFee, setRestockingFee] = useState(storeSettings.return_restocking_fee_percent);

  // submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [resultData, setResultData] = useState<{
    total_refund_cents: number;
    refund_method: string;
  } | null>(null);

  /* ---- sale search ---- */
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSales([]);
      return;
    }
    const ctrl = new AbortController();
    setSalesLoading(true);
    fetch(`/api/returns/sales?q=${encodeURIComponent(searchQuery)}`, {
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((d) => setSales(d))
      .catch(() => {})
      .finally(() => setSalesLoading(false));
    return () => ctrl.abort();
  }, [searchQuery]);

  /* ---- select a sale ---- */
  function selectSale(sale: SaleRow) {
    setSelectedSale(sale);
    setReturnItems(
      sale.items
        .filter((i) => i.max_returnable > 0)
        .map((i) => ({
          inventory_item_id: i.inventory_item_id,
          name: i.name,
          category: i.category,
          price_cents: i.price_cents,
          quantity: 1,
          max_returnable: i.max_returnable,
          restock: true,
          selected: false,
        }))
    );
    setStep(2);
  }

  /* ---- item helpers ---- */
  function toggleItem(idx: number) {
    setReturnItems((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, selected: !item.selected } : item
      )
    );
  }

  function updateItem(idx: number, patch: Partial<ReturnItem>) {
    setReturnItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, ...patch } : item))
    );
  }

  const selectedItems = returnItems.filter((i) => i.selected);
  const subtotalCents = selectedItems.reduce(
    (sum, i) => sum + i.price_cents * i.quantity,
    0
  );
  const restockingFeeCents = Math.round(subtotalCents * restockingFee / 100);
  const refundAmountCents = subtotalCents - restockingFeeCents;
  const totalRefundCents =
    refundMethod === 'store_credit'
      ? Math.round(refundAmountCents * (1 + creditBonus / 100))
      : refundAmountCents;

  /* ---- submit ---- */
  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    try {
      const body = {
        original_ledger_entry_id: selectedSale!.id,
        items: selectedItems.map((i) => ({
          inventory_item_id: i.inventory_item_id,
          name: i.name,
          category: i.category,
          quantity: i.quantity,
          price_cents: i.price_cents,
          restock: i.restock,
        })),
        refund_method: refundMethod,
        credit_bonus_percent: refundMethod === 'store_credit' ? creditBonus : 0,
        reason,
        reason_notes: reasonNotes.trim() || null,
        restocking_fee_percent: restockingFee,
      };
      const res = await fetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to process return');
      }
      const data = await res.json();
      setResultData(data);
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to process return');
    } finally {
      setSubmitting(false);
    }
  }

  /* ---- success screen ---- */
  if (success && resultData) {
    return (
      <div className="mx-auto max-w-lg space-y-6 text-center">
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-8">
          <h2 className="text-xl font-bold text-green-400">Return Processed</h2>
          <p className="mt-2 text-foreground/70">
            {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} &middot;{' '}
            {formatCents(resultData.total_refund_cents)}{' '}
            {resultData.refund_method === 'store_credit' ? 'store credit' : 'cash refund'}
          </p>
          {selectedSale?.customer_name && selectedSale.customer_name !== 'Guest' && (
            <p className="mt-1 text-sm text-muted">
              Customer: {selectedSale.customer_name}
            </p>
          )}
        </div>
        <Link
          href="/dashboard/returns"
          className="inline-block rounded-xl bg-card-hover px-4 py-2 text-sm text-foreground hover:bg-card-hover transition-colors"
        >
          Back to Returns
        </Link>
      </div>
    );
  }

  /* ---- render ---- */
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="New Return" backHref="/dashboard/returns" />

      {/* progress */}
      <div className="flex gap-2 text-sm">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`flex-1 rounded-full py-1 text-center font-medium transition-colors ${
              s === step
                ? 'bg-accent text-foreground'
                : s < step
                  ? 'bg-accent/30 text-indigo-300'
                  : 'bg-card-hover text-muted'
            }`}
          >
            Step {s}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* ============ STEP 1: FIND SALE ============ */}
      {step === 1 && (
        <div className="space-y-4 rounded-xl border border-card-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Find Original Sale</h2>

          <input
            type="text"
            placeholder="Search by customer name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
            className="w-full rounded-xl border border-input-border bg-card-hover px-4 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />

          {salesLoading && <div className="text-sm text-muted">Searching...</div>}

          {sales.length > 0 && (
            <div className="space-y-2">
              {sales.map((sale) => {
                const hasReturnableItems = sale.items.some((i) => i.max_returnable > 0);
                return (
                  <button
                    key={sale.id}
                    onClick={() => hasReturnableItems && selectSale(sale)}
                    disabled={!hasReturnableItems}
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${
                      hasReturnableItems
                        ? 'border-input-border bg-card-hover hover:border-indigo-500/50 hover:bg-zinc-750'
                        : 'border-card-border bg-card opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-foreground">{sale.customer_name}</span>
                        <span className="ml-3 text-sm text-muted">
                          {new Date(sale.created_at).toLocaleDateString()}{' '}
                          {new Date(sale.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <span className="font-medium tabular-nums text-foreground">
                        {formatCents(sale.amount_cents)}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-muted">
                      {sale.items.map((i) => i.name).join(', ')}
                    </div>
                    {!hasReturnableItems && (
                      <div className="mt-1 text-xs text-red-400">All items already returned</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============ STEP 2: SELECT ITEMS ============ */}
      {step === 2 && selectedSale && (
        <div className="space-y-4 rounded-xl border border-card-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Select Items to Return</h2>
          <div className="text-sm text-muted">
            Sale to {selectedSale.customer_name} on{' '}
            {new Date(selectedSale.created_at).toLocaleDateString()} &middot;{' '}
            {formatCents(selectedSale.amount_cents)}
          </div>

          {/* items */}
          <div className="space-y-3">
            {returnItems.map((item, idx) => (
              <div
                key={item.inventory_item_id}
                className={`rounded-xl border p-4 transition-colors ${
                  item.selected
                    ? 'border-indigo-500/50 bg-card-hover'
                    : 'border-input-border bg-card-hover'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={() => toggleItem(idx)}
                    className="mt-1 h-4 w-4 rounded border-zinc-600 bg-card text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-foreground">{item.name}</div>
                      <div className="text-sm tabular-nums text-foreground/70">
                        {formatCents(item.price_cents)} ea
                      </div>
                    </div>
                    {item.category && (
                      <div className="text-xs text-muted">{item.category}</div>
                    )}
                    <div className="text-xs text-muted">
                      Max returnable: {item.max_returnable}
                    </div>

                    {item.selected && (
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                        <label className="flex items-center gap-1.5 text-muted">
                          Qty
                          <input
                            type="number"
                            min="1"
                            max={item.max_returnable}
                            value={item.quantity}
                            onChange={(e) =>
                              updateItem(idx, {
                                quantity: Math.min(
                                  Math.max(1, Number(e.target.value)),
                                  item.max_returnable
                                ),
                              })
                            }
                            className="w-16 rounded border border-zinc-600 bg-card px-2 py-1 text-foreground tabular-nums focus:border-accent focus:outline-none"
                          />
                        </label>

                        <label className="flex items-center gap-1.5 text-muted">
                          <input
                            type="checkbox"
                            checked={item.restock}
                            onChange={(e) =>
                              updateItem(idx, { restock: e.target.checked })
                            }
                            className="h-3.5 w-3.5 rounded border-zinc-600 bg-card text-indigo-600 focus:ring-indigo-500"
                          />
                          Restock
                        </label>

                        <div className="ml-auto font-medium text-foreground tabular-nums">
                          {formatCents(item.price_cents * item.quantity)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* reason */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground/70">Reason *</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as ReturnReason)}
              className="w-full rounded-xl border border-input-border bg-card-hover px-4 py-2 text-foreground focus:border-accent focus:outline-none"
            >
              {RETURN_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <textarea
            placeholder="Additional notes (optional)"
            value={reasonNotes}
            onChange={(e) => setReasonNotes(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-input-border bg-card-hover px-4 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />

          {/* running total */}
          <div className="flex items-center justify-between border-t border-input-border pt-4">
            <span className="text-muted">
              Return Subtotal ({selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''})
            </span>
            <span className="text-lg font-semibold text-foreground tabular-nums">
              {formatCents(subtotalCents)}
            </span>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep(1)}
              className="rounded-xl bg-card-hover px-4 py-2 text-sm text-foreground/70 hover:bg-card-hover transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={selectedItems.length === 0}
              className="rounded-xl bg-accent px-6 py-2 text-sm font-medium text-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
            >
              Next: Refund Method
            </button>
          </div>
        </div>
      )}

      {/* ============ STEP 3: REFUND METHOD ============ */}
      {step === 3 && (
        <div className="space-y-4 rounded-xl border border-card-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Refund Method</h2>

          {/* toggle */}
          <div className="flex gap-2">
            {(['cash', 'store_credit'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setRefundMethod(m)}
                className={`flex-1 rounded-xl py-2 text-sm font-medium transition-colors ${
                  refundMethod === m
                    ? 'bg-accent text-foreground'
                    : 'bg-card-hover text-muted hover:bg-card-hover'
                }`}
              >
                {m === 'store_credit' ? 'Store Credit' : 'Cash'}
              </button>
            ))}
          </div>

          {refundMethod === 'store_credit' && (
            <div className="rounded-xl border border-input-border bg-card-hover p-4 space-y-2">
              <label className="flex items-center gap-2 text-sm text-foreground/70">
                Credit Bonus %
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={creditBonus}
                  onChange={(e) => setCreditBonus(Math.max(0, Number(e.target.value)))}
                  className="w-20 rounded border border-zinc-600 bg-card px-2 py-1 text-foreground tabular-nums focus:border-accent focus:outline-none"
                />
              </label>
            </div>
          )}

          {/* restocking fee */}
          <div className="rounded-xl border border-input-border bg-card-hover p-4">
            <label className="flex items-center gap-2 text-sm text-foreground/70">
              Restocking Fee %
              <input
                type="number"
                min="0"
                max="100"
                value={restockingFee}
                onChange={(e) => setRestockingFee(Math.max(0, Number(e.target.value)))}
                className="w-20 rounded border border-zinc-600 bg-card px-2 py-1 text-foreground tabular-nums focus:border-accent focus:outline-none"
              />
            </label>
          </div>

          {/* summary */}
          <div className="rounded-xl border border-input-border bg-card-hover p-4 space-y-2 text-sm">
            <h3 className="font-medium text-foreground">Summary</h3>
            <div className="text-muted">
              Customer: <span className="text-foreground">{selectedSale?.customer_name ?? 'Guest'}</span>
            </div>
            <div className="text-muted">
              Original Sale:{' '}
              <span className="text-foreground">
                {selectedSale && new Date(selectedSale.created_at).toLocaleDateString()}
              </span>
            </div>
            <div className="text-muted">
              Reason:{' '}
              <span className="text-foreground">
                {RETURN_REASONS.find((r) => r.value === reason)?.label}
              </span>
            </div>

            <ul className="space-y-1 border-t border-input-border pt-2">
              {selectedItems.map((item) => (
                <li key={item.inventory_item_id} className="flex justify-between text-foreground/70">
                  <span>
                    {item.name} &times;{item.quantity}
                    {!item.restock && (
                      <span className="ml-1 text-xs text-yellow-500">(no restock)</span>
                    )}
                  </span>
                  <span className="tabular-nums">
                    {formatCents(item.price_cents * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex justify-between border-t border-input-border pt-2 text-foreground/70">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatCents(subtotalCents)}</span>
            </div>

            {restockingFeeCents > 0 && (
              <div className="flex justify-between text-muted">
                <span>Restocking Fee ({restockingFee}%)</span>
                <span className="tabular-nums">-{formatCents(restockingFeeCents)}</span>
              </div>
            )}

            {refundMethod === 'store_credit' && creditBonus > 0 && (
              <div className="flex justify-between text-muted">
                <span>Credit Bonus (+{creditBonus}%)</span>
                <span className="tabular-nums text-green-400">
                  +{formatCents(totalRefundCents - refundAmountCents)}
                </span>
              </div>
            )}

            <div className="flex justify-between font-semibold text-foreground">
              <span>
                Total Refund ({refundMethod === 'store_credit' ? 'Store Credit' : 'Cash'})
              </span>
              <span className="tabular-nums text-red-400">
                {formatCents(totalRefundCents)}
              </span>
            </div>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep(2)}
              className="rounded-xl bg-card-hover px-4 py-2 text-sm text-foreground/70 hover:bg-card-hover transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || selectedItems.length === 0}
              className="rounded-xl bg-green-600 px-6 py-2 text-sm font-medium text-foreground hover:bg-green-500 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Processing...' : 'Process Return'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
