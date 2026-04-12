"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { Customer, formatCents, parseDollars } from "@/lib/types";
import { useStoreSettings } from "@/lib/store-settings";
import { useScanner } from "@/hooks/use-scanner";
import { ConditionGrader } from "@/components/condition-grader";
import { PageHeader } from "@/components/page-header";
import {
  calculateOffer,
  CONDITION_PERCENT,
  type Condition,
  type PricingConfig,
  DEFAULT_PRICING_CONFIG,
} from "@/lib/tcg-pricing";
import type { CatalogCard } from "@/lib/scryfall";

/* ---------- types ---------- */

interface BulkItem {
  key: number;
  name: string;
  set_name: string;
  set_code: string;
  scryfall_id: string;
  image_url: string | null;
  condition: Condition;
  isFoil: boolean;
  market_price_cents: number;
  offer_price_cents: number;
  overridden: boolean; // true if cashier manually changed offer
}

/* ---------- component ---------- */

export default function BulkTradeInPage() {
  const storeSettings = useStoreSettings();
  const creditBonus = storeSettings.trade_in_credit_bonus_percent;

  // Customer
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustEmail, setNewCustEmail] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");

  // Card search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CatalogCard[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Current card being graded
  const [currentCard, setCurrentCard] = useState<CatalogCard | null>(null);
  const [condition, setCondition] = useState<Condition>("NM");
  const [isFoil, setIsFoil] = useState(false);
  const [offerCents, setOfferCents] = useState(0);
  const [offerOverridden, setOfferOverridden] = useState(false);

  // Items list
  const [items, setItems] = useState<BulkItem[]>([]);
  const nextKey = useRef(1);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{
    count: number;
    payoutCents: number;
    payoutType: string;
  } | null>(null);

  // Pricing config from store settings (could be extended to settings page)
  const pricingConfig: Partial<PricingConfig> = {
    buylistPercent: DEFAULT_PRICING_CONFIG.buylistPercent,
  };

  /* ---- Load items from evaluator handoff (sessionStorage) ---- */
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("eval_to_tradein");
      if (!raw) return;
      sessionStorage.removeItem("eval_to_tradein");
      const evalItems = JSON.parse(raw) as Array<{
        name: string;
        set_name: string;
        set_code: string;
        scryfall_id: string;
        image_url: string | null;
        condition: Condition;
        foil: boolean;
        market_price_cents: number;
      }>;
      if (!Array.isArray(evalItems) || evalItems.length === 0) return;

      const bulkItems: BulkItem[] = evalItems.map((ei) => {
        const offer = calculateOffer({
          marketPriceCents: ei.market_price_cents,
          condition: ei.condition,
          isFoil: ei.foil,
          config: pricingConfig,
        });
        return {
          key: nextKey.current++,
          name: ei.name,
          set_name: ei.set_name,
          set_code: ei.set_code,
          scryfall_id: ei.scryfall_id,
          image_url: ei.image_url,
          condition: ei.condition,
          isFoil: ei.foil,
          market_price_cents: ei.market_price_cents,
          offer_price_cents: offer,
          overridden: false,
        };
      });
      setItems(bulkItems);
    } catch {
      // Silently ignore malformed sessionStorage data
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- customer search ---- */
  useEffect(() => {
    if (customerQuery.length < 2) {
      setCustomerResults([]);
      return;
    }
    const ctrl = new AbortController();
    setCustomerLoading(true);
    fetch(`/api/customers?q=${encodeURIComponent(customerQuery)}`, {
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((d) => setCustomerResults(d))
      .catch(() => {})
      .finally(() => setCustomerLoading(false));
    return () => ctrl.abort();
  }, [customerQuery]);

  /* ---- create customer inline ---- */
  async function createCustomer() {
    if (!newCustName.trim()) return;
    setCustomerLoading(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCustName.trim(),
          email: newCustEmail.trim() || null,
          phone: newCustPhone.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to create customer");
      const customer = await res.json();
      setSelectedCustomer(customer);
      setShowCreateCustomer(false);
      setNewCustName("");
      setNewCustEmail("");
      setNewCustPhone("");
      // Focus search after customer selected
      setTimeout(() => searchRef.current?.focus(), 100);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create customer");
    } finally {
      setCustomerLoading(false);
    }
  }

  /* ---- card search (debounced 200ms) ---- */
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (searchQuery.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    searchTimerRef.current = setTimeout(() => {
      const ctrl = new AbortController();
      fetch(
        `/api/catalog/scryfall/search?q=${encodeURIComponent(searchQuery)}`,
        { signal: ctrl.signal }
      )
        .then((r) => r.json())
        .then((d) => {
          setSearchResults(d.cards || []);
          setSearchLoading(false);
        })
        .catch(() => setSearchLoading(false));
    }, 200);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  /* ---- USB barcode scanner ---- */
  const handleBarcodeScan = useCallback(
    (code: string) => {
      setSearchQuery(code);
    },
    []
  );
  useScanner({ onScan: handleBarcodeScan, enabled: !submitting && !success });

  /* ---- select a card from search results ---- */
  function selectCard(card: CatalogCard) {
    setCurrentCard(card);
    setCondition("NM"); // Default to NM (most common)
    setOfferOverridden(false);

    // Determine foil from card data
    const cardIsFoil = !card.nonfoil && card.foil;
    setIsFoil(cardIsFoil);

    // Calculate offer
    const priceStr = cardIsFoil ? card.price_usd_foil : card.price_usd;
    const marketCents = priceStr ? Math.round(parseFloat(priceStr) * 100) : 0;
    const offer = calculateOffer({
      marketPriceCents: marketCents,
      condition: "NM",
      isFoil: cardIsFoil,
      config: pricingConfig,
    });
    setOfferCents(offer);

    // Clear search
    setSearchQuery("");
    setSearchResults([]);
  }

  /* ---- recalculate offer when condition/foil changes ---- */
  function updateOffer(newCondition: Condition, newFoil: boolean) {
    if (!currentCard || offerOverridden) return;
    const priceStr = newFoil
      ? currentCard.price_usd_foil
      : currentCard.price_usd;
    const marketCents = priceStr ? Math.round(parseFloat(priceStr) * 100) : 0;
    const offer = calculateOffer({
      marketPriceCents: marketCents,
      condition: newCondition,
      isFoil: newFoil,
      config: pricingConfig,
    });
    setOfferCents(offer);
  }

  function handleConditionChange(c: Condition) {
    setCondition(c);
    updateOffer(c, isFoil);
  }

  function handleFoilToggle(foil: boolean) {
    setIsFoil(foil);
    updateOffer(condition, foil);
  }

  /* ---- add card to list ---- */
  function addToList() {
    if (!currentCard) return;

    const priceStr = isFoil
      ? currentCard.price_usd_foil
      : currentCard.price_usd;
    const marketCents = priceStr ? Math.round(parseFloat(priceStr) * 100) : 0;

    const item: BulkItem = {
      key: nextKey.current++,
      name: isFoil ? `${currentCard.name} (Foil)` : currentCard.name,
      set_name: currentCard.set_name,
      set_code: currentCard.set_code,
      scryfall_id: currentCard.scryfall_id,
      image_url: currentCard.small_image_url,
      condition,
      isFoil,
      market_price_cents: marketCents,
      offer_price_cents: offerCents,
      overridden: offerOverridden,
    };

    setItems((prev) => [item, ...prev]); // Newest on top
    setCurrentCard(null);
    setCondition("NM");
    setIsFoil(false);
    setOfferCents(0);
    setOfferOverridden(false);

    // Refocus search for next card
    setTimeout(() => searchRef.current?.focus(), 50);
  }

  /* ---- remove item from list ---- */
  function removeItem(key: number) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  /* ---- keyboard shortcuts ---- */
  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && searchResults.length > 0) {
      e.preventDefault();
      selectCard(searchResults[0]);
    }
  }

  function handleCardKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && currentCard) {
      e.preventDefault();
      addToList();
    }
  }

  /* ---- totals ---- */
  const totalOfferCents = items.reduce((s, i) => s + i.offer_price_cents, 0);
  const totalCreditCents = Math.round(
    totalOfferCents * (1 + creditBonus / 100)
  );

  /* ---- submit ---- */
  async function handleComplete(payoutType: "cash" | "credit") {
    if (items.length === 0) return;
    if (!selectedCustomer && storeSettings.trade_in_require_customer) {
      setError("Please select a customer before completing the trade-in.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const body = {
        customer_id: selectedCustomer?.id ?? null,
        items: items.map((i) => ({
          name: i.name,
          category: "tcg_single",
          attributes: {
            condition: i.condition,
            foil: i.isFoil,
            scryfall_id: i.scryfall_id,
            set_code: i.set_code,
            set_name: i.set_name,
          },
          quantity: 1,
          market_price_cents: i.market_price_cents,
          offer_price_cents: i.offer_price_cents,
        })),
        payout_type: payoutType,
        credit_bonus_percent: payoutType === "credit" ? creditBonus : 0,
        notes: `Bulk buylist: ${items.length} singles`,
      };

      const res = await fetch("/api/trade-ins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create trade-in");
      }

      const result = await res.json();
      setSuccess({
        count: items.length,
        payoutCents:
          payoutType === "credit"
            ? result.total_payout_cents
            : result.total_offer_cents,
        payoutType,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit trade-in");
    } finally {
      setSubmitting(false);
    }
  }

  /* ---- success screen ---- */
  if (success) {
    return (
      <div className="mx-auto max-w-lg space-y-6 text-center py-12">
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-8">
          <div className="text-4xl mb-3">OK</div>
          <h2 className="text-xl font-bold text-green-400">
            Trade-In Complete
          </h2>
          <p className="mt-2 text-foreground/70">
            {success.count} card{success.count !== 1 ? "s" : ""} &middot;{" "}
            {formatCents(success.payoutCents)}{" "}
            {success.payoutType === "credit" ? "store credit" : "cash"}
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => {
              setSuccess(null);
              setItems([]);
              setCurrentCard(null);
              setSelectedCustomer(null);
              setTimeout(() => searchRef.current?.focus(), 100);
            }}
            className="rounded-xl bg-accent px-6 py-3 text-sm font-medium text-foreground hover:opacity-90 transition-colors"
          >
            Start New Buylist
          </button>
          <Link
            href="/dashboard/trade-ins"
            className="rounded-xl bg-card-hover px-6 py-3 text-sm font-medium text-foreground hover:bg-card-hover transition-colors border border-input-border"
          >
            Back to Trade-Ins
          </Link>
        </div>
      </div>
    );
  }

  /* ---- market price for display ---- */
  function getMarketCents(card: CatalogCard, foil: boolean): number {
    const priceStr = foil ? card.price_usd_foil : card.price_usd;
    return priceStr ? Math.round(parseFloat(priceStr) * 100) : 0;
  }

  /* ---- render ---- */
  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-32">
      <PageHeader title="Bulk Buylist" backHref="/dashboard/trade-ins" />

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
          <button
            onClick={() => setError("")}
            className="ml-2 text-red-300 hover:text-red-200"
          >
            dismiss
          </button>
        </div>
      )}

      {/* ---- Customer selector ---- */}
      <div className="rounded-xl border border-card-border bg-card p-4">
        {selectedCustomer ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted uppercase tracking-wider">
                Customer
              </span>
              <span className="font-medium text-foreground">
                {selectedCustomer.name}
              </span>
              {selectedCustomer.credit_balance_cents > 0 && (
                <span className="text-xs text-green-400">
                  {formatCents(selectedCustomer.credit_balance_cents)} credit
                </span>
              )}
            </div>
            <button
              onClick={() => {
                setSelectedCustomer(null);
                setCustomerQuery("");
              }}
              className="text-muted hover:text-foreground text-sm"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Customer name..."
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                className="flex-1 rounded-xl border border-input-border bg-card-hover px-4 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <button
                onClick={() => setShowCreateCustomer((v) => !v)}
                className="text-xs text-indigo-400 hover:text-indigo-300 whitespace-nowrap"
              >
                {showCreateCustomer ? "Cancel" : "+ New"}
              </button>
            </div>
            {customerLoading && (
              <div className="text-xs text-muted">Searching...</div>
            )}
            {customerResults.length > 0 && (
              <div className="space-y-1 rounded-xl border border-input-border bg-card-hover p-2 max-h-40 overflow-y-auto scroll-visible">
                {customerResults.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedCustomer(c);
                      setCustomerQuery("");
                      setCustomerResults([]);
                      setTimeout(() => searchRef.current?.focus(), 100);
                    }}
                    className="w-full rounded px-3 py-2 text-left text-sm text-foreground hover:bg-card transition-colors"
                  >
                    <span className="font-medium">{c.name}</span>
                    {c.email && (
                      <span className="ml-2 text-muted">{c.email}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {showCreateCustomer && (
              <div className="space-y-2 rounded-xl border border-input-border bg-card-hover p-3">
                <input
                  type="text"
                  placeholder="Name *"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full rounded-xl border border-zinc-600 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                />
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="Email"
                    value={newCustEmail}
                    onChange={(e) => setNewCustEmail(e.target.value)}
                    className="flex-1 rounded-xl border border-zinc-600 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                  <input
                    type="tel"
                    placeholder="Phone"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    className="flex-1 rounded-xl border border-zinc-600 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                </div>
                <button
                  onClick={createCustomer}
                  disabled={!newCustName.trim() || customerLoading}
                  className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
                >
                  Create & Select
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---- Card search ---- */}
      <div className="relative">
        <input
          ref={searchRef}
          type="text"
          placeholder="Search card name or scan..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          autoFocus
          className="w-full rounded-xl border border-input-border bg-card px-4 py-3 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
        {searchLoading && (
          <div className="absolute right-3 top-3.5 text-xs text-muted">
            ...
          </div>
        )}

        {/* Search dropdown */}
        {searchResults.length > 0 && (
          <div className="absolute z-20 mt-1 w-full max-h-80 overflow-y-auto rounded-xl border border-input-border bg-card shadow-xl scroll-visible">
            {searchResults.map((card) => {
              const priceUsd = card.price_usd
                ? `$${card.price_usd}`
                : null;
              const priceFoil = card.price_usd_foil
                ? `$${card.price_usd_foil} foil`
                : null;
              return (
                <button
                  key={`${card.scryfall_id}`}
                  onClick={() => selectCard(card)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-card-hover transition-colors border-b border-card-border last:border-b-0"
                >
                  {card.small_image_url && (
                    <img
                      src={card.small_image_url}
                      alt=""
                      className="w-8 h-11 rounded object-cover shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground truncate">
                      {card.name}
                    </div>
                    <div className="text-xs text-muted truncate">
                      {card.set_name} &middot; {card.set_code} &middot;{" "}
                      {card.rarity}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {priceUsd && (
                      <div className="text-xs font-medium text-foreground tabular-nums">
                        {priceUsd}
                      </div>
                    )}
                    {priceFoil && (
                      <div className="text-xs text-muted tabular-nums">
                        {priceFoil}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ---- Current card grading ---- */}
      {currentCard && (
        <div
          className="rounded-xl border border-accent/40 bg-card p-4 space-y-4"
          onKeyDown={handleCardKeyDown}
        >
          <div className="flex items-start gap-4">
            {currentCard.small_image_url && (
              <img
                src={currentCard.small_image_url}
                alt={currentCard.name}
                className="w-16 h-22 rounded-lg object-cover shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-bold text-foreground leading-tight">
                {currentCard.name}
              </h3>
              <p className="text-sm text-muted mt-0.5">
                {currentCard.set_name} &middot; {currentCard.set_code} &middot;{" "}
                {currentCard.rarity}
              </p>
              <p className="text-sm text-foreground/70 mt-1 tabular-nums">
                Market:{" "}
                <span className="font-medium text-foreground">
                  {formatCents(getMarketCents(currentCard, isFoil))}
                </span>
              </p>
            </div>
          </div>

          {/* Condition */}
          <div>
            <label className="block text-xs text-muted uppercase tracking-wider mb-2">
              Condition
            </label>
            <ConditionGrader
              value={condition}
              onChange={handleConditionChange}
              size="large"
            />
          </div>

          {/* Foil toggle */}
          <div>
            <label className="block text-xs text-muted uppercase tracking-wider mb-2">
              Foil
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleFoilToggle(false)}
                className={`flex-1 rounded-xl border py-3 text-sm font-medium transition-all ${
                  !isFoil
                    ? "bg-card-hover border-foreground/30 text-foreground"
                    : "border-input-border text-muted hover:text-foreground"
                }`}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => handleFoilToggle(true)}
                className={`flex-1 rounded-xl border py-3 text-sm font-medium transition-all ${
                  isFoil
                    ? "bg-purple-600/20 border-purple-500/50 text-purple-300"
                    : "border-input-border text-muted hover:text-foreground"
                }`}
              >
                Foil
              </button>
            </div>
          </div>

          {/* Offer price */}
          <div>
            <label className="block text-xs text-muted uppercase tracking-wider mb-2">
              Offer ({CONDITION_PERCENT[condition]}% condition{" "}
              &times; {pricingConfig.buylistPercent ?? DEFAULT_PRICING_CONFIG.buylistPercent}% buylist)
            </label>
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={(offerCents / 100).toFixed(2)}
                  onChange={(e) => {
                    setOfferCents(parseDollars(e.target.value));
                    setOfferOverridden(true);
                  }}
                  className="w-full rounded-xl border border-input-border bg-card-hover pl-7 pr-3 py-3 text-lg font-semibold text-foreground tabular-nums focus:border-accent focus:outline-none"
                />
              </div>
              {offerOverridden && (
                <button
                  onClick={() => {
                    setOfferOverridden(false);
                    updateOffer(condition, isFoil);
                  }}
                  className="text-xs text-muted hover:text-foreground whitespace-nowrap"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Add button */}
          <button
            onClick={addToList}
            className="w-full rounded-xl bg-accent py-4 text-base font-bold text-foreground hover:opacity-90 transition-colors min-h-[56px]"
          >
            ADD TO LIST
          </button>
        </div>
      )}

      {/* ---- Items list ---- */}
      {items.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted">
              Cards Added ({items.length})
            </h3>
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {formatCents(totalOfferCents)}
            </span>
          </div>

          <div className="divide-y divide-card-border rounded-xl border border-card-border bg-card overflow-hidden">
            {items.map((item) => (
              <div
                key={item.key}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt=""
                    className="w-6 h-8 rounded object-cover shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground truncate">
                    {item.name}
                  </div>
                  <div className="text-xs text-muted">
                    {item.set_code} &middot; {item.condition}
                    {item.overridden && " *"}
                  </div>
                </div>
                <div className="text-sm font-medium text-foreground tabular-nums shrink-0">
                  {formatCents(item.offer_price_cents)}
                </div>
                <button
                  onClick={() => removeItem(item.key)}
                  className="text-muted hover:text-red-400 transition-colors shrink-0 p-1"
                  title="Remove"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- Bottom bar ---- */}
      {items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-card-border bg-background/95 backdrop-blur-sm px-4 py-4 pb-safe md:static md:border-t-0 md:bg-transparent md:backdrop-blur-none md:px-0 md:pb-0">
          <div className="mx-auto max-w-3xl space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Total Offer (Cash)</span>
              <span className="text-lg font-bold text-foreground tabular-nums">
                {formatCents(totalOfferCents)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">
                Credit (+{creditBonus}%)
              </span>
              <span className="text-lg font-bold text-green-400 tabular-nums">
                {formatCents(totalCreditCents)}
              </span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleComplete("cash")}
                disabled={submitting}
                className="flex-1 rounded-xl bg-card-hover border border-input-border py-3.5 text-sm font-bold text-foreground hover:bg-card transition-colors disabled:opacity-50 min-h-[52px]"
              >
                {submitting ? "..." : "Complete as Cash"}
              </button>
              <button
                onClick={() => handleComplete("credit")}
                disabled={submitting}
                className="flex-1 rounded-xl bg-green-600 py-3.5 text-sm font-bold text-foreground hover:bg-green-500 transition-colors disabled:opacity-50 min-h-[52px]"
              >
                {submitting ? "..." : "Complete as Credit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
