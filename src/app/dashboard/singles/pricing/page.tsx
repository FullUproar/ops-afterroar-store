"use client";

import { useState, useEffect, useCallback } from "react";
import { formatCents } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { calculateSellPrice, type Condition } from "@/lib/tcg-pricing";

/* ---------- types ---------- */

interface PricingItem {
  id: string;
  name: string;
  price_cents: number;
  cost_cents: number;
  quantity: number;
  image_url: string | null;
  game: string | null;
  set_name: string | null;
  set_code: string | null;
  condition: string;
  foil: boolean;
  scryfall_id: string | null;
  market_price_cents: number | null;
  new_price_cents: number;
}

type GameFilter = "All" | "MTG" | "Pokemon" | "Lorcana" | "Yu-Gi-Oh";
const GAME_OPTIONS: GameFilter[] = ["All", "MTG", "Pokemon", "Lorcana", "Yu-Gi-Oh"];

/* ---------- component ---------- */

export default function BulkPricingPage() {
  const [items, setItems] = useState<PricingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<{ count: number } | null>(null);
  const [error, setError] = useState("");

  // Pricing strategy
  const [markupPercent, setMarkupPercent] = useState(130);
  const [gameFilter, setGameFilter] = useState<GameFilter>("All");
  const [conditionFilter, setConditionFilter] = useState("All");

  // Fetch items and compute new prices
  const fetchAndCompute = useCallback(async () => {
    setLoading(true);
    setError("");
    setApplied(null);

    try {
      const params = new URLSearchParams();
      if (gameFilter !== "All") params.set("game", gameFilter);
      if (conditionFilter !== "All") params.set("condition", conditionFilter);
      params.set("sort", "price");
      params.set("dir", "desc");
      params.set("limit", "100");
      params.set("stats", "false");

      const res = await fetch(`/api/singles?${params}`);
      if (!res.ok) throw new Error("Failed to load singles");
      const data = await res.json();

      // For items with scryfall IDs, try to get current market prices
      // We use the cost_cents as a proxy if no market data is available
      const computed: PricingItem[] = data.items.map(
        (item: Record<string, unknown>) => {
          const attrs = (item.attributes ?? {}) as Record<string, unknown>;
          const scryfallId = (attrs.scryfall_id as string) || null;

          // Use item's price as "market" if we don't have real market data yet
          // In a real scenario, we'd batch-fetch from the price cache
          const marketCents = (item.price_cents as number) || 0;

          const condition = ((item.condition as string) || "NM") as Condition;
          const foil = (item.foil as boolean) || false;

          const newPrice = calculateSellPrice({
            marketPriceCents: marketCents,
            condition,
            isFoil: foil,
            markupPercent,
          });

          return {
            id: item.id as string,
            name: item.name as string,
            price_cents: item.price_cents as number,
            cost_cents: item.cost_cents as number,
            quantity: item.quantity as number,
            image_url: item.image_url as string | null,
            game: item.game as string | null,
            set_name: item.set_name as string | null,
            set_code: item.set_code as string | null,
            condition,
            foil,
            scryfall_id: scryfallId,
            market_price_cents: marketCents,
            new_price_cents: newPrice,
          };
        }
      );

      setItems(computed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [gameFilter, conditionFilter, markupPercent]);

  // Fetch market prices from Scryfall for items that have scryfall_id
  const [fetchingMarket, setFetchingMarket] = useState(false);

  async function fetchMarketPrices() {
    if (items.length === 0) return;
    setFetchingMarket(true);

    try {
      // Use the price-drift endpoint to get market prices for our items
      const res = await fetch("/api/inventory/price-drift?threshold=0");
      if (!res.ok) return;
      const data = await res.json();

      if (data.items && Array.isArray(data.items)) {
        const marketMap = new Map<string, number>();
        for (const d of data.items) {
          marketMap.set(d.id, d.market_price_cents);
        }

        // Update items with real market prices and recalculate
        setItems((prev) =>
          prev.map((item) => {
            const market = marketMap.get(item.id);
            if (market) {
              const newPrice = calculateSellPrice({
                marketPriceCents: market,
                condition: item.condition as Condition,
                isFoil: item.foil,
                markupPercent,
              });
              return {
                ...item,
                market_price_cents: market,
                new_price_cents: newPrice,
              };
            }
            return item;
          })
        );
      }
    } finally {
      setFetchingMarket(false);
    }
  }

  useEffect(() => {
    fetchAndCompute();
  }, [fetchAndCompute]);

  // Recalculate when markup changes (client-side)
  useEffect(() => {
    if (items.length === 0) return;
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        new_price_cents: calculateSellPrice({
          marketPriceCents: item.market_price_cents || item.price_cents,
          condition: item.condition as Condition,
          isFoil: item.foil,
          markupPercent,
        }),
      }))
    );
  }, [markupPercent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Items that would actually change
  const changedItems = items.filter(
    (i) => i.new_price_cents !== i.price_cents
  );
  const significantChanges = changedItems.filter((i) => {
    const pctChange =
      i.price_cents > 0
        ? Math.abs(i.new_price_cents - i.price_cents) / i.price_cents
        : 1;
    return pctChange > 0.2;
  });

  // Apply all prices
  async function applyAll() {
    if (changedItems.length === 0) return;
    setApplying(true);
    setError("");

    try {
      const updates = changedItems.map((i) => ({
        item_id: i.id,
        new_price_cents: i.new_price_cents,
      }));

      const res = await fetch("/api/singles/bulk-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to apply prices");
      }

      const result = await res.json();
      setApplied({ count: result.updated });

      // Update local state
      setItems((prev) =>
        prev.map((i) => {
          const changed = changedItems.find((c) => c.id === i.id);
          if (changed) {
            return { ...i, price_cents: changed.new_price_cents };
          }
          return i;
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply");
    } finally {
      setApplying(false);
    }
  }

  // Export preview
  function exportPreview() {
    if (changedItems.length === 0) return;
    const header = "Card Name,Current Price,Market Price,New Price,Change %";
    const rows = changedItems.map((i) => {
      const pctChange =
        i.price_cents > 0
          ? (
              ((i.new_price_cents - i.price_cents) / i.price_cents) *
              100
            ).toFixed(1)
          : "N/A";
      return `"${i.name}","${(i.price_cents / 100).toFixed(2)}","${((i.market_price_cents || 0) / 100).toFixed(2)}","${(i.new_price_cents / 100).toFixed(2)}","${pctChange}%"`;
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `price-update-preview-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-8">
      <PageHeader title="Bulk Pricing Tool" backHref="/dashboard/singles" />

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

      {applied && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400">
          {applied.count} item{applied.count !== 1 ? "s" : ""} updated
          successfully.
        </div>
      )}

      {/* Pricing Strategy */}
      <div className="rounded-xl border border-card-border bg-card p-4 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">
          Pricing Strategy
        </h2>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-muted">Market Mid x</span>
          <div className="relative">
            <input
              type="number"
              min="50"
              max="300"
              step="5"
              value={markupPercent}
              onChange={(e) =>
                setMarkupPercent(
                  Math.max(50, Math.min(300, parseInt(e.target.value, 10) || 100))
                )
              }
              className="w-20 rounded-lg border border-input-border bg-card-hover px-3 py-2 text-sm text-foreground text-center tabular-nums focus:border-accent focus:outline-none"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted">
              %
            </span>
          </div>
          <span className="text-xs text-muted">
            (sell at {markupPercent}% of market)
          </span>
          <button
            onClick={fetchMarketPrices}
            disabled={fetchingMarket || items.length === 0}
            className="ml-auto rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50"
          >
            {fetchingMarket
              ? "Fetching..."
              : "Refresh Market Prices"}
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs text-muted">Filter:</label>
          <select
            value={gameFilter}
            onChange={(e) => setGameFilter(e.target.value as GameFilter)}
            className="rounded-lg border border-input-border bg-card-hover px-2.5 py-1.5 text-sm text-foreground focus:border-accent focus:outline-none"
          >
            {GAME_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select
            value={conditionFilter}
            onChange={(e) => setConditionFilter(e.target.value)}
            className="rounded-lg border border-input-border bg-card-hover px-2.5 py-1.5 text-sm text-foreground focus:border-accent focus:outline-none"
          >
            <option value="All">All Conditions</option>
            <option value="NM">NM</option>
            <option value="LP">LP</option>
            <option value="MP">MP</option>
            <option value="HP">HP</option>
            <option value="DMG">DMG</option>
          </select>
        </div>
      </div>

      {/* Preview */}
      {loading ? (
        <div className="text-center py-12 text-muted text-sm">
          Loading singles...
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted text-sm">
          No singles match the current filters.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted">
              Preview ({changedItems.length} of {items.length} items will be
              updated)
              {significantChanges.length > 0 && (
                <span className="text-amber-400 ml-2">
                  {significantChanges.length} with {">"}20% change
                </span>
              )}
            </p>
          </div>

          {/* Table Header */}
          <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 text-[10px] text-muted uppercase tracking-wider">
            <div>Card</div>
            <div className="w-20 text-right">Current</div>
            <div className="w-20 text-right">Market</div>
            <div className="w-20 text-right">New Price</div>
            <div className="w-16 text-right">Change</div>
          </div>

          <div className="divide-y divide-card-border rounded-xl border border-card-border bg-card overflow-hidden">
            {items.map((item) => {
              const pctChange =
                item.price_cents > 0
                  ? (
                      ((item.new_price_cents - item.price_cents) /
                        item.price_cents) *
                      100
                    ).toFixed(1)
                  : "N/A";
              const isSignificant =
                item.price_cents > 0 &&
                Math.abs(item.new_price_cents - item.price_cents) /
                  item.price_cents >
                  0.2;
              const isChanged = item.new_price_cents !== item.price_cents;

              return (
                <div
                  key={item.id}
                  className={`px-4 py-2.5 ${
                    isSignificant
                      ? "bg-amber-500/5"
                      : ""
                  }`}
                >
                  {/* Mobile layout */}
                  <div className="md:hidden space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground truncate mr-2">
                        {item.name}
                      </span>
                      {isSignificant && (
                        <span className="text-amber-400 text-xs shrink-0">
                          !
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs tabular-nums">
                      <span className="text-muted">
                        Current: {formatCents(item.price_cents)}
                      </span>
                      <span className="text-muted">
                        Market: {formatCents(item.market_price_cents || 0)}
                      </span>
                      <span
                        className={
                          isChanged ? "text-accent font-medium" : "text-muted"
                        }
                      >
                        New: {formatCents(item.new_price_cents)}
                      </span>
                    </div>
                  </div>

                  {/* Desktop layout */}
                  <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 items-center">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-foreground truncate">
                        {item.name}
                      </span>
                      <span className="text-[10px] text-muted shrink-0">
                        {item.condition}
                        {item.foil ? " Foil" : ""}
                      </span>
                      {isSignificant && (
                        <span className="text-amber-400 text-xs shrink-0">
                          !
                        </span>
                      )}
                    </div>
                    <div className="w-20 text-right text-sm text-muted tabular-nums">
                      {formatCents(item.price_cents)}
                    </div>
                    <div className="w-20 text-right text-sm text-muted tabular-nums">
                      {formatCents(item.market_price_cents || 0)}
                    </div>
                    <div
                      className={`w-20 text-right text-sm font-medium tabular-nums ${
                        isChanged ? "text-accent" : "text-muted"
                      }`}
                    >
                      {formatCents(item.new_price_cents)}
                    </div>
                    <div
                      className={`w-16 text-right text-xs tabular-nums ${
                        isSignificant
                          ? "text-amber-400"
                          : isChanged
                            ? "text-foreground/70"
                            : "text-muted"
                      }`}
                    >
                      {typeof pctChange === "string" && pctChange !== "N/A"
                        ? `${parseFloat(pctChange) > 0 ? "+" : ""}${pctChange}%`
                        : pctChange}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={applyAll}
              disabled={applying || changedItems.length === 0}
              className="flex-1 md:flex-none rounded-xl bg-accent px-6 py-3 text-sm font-bold text-foreground hover:opacity-90 transition-colors disabled:opacity-50 min-h-[48px]"
            >
              {applying
                ? "Applying..."
                : `Apply ${changedItems.length} Price${changedItems.length !== 1 ? "s" : ""}`}
            </button>
            <button
              onClick={exportPreview}
              disabled={changedItems.length === 0}
              className="rounded-xl border border-card-border bg-card px-4 py-3 text-sm font-medium text-muted hover:text-foreground transition-colors disabled:opacity-50"
            >
              Export Preview
            </button>
          </div>
        </>
      )}
    </div>
  );
}
