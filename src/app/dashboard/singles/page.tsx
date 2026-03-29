"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { formatCents, parseDollars } from "@/lib/types";
import { PageHeader } from "@/components/page-header";

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

  // Inline price save
  async function savePrice(id: string) {
    const cents = parseDollars(editPriceValue);
    if (isNaN(cents) || cents < 0) return;
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
      }
    } finally {
      setSaving(false);
      setEditingPrice(null);
    }
  }

  // Inline quantity save
  async function saveQty(id: string) {
    const qty = parseInt(editQtyValue, 10);
    if (isNaN(qty) || qty < 0) return;
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
      }
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
      <PageHeader
        title="TCG Singles"
        backHref="/dashboard"
        action={
          <Link
            href="/dashboard/catalog"
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-foreground hover:opacity-90 transition-colors"
          >
            + Add
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
        <div className="text-center py-12 text-muted text-sm">
          Loading singles...
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-muted text-sm">No singles found</p>
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
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt=""
                    className="w-10 h-14 rounded object-cover shrink-0 mt-0.5"
                  />
                ) : (
                  <div className="w-10 h-14 rounded bg-card-hover shrink-0 mt-0.5 flex items-center justify-center text-muted text-xs">
                    ?
                  </div>
                )}

                {/* Card Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground text-sm leading-tight">
                      {item.name}
                    </span>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-card-hover text-muted">
                      {item.condition}
                    </span>
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
                    {item.set_name || item.set_code || "Unknown Set"}
                    {item.game && ` \u00b7 ${item.game}`}
                    {item.rarity && ` \u00b7 ${item.rarity}`}
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
                          OK
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
                          OK
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
                  <span className="text-sm font-semibold text-foreground tabular-nums">
                    {formatCents(item.price_cents)}
                  </span>
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
