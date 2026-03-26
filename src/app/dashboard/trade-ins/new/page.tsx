'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import Link from 'next/link';
import { Customer, formatCents, parseDollars } from '@/lib/types';

/* ---------- types ---------- */

interface InventoryResult {
  id: string;
  name: string;
  category: string;
  price_cents: number;
}

interface TradeItem {
  key: number;
  name: string;
  category: string;
  market_price_cents: number;
  offer_price_cents: number;
  condition: string;
  quantity: number;
  inventory_item_id?: string;
}

const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const;

/* ---------- component ---------- */

export default function NewTradeInPage() {
  const [step, setStep] = useState(1);

  // Step 1 — customer
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [customerLoading, setCustomerLoading] = useState(false);

  // Step 2 — items
  const [items, setItems] = useState<TradeItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<InventoryResult[]>([]);
  const [showManual, setShowManual] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualCategory, setManualCategory] = useState('');
  const nextKey = useRef(1);
  const searchRef = useRef<HTMLInputElement>(null);

  // Step 3 — payout
  const [payoutType, setPayoutType] = useState<'cash' | 'credit'>('cash');
  const [creditBonus, setCreditBonus] = useState(30);
  const [notes, setNotes] = useState('');

  // submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  /* ---- customer search ---- */
  useEffect(() => {
    if (customerQuery.length < 2) {
      setCustomerResults([]);
      return;
    }
    const ctrl = new AbortController();
    setCustomerLoading(true);
    fetch(`/api/customers?q=${encodeURIComponent(customerQuery)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => setCustomerResults(d))
      .catch(() => {})
      .finally(() => setCustomerLoading(false));
    return () => ctrl.abort();
  }, [customerQuery]);

  /* ---- inventory search ---- */
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/inventory/search?q=${encodeURIComponent(searchQuery)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => setSearchResults(d))
      .catch(() => {});
    return () => ctrl.abort();
  }, [searchQuery]);

  /* ---- helpers ---- */

  function addItemFromSearch(inv: InventoryResult) {
    setItems((prev) => [
      ...prev,
      {
        key: nextKey.current++,
        name: inv.name,
        category: inv.category,
        market_price_cents: inv.price_cents,
        offer_price_cents: Math.round(inv.price_cents * 0.5),
        condition: 'LP',
        quantity: 1,
        inventory_item_id: inv.id,
      },
    ]);
    setSearchQuery('');
    setSearchResults([]);
    searchRef.current?.focus();
  }

  function addManualItem() {
    if (!manualName.trim()) return;
    setItems((prev) => [
      ...prev,
      {
        key: nextKey.current++,
        name: manualName.trim(),
        category: manualCategory.trim(),
        market_price_cents: 0,
        offer_price_cents: 0,
        condition: 'LP',
        quantity: 1,
      },
    ]);
    setManualName('');
    setManualCategory('');
    setShowManual(false);
    searchRef.current?.focus();
  }

  function updateItem(key: number, patch: Partial<TradeItem>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  function removeItem(key: number) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  const totalOfferCents = items.reduce((s, i) => s + i.offer_price_cents * i.quantity, 0);
  const totalPayoutCents =
    payoutType === 'credit'
      ? Math.round(totalOfferCents * (1 + creditBonus / 100))
      : totalOfferCents;

  /* ---- quick-create customer ---- */
  async function createCustomer() {
    if (!newName.trim()) return;
    setCustomerLoading(true);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), email: newEmail.trim() || null, phone: newPhone.trim() || null }),
      });
      if (!res.ok) throw new Error('Failed to create customer');
      const customer = await res.json();
      setSelectedCustomer(customer);
      setShowCreate(false);
      setStep(2);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCustomerLoading(false);
    }
  }

  /* ---- submit ---- */
  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    try {
      const body = {
        customer_id: selectedCustomer!.id,
        items: items.map((i) => ({
          name: i.name,
          category: i.category,
          attributes: { condition: i.condition, inventory_item_id: i.inventory_item_id },
          quantity: i.quantity,
          market_price_cents: i.market_price_cents,
          offer_price_cents: i.offer_price_cents,
        })),
        payout_type: payoutType,
        credit_bonus_percent: payoutType === 'credit' ? creditBonus : 0,
        notes: notes.trim() || null,
      };
      const res = await fetch('/api/trade-ins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create trade-in');
      }
      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  /* ---- keyboard nav ---- */
  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && searchResults.length > 0) {
      e.preventDefault();
      addItemFromSearch(searchResults[0]);
    }
  }

  /* ---- success screen ---- */
  if (success) {
    return (
      <div className="mx-auto max-w-lg space-y-6 text-center">
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-8">
          <h2 className="text-xl font-bold text-green-400">Trade-In Complete</h2>
          <p className="mt-2 text-zinc-300">
            {items.length} item{items.length !== 1 ? 's' : ''} &middot;{' '}
            {formatCents(totalPayoutCents)} {payoutType === 'credit' ? 'store credit' : 'cash'}
          </p>
        </div>
        <Link
          href="/dashboard/trade-ins"
          className="inline-block rounded-lg bg-zinc-800 px-4 py-2 text-sm text-white hover:bg-zinc-700 transition-colors"
        >
          Back to Trade-Ins
        </Link>
      </div>
    );
  }

  /* ---- render ---- */
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-white">New Trade-In</h1>

      {/* progress */}
      <div className="flex gap-2 text-sm">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`flex-1 rounded-full py-1 text-center font-medium transition-colors ${
              s === step
                ? 'bg-indigo-600 text-white'
                : s < step
                  ? 'bg-indigo-600/30 text-indigo-300'
                  : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            Step {s}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* ============ STEP 1: CUSTOMER ============ */}
      {step === 1 && (
        <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-lg font-semibold text-white">Select Customer</h2>

          {selectedCustomer ? (
            <div className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800 p-4">
              <div>
                <div className="font-medium text-white">{selectedCustomer.name}</div>
                {selectedCustomer.email && (
                  <div className="text-sm text-zinc-400">{selectedCustomer.email}</div>
                )}
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="text-sm text-zinc-400 hover:text-white"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                placeholder="Search customers by name..."
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                autoFocus
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
              />

              {customerLoading && <div className="text-sm text-zinc-400">Searching...</div>}

              {customerResults.length > 0 && (
                <div className="space-y-1 rounded-lg border border-zinc-700 bg-zinc-800 p-2">
                  {customerResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedCustomer(c);
                        setCustomerQuery('');
                        setCustomerResults([]);
                      }}
                      className="w-full rounded px-3 py-2 text-left text-sm text-white hover:bg-zinc-700 transition-colors"
                    >
                      <span className="font-medium">{c.name}</span>
                      {c.email && <span className="ml-2 text-zinc-400">{c.email}</span>}
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={() => setShowCreate((v) => !v)}
                className="text-sm text-indigo-400 hover:text-indigo-300"
              >
                {showCreate ? 'Cancel' : '+ Create New Customer'}
              </button>

              {showCreate && (
                <div className="space-y-3 rounded-lg border border-zinc-700 bg-zinc-800 p-4">
                  <input
                    type="text"
                    placeholder="Name *"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
                  />
                  <input
                    type="tel"
                    placeholder="Phone"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    onClick={createCustomer}
                    disabled={!newName.trim() || customerLoading}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                  >
                    Create & Select
                  </button>
                </div>
              )}
            </>
          )}

          {selectedCustomer && (
            <div className="flex justify-end">
              <button
                onClick={() => setStep(2)}
                className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
              >
                Next: Add Items
              </button>
            </div>
          )}
        </div>
      )}

      {/* ============ STEP 2: ITEMS ============ */}
      {step === 2 && (
        <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-lg font-semibold text-white">Add Items</h2>

          {/* search */}
          <div className="relative">
            <input
              ref={searchRef}
              type="text"
              placeholder="Search inventory to add item..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              autoFocus
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
            />
            {searchResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl">
                {searchResults.map((inv) => (
                  <button
                    key={inv.id}
                    onClick={() => addItemFromSearch(inv)}
                    className="w-full px-4 py-2 text-left text-sm text-white hover:bg-zinc-700 transition-colors first:rounded-t-lg last:rounded-b-lg"
                  >
                    <span className="font-medium">{inv.name}</span>
                    <span className="ml-2 text-zinc-400">{inv.category}</span>
                    <span className="ml-2 text-zinc-500">{formatCents(inv.price_cents)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => setShowManual((v) => !v)}
            className="text-sm text-indigo-400 hover:text-indigo-300"
          >
            {showManual ? 'Cancel Manual Entry' : '+ Manual Entry'}
          </button>

          {showManual && (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Item name"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addManualItem()}
                className="flex-1 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
              />
              <input
                type="text"
                placeholder="Category"
                value={manualCategory}
                onChange={(e) => setManualCategory(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addManualItem()}
                className="w-36 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
              />
              <button
                onClick={addManualItem}
                disabled={!manualName.trim()}
                className="rounded-lg bg-zinc-700 px-3 py-2 text-sm text-white hover:bg-zinc-600 disabled:opacity-50 transition-colors"
              >
                Add
              </button>
            </div>
          )}

          {/* items list */}
          {items.length > 0 && (
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.key}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 p-4 space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-white">{item.name}</div>
                      {item.category && (
                        <div className="text-xs text-zinc-400">{item.category}</div>
                      )}
                      {item.market_price_cents > 0 && (
                        <div className="text-xs text-zinc-500">
                          Market: {formatCents(item.market_price_cents)}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeItem(item.key)}
                      className="text-zinc-500 hover:text-red-400 transition-colors"
                      title="Remove item"
                    >
                      &times;
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <label className="flex items-center gap-1.5 text-zinc-400">
                      Offer $
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={(item.offer_price_cents / 100).toFixed(2)}
                        onChange={(e) =>
                          updateItem(item.key, {
                            offer_price_cents: parseDollars(e.target.value),
                          })
                        }
                        className="w-24 rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-white tabular-nums focus:border-indigo-500 focus:outline-none"
                      />
                    </label>

                    <label className="flex items-center gap-1.5 text-zinc-400">
                      Cond
                      <select
                        value={item.condition}
                        onChange={(e) => updateItem(item.key, { condition: e.target.value })}
                        className="rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-white focus:border-indigo-500 focus:outline-none"
                      >
                        {CONDITIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex items-center gap-1.5 text-zinc-400">
                      Qty
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(item.key, { quantity: Math.max(1, Number(e.target.value)) })
                        }
                        className="w-16 rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-white tabular-nums focus:border-indigo-500 focus:outline-none"
                      />
                    </label>

                    <div className="ml-auto font-medium text-white tabular-nums">
                      {formatCents(item.offer_price_cents * item.quantity)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* running total */}
          <div className="flex items-center justify-between border-t border-zinc-700 pt-4">
            <span className="text-zinc-400">Running Total</span>
            <span className="text-lg font-bold text-white tabular-nums">
              {formatCents(totalOfferCents)}
            </span>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep(1)}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={items.length === 0}
              className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              Next: Payout
            </button>
          </div>
        </div>
      )}

      {/* ============ STEP 3: PAYOUT ============ */}
      {step === 3 && (
        <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-lg font-semibold text-white">Payout</h2>

          {/* toggle */}
          <div className="flex gap-2">
            {(['cash', 'credit'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setPayoutType(t)}
                className={`flex-1 rounded-lg py-2 text-sm font-medium capitalize transition-colors ${
                  payoutType === t
                    ? 'bg-indigo-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                {t === 'credit' ? 'Store Credit' : 'Cash'}
              </button>
            ))}
          </div>

          {payoutType === 'credit' && (
            <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-4 space-y-2">
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                Credit Bonus %
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={creditBonus}
                  onChange={(e) => setCreditBonus(Math.max(0, Number(e.target.value)))}
                  className="w-20 rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-white tabular-nums focus:border-indigo-500 focus:outline-none"
                />
              </label>
              <div className="text-sm text-zinc-400">
                Base: {formatCents(totalOfferCents)} + {creditBonus}% bonus ={' '}
                <span className="font-medium text-green-400">{formatCents(totalPayoutCents)}</span>
              </div>
            </div>
          )}

          {/* notes */}
          <textarea
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
          />

          {/* summary */}
          <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-4 space-y-2 text-sm">
            <h3 className="font-medium text-white">Summary</h3>
            <div className="text-zinc-400">
              Customer: <span className="text-white">{selectedCustomer?.name}</span>
            </div>
            <div className="text-zinc-400">
              Items: <span className="text-white">{items.length}</span> (
              {items.reduce((s, i) => s + i.quantity, 0)} total qty)
            </div>
            <ul className="space-y-1 border-t border-zinc-700 pt-2">
              {items.map((item) => (
                <li key={item.key} className="flex justify-between text-zinc-300">
                  <span>
                    {item.name} ({item.condition}) &times;{item.quantity}
                  </span>
                  <span className="tabular-nums">
                    {formatCents(item.offer_price_cents * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between border-t border-zinc-700 pt-2 font-medium text-white">
              <span>Total Offer</span>
              <span className="tabular-nums">{formatCents(totalOfferCents)}</span>
            </div>
            <div className="flex justify-between font-bold text-white">
              <span>
                Payout ({payoutType === 'credit' ? `Credit +${creditBonus}%` : 'Cash'})
              </span>
              <span className="tabular-nums text-green-400">{formatCents(totalPayoutCents)}</span>
            </div>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep(2)}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-lg bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Processing...' : 'Complete Trade-In'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
