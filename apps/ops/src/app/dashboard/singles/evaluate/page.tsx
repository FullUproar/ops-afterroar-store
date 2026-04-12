"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ConditionGrader } from "@/components/condition-grader";
import type { Condition } from "@/lib/tcg-pricing";
import { CONDITION_PERCENT } from "@/lib/tcg-pricing";
import type { CatalogCard } from "@/lib/scryfall";

/* ---------- types ---------- */

interface EvalItem {
  key: number;
  name: string;
  set_name: string;
  set_code: string;
  scryfall_id: string;
  image_url: string | null;
  condition: Condition;
  foil: boolean;
  market_price_cents: number;
}

/* ---------- component ---------- */

export default function CardEvaluatorPage() {
  const router = useRouter();

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CatalogCard[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Current card being evaluated
  const [currentCard, setCurrentCard] = useState<CatalogCard | null>(null);
  const [condition, setCondition] = useState<Condition>("NM");
  const [isFoil, setIsFoil] = useState(false);

  // Evaluated items list
  const [items, setItems] = useState<EvalItem[]>([]);
  const nextKey = useRef(1);

  // Exporting
  const [exporting, setExporting] = useState(false);

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
      fetch(
        `/api/catalog/scryfall/search?q=${encodeURIComponent(searchQuery)}`
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

  /* ---- select card ---- */
  function selectCard(card: CatalogCard) {
    setCurrentCard(card);
    setCondition("NM");
    const cardIsFoil = !card.nonfoil && card.foil;
    setIsFoil(cardIsFoil);
    setSearchQuery("");
    setSearchResults([]);
  }

  /* ---- get market price in cents ---- */
  function getMarketCents(card: CatalogCard, foil: boolean): number {
    const priceStr = foil ? card.price_usd_foil : card.price_usd;
    return priceStr ? Math.round(parseFloat(priceStr) * 100) : 0;
  }

  /* ---- add card to eval list ---- */
  function addToList() {
    if (!currentCard) return;

    const marketCents = getMarketCents(currentCard, isFoil);
    const condMul = CONDITION_PERCENT[condition] / 100;
    const adjustedMarket = Math.round(marketCents * condMul);

    const item: EvalItem = {
      key: nextKey.current++,
      name: isFoil ? `${currentCard.name} (Foil)` : currentCard.name,
      set_name: currentCard.set_name,
      set_code: currentCard.set_code,
      scryfall_id: currentCard.scryfall_id,
      image_url: currentCard.small_image_url,
      condition,
      foil: isFoil,
      market_price_cents: adjustedMarket,
    };

    setItems((prev) => [item, ...prev]);
    setCurrentCard(null);
    setCondition("NM");
    setIsFoil(false);
    setTimeout(() => searchRef.current?.focus(), 50);
  }

  /* ---- remove ---- */
  function removeItem(key: number) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  /* ---- totals ---- */
  const totalMarketCents = items.reduce((s, i) => s + i.market_price_cents, 0);

  /* ---- export to CSV ---- */
  function exportCSV() {
    if (items.length === 0) return;
    setExporting(true);

    const header = "Card Name,Set,Set Code,Condition,Foil,Market Value";
    const rows = items.map(
      (i) =>
        `"${i.name}","${i.set_name}","${i.set_code}","${i.condition}","${i.foil ? "Yes" : "No"}","${(i.market_price_cents / 100).toFixed(2)}"`
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `card-evaluation-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    setExporting(false);
  }

  /* ---- start trade-in with these cards ---- */
  function startTradeIn() {
    // Store eval items in sessionStorage so the trade-in page can pick them up
    const payload = items.map((i) => ({
      name: i.name,
      set_name: i.set_name,
      set_code: i.set_code,
      scryfall_id: i.scryfall_id,
      image_url: i.image_url,
      condition: i.condition,
      foil: i.foil,
      market_price_cents: i.market_price_cents,
    }));
    sessionStorage.setItem("eval_to_tradein", JSON.stringify(payload));
    router.push("/dashboard/trade-ins/bulk");
  }

  /* ---- print ---- */
  function printEvaluation() {
    window.print();
  }

  /* ---- keyboard ---- */
  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    e.stopPropagation();
    if (e.key === "Enter" && searchResults.length > 0) {
      e.preventDefault();
      selectCard(searchResults[0]);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-8">
      <PageHeader
        title="Card Evaluator"
        backHref="/dashboard/singles"
        action={
          items.length > 0 ? (
            <button
              onClick={() => {
                setItems([]);
                setCurrentCard(null);
              }}
              className="rounded-lg border border-card-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground transition-colors"
            >
              Clear All
            </button>
          ) : undefined
        }
      />

      <p className="text-xs text-muted -mt-2">
        Quickly evaluate a collection or binder. Not a trade-in -- just "what&apos;s this worth?"
      </p>

      {/* Search */}
      <div className="relative">
        <input
          ref={searchRef}
          type="text"
          placeholder="Search card name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          autoFocus
          className="w-full rounded-xl border border-input-border bg-card px-4 py-3 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
        {searchLoading && (
          <div className="absolute right-3 top-3.5 flex items-center gap-1.5 text-xs text-muted">
            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Searching Scryfall...
          </div>
        )}

        {searchResults.length > 0 && (
          <div className="absolute z-20 mt-1 w-full max-h-80 overflow-y-auto rounded-xl border border-input-border bg-card shadow-xl scroll-visible">
            {searchResults.map((card) => {
              const priceUsd = card.price_usd ? `$${card.price_usd}` : null;
              const priceFoil = card.price_usd_foil
                ? `$${card.price_usd_foil} foil`
                : null;
              return (
                <button
                  key={card.scryfall_id}
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
                      {card.set_name} &middot; {card.set_code}
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

      {/* Current card grading */}
      {currentCard && (
        <div className="rounded-xl border border-accent/40 bg-card p-4 space-y-4">
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
                {currentCard.set_name} &middot; {currentCard.set_code}
              </p>
              <p className="text-sm text-foreground/70 mt-1 tabular-nums">
                Market:{" "}
                <span className="font-medium text-foreground">
                  {formatCents(getMarketCents(currentCard, isFoil))}
                </span>
                {condition !== "NM" && (
                  <span className="ml-2 text-muted">
                    {condition}: {formatCents(Math.round(getMarketCents(currentCard, isFoil) * CONDITION_PERCENT[condition] / 100))}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted uppercase tracking-wider mb-2">
              Condition
            </label>
            <ConditionGrader value={condition} onChange={setCondition} size="large" />
          </div>

          <div>
            <label className="block text-xs text-muted uppercase tracking-wider mb-2">
              Foil
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsFoil(false)}
                className={`flex-1 rounded-xl border py-2.5 text-sm font-medium transition-all ${
                  !isFoil
                    ? "bg-card-hover border-foreground/30 text-foreground"
                    : "border-input-border text-muted hover:text-foreground"
                }`}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => setIsFoil(true)}
                className={`flex-1 rounded-xl border py-2.5 text-sm font-medium transition-all ${
                  isFoil
                    ? "bg-purple-600/20 border-purple-500/50 text-purple-300"
                    : "border-input-border text-muted hover:text-foreground"
                }`}
              >
                Foil
              </button>
            </div>
          </div>

          <button
            onClick={addToList}
            className="w-full rounded-xl bg-accent py-3.5 text-base font-bold text-foreground hover:opacity-90 transition-colors min-h-[52px]"
          >
            ADD TO EVALUATION
          </button>
        </div>
      )}

      {/* Summary Bar */}
      {items.length > 0 && (
        <div className="rounded-xl border border-card-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-muted">Cards Evaluated: </span>
              <span className="text-sm font-semibold text-foreground">
                {items.length}
              </span>
            </div>
            <div>
              <span className="text-sm text-muted">Total Value: </span>
              <span className="text-lg font-bold text-green-400 tabular-nums">
                {formatCents(totalMarketCents)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Items List */}
      {items.length > 0 && (
        <div className="divide-y divide-card-border rounded-xl border border-card-border bg-card overflow-hidden">
          {items.map((item) => (
            <div key={item.key} className="flex items-center gap-3 px-4 py-2.5">
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
                  {item.foil && " &middot; Foil"}
                </div>
              </div>
              <div className="text-sm font-medium text-foreground tabular-nums shrink-0">
                {formatCents(item.market_price_cents)}
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
      )}

      {/* Action Buttons */}
      {items.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={startTradeIn}
            className="w-full rounded-xl bg-green-600 py-3.5 text-sm font-bold text-foreground hover:bg-green-500 transition-colors min-h-[52px]"
          >
            Start Trade-In with These Cards
          </button>
          <div className="flex gap-2">
            <button
              onClick={exportCSV}
              disabled={exporting}
              className="flex-1 rounded-xl border border-card-border bg-card py-2.5 text-sm font-medium text-muted hover:text-foreground transition-colors disabled:opacity-50"
            >
              Export to CSV
            </button>
            <button
              onClick={printEvaluation}
              className="flex-1 rounded-xl border border-card-border bg-card py-2.5 text-sm font-medium text-muted hover:text-foreground transition-colors"
            >
              Print Evaluation
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
