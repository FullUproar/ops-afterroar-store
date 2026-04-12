"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store-context";
import { formatCents, parseDollars } from "@/lib/types";
import type { Permission } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { ConditionBadge, CardImage } from "@/components/tcg/shared";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

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
type SortField = "name" | "set" | "condition" | "quantity" | "price" | "cost" | "margin";
type SortState = { field: SortField; dir: "asc" | "desc" } | null;

type MainTab = "inventory" | "marketplace";
type MarketplaceGame = "mtg" | "pokemon" | "yugioh";

interface MarketplaceCard {
  id: string;
  name: string;
  set_name: string;
  set_code: string;
  collector_number: string;
  rarity: string | null;
  price_usd: string | null;
  price_usd_foil: string | null;
  image_url: string | null;
  small_image_url: string | null;
  foil: boolean;
  nonfoil: boolean;
  type_line: string;
  mana_cost: string;
  // Cross-reference
  in_stock_qty?: number;
  inventory_id?: string;
}

interface AddFormState {
  card: MarketplaceCard;
  quantity: number;
  cost: string;
  price: string;
  condition: string;
  foil: boolean;
}

const GAME_TABS: GameFilter[] = ["All", "MTG", "Pokemon", "Lorcana", "Yu-Gi-Oh"];
const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"] as const;
const CONDITION_MULTIPLIERS: Record<string, number> = {
  NM: 1.0, LP: 0.85, MP: 0.7, HP: 0.5, DMG: 0.3,
};
const PAGE_SIZE = 10;

/* ================================================================== */
/*  Spinner                                                            */
/* ================================================================== */

function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/* ================================================================== */
/*  Main Component                                                     */
/* ================================================================== */

export default function SinglesDashboard() {
  const router = useRouter();
  const { can } = useStore();
  const [mainTab, setMainTab] = useState<MainTab>("inventory");

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }

  // Switch to marketplace with a pre-filled search query
  const [marketplacePreSearch, setMarketplacePreSearch] = useState<string | null>(null);
  function switchToMarketplace(query: string) {
    setMarketplacePreSearch(query);
    setMainTab("marketplace");
  }

  return (
    <div className="mx-auto max-w-6xl flex flex-col h-full gap-4 pb-8 min-w-0">
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

      {/* Main Tabs */}
      <div className="flex gap-1 rounded-xl bg-card-hover/80 p-1 w-fit">
        <button
          onClick={() => setMainTab("inventory")}
          className={`rounded-lg px-5 py-2 text-sm font-medium transition-colors ${
            mainTab === "inventory"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted hover:text-foreground"
          }`}
        >
          My Inventory
        </button>
        <button
          onClick={() => setMainTab("marketplace")}
          className={`rounded-lg px-5 py-2 text-sm font-medium transition-colors ${
            mainTab === "marketplace"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted hover:text-foreground"
          }`}
        >
          Marketplace
        </button>
      </div>

      {mainTab === "inventory" ? (
        <InventoryTab
          router={router}
          showToast={showToast}
          switchToMarketplace={switchToMarketplace}
        />
      ) : (
        <MarketplaceTab
          can={can}
          showToast={showToast}
          preSearch={marketplacePreSearch}
          clearPreSearch={() => setMarketplacePreSearch(null)}
        />
      )}
    </div>
  );
}

/* ================================================================== */
/*  INVENTORY TAB                                                      */
/* ================================================================== */

