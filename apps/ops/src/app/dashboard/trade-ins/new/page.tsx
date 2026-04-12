'use client';

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import Link from 'next/link';
import { Customer, formatCents, parseDollars } from '@/lib/types';
import { useStoreSettings } from '@/lib/store-settings';
import { BarcodeScanner } from '@/components/barcode-scanner';
import { PageHeader } from '@/components/page-header';
import { HelpTooltip } from '@/components/help-tooltip';
import { calculateOffer, type Condition, DEFAULT_CONDITION_MULTIPLIERS } from '@/lib/tcg-pricing';

/* ---------- types ---------- */

interface InventoryResult {
  id: string;
  name: string;
  category: string;
  price_cents: number;
  image_url: string | null;
  quantity: number;
}

interface TradeItem {
  key: number;
  name: string;
  category: string;
  market_price_cents: number;
  offer_price_cents: number;
  condition: Condition;
  quantity: number;
  inventory_item_id?: string;
  image_url?: string | null;
  current_stock?: number;
  manualOffer?: boolean; // true when user has manually edited the offer
}

const CONDITIONS: Condition[] = ['NM', 'LP', 'MP', 'HP', 'DMG'];

/* Condition button color classes (matches ConditionBadge from shared.tsx) */
const CONDITION_COLORS: Record<Condition, { base: string; active: string }> = {
  NM:  { base: 'border-green-500/30 text-green-400 hover:bg-green-500/20', active: 'bg-green-500/30 border-green-500 text-green-300 ring-1 ring-green-500/50' },
  LP:  { base: 'border-blue-500/30 text-blue-400 hover:bg-blue-500/20', active: 'bg-blue-500/30 border-blue-500 text-blue-300 ring-1 ring-blue-500/50' },
  MP:  { base: 'border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20', active: 'bg-yellow-500/30 border-yellow-500 text-yellow-300 ring-1 ring-yellow-500/50' },
  HP:  { base: 'border-orange-500/30 text-orange-400 hover:bg-orange-500/20', active: 'bg-orange-500/30 border-orange-500 text-orange-300 ring-1 ring-orange-500/50' },
  DMG: { base: 'border-red-500/30 text-red-400 hover:bg-red-500/20', active: 'bg-red-500/30 border-red-500 text-red-300 ring-1 ring-red-500/50' },
};

/* ---------- component ---------- */

