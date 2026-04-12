"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useStore } from "@/lib/store-context";
import { formatCents, parseDollars } from "@/lib/types";
import { PageHeader } from "@/components/page-header";

interface CatalogCard {
  scryfall_id: string;
  name: string;
  set_name: string;
  set_code: string;
  collector_number: string;
  rarity: string;
  price_usd: string | null;
  price_usd_foil: string | null;
  image_url: string | null;
  small_image_url: string | null;
  foil: boolean;
  nonfoil: boolean;
  type_line: string;
  mana_cost: string;
}

interface AddModalState {
  card: CatalogCard;
  quantity: number;
  cost: string;
  price: string;
  condition: string;
  foil: boolean;
}

const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"] as const;

const RARITY_COLORS: Record<string, string> = {
  common: "text-muted",
  uncommon: "text-slate-300",
  rare: "text-amber-400",
  mythic: "text-orange-500",
  special: "text-purple-400",
  bonus: "text-purple-400",
};

const RARITY_BG: Record<string, string> = {
  common: "bg-card-hover",
  uncommon: "bg-slate-800",
  rare: "bg-amber-900/40",
  mythic: "bg-orange-900/40",
  special: "bg-purple-900/40",
  bonus: "bg-purple-900/40",
};

export default function CatalogPage() {
  const { can } = useStore();

  type GameTab = "mtg" | "pokemon" | "yugioh";
  const [gameTab, setGameTab] = useState<GameTab>("mtg");
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState<CatalogCard[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pokemonCards, setPokemonCards] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Advanced filters (MTG only)
  const [showFilters, setShowFilters] = useState(false);
  const [filterSet, setFilterSet] = useState("");
  const [filterColor, setFilterColor] = useState("");
  const [filterRarity, setFilterRarity] = useState("");
  const [filterMinPrice, setFilterMinPrice] = useState("");
  const [filterMaxPrice, setFilterMaxPrice] = useState("");
  const [filterFormat, setFilterFormat] = useState("");

  // Existing external_ids in inventory for "Already in inventory" badges
  const [existingIds, setExistingIds] = useState<Set<string>>(new Set());

  // Add modal
  const [addModal, setAddModal] = useState<AddModalState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // Search — routes to the right API based on game tab
  const handleSearch = useCallback(async () => {
    if (!query.trim() || query.trim().length < 2) return;

    setLoading(true);
    setSearched(true);
    setError(null);

    try {
      if (gameTab === "pokemon" || gameTab === "yugioh") {
        const endpoint = gameTab === "pokemon" ? "/api/catalog/pokemon" : "/api/catalog/yugioh";
        const res = await fetch(`${endpoint}?q=${encodeURIComponent(query.trim())}`);
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        setPokemonCards(data.cards || []);
        setCards([]);
        setTotal(data.total || 0);
        setLoading(false);
        return;
      }

      // MTG (Scryfall) — build query with filters
      let scryfallQuery = query.trim();
      if (filterSet) scryfallQuery += ` set:${filterSet}`;
      if (filterColor) scryfallQuery += ` c:${filterColor}`;
      if (filterRarity) scryfallQuery += ` r:${filterRarity}`;
      if (filterMinPrice) scryfallQuery += ` usd>=${filterMinPrice}`;
      if (filterMaxPrice) scryfallQuery += ` usd<=${filterMaxPrice}`;
      if (filterFormat) scryfallQuery += ` f:${filterFormat}`;

      const res = await fetch(
        `/api/catalog/scryfall?q=${encodeURIComponent(scryfallQuery)}`
      );
      if (!res.ok) {
        throw new Error("Search failed");
      }
      const data = await res.json();
      setCards(data.cards || []);
      setPokemonCards([]);
      setTotal(data.total || 0);

      // Check which cards already exist in our inventory
      if (data.cards && data.cards.length > 0) {
        const ids = data.cards.map(
          (c: CatalogCard) => `scryfall:${c.scryfall_id}`
        );
        try {
          const invRes = await fetch(
            `/api/catalog/scryfall/check?ids=${encodeURIComponent(JSON.stringify(ids))}`
          );
          if (invRes.ok) {
            const existing = await invRes.json();
            setExistingIds(new Set(existing));
          }
        } catch {
          // Non-critical, ignore
        }
      }
    } catch {
      setError("Failed to search Scryfall. Please try again.");
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [query, gameTab]);

  // Debounced search on Enter or after typing pause
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      return;
    }

    const timer = setTimeout(() => {
      handleSearch();
    }, 500);

    return () => clearTimeout(timer);
  }, [query, handleSearch]);

  // Open add modal
  const openAddModal = (card: CatalogCard) => {
    const defaultFoil = !card.nonfoil && card.foil;
    const priceStr = defaultFoil
      ? card.price_usd_foil
      : card.price_usd;

    setAddModal({
      card,
      quantity: 1,
      cost: "",
      price: priceStr || "",
      condition: "NM",
      foil: defaultFoil,
    });
    setError(null);
  };

  // Handle foil toggle in modal (update price)
  const handleFoilToggle = (foil: boolean) => {
    if (!addModal) return;
    const priceStr = foil
      ? addModal.card.price_usd_foil
      : addModal.card.price_usd;
    setAddModal({
      ...addModal,
      foil,
      price: priceStr || addModal.price,
    });
  };

  // Submit add to inventory
  const handleAdd = useCallback(async () => {
    if (!addModal) return;

    setSubmitting(true);
    setError(null);

    try {
      const priceCents = addModal.price
        ? parseDollars(addModal.price)
        : 0;
      const costCents = addModal.cost ? parseDollars(addModal.cost) : 0;

      const isPokemon = gameTab === "pokemon";
      const isYuGiOh = gameTab === "yugioh";
      const endpoint = isPokemon ? "/api/catalog/pokemon" : isYuGiOh ? "/api/catalog/yugioh" : "/api/catalog/scryfall";
      const payload = isYuGiOh
        ? {
            yugioh_id: addModal.card.scryfall_id,
            name: addModal.card.name,
            set_name: addModal.card.set_name,
            rarity: addModal.card.rarity,
            image_url: addModal.card.image_url,
            price_cents: priceCents,
            cost_cents: costCents,
            quantity: addModal.quantity,
            condition: addModal.condition,
          }
        : isPokemon
        ? {
            pokemon_id: addModal.card.scryfall_id,
            name: addModal.card.name,
            set_name: addModal.card.set_name,
            number: addModal.card.collector_number,
            rarity: addModal.card.rarity,
            image_url: addModal.card.image_url,
            price_cents: priceCents,
            cost_cents: costCents,
            quantity: addModal.quantity,
            condition: addModal.condition,
          }
        : {
            scryfall_id: addModal.card.scryfall_id,
            foil: addModal.foil,
            quantity: addModal.quantity,
            cost_cents: costCents,
            condition: addModal.condition,
            price_cents: priceCents,
          };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to add item");
      }

      const data = await res.json();
      showToast(data.message);

      // Mark as existing
      const externalId = `scryfall:${addModal.card.scryfall_id}:${addModal.foil ? "foil" : "nonfoil"}`;
      setExistingIds((prev) => new Set([...prev, externalId]));

      setAddModal(null);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to add item";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }, [addModal, showToast, gameTab]);

  const isInInventory = (card: CatalogCard) => {
    return (
      existingIds.has(`scryfall:${card.scryfall_id}:foil`) ||
      existingIds.has(`scryfall:${card.scryfall_id}:nonfoil`)
    );
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div>
        <PageHeader title="Catalog" />
        <p className="text-sm text-muted mt-1">
          Search external product databases and add items to inventory
        </p>
      </div>

      {/* Game Tabs */}
      <div className="flex gap-1 rounded-xl bg-card-hover/80 p-1 w-fit">
        <button
          onClick={() => { setGameTab("mtg"); setCards([]); setPokemonCards([]); setSearched(false); }}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            gameTab === "mtg" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"
          }`}
          style={{ minHeight: "auto" }}
        >
          Magic: The Gathering
        </button>
        <button
          onClick={() => { setGameTab("pokemon"); setCards([]); setPokemonCards([]); setSearched(false); }}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            gameTab === "pokemon" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"
          }`}
          style={{ minHeight: "auto" }}
        >
          Pokemon
        </button>
        <button
          onClick={() => { setGameTab("yugioh"); setCards([]); setPokemonCards([]); setSearched(false); }}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            gameTab === "yugioh" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"
          }`}
          style={{ minHeight: "auto" }}
        >
          Yu-Gi-Oh
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") handleSearch();
          }}
          placeholder={gameTab === "mtg" ? "Search MTG cards on Scryfall..." : gameTab === "pokemon" ? "Search Pokemon cards..." : "Search Yu-Gi-Oh cards..."}
          autoFocus
          className="w-full rounded-xl border border-input-border bg-card px-5 py-3 text-lg text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {/* Advanced Filters (MTG only) */}
      {gameTab === "mtg" && (
        <div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="text-xs text-muted hover:text-foreground transition-colors"
            style={{ minHeight: "auto" }}
          >
            {showFilters ? "Hide filters" : "Advanced filters"}
          </button>
          {showFilters && (
            <div className="mt-2 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              <div>
                <label className="block text-[10px] text-muted mb-0.5">Set Code</label>
                <input
                  type="text"
                  value={filterSet}
                  onChange={(e) => setFilterSet(e.target.value.toLowerCase())}
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
                <label className="block text-[10px] text-muted mb-0.5">Min Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={filterMinPrice}
                  onChange={(e) => setFilterMinPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-input-border bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-muted mb-0.5">Max Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={filterMaxPrice}
                  onChange={(e) => setFilterMaxPrice(e.target.value)}
                  placeholder="100.00"
                  className="w-full rounded-lg border border-input-border bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                />
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
                  <option value="vintage">Vintage</option>
                  <option value="commander">Commander</option>
                  <option value="pauper">Pauper</option>
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Results info */}
      {searched && !loading && (
        <div className="text-sm text-muted">
          {(cards.length === 0 && pokemonCards.length === 0)
            ? "No cards found. Try a different search."
            : `Showing ${cards.length || pokemonCards.length} of ${total.toLocaleString()} results`}
        </div>
      )}

      {/* Pokemon / Yu-Gi-Oh Results */}
      {pokemonCards.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {pokemonCards.map((card: Record<string, unknown>) => {
            // Normalize fields across Pokemon and Yu-Gi-Oh
            const cardId = String(card.pokemon_id || card.yugioh_id || "");
            const cardName = String(card.name || "");
            const setName = String(card.set_name || "");
            const cardNumber = String(card.number || card.set_code || "");
            const rarity = (card.rarity as string) || null;
            const imageUrl = (card.image_url as string) || null;
            const smallImageUrl = (card.small_image_url as string) || imageUrl;
            const priceCents = (card.price_market as number) || (card.price_tcgplayer as number) || null;

            return (
            <div
              key={cardId}
              className="group rounded-xl border border-card-border bg-card overflow-hidden hover:border-accent/50 transition-colors cursor-pointer"
              onClick={() => {
                setAddModal({
                  card: {
                    scryfall_id: cardId,
                    name: cardName,
                    set_name: setName,
                    set_code: "",
                    collector_number: cardNumber,
                    rarity: rarity || "common",
                    price_usd: priceCents ? (priceCents / 100).toFixed(2) : null,
                    price_usd_foil: null,
                    image_url: imageUrl,
                    small_image_url: smallImageUrl,
                    foil: false,
                    nonfoil: true,
                    type_line: gameTab === "pokemon" ? "Pokemon" : "Yu-Gi-Oh",
                    mana_cost: "",
                  },
                  quantity: 1,
                  cost: "",
                  price: priceCents ? (priceCents / 100).toFixed(2) : "",
                  condition: "NM",
                  foil: false,
                });
              }}
            >
              {smallImageUrl && (
                <div className="aspect-[2.5/3.5] bg-background">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={smallImageUrl} alt={cardName} className="w-full h-full object-contain" loading="lazy" />
                </div>
              )}
              <div className="p-2.5">
                <p className="text-sm font-medium text-foreground truncate">{cardName}</p>
                <p className="text-xs text-muted truncate">{setName}{cardNumber ? ` #${cardNumber}` : ""}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-muted">{rarity}</span>
                  {priceCents && (
                    <span className="text-sm font-semibold text-accent tabular-nums">${(priceCents / 100).toFixed(2)}</span>
                  )}
                </div>
              </div>
            </div>
          );})}
        </div>
      )}

      {/* Error */}
      {error && !addModal && (
        <div className="rounded-md bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 text-muted py-12">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Searching Scryfall...
        </div>
      )}

      {/* Card Grid */}
      {!loading && cards.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cards.map((card) => (
            <div
              key={`${card.scryfall_id}-${card.set_code}`}
              className="rounded-xl border border-card-border bg-card overflow-hidden hover:border-zinc-600 transition-colors"
            >
              {/* Card Image */}
              {card.image_url ? (
                <div className="relative aspect-[488/680] bg-background">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={card.image_url}
                    alt={card.name}
                    className="w-full h-full object-contain"
                    loading="lazy"
                  />
                  {isInInventory(card) && (
                    <div className="absolute top-2 right-2 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-foreground shadow">
                      In Inventory
                    </div>
                  )}
                </div>
              ) : (
                <div className="aspect-[488/680] bg-background flex items-center justify-center text-zinc-600 text-sm">
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
                    {card.set_name}{" "}
                    <span className="text-zinc-600">#{card.collector_number}</span>
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium capitalize ${
                      RARITY_BG[card.rarity] || "bg-card-hover"
                    } ${RARITY_COLORS[card.rarity] || "text-muted"}`}
                  >
                    {card.rarity}
                  </span>

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
                {can("inventory.adjust") && (
                  <button
                    onClick={() => openAddModal(card)}
                    className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-foreground hover:opacity-90 transition-colors"
                  >
                    {isInInventory(card)
                      ? "Update Inventory"
                      : "Add to Inventory"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !searched && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3 opacity-30">&#x2318;</div>
          <p className="text-muted text-sm">
            Search for MTG cards by name, set, or collector number.
          </p>
          <p className="text-zinc-600 text-xs mt-1">
            Powered by Scryfall -- 80,000+ unique cards
          </p>
        </div>
      )}

      {/* Add to Inventory Modal */}
      {addModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-bg"
          onClick={() => {
            setAddModal(null);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setAddModal(null); setError(null); }
          }}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-card-border bg-card p-6 shadow-2xl mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">
                Add to Inventory
              </h2>
              <button
                onClick={() => { setAddModal(null); setError(null); }}
                className="flex items-center justify-center h-8 w-8 rounded-full text-muted hover:text-foreground active:bg-card-hover transition-colors text-lg"
              >
                &times;
              </button>
            </div>

            <div className="flex gap-4 mb-5">
              {/* Card image */}
              {addModal.card.small_image_url && (
                <div className="flex-shrink-0 w-28">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={addModal.card.small_image_url}
                    alt={addModal.card.name}
                    className="w-full rounded"
                  />
                </div>
              )}

              {/* Card details */}
              <div className="flex-1 min-w-0">
                <h3 className="text-foreground font-semibold text-sm">
                  {addModal.card.name}
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  {addModal.card.set_name}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  #{addModal.card.collector_number} --{" "}
                  <span className="capitalize">{addModal.card.rarity}</span>
                </p>
                {addModal.card.type_line && (
                  <p className="text-xs text-muted mt-1">
                    {addModal.card.type_line}
                  </p>
                )}
                <div className="mt-2 flex gap-3">
                  {addModal.card.price_usd && (
                    <span className="text-xs text-emerald-400">
                      Market: ${addModal.card.price_usd}
                    </span>
                  )}
                  {addModal.card.price_usd_foil && (
                    <span className="text-xs text-yellow-400">
                      Foil: ${addModal.card.price_usd_foil}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {error && (
              <p className="mb-3 text-sm text-red-400">{error}</p>
            )}

            <div className="grid grid-cols-2 gap-4 mb-4">
              {/* Quantity */}
              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  Quantity
                </label>
                <input
                  type="number"
                  min={1}
                  value={addModal.quantity}
                  onChange={(e) =>
                    setAddModal({
                      ...addModal,
                      quantity: Math.max(1, parseInt(e.target.value) || 1),
                    })
                  }
                  onKeyDown={(e) => e.stopPropagation()}
                  className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-foreground focus:border-accent focus:outline-none"
                />
              </div>

              {/* Cost */}
              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  Cost ($)
                </label>
                <input
                  type="text"
                  value={addModal.cost}
                  onChange={(e) =>
                    setAddModal({ ...addModal, cost: e.target.value })
                  }
                  onKeyDown={(e) => e.stopPropagation()}
                  className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  placeholder="What you paid"
                />
              </div>

              {/* Price */}
              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  Sell Price ($)
                </label>
                <input
                  type="text"
                  value={addModal.price}
                  onChange={(e) =>
                    setAddModal({ ...addModal, price: e.target.value })
                  }
                  onKeyDown={(e) => e.stopPropagation()}
                  className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  placeholder="0.00"
                />
              </div>

              {/* Condition */}
              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  Condition
                </label>
                <select
                  value={addModal.condition}
                  onChange={(e) =>
                    setAddModal({ ...addModal, condition: e.target.value })
                  }
                  className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-foreground focus:border-accent focus:outline-none"
                >
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Foil toggle */}
            <div className="mb-5">
              <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={addModal.foil}
                  onChange={(e) => handleFoilToggle(e.target.checked)}
                  onKeyDown={(e) => e.stopPropagation()}
                  disabled={
                    addModal.foil
                      ? !addModal.card.nonfoil
                      : !addModal.card.foil
                  }
                  className="rounded border-input-border bg-background text-indigo-600 focus:ring-indigo-500"
                />
                Foil
                {addModal.foil && (
                  <span className="text-yellow-400 text-xs">(foil pricing applied)</span>
                )}
              </label>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setAddModal(null);
                  setError(null);
                }}
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
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Adding...
                  </span>
                ) : isInInventory(addModal.card)
                    ? "Update Stock"
                    : "Add to Inventory"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-medium text-foreground shadow-lg animate-in slide-in-from-bottom-4">
          {toast}
        </div>
      )}
    </div>
  );
}