function InventoryTab({
  router,
  showToast,
  switchToMarketplace,
}: {
  router: ReturnType<typeof useRouter>;
  showToast: (msg: string, type?: "success" | "error") => void;
  switchToMarketplace: (query: string) => void;
}) {
  const [items, setItems] = useState<SingleItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // Filters
  const [gameFilter, setGameFilter] = useState<GameFilter>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sort — three-state: click once = asc, again = desc, again = off
  const [sort, setSort] = useState<SortState>({ field: "name", dir: "asc" });

  // Debounce search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1); // reset page on new search
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [gameFilter]);

  // Fetch items
  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (gameFilter !== "All") params.set("game", gameFilter);
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (sort) {
        params.set("sort", sort.field);
        params.set("dir", sort.dir);
      }
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      if (page === 1) params.set("stats", "true");
      else params.set("stats", "false");

      const res = await fetch(`/api/singles?${params}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();

      setItems(data.items);
      if (data.stats) setStats(data.stats);
      if (typeof data.total === "number") setTotal(data.total);
    } catch {
      // Silently handle error
    } finally {
      setLoading(false);
    }
  }, [gameFilter, debouncedSearch, sort, page]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Sort handler — three-state cycling
  function handleSort(field: SortField) {
    setSort((prev) => {
      if (!prev || prev.field !== field) {
        // New field: start with asc (except numeric fields which start desc)
        const numericFields: SortField[] = ["price", "cost", "quantity", "margin"];
        return { field, dir: numericFields.includes(field) ? "desc" : "asc" };
      }
      if (prev.dir === "asc") return { field, dir: "desc" };
      if (prev.dir === "desc") return null; // third click = off
      return { field, dir: "asc" };
    });
    setPage(1);
  }

  function sortIndicator(field: SortField) {
    if (!sort || sort.field !== field) return null;
    return (
      <span className="ml-0.5">
        {sort.dir === "asc" ? "\u25B2" : "\u25BC"}
      </span>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard label="Total Singles" value={stats.total_singles.toLocaleString()} sub={`${stats.unique_cards} unique`} />
          <KPICard label="Total Value" value={formatCents(stats.total_retail_cents)} sub={`Cost ${formatCents(stats.total_cost_cents)}`} />
          <KPICard label="Avg Margin" value={`${stats.avg_margin_percent}%`} sub="across all singles" />
          <KPICard label="Unique Cards" value={stats.unique_cards.toLocaleString()} sub="distinct items" />
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
      <div className="overflow-hidden w-full">
      <div className="flex gap-1.5 overflow-x-auto pb-1 scroll-visible">
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
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search your inventory..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        className="w-full rounded-xl border border-input-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
      />

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted text-sm">
          <Spinner />
          Loading singles...
        </div>
      ) : items.length === 0 && !debouncedSearch && gameFilter === "All" ? (
        <EmptyInventory />
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
        <>
          {/* Responsive table */}
          <div className="rounded-xl border border-card-border bg-card overflow-hidden">
            <div className="overflow-x-auto scroll-visible">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-card-border bg-card-hover/50">
                    <SortHeader field="name" label="Name" sort={sort} onSort={handleSort} indicator={sortIndicator} />
                    <SortHeader field="set" label="Set" sort={sort} onSort={handleSort} indicator={sortIndicator} className="hidden md:table-cell" />
                    <SortHeader field="condition" label="Cond" sort={sort} onSort={handleSort} indicator={sortIndicator} className="hidden sm:table-cell" />
                    <SortHeader field="quantity" label="Qty" sort={sort} onSort={handleSort} indicator={sortIndicator} align="right" />
                    <SortHeader field="price" label="Price" sort={sort} onSort={handleSort} indicator={sortIndicator} align="right" />
                    <SortHeader field="cost" label="Cost" sort={sort} onSort={handleSort} indicator={sortIndicator} align="right" className="hidden lg:table-cell" />
                    <SortHeader field="margin" label="Margin" sort={sort} onSort={handleSort} indicator={sortIndicator} align="right" className="hidden lg:table-cell" />
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-muted uppercase tracking-wider w-8">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-border">
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => router.push(`/dashboard/inventory/${item.id}`)}
                      className="hover:bg-card-hover transition-colors cursor-pointer"
                    >
                      {/* Name */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <CardImage src={item.image_url} alt={item.name} size="xs" game={item.game || undefined} />
                          <div className="min-w-0">
                            <div className="font-medium text-foreground truncate max-w-50 sm:max-w-65">
                              {item.name}
                            </div>
                            {/* Set/condition visible on mobile when columns are hidden */}
                            <div className="flex items-center gap-1.5 mt-0.5 md:hidden">
                              <span className="text-[10px] text-muted truncate max-w-30">
                                {item.set_name || item.set_code || ""}
                              </span>
                              <ConditionBadge condition={item.condition} size="xs" />
                              {item.foil && (
                                <span className="text-[10px] font-medium px-1 py-0 rounded bg-purple-600/20 text-purple-300 border border-purple-500/30">
                                  F
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Set */}
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        <span className="text-muted text-xs truncate block max-w-40">
                          {item.set_name || item.set_code || "--"}
                        </span>
                      </td>

                      {/* Condition */}
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        <div className="flex items-center gap-1.5">
                          <ConditionBadge condition={item.condition} size="xs" />
                          {item.foil && (
                            <span className="text-[10px] font-medium px-1 py-0 rounded bg-purple-600/20 text-purple-300 border border-purple-500/30">
                              Foil
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Qty */}
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                        {item.quantity}
                      </td>

                      {/* Price */}
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium text-foreground">
                        {formatCents(item.price_cents)}
                      </td>

                      {/* Cost */}
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted hidden lg:table-cell">
                        {formatCents(item.cost_cents)}
                      </td>

                      {/* Margin */}
                      <td className="px-3 py-2.5 text-right tabular-nums hidden lg:table-cell">
                        {item.margin_percent !== null ? (
                          <span
                            className={
                              item.margin_percent >= 30
                                ? "text-green-400"
                                : item.margin_percent >= 10
                                  ? "text-yellow-400"
                                  : "text-red-400"
                            }
                          >
                            {item.margin_percent}%
                          </span>
                        ) : (
                          <span className="text-muted">--</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2.5 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            switchToMarketplace(item.name.replace(/\s*\(Foil\)\s*$/, ""));
                          }}
                          className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors whitespace-nowrap"
                          title="Check market price"
                        >
                          Market
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted text-xs">
              {total > 0
                ? `${(page - 1) * PAGE_SIZE + 1}--${Math.min(page * PAGE_SIZE, total)} of ${total}`
                : ""}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-card-border bg-card px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Prev
              </button>
              <span className="px-3 py-1.5 text-xs text-muted tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-card-border bg-card px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ================================================================== */
/*  MARKETPLACE TAB                                                    */
/* ================================================================== */

function MarketplaceTab({
  can: canFn,
  showToast,
  preSearch,
  clearPreSearch,
}: {
  can: (p: Permission) => boolean;
  showToast: (msg: string, type?: "success" | "error") => void;
  preSearch: string | null;
  clearPreSearch: () => void;
}) {
  const [gameTab, setGameTab] = useState<MarketplaceGame>("mtg");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MarketplaceCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inventory cross-reference
  const [existingIds, setExistingIds] = useState<Map<string, { qty: number; id: string }>>(new Map());

  // Add form
  const [addForm, setAddForm] = useState<AddFormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Advanced MTG filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterSet, setFilterSet] = useState("");
  const [filterColor, setFilterColor] = useState("");
  const [filterRarity, setFilterRarity] = useState("");
  const [filterFormat, setFilterFormat] = useState("");

  // Handle pre-search from inventory tab
  useEffect(() => {
    if (preSearch) {
      setQuery(preSearch);
      clearPreSearch();
      // Trigger search after setting query
      const timer = setTimeout(() => {
        doSearch(preSearch);
      }, 50);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preSearch]);

  // Search function
  const doSearch = useCallback(async (searchQuery?: string) => {
    const q = (searchQuery ?? query).trim();
    if (!q || q.length < 2) return;

    setLoading(true);
    setSearched(true);
    setError(null);

    try {
      if (gameTab === "pokemon" || gameTab === "yugioh") {
        const endpoint = gameTab === "pokemon" ? "/api/catalog/pokemon" : "/api/catalog/yugioh";
        const res = await fetch(`${endpoint}?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();

        // Normalize pokemon/yugioh results to MarketplaceCard
        const cards: MarketplaceCard[] = (data.cards || []).map((card: Record<string, unknown>) => {
          const cardId = String(card.pokemon_id || card.yugioh_id || "");
          const priceCents = (card.price_market as number) || (card.price_tcgplayer as number) || null;
          return {
            id: cardId,
            name: String(card.name || ""),
            set_name: String(card.set_name || ""),
            set_code: String(card.set_code || ""),
            collector_number: String(card.number || ""),
            rarity: (card.rarity as string) || null,
            price_usd: priceCents ? (priceCents / 100).toFixed(2) : null,
            price_usd_foil: null,
            image_url: (card.image_url as string) || null,
            small_image_url: (card.small_image_url as string) || (card.image_url as string) || null,
            foil: false,
            nonfoil: true,
            type_line: gameTab === "pokemon" ? "Pokemon" : "Yu-Gi-Oh",
            mana_cost: "",
          };
        });

        setResults(cards);
        setTotal(data.total || 0);

        // Cross-reference with inventory
        await crossReferenceInventory(cards);
      } else {
        // MTG (Scryfall)
        let scryfallQuery = q;
        if (filterSet) scryfallQuery += ` set:${filterSet}`;
        if (filterColor) scryfallQuery += ` c:${filterColor}`;
        if (filterRarity) scryfallQuery += ` r:${filterRarity}`;
        if (filterFormat) scryfallQuery += ` f:${filterFormat}`;

        const res = await fetch(`/api/catalog/scryfall?q=${encodeURIComponent(scryfallQuery)}`);
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();

        const cards: MarketplaceCard[] = (data.cards || []).map((card: Record<string, unknown>) => ({
          id: card.scryfall_id as string,
          name: card.name as string,
          set_name: card.set_name as string,
          set_code: card.set_code as string,
          collector_number: card.collector_number as string,
          rarity: (card.rarity as string) || null,
          price_usd: (card.price_usd as string) || null,
          price_usd_foil: (card.price_usd_foil as string) || null,
          image_url: (card.image_url as string) || null,
          small_image_url: (card.small_image_url as string) || (card.image_url as string) || null,
          foil: (card.foil as boolean) || false,
          nonfoil: (card.nonfoil as boolean) ?? true,
          type_line: (card.type_line as string) || "",
          mana_cost: (card.mana_cost as string) || "",
        }));

        setResults(cards);
        setTotal(data.total || 0);

        // Cross-reference with inventory
        if (cards.length > 0) {
          const ids = cards.map((c) => `scryfall:${c.id}`);
          try {
            const invRes = await fetch(`/api/catalog/scryfall/check?ids=${encodeURIComponent(JSON.stringify(ids))}`);
            if (invRes.ok) {
              const existing: string[] = await invRes.json();
              // Also do a name-based search for non-MTG that may be in inventory
              await crossReferenceByNames(cards, new Set(existing));
            }
          } catch {
            // Non-critical
          }
        }
      }
    } catch {
      setError("Search failed. Please try again.");
      setResults([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, gameTab, filterSet, filterColor, filterRarity, filterFormat]);

  // Cross-reference: check inventory for matching cards by name
  async function crossReferenceInventory(cards: MarketplaceCard[]) {
    if (cards.length === 0) return;
    // Search inventory for each unique card name
    const uniqueNames = [...new Set(cards.map((c) => c.name))];
    const map = new Map<string, { qty: number; id: string }>();

    for (const name of uniqueNames.slice(0, 10)) {
      try {
        const res = await fetch(`/api/singles?search=${encodeURIComponent(name)}&limit=5&stats=false`);
        if (res.ok) {
          const data = await res.json();
          for (const item of data.items || []) {
            const key = (item.name as string).toLowerCase().replace(/\s*\(foil\)\s*$/i, "");
            if (!map.has(key) || (map.get(key)!.qty < (item.quantity as number))) {
              map.set(key, { qty: item.quantity as number, id: item.id as string });
            }
          }
        }
      } catch {
        // Non-critical
      }
    }
    setExistingIds(map);
  }

  // Cross-reference MTG cards by external IDs + name fallback
  async function crossReferenceByNames(cards: MarketplaceCard[], existingExternalIds: Set<string>) {
    const map = new Map<string, { qty: number; id: string }>();

    // Mark cards that have matching external_ids
    // For each card, also search by name for broader matching
    const uniqueNames = [...new Set(cards.map((c) => c.name))];
    for (const name of uniqueNames.slice(0, 10)) {
      try {
        const res = await fetch(`/api/singles?search=${encodeURIComponent(name)}&limit=5&stats=false`);
        if (res.ok) {
          const data = await res.json();
          for (const item of data.items || []) {
            const key = (item.name as string).toLowerCase().replace(/\s*\(foil\)\s*$/i, "");
            const existing = map.get(key);
            const itemQty = item.quantity as number;
            if (!existing || existing.qty < itemQty) {
              map.set(key, { qty: itemQty, id: item.id as string });
            }
          }
        }
      } catch {
        // Non-critical
      }
    }

    setExistingIds(map);
  }

  function getInStockInfo(card: MarketplaceCard): { qty: number; id: string } | null {
    const key = card.name.toLowerCase().replace(/\s*\(foil\)\s*$/i, "");
    return existingIds.get(key) || null;
  }

  // Add to inventory
  function openAddForm(card: MarketplaceCard) {
    const defaultFoil = !card.nonfoil && card.foil;
    const priceStr = defaultFoil ? card.price_usd_foil : card.price_usd;
    setAddForm({
      card,
      quantity: 1,
      cost: "",
      price: priceStr || "",
      condition: "NM",
      foil: defaultFoil,
    });
    setAddError(null);
  }

  async function handleAdd() {
    if (!addForm) return;
    setSubmitting(true);
    setAddError(null);

    try {
      const priceCents = addForm.price ? parseDollars(addForm.price) : 0;
      const costCents = addForm.cost ? parseDollars(addForm.cost) : 0;

      const isPokemon = gameTab === "pokemon";
      const isYuGiOh = gameTab === "yugioh";
      const endpoint = isPokemon ? "/api/catalog/pokemon" : isYuGiOh ? "/api/catalog/yugioh" : "/api/catalog/scryfall";
      const payload = isYuGiOh
        ? {
            yugioh_id: addForm.card.id,
            name: addForm.card.name,
            set_name: addForm.card.set_name,
            rarity: addForm.card.rarity,
            image_url: addForm.card.image_url,
            price_cents: priceCents,
            cost_cents: costCents,
            quantity: addForm.quantity,
            condition: addForm.condition,
          }
        : isPokemon
          ? {
              pokemon_id: addForm.card.id,
              name: addForm.card.name,
              set_name: addForm.card.set_name,
              number: addForm.card.collector_number,
              rarity: addForm.card.rarity,
              image_url: addForm.card.image_url,
              price_cents: priceCents,
              cost_cents: costCents,
              quantity: addForm.quantity,
              condition: addForm.condition,
            }
          : {
              scryfall_id: addForm.card.id,
              foil: addForm.foil,
              quantity: addForm.quantity,
              cost_cents: costCents,
              condition: addForm.condition,
              price_cents: priceCents,
            };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to add item");
      }

      const data = await res.json();
      showToast(data.message || `${addForm.card.name} added to inventory`);

      // Update cross-reference
      const key = addForm.card.name.toLowerCase().replace(/\s*\(foil\)\s*$/i, "");
      setExistingIds((prev) => {
        const next = new Map(prev);
        const existing = next.get(key);
        next.set(key, {
          qty: (existing?.qty || 0) + addForm.quantity,
          id: existing?.id || data.item?.id || "",
        });
        return next;
      });

      setAddForm(null);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Game Tabs */}
      <div className="flex gap-1 rounded-xl bg-card-hover/80 p-1 w-fit">
        {(["mtg", "pokemon", "yugioh"] as MarketplaceGame[]).map((g) => (
          <button
            key={g}
            onClick={() => {
              setGameTab(g);
              setResults([]);
              setSearched(false);
              setExistingIds(new Map());
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              gameTab === g ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            {g === "mtg" ? "Magic: The Gathering" : g === "pokemon" ? "Pokemon" : "Yu-Gi-Oh"}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") doSearch();
          }}
          placeholder={
            gameTab === "mtg"
              ? "Search MTG cards on Scryfall..."
              : gameTab === "pokemon"
                ? "Search Pokemon cards..."
                : "Search Yu-Gi-Oh cards..."
          }
          autoFocus
          className="w-full rounded-xl border border-input-border bg-card px-5 py-3 pr-28 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <button
          onClick={() => doSearch()}
          disabled={loading || !query.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {/* Advanced Filters (MTG) */}
      {gameTab === "mtg" && (
        <div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="text-xs text-muted hover:text-foreground transition-colors"
          >
            {showFilters ? "Hide filters" : "Advanced filters"}
          </button>
          {showFilters && (
            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
              <div>
                <label className="block text-[10px] text-muted mb-0.5">Set Code</label>
                <input
                  type="text"
                  value={filterSet}
                  onChange={(e) => setFilterSet(e.target.value.toLowerCase())}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="e.g. mh3"
                  className="w-full rounded-lg border border-input-border bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-muted mb-0.5">Color</label>
                <select
                  value={filterColor}
                  onChange={(e) => setFilterColor(e.target.value)}
                  className="w-full rounded-lg border border-input-border bg-card px-2 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
                >
                  <option value="">Any</option>
                  <option value="w">White</option>
                  <option value="u">Blue</option>
                  <option value="b">Black</option>
                  <option value="r">Red</option>
                  <option value="g">Green</option>
                  <option value="c">Colorless</option>
                  <option value="m">Multicolor</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-muted mb-0.5">Rarity</label>
                <select
                  value={filterRarity}
                  onChange={(e) => setFilterRarity(e.target.value)}
                  className="w-full rounded-lg border border-input-border bg-card px-2 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
                >
                  <option value="">Any</option>
                  <option value="common">Common</option>
                  <option value="uncommon">Uncommon</option>
                  <option value="rare">Rare</option>
                  <option value="mythic">Mythic</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-muted mb-0.5">Format</label>
                <select
                  value={filterFormat}
                  onChange={(e) => setFilterFormat(e.target.value)}
                  className="w-full rounded-lg border border-input-border bg-card px-2 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
                >
                  <option value="">Any</option>
                  <option value="standard">Standard</option>
                  <option value="pioneer">Pioneer</option>
                  <option value="modern">Modern</option>
                  <option value="legacy">Legacy</option>
                  <option value="commander">Commander</option>
                  <option value="pauper">Pauper</option>
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Condition Multiplier Reference */}
      <div className="flex items-center gap-3 text-[11px] text-muted">
        <span className="font-medium">Condition multipliers:</span>
        {CONDITIONS.map((c) => (
          <span key={c} className="tabular-nums">
            {c} {Math.round(CONDITION_MULTIPLIERS[c] * 100)}%
          </span>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 text-muted py-12">
          <Spinner />
          Searching...
        </div>
      )}

      {/* Results info */}
      {searched && !loading && (
        <div className="text-sm text-muted">
          {results.length === 0
            ? "No cards found. Try a different search."
            : `Showing ${results.length} of ${total.toLocaleString()} results`}
        </div>
      )}

      {/* Results Grid */}
      {!loading && results.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {results.map((card) => {
            const stockInfo = getInStockInfo(card);
            return (
              <div
                key={`${card.id}-${card.set_code}`}
                className="rounded-xl border border-card-border bg-card overflow-hidden hover:border-zinc-600 transition-colors"
              >
                {/* Card Image */}
                {card.image_url ? (
                  <div className="relative aspect-488/680 bg-background">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={card.image_url}
                      alt={card.name}
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                    {stockInfo && stockInfo.qty > 0 && (
                      <Link
                        href={`/dashboard/inventory/${stockInfo.id}`}
                        className="absolute top-2 right-2 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white shadow hover:bg-emerald-500 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        In Stock: {stockInfo.qty}
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="aspect-488/680 bg-background flex items-center justify-center text-zinc-600 text-sm">
                    No Image
                  </div>
                )}

                {/* Card Info */}
                <div className="p-3 space-y-2">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground leading-tight">
                      {card.name}
                    </h3>
                    <p className="text-xs text-muted mt-0.5">
                      {card.set_name}
                      {card.collector_number && (
                        <span className="text-zinc-600"> #{card.collector_number}</span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    {card.rarity && (
                      <span className="inline-block rounded px-1.5 py-0.5 text-xs font-medium capitalize bg-card-hover text-muted">
                        {card.rarity}
                      </span>
                    )}
                    <div className="text-right">
                      {card.price_usd && (
                        <span className="text-sm font-medium text-emerald-400">
                          ${card.price_usd}
                        </span>
                      )}
                      {card.price_usd_foil && (
                        <span className="ml-2 text-xs text-yellow-400">
                          Foil ${card.price_usd_foil}
                        </span>
                      )}
                      {!card.price_usd && !card.price_usd_foil && (
                        <span className="text-xs text-muted">No price</span>
                      )}
                    </div>
                  </div>

                  {/* Add button */}
                  {canFn("inventory.adjust") && (
                    <button
                      onClick={() => openAddForm(card)}
                      className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-foreground hover:opacity-90 transition-colors"
                    >
                      {stockInfo && stockInfo.qty > 0
                        ? "Add More to Inventory"
                        : "Add to Inventory"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state — no search yet */}
      {!loading && !searched && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3 opacity-30">&#x2318;</div>
          <p className="text-muted text-sm">
            Search external card databases to find market prices and add cards to inventory.
          </p>
          <p className="text-zinc-600 text-xs mt-1">
            Powered by Scryfall, Pokemon TCG API, and YGOPRODeck
          </p>
        </div>
      )}

      {/* Add to Inventory Modal */}
      {addForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-bg"
          onClick={() => { setAddForm(null); setAddError(null); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setAddForm(null); setAddError(null); }
          }}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-card-border bg-card p-6 shadow-2xl mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Add to Inventory</h2>
              <button
                onClick={() => { setAddForm(null); setAddError(null); }}
                className="flex items-center justify-center h-8 w-8 rounded-full text-muted hover:text-foreground active:bg-card-hover transition-colors text-lg"
              >
                &times;
              </button>
            </div>

            <div className="flex gap-4 mb-5">
              {addForm.card.small_image_url && (
                <div className="shrink-0 w-28">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={addForm.card.small_image_url} alt={addForm.card.name} className="w-full rounded" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="text-foreground font-semibold text-sm">{addForm.card.name}</h3>
                <p className="text-xs text-muted mt-0.5">{addForm.card.set_name}</p>
                {addForm.card.collector_number && (
                  <p className="text-xs text-muted mt-0.5">
                    #{addForm.card.collector_number}
                    {addForm.card.rarity && <> -- <span className="capitalize">{addForm.card.rarity}</span></>}
                  </p>
                )}
                <div className="mt-2 flex gap-3">
                  {addForm.card.price_usd && (
                    <span className="text-xs text-emerald-400">Market: ${addForm.card.price_usd}</span>
                  )}
                  {addForm.card.price_usd_foil && (
                    <span className="text-xs text-yellow-400">Foil: ${addForm.card.price_usd_foil}</span>
                  )}
                </div>
              </div>
            </div>

            {addError && <p className="mb-3 text-sm text-red-400">{addError}</p>}

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">Quantity</label>
                <input
                  type="number"
                  min={1}
                  value={addForm.quantity}
                  onChange={(e) => setAddForm({ ...addForm, quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-foreground focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">Cost ($)</label>
                <input
                  type="text"
                  value={addForm.cost}
                  onChange={(e) => setAddForm({ ...addForm, cost: e.target.value })}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  placeholder="What you paid"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">Sell Price ($)</label>
                <input
                  type="text"
                  value={addForm.price}
                  onChange={(e) => setAddForm({ ...addForm, price: e.target.value })}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">Condition</label>
                <select
                  value={addForm.condition}
                  onChange={(e) => setAddForm({ ...addForm, condition: e.target.value })}
                  className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-foreground focus:border-accent focus:outline-none"
                >
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Foil toggle (MTG only) */}
            {gameTab === "mtg" && (
              <div className="mb-5">
                <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addForm.foil}
                    onChange={(e) => {
                      const foil = e.target.checked;
                      const priceStr = foil ? addForm.card.price_usd_foil : addForm.card.price_usd;
                      setAddForm({ ...addForm, foil, price: priceStr || addForm.price });
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                    disabled={addForm.foil ? !addForm.card.nonfoil : !addForm.card.foil}
                    className="rounded border-input-border bg-background text-indigo-600 focus:ring-indigo-500"
                  />
                  Foil
                  {addForm.foil && <span className="text-yellow-400 text-xs">(foil pricing applied)</span>}
                </label>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setAddForm(null); setAddError(null); }}
                className="flex-1 rounded-md border border-input-border px-4 py-2 text-sm text-foreground/70 hover:bg-card-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={submitting}
                className="flex-1 rounded-md bg-accent px-4 py-2 text-sm font-medium text-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner className="h-4 w-4" />
                    Adding...
                  </span>
                ) : (
                  "Add to Inventory"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Sort Header                                                        */
/* ================================================================== */

function SortHeader({
  field,
  label,
  sort,
  onSort,
  indicator,
  align = "left",
  className = "",
}: {
  field: SortField;
  label: string;
  sort: SortState;
  onSort: (field: SortField) => void;
  indicator: (field: SortField) => React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  const isActive = sort?.field === field;
  return (
    <th
      className={`px-3 py-2.5 text-xs font-medium uppercase tracking-wider cursor-pointer select-none transition-colors ${
        isActive ? "text-foreground" : "text-muted hover:text-foreground"
      } ${align === "right" ? "text-right" : "text-left"} ${className}`}
      onClick={() => onSort(field)}
    >
      {label}
      {indicator(field)}
    </th>
  );
}

/* ================================================================== */
/*  KPI Card                                                           */
/* ================================================================== */

function KPICard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-card-border bg-card p-3">
      <div className="text-[10px] text-muted uppercase tracking-wider">{label}</div>
      <div className="text-xl font-bold tabular-nums mt-0.5 text-foreground">{value}</div>
      {sub && <div className="text-[10px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

/* ================================================================== */
/*  Empty State                                                        */
/* ================================================================== */

function EmptyInventory() {
  return (
    <div className="space-y-6 py-8">
      <div className="text-center space-y-2">
        <div className="text-4xl opacity-40">&#x1F0CF;</div>
        <h2 className="text-lg font-semibold text-foreground">No TCG singles in inventory yet</h2>
        <p className="text-sm text-muted max-w-md mx-auto">
          TCG singles are cards from games like Magic: The Gathering, Pokemon, and Yu-Gi-Oh. Add them from the Marketplace tab or scan barcodes.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mx-auto">
        <Link
          href="/dashboard/catalog"
          className="flex flex-col items-center gap-2 rounded-xl border border-card-border bg-card p-5 hover:border-accent/50 hover:bg-card-hover transition-colors"
        >
          <span className="text-2xl opacity-60">&#x1F50D;</span>
          <span className="text-sm font-medium text-foreground">Search Catalog</span>
          <span className="text-[11px] text-muted text-center">Browse the full catalog</span>
        </Link>
        <Link
          href="/dashboard/import"
          className="flex flex-col items-center gap-2 rounded-xl border border-card-border bg-card p-5 hover:border-accent/50 hover:bg-card-hover transition-colors"
        >
          <span className="text-2xl opacity-60">&#x1F4E6;</span>
          <span className="text-sm font-medium text-foreground">Bulk Import</span>
          <span className="text-[11px] text-muted text-center">Upload a CSV or spreadsheet</span>
        </Link>
        <Link
          href="/dashboard/catalog?scan=1"
          className="flex flex-col items-center gap-2 rounded-xl border border-card-border bg-card p-5 hover:border-accent/50 hover:bg-card-hover transition-colors"
        >
          <span className="text-2xl opacity-60">&#x1F4F7;</span>
          <span className="text-sm font-medium text-foreground">Scan a Card</span>
          <span className="text-[11px] text-muted text-center">Use your camera or scanner</span>
        </Link>
      </div>
    </div>
  );
}