export default function NewTradeInPage() {
  const storeSettings = useStoreSettings();
  const [step, setStep] = useState(1);

  // Cash position indicator for buylist decisions
  const [cashIndicator, setCashIndicator] = useState<{ level: "healthy" | "tight" | "critical"; message: string } | null>(null);
  useEffect(() => {
    fetch("/api/intelligence").then((r) => r.ok ? r.json() : null).then((data) => {
      if (!data?.insights) return;
      const runway = data.insights.find((i: { id: string }) => i.id === "liquidity-runway");
      if (!runway) return;
      if (runway.type === "warning") {
        setCashIndicator({ level: runway.priority === "high" ? "critical" : "tight", message: "Cash is tight — consider offering store credit instead of cash" });
      } else {
        setCashIndicator({ level: "healthy", message: "Cash position is healthy" });
      }
    }).catch(() => {});
  }, []);

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
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);

  // Step 3 — payout
  const [payoutType, setPayoutType] = useState<'cash' | 'credit'>('cash');
  const [creditBonus, setCreditBonus] = useState(storeSettings.trade_in_credit_bonus_percent);
  const [notes, setNotes] = useState('');
  const [customerTier, setCustomerTier] = useState<string | null>(null);

  // Tiered credit bonus: VIP customers get a better rate
  useEffect(() => {
    if (!selectedCustomer) { setCustomerTier(null); return; }
    // Check customer's lifetime spend to determine tier
    fetch(`/api/customers/${selectedCustomer.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.ledger_entries) return;
        const lifetime = data.ledger_entries
          .filter((e: { type: string }) => e.type === "sale")
          .reduce((s: number, e: { amount_cents: number }) => s + e.amount_cents, 0);
        const baseBonus = storeSettings.trade_in_credit_bonus_percent;
        if (lifetime >= 50000) { // $500+ = VIP
          setCustomerTier("VIP");
          setCreditBonus(baseBonus + 10); // +10% on top
        } else if (lifetime >= 20000) { // $200+ = Regular
          setCustomerTier("Regular");
          setCreditBonus(baseBonus + 5); // +5% on top
        } else {
          setCustomerTier(null);
          setCreditBonus(baseBonus);
        }
      })
      .catch(() => {});
  }, [selectedCustomer, storeSettings.trade_in_credit_bonus_percent]);

  // Track which items just had their offer recalculated (for flash animation)
  const [flashingKeys, setFlashingKeys] = useState<Set<number>>(new Set());

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
    const defaultCondition: Condition = "LP";
    const isTCG = inv.category === "tcg_single";
    // Use TCG pricing engine for singles, 50% for everything else
    const offerCents = isTCG
      ? calculateOffer({ marketPriceCents: inv.price_cents, condition: defaultCondition, isFoil: false })
      : Math.round(inv.price_cents * 0.5);

    setItems((prev) => [
      ...prev,
      {
        key: nextKey.current++,
        name: inv.name,
        category: inv.category,
        market_price_cents: inv.price_cents,
        offer_price_cents: offerCents,
        condition: defaultCondition,
        quantity: 1,
        inventory_item_id: inv.id,
        image_url: inv.image_url,
        current_stock: inv.quantity,
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
        condition: 'LP' as Condition,
        quantity: 1,
      },
    ]);
    setManualName('');
    setManualCategory('');
    setShowManual(false);
    searchRef.current?.focus();
  }

  /** Flash the offer field briefly when auto-recalculated */
  const triggerFlash = useCallback((key: number) => {
    setFlashingKeys((prev) => new Set(prev).add(key));
    setTimeout(() => {
      setFlashingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 600);
  }, []);

  /** Compute offer cents for an item given its properties */
  function computeOffer(item: { category: string; market_price_cents: number }, condition: Condition): number {
    const isTCG = item.category === "tcg_single";
    if (isTCG && item.market_price_cents > 0) {
      return calculateOffer({ marketPriceCents: item.market_price_cents, condition, isFoil: false });
    }
    return Math.round(item.market_price_cents * 0.5);
  }

  function updateItem(key: number, patch: Partial<TradeItem>) {
    setItems((prev) => prev.map((i) => {
      if (i.key !== key) return i;
      const updated = { ...i, ...patch };

      // If user manually edited the offer, mark it so condition changes don't override
      if (patch.offer_price_cents !== undefined && !patch.condition) {
        updated.manualOffer = true;
      }

      // Auto-recalculate offer when condition changes (unless user manually overrode)
      if (patch.condition && !updated.manualOffer && i.market_price_cents > 0) {
        updated.offer_price_cents = computeOffer(i, patch.condition as Condition);
        triggerFlash(key);
      }
      return updated;
    }));
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
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-8">
          <h2 className="text-xl font-bold text-green-400">Trade-In Complete</h2>
          <p className="mt-2 text-foreground/70">
            {items.length} item{items.length !== 1 ? 's' : ''} &middot;{' '}
            {formatCents(totalPayoutCents)} {payoutType === 'credit' ? 'store credit' : 'cash'}
          </p>
        </div>
        <Link
          href="/dashboard/trade-ins"
          className="inline-block rounded-xl bg-card-hover px-4 py-2 text-sm text-foreground hover:bg-card-hover transition-colors"
        >
          Back to Trade-Ins
        </Link>
      </div>
    );
  }

  /* ---- render ---- */
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="New Trade-In" backHref="/dashboard/trade-ins" />

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

      {/* ============ STEP 1: CUSTOMER ============ */}
      {step === 1 && (
        <div className="space-y-4 rounded-xl border border-card-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Select Customer</h2>

          {selectedCustomer ? (
            <div className="flex items-center justify-between rounded-xl border border-input-border bg-card-hover p-4">
              <div>
                <div className="font-medium text-foreground">{selectedCustomer.name}</div>
                {selectedCustomer.email && (
                  <div className="text-sm text-muted">{selectedCustomer.email}</div>
                )}
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="text-sm text-muted hover:text-foreground"
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
                className="w-full rounded-xl border border-input-border bg-card-hover px-4 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />

              {customerLoading && <div className="text-sm text-muted">Searching...</div>}

              {customerResults.length > 0 && (
                <div className="space-y-1 rounded-xl border border-input-border bg-card-hover p-2">
                  {customerResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedCustomer(c);
                        setCustomerQuery('');
                        setCustomerResults([]);
                      }}
                      className="w-full rounded px-3 py-2 text-left text-sm text-foreground hover:bg-card-hover transition-colors"
                    >
                      <span className="font-medium">{c.name}</span>
                      {c.email && <span className="ml-2 text-muted">{c.email}</span>}
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
                <div className="space-y-3 rounded-xl border border-input-border bg-card-hover p-4">
                  <input
                    type="text"
                    placeholder="Name *"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full rounded-xl border border-zinc-600 bg-card px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full rounded-xl border border-zinc-600 bg-card px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                  <input
                    type="tel"
                    placeholder="Phone"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full rounded-xl border border-zinc-600 bg-card px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                  <button
                    onClick={createCustomer}
                    disabled={!newName.trim() || customerLoading}
                    className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
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
                className="rounded-xl bg-accent px-6 py-2 text-sm font-medium text-foreground hover:opacity-90 transition-colors"
              >
                Next: Add Items
              </button>
            </div>
          )}
        </div>
      )}

      {/* ============ STEP 2: ITEMS ============ */}
      {step === 2 && (
        <div className="space-y-4 rounded-xl border border-card-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Add Items</h2>

          {/* Cash position indicator */}
          {cashIndicator && cashIndicator.level !== "healthy" && (
            <div className={`rounded-lg px-3 py-2 text-xs flex items-center gap-2 ${
              cashIndicator.level === "critical"
                ? "bg-red-900/20 border border-red-500/30 text-red-300"
                : "bg-amber-900/20 border border-amber-500/30 text-amber-300"
            }`}>
              <span className={`h-2 w-2 rounded-full shrink-0 ${cashIndicator.level === "critical" ? "bg-red-400 animate-pulse" : "bg-amber-400"}`} />
              {cashIndicator.message}
            </div>
          )}

          {/* search */}
          <div className="relative">
            <div className="flex gap-2">
              <input
                ref={searchRef}
                type="text"
                placeholder="Search inventory to add item..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                autoFocus
                className="flex-1 rounded-xl border border-input-border bg-card-hover px-4 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <button
                onClick={() => setShowBarcodeScanner(true)}
                className="rounded-xl bg-card-hover px-3 py-2 text-xs font-medium text-muted hover:text-foreground border border-input-border transition-colors min-h-11"
                title="Scan barcode"
              >
                Scan
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-xl border border-input-border bg-card-hover shadow-xl">
                {searchResults.map((inv) => (
                  <button
                    key={inv.id}
                    onClick={() => addItemFromSearch(inv)}
                    className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-card-hover transition-colors first:rounded-t-lg last:rounded-b-lg"
                  >
                    <span className="font-medium">{inv.name}</span>
                    <span className="ml-2 text-muted">{inv.category}</span>
                    <span className="ml-2 text-muted">{formatCents(inv.price_cents)}</span>
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
                className="flex-1 rounded-xl border border-zinc-600 bg-card-hover px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <input
                type="text"
                placeholder="Category"
                value={manualCategory}
                onChange={(e) => setManualCategory(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addManualItem()}
                className="w-36 rounded-xl border border-zinc-600 bg-card-hover px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <button
                onClick={addManualItem}
                disabled={!manualName.trim()}
                className="rounded-xl bg-card-hover px-3 py-2 text-sm text-foreground hover:bg-card-hover disabled:opacity-50 transition-colors"
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
                  className="rounded-xl border border-input-border bg-card-hover p-4 space-y-3"
                >
                  {/* Row 1: Item info left, remove button right */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3 min-w-0">
                      {/* Card image */}
                      {item.image_url && item.category === "tcg_single" && (
                        <div className="shrink-0 w-14 h-[78px] rounded-lg overflow-hidden bg-background border border-card-border">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate">{item.name}</div>
                        {item.category && (
                          <div className="text-xs text-muted">{item.category}</div>
                        )}
                        {item.market_price_cents > 0 && (
                          <div className="text-xs text-muted">
                            Market: {formatCents(item.market_price_cents)}
                          </div>
                        )}
                        {item.current_stock !== undefined && item.category === "tcg_single" && (
                          <div className="text-[10px] mt-0.5">
                            {item.current_stock <= 1 ? (
                              <span className="text-red-400">{"\u{1F525}"} Low stock — offer more to secure</span>
                            ) : item.current_stock >= 5 ? (
                              <span className="text-blue-400">Well stocked ({item.current_stock}) — standard offer</span>
                            ) : (
                              <span className="text-muted">{item.current_stock} in stock</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => removeItem(item.key)}
                      className="text-muted hover:text-red-400 transition-colors text-lg leading-none"
                      title="Remove item"
                    >
                      &times;
                    </button>
                  </div>

                  {/* Row 2: Condition buttons (prominent, big) */}
                  <div className="flex gap-1.5">
                    {CONDITIONS.map((c) => {
                      const isActive = item.condition === c;
                      const colors = CONDITION_COLORS[c];
                      return (
                        <button
                          key={c}
                          onClick={() => updateItem(item.key, { condition: c })}
                          className={`flex-1 rounded-lg border py-2 text-sm font-bold transition-all ${
                            isActive ? colors.active : colors.base
                          }`}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>

                  {/* Row 3: Offer + Qty + Line total */}
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <label className="flex items-center gap-1.5 text-muted">
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
                        className={`w-24 rounded border border-zinc-600 bg-card px-2 py-1 text-foreground tabular-nums focus:border-accent focus:outline-none transition-all ${
                          flashingKeys.has(item.key)
                            ? 'ring-2 ring-accent bg-accent/10'
                            : ''
                        }`}
                      />
                      {item.manualOffer && (
                        <button
                          onClick={() => {
                            const recalc = computeOffer(item, item.condition);
                            setItems((prev) => prev.map((i) =>
                              i.key === item.key ? { ...i, offer_price_cents: recalc, manualOffer: false } : i
                            ));
                            triggerFlash(item.key);
                          }}
                          className="text-[10px] text-accent hover:text-accent/80 underline"
                          title="Reset to auto-calculated offer"
                        >
                          reset
                        </button>
                      )}
                    </label>

                    <label className="flex items-center gap-1.5 text-muted">
                      Qty
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(item.key, { quantity: Math.max(1, Number(e.target.value)) })
                        }
                        className="w-16 rounded border border-zinc-600 bg-card px-2 py-1 text-foreground tabular-nums focus:border-accent focus:outline-none"
                      />
                    </label>

                    <div className="ml-auto font-semibold text-foreground tabular-nums text-base">
                      {formatCents(item.offer_price_cents * item.quantity)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* running total */}
          <div className="flex items-center justify-between border-t border-input-border pt-4">
            <span className="text-muted">Running Total</span>
            <span className="text-lg font-semibold text-foreground tabular-nums">
              {formatCents(totalOfferCents)}
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
              disabled={items.length === 0}
              className="rounded-xl bg-accent px-6 py-2 text-sm font-medium text-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
            >
              Next: Payout
            </button>
          </div>
        </div>
      )}

      {/* ============ STEP 3: PAYOUT ============ */}
      {step === 3 && (
        <div className="space-y-4 rounded-xl border border-card-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Payout</h2>

          {/* toggle */}
          <div className="flex gap-2">
            {(['cash', 'credit'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setPayoutType(t)}
                className={`flex-1 rounded-xl py-2 text-sm font-medium capitalize transition-colors ${
                  payoutType === t
                    ? 'bg-accent text-foreground'
                    : 'bg-card-hover text-muted hover:bg-card-hover'
                }`}
              >
                {t === 'credit' ? 'Store Credit' : 'Cash'}
              </button>
            ))}
          </div>

          {payoutType === 'credit' && (
            <div className="rounded-xl border border-input-border bg-card-hover p-4 space-y-2">
              <label className="flex items-center gap-2 text-sm text-foreground/70">
                Credit Bonus %
                <HelpTooltip text="The credit bonus is an extra percentage added on top of the cash offer when customers choose store credit. A 30% bonus means a $10 cash offer becomes $13 in store credit." />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={creditBonus}
                  onChange={(e) => setCreditBonus(Math.max(0, Number(e.target.value)))}
                  className="w-20 rounded border border-zinc-600 bg-card px-2 py-1 text-foreground tabular-nums focus:border-accent focus:outline-none"
                />
              </label>
              {customerTier && (
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${customerTier === "VIP" ? "bg-amber-900/40 text-amber-400" : "bg-blue-900/40 text-blue-400"}`}>
                    {customerTier} +{customerTier === "VIP" ? "10" : "5"}% bonus
                  </span>
                </div>
              )}
              <div className="text-sm text-muted">
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
            className="w-full rounded-xl border border-input-border bg-card-hover px-4 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />

          {/* summary */}
          <div className="rounded-xl border border-input-border bg-card-hover p-4 space-y-2 text-sm">
            <h3 className="font-medium text-foreground">Summary</h3>
            <div className="text-muted">
              Customer: <span className="text-foreground">{selectedCustomer?.name}</span>
            </div>
            <div className="text-muted">
              Items: <span className="text-foreground">{items.length}</span> (
              {items.reduce((s, i) => s + i.quantity, 0)} total qty)
            </div>
            <ul className="space-y-1 border-t border-input-border pt-2">
              {items.map((item) => (
                <li key={item.key} className="flex justify-between text-foreground/70">
                  <span>
                    {item.name} ({item.condition}) &times;{item.quantity}
                  </span>
                  <span className="tabular-nums">
                    {formatCents(item.offer_price_cents * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between border-t border-input-border pt-2 font-medium text-foreground">
              <span>Total Offer</span>
              <span className="tabular-nums">{formatCents(totalOfferCents)}</span>
            </div>
            <div className="flex justify-between font-semibold text-foreground">
              <span>
                Payout ({payoutType === 'credit' ? `Credit +${creditBonus}%` : 'Cash'})
              </span>
              <span className="tabular-nums text-green-400">{formatCents(totalPayoutCents)}</span>
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
              disabled={submitting}
              className="rounded-xl bg-green-600 px-6 py-2 text-sm font-medium text-foreground hover:bg-green-500 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Processing...' : 'Complete Trade-In'}
            </button>
          </div>
        </div>
      )}
      {/* Barcode scanner */}
      {showBarcodeScanner && (
        <BarcodeScanner
          title="Scan Item Barcode"
          onScan={(code) => {
            setShowBarcodeScanner(false);
            setSearchQuery(code);
          }}
          onClose={() => setShowBarcodeScanner(false)}
        />
      )}
    </div>
  );
}
