"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { formatCents, parseDollars } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ConditionBadge, CardImage, PriceTag, SetInfo } from "@/components/tcg/shared";

/* ---------- types ---------- */

interface SingleItem {
  id: string;
  name: string;
  price_cents: number;
  cost_cents: number;
  quantity: number;
  image_url: string | null;
  external_id: string | null;
  game: string | null;
  set_name: string | null;
  set_code: string | null;
  condition: string;
  foil: boolean;
  rarity: string | null;
  scryfall_id: string | null;
  collector_number: string | null;
  margin_percent: number | null;
  listed_on_ebay: boolean;
}

interface Stats {
  total_singles: number;
  unique_cards: number;
  total_cost_cents: number;
  total_retail_cents: number;
  avg_margin_percent: number;
  alert_eligible: number;
}

type GameFilter = "All" | "MTG" | "Pokemon" | "Lorcana" | "Yu-Gi-Oh";
type SortField = "name" | "price" | "set" | "quantity" | "condition";

const GAME_TABS: GameFilter[] = ["All", "MTG", "Pokemon", "Lorcana", "Yu-Gi-Oh"];

/* ---------- component ---------- */

export default function SinglesDashboard() {
  const [items, setItems] = useState<SingleItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Filters
  const [gameFilter, setGameFilter] = useState<GameFilter>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Inline editing
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [editPriceValue, setEditPriceValue] = useState("");
  const [editingQty, setEditingQty] = useState<string | null>(null);
  const [editQtyValue, setEditQtyValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Debounce search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  // Fetch items
  const fetchItems = useCallback(
    async (cursor?: string | null) => {
      const isLoadMore = !!cursor;
      if (isLoadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams();
        if (gameFilter !== "All") params.set("game", gameFilter);
        if (debouncedSearch) params.set("search", debouncedSearch);
        params.set("sort", sortField);
        params.set("dir", sortDir);
        if (cursor) params.set("cursor", cursor);
        if (isLoadMore) params.set("stats", "false");

        const res = await fetch(`/api/singles?${params}`);
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();

        if (isLoadMore) {
          setItems((prev) => [...prev, ...data.items]);
        } else {
          setItems(data.items);
          if (data.stats) setStats(data.stats);
        }
        setNextCursor(data.nextCursor);
        setHasMore(data.hasMore);
      } catch {
        // Silently handle error
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [gameFilter, debouncedSearch, sortField, sortDir]
  );

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Toast helper
  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }

  // Inline price save
  async function savePrice(id: string) {
    const cents = parseDollars(editPriceValue);
    if (isNaN(cents) || cents < 0) {
      showToast("Invalid price value", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/singles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, price_cents: cents }),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((i) => (i.id === id ? { ...i, price_cents: cents } : i))
        );
        showToast("Price updated", "success");
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "Failed to update price", "error");
      }
    } catch {
      showToast("Network error — price not saved", "error");
    } finally {
      setSaving(false);
      setEditingPrice(null);
    }
  }

  // Inline quantity save
  async function saveQty(id: string) {
    const qty = parseInt(editQtyValue, 10);
    if (isNaN(qty) || qty < 0) {
      showToast("Invalid quantity", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/singles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, quantity: qty }),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((i) => (i.id === id ? { ...i, quantity: qty } : i))
        );
        showToast("Quantity updated", "success");
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "Failed to update quantity", "error");
      }
    } catch {
      showToast("Network error — quantity not saved", "error");
    } finally {
      setSaving(false);
      setEditingQty(null);
    }
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "price" || field === "quantity" ? "desc" : "asc");
    }
  }

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return "";
    return sortDir === "asc" ? " \u25B2" : " \u25BC";
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-8">
      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-lg transition-opacity ${
            toast.type === "error"
              ? "border border-red-500/30 bg-red-500/10 text-red-400"
              : "border border-green-500/30 bg-green-500/10 text-green-400"
          }`}
        >
          {toast.message}
        </div>
      )}

      <PageHeader
        title="TCG Singles"
        backHref="/dashboard"
        action={
          <Link
            href="/dashboard/catalog"
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-colors"
          >
            + Add Cards
          </Link>
        }
      />

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard label="Total Singles" value={stats.total_singles.toLocaleString()} sub={`${stats.unique_cards} unique`} />
          <KPICard label="Value at Cost" value={formatCents(stats.total_cost_cents)} sub={`Retail ${formatCents(stats.total_retail_cents)}`} />
          <KPICard label="Avg Margin" value={`${stats.avg_margin_percent}%`} sub="across all singles" />
          <KPICard label="Price Alerts" value={String(stats.alert_eligible)} sub="eligible for check" accent />
        </div>
      )}

      {/* Tool Links */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/dashboard/singles/evaluate"
          className="rounded-lg border border-card-border bg-card px-3 py-2 text-xs font-medium text-muted hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          Card Evaluator
        </Link>
        <Link
          href="/dashboard/singles/pricing"
          className="rounded-lg border border-card-border bg-card px-3 py-2 text-xs font-medium text-muted hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          Bulk Pricing
        </Link>
        <Link
          href="/dashboard/singles/ebay"
          className="rounded-lg border border-card-border bg-card px-3 py-2 text-xs font-medium text-muted hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          eBay Listings
        </Link>
        <Link
          href="/dashboard/trade-ins/bulk"
          className="rounded-lg border border-card-border bg-card px-3 py-2 text-xs font-medium text-muted hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          Bulk Buylist
        </Link>
      </div>

      {/* Game Filter Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {GAME_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setGameFilter(tab)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
              gameFilter === tab
                ? "bg-accent text-foreground"
                : "bg-card-hover text-muted hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search singles..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        className="w-full rounded-xl border border-input-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
      />

      {/* Sort Bar */}
      <div className="flex items-center gap-1 text-xs text-muted overflow-x-auto">
        <span className="shrink-0 mr-1">Sort:</span>
        {(["name", "price", "set", "quantity", "condition"] as SortField[]).map(
          (field) => (
            <button
              key={field}
              onClick={() => handleSort(field)}
              className={`rounded px-2 py-1 whitespace-nowrap transition-colors ${
                sortField === field
                  ? "bg-card-hover text-foreground font-medium"
                  : "hover:text-foreground"
              }`}
            >
              {field.charAt(0).toUpperCase() + field.slice(1)}
              {sortIndicator(field)}
            </button>
          )
        )}
      </div>

      {/* Items List */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted text-sm">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading singles...
        </div>
      ) : items.length === 0 && !debouncedSearch && gameFilter === "All" ? (
        <div className="space-y-6 py-8">
          <div className="text-center space-y-2">
            <div className="text-4xl">🃏</div>
            <h2 className="text-lg font-semibold text-foreground">No TCG singles in inventory yet</h2>
            <p className="text-sm text-muted max-w-md mx-auto">
              TCG singles are cards from games like Magic: The Gathering, Pokemon, and Yu-Gi-Oh. Add them from the Scryfall catalog or scan barcodes.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mx-auto">
            <Link
              href="/dashboard/catalog"
              className="flex flex-col items-center gap-2 rounded-xl border border-card-border bg-card p-5 hover:border-accent/50 hover:bg-card-hover transition-colors"
            >
              <span className="text-2xl">🔍</span>
              <span className="text-sm font-medium text-foreground">Search Scryfall</span>
              <span className="text-[11px] text-muted text-center">Browse the full MTG catalog</span>
            </Link>
            <Link
              href="/dashboard/import"
              className="flex flex-col items-center gap-2 rounded-xl border border-card-border bg-card p-5 hover:border-accent/50 hover:bg-card-hover transition-colors"
            >
              <span className="text-2xl">📦</span>
              <span className="text-sm font-medium text-foreground">Bulk Import</span>
              <span className="text-[11px] text-muted text-center">Upload a CSV or spreadsheet</span>
            </Link>
            <button
              onClick={() => {
                // Trigger barcode scanner — navigate to catalog with scan mode
                window.location.href = "/dashboard/catalog?scan=1";
              }}
              className="flex flex-col items-center gap-2 rounded-xl border border-card-border bg-card p-5 hover:border-accent/50 hover:bg-card-hover transition-colors"
            >
              <span className="text-2xl">📷</span>
              <span className="text-sm font-medium text-foreground">Scan a Card</span>
              <span className="text-[11px] text-muted text-center">Use your camera or scanner</span>
            </button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-muted text-sm">No singles found matching your search</p>
          <Link
            href="/dashboard/catalog"
            className="inline-block rounded-xl bg-accent px-4 py-2 text-sm font-medium text-foreground hover:opacity-90 transition-colors"
          >
            Add from Catalog
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-card-border rounded-xl border border-card-border bg-card overflow-hidden">
          {items.map((item) => (
            <div key={item.id} className="px-4 py-3 hover:bg-card-hover transition-colors">
              <div className="flex items-start gap-3">
                {/* Card Image */}
                <CardImage src={item.image_url} alt={item.name} size="sm" game={item.game || undefined} className="mt-0.5" />

                {/* Card Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground text-sm leading-tight">
                      {item.name}
                    </span>
                    <ConditionBadge condition={item.condition} size="xs" />
                    {item.foil && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-600/20 text-purple-300 border border-purple-500/30">
                        Foil
                      </span>
                    )}
                    {item.listed_on_ebay && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-300 border border-blue-500/30">
                        eBay
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    <SetInfo setName={item.set_name || item.set_code || "Unknown Set"} rarity={item.rarity} game={item.game} size="xs" />
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs tabular-nums flex-wrap">
                    <span className="text-muted">
                      Cost: {formatCents(item.cost_cents)}
                    </span>

                    {/* Inline price edit */}
                    {editingPrice === item.id ? (
                      <span className="flex items-center gap-1">
                        <span className="text-muted">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editPriceValue}
                          onChange={(e) => setEditPriceValue(e.target.value)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") savePrice(item.id);
                            if (e.key === "Escape") setEditingPrice(null);
                          }}
                          autoFocus
                          disabled={saving}
                          className="w-20 rounded border border-accent bg-card-hover px-1.5 py-0.5 text-xs text-foreground focus:outline-none"
                        />
                        <button
                          onClick={() => savePrice(item.id)}
                          disabled={saving}
                          className="text-green-400 hover:text-green-300"
                        >
                          {saving ? (
                            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : "OK"}
                        </button>
                        <button
                          onClick={() => setEditingPrice(null)}
                          className="text-muted hover:text-foreground"
                        >
                          X
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingPrice(item.id);
                          setEditPriceValue((item.price_cents / 100).toFixed(2));
                        }}
                        className="text-foreground hover:text-accent transition-colors"
                      >
                        Price: {formatCents(item.price_cents)}
                      </button>
                    )}

                    {/* Inline qty edit */}
                    {editingQty === item.id ? (
                      <span className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          value={editQtyValue}
                          onChange={(e) => setEditQtyValue(e.target.value)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") saveQty(item.id);
                            if (e.key === "Escape") setEditingQty(null);
                          }}
                          autoFocus
                          disabled={saving}
                          className="w-14 rounded border border-accent bg-card-hover px-1.5 py-0.5 text-xs text-foreground focus:outline-none"
                        />
                        <button
                          onClick={() => saveQty(item.id)}
                          disabled={saving}
                          className="text-green-400 hover:text-green-300"
                        >
                          {saving ? (
                            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : "OK"}
                        </button>
                        <button
                          onClick={() => setEditingQty(null)}
                          className="text-muted hover:text-foreground"
                        >
                          X
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingQty(item.id);
                          setEditQtyValue(String(item.quantity));
                        }}
                        className="text-foreground hover:text-accent transition-colors"
                      >
                        Qty: {item.quantity}
                      </button>
                    )}

                    {item.margin_percent !== null && (
                      <span
                        className={
                          item.margin_percent >= 30
                            ? "text-green-400"
                            : item.margin_percent >= 10
                              ? "text-yellow-400"
                              : "text-red-400"
                        }
                      >
                        {item.margin_percent}% margin
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <PriceTag cents={item.price_cents} size="sm" />
                  {item.scryfall_id && item.set_code && item.collector_number && (
                    <a
                      href={`https://scryfall.com/card/${item.set_code.toLowerCase()}/${item.collector_number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      Scryfall
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load More */}
      {hasMore && (
        <div className="text-center">
          <button
            onClick={() => fetchItems(nextCursor)}
            disabled={loadingMore}
            className="rounded-xl border border-card-border bg-card px-6 py-2.5 text-sm font-medium text-muted hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50"
          >
            {loadingMore ? "Loading..." : "Load More"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- KPI Card ---------- */

function KPICard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        accent
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-card-border bg-card"
      }`}
    >
      <div className="text-[10px] text-muted uppercase tracking-wider">
        {label}
      </div>
      <div
        className={`text-xl font-bold tabular-nums mt-0.5 ${
          accent ? "text-amber-400" : "text-foreground"
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}
