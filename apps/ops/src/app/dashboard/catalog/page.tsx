"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useStore } from "@/lib/store-context";
import { formatCents, parseDollars } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { SubNav } from "@/components/ui/sub-nav";
import { FeatureGate } from "@/components/feature-gate";

const INVENTORY_TABS = [
  { href: '/dashboard/inventory', label: 'Inventory' },
  { href: '/dashboard/catalog', label: 'Card Catalog' },
  { href: '/dashboard/deck-builder', label: 'Deck Builder' },
  { href: '/dashboard/trade-ins', label: 'Trade-Ins' },
  { href: '/dashboard/consignment', label: 'Consignment' },
];

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

// Rarity tone — pairs color + weight + capitalization (no emoji), passes a11y
const RARITY_TONE: Record<string, string> = {
  common: "text-ink-soft",
  uncommon: "text-ink",
  rare: "text-yellow",
  mythic: "text-orange",
  special: "text-yellow",
  bonus: "text-yellow",
};

const GAMES: Array<{ id: "mtg" | "pokemon" | "yugioh"; label: string }> = [
  { id: "mtg", label: "MTG" },
  { id: "pokemon", label: "Pokémon" },
  { id: "yugioh", label: "Yu-Gi-Oh" },
];

const TCG_TABS = [
  { id: "singles", label: "Singles", active: true },
  { id: "sealed", label: "Sealed" },
  { id: "buylist", label: "Buylist" },
  { id: "deck", label: "Deck Builder", href: "/dashboard/deck-builder" },
  { id: "rules", label: "Pricing Rules" },
];

// Color identity from mana cost. Returns first WUBRG letter found.
function colorIdentityFromMana(manaCost: string): string {
  if (!manaCost) return "c";
  const m = manaCost.toUpperCase();
  for (const c of ["W", "U", "B", "R", "G"]) {
    if (m.includes(c)) return c.toLowerCase();
  }
  return "c";
}

// Parse a mana cost string like "{2}{B}{B}" into ordered pip tokens.
function parseManaPips(manaCost: string): string[] {
  if (!manaCost) return [];
  const tokens: string[] = [];
  const re = /\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(manaCost)) !== null) {
    tokens.push(match[1]);
  }
  return tokens;
}

function pipColorClass(token: string): string {
  const t = token.toUpperCase();
  if (t === "W") return "w";
  if (t === "U") return "u";
  if (t === "B") return "b";
  if (t === "R") return "r";
  if (t === "G") return "g";
  return "c";
}

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
        if (!res.ok) {
          let serverMessage: string | undefined;
          try { const body = await res.json(); serverMessage = body?.error; } catch {}
          throw new Error(serverMessage || `Search failed (${res.status})`);
        }
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
        // Surface the server's actual error message so the operator can act on it
        let serverMessage: string | undefined;
        try {
          const body = await res.json();
          serverMessage = body?.error;
        } catch { /* response wasn't JSON */ }
        throw new Error(serverMessage || `Search failed (${res.status})`);
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
    } catch (err) {
      const message = err instanceof Error ? err.message : "Search failed";
      setError(`Search failed: ${message}`);
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [query, gameTab, filterSet, filterColor, filterRarity, filterMinPrice, filterMaxPrice, filterFormat]);

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

  const activeGameLabel = GAMES.find((g) => g.id === gameTab)?.label ?? "MTG";
  const resultCount = cards.length || pokemonCards.length;

  return (
    <div className="flex flex-col h-full gap-4">
      <SubNav items={INVENTORY_TABS} />

      {/* Section hero — crumb + display title + game switcher + stat strip */}
      <PageHeader
        title="Card Catalog"
        crumb={`TCG · ${activeGameLabel}`}
        desc="Search external product databases (Scryfall · Pokémon TCG · YGOPRODeck) and add items to inventory."
      />

      <FeatureGate module="tcg_engine">
        {/* Game switcher — operator-grade mono pills */}
        <div className="flex flex-wrap items-center gap-2">
          {GAMES.map((g) => {
            const on = gameTab === g.id;
            return (
              <button
                key={g.id}
                onClick={() => {
                  setGameTab(g.id);
                  setCards([]);
                  setPokemonCards([]);
                  setSearched(false);
                }}
                className="font-mono uppercase font-semibold inline-flex items-center gap-2 px-3 transition-colors"
                style={{
                  fontSize: "0.66rem",
                  letterSpacing: "0.18em",
                  minHeight: 44,
                  border: `1px solid ${on ? "var(--orange)" : "var(--rule-hi)"}`,
                  background: on ? "var(--orange-mute)" : "var(--panel-mute)",
                  color: on ? "var(--orange)" : "var(--ink-soft)",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    background: "currentColor",
                    clipPath:
                      "polygon(50% 0%,100% 38%,82% 100%,18% 100%,0% 38%)",
                  }}
                />
                {g.label}
              </button>
            );
          })}

          <span aria-hidden className="hidden md:inline-block" style={{ width: 1, height: 22, background: "var(--rule-hi)", margin: "0 0.25rem" }} />

          <a
            href="/dashboard/catalog/sealed-ev"
            className="font-mono uppercase font-semibold inline-flex items-center gap-1.5 px-3 transition-colors text-ink-soft hover:text-orange"
            style={{
              fontSize: "0.62rem",
              letterSpacing: "0.18em",
              minHeight: 44,
              border: "1px solid var(--rule-hi)",
              background: "var(--panel-mute)",
            }}
          >
            Sealed EV <span aria-hidden>→</span>
          </a>
          <a
            href="/dashboard/catalog/import"
            className="font-mono uppercase font-semibold inline-flex items-center gap-1.5 px-3 transition-colors text-ink-soft hover:text-orange"
            style={{
              fontSize: "0.62rem",
              letterSpacing: "0.18em",
              minHeight: 44,
              border: "1px solid var(--rule-hi)",
              background: "var(--panel-mute)",
            }}
          >
            Import <span aria-hidden>→</span>
          </a>
        </div>

        {/* Stat strip — mono labels above mono numbers */}
        <div
          className="grid grid-cols-3 md:grid-cols-6"
          style={{ gap: 1, background: "var(--rule)", border: "1px solid var(--rule)" }}
        >
          {[
            { k: "Results", v: searched ? resultCount.toLocaleString() : "—" },
            { k: "Total Hits", v: searched ? total.toLocaleString() : "—" },
            { k: "Source", v: gameTab === "mtg" ? "Scryfall" : gameTab === "pokemon" ? "PokémonTCG" : "YGOPro" },
            { k: "Game", v: activeGameLabel },
            { k: "Filters", v: gameTab === "mtg" && (filterSet || filterColor || filterRarity || filterFormat || filterMinPrice || filterMaxPrice) ? "ON" : "OFF", warn: gameTab === "mtg" && (!!filterSet || !!filterColor || !!filterRarity || !!filterFormat || !!filterMinPrice || !!filterMaxPrice) },
            { k: "Status", v: loading ? "SEARCHING" : searched ? "READY" : "IDLE", up: !loading && searched && resultCount > 0 },
          ].map((cell) => (
            <div key={cell.k} className="px-3 py-2" style={{ background: "var(--panel-mute)" }}>
              <div
                className="font-mono uppercase font-semibold text-ink-faint"
                style={{ fontSize: "0.55rem", letterSpacing: "0.22em" }}
              >
                {cell.k}
              </div>
              <div
                className="font-mono font-semibold mt-1"
                style={{
                  fontSize: "0.95rem",
                  letterSpacing: "0.02em",
                  color: cell.warn
                    ? "var(--yellow)"
                    : cell.up
                    ? "var(--teal)"
                    : "var(--ink)",
                }}
              >
                {cell.v}
              </div>
            </div>
          ))}
        </div>

        {/* TCG sub-tabs */}
        <nav
          className="flex items-end overflow-x-auto"
          aria-label="TCG sections"
          style={{
            background: "var(--slate)",
            borderBottom: "1px solid var(--rule)",
            paddingLeft: "0.25rem",
            paddingRight: "0.25rem",
          }}
        >
          {TCG_TABS.map((t) => {
            const isActive = t.active === true;
            const Tag: "a" | "button" = t.href ? "a" : "button";
            const props = t.href ? { href: t.href } : { type: "button" as const };
            return (
              <Tag
                key={t.id}
                {...props}
                className="font-mono uppercase font-semibold inline-flex items-center gap-2 shrink-0 transition-colors"
                style={{
                  padding: "0.85rem 1rem",
                  minHeight: 52,
                  fontSize: "0.7rem",
                  letterSpacing: "0.22em",
                  borderBottom: `2px solid ${isActive ? "var(--orange)" : "transparent"}`,
                  color: isActive ? "var(--orange)" : "var(--ink-soft)",
                  background: "transparent",
                  textDecoration: "none",
                }}
              >
                {t.label}
              </Tag>
            );
          })}
        </nav>

        {/* Filter bar — search + pills */}
        <div
          className="flex flex-wrap items-center gap-2 px-3 py-3"
          style={{
            background: "var(--panel-mute)",
            border: "1px solid var(--rule)",
          }}
        >
          {/* Search input */}
          <div className="relative grow" style={{ minWidth: 240, maxWidth: 480 }}>
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
              style={{ width: 16, height: 16 }}
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.5-4.5" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") handleSearch();
              }}
              placeholder={
                gameTab === "mtg"
                  ? "Search card name, set, scryfall ID, oracle…"
                  : gameTab === "pokemon"
                  ? "Search Pokémon cards by name or set…"
                  : "Search Yu-Gi-Oh cards by name…"
              }
              autoFocus
              className="w-full font-mono text-ink placeholder:text-ink-faint focus:outline-none"
              style={{
                background: "var(--panel)",
                border: "1px solid var(--rule-hi)",
                color: "var(--ink)",
                fontSize: "0.92rem",
                padding: "0 5rem 0 2.4rem",
                minHeight: 48,
                letterSpacing: "0.01em",
              }}
            />
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 font-mono uppercase font-semibold transition-colors disabled:opacity-50"
              style={{
                fontSize: "0.62rem",
                letterSpacing: "0.16em",
                padding: "0 0.7rem",
                minHeight: 36,
                background: loading ? "var(--panel-hi)" : "var(--orange)",
                color: loading ? "var(--ink-soft)" : "var(--void)",
                border: "1px solid var(--orange)",
              }}
            >
              {loading ? "…" : "Search"}
            </button>
          </div>

          {/* Filter pills (MTG only) */}
          {gameTab === "mtg" && (
            <>
              <span aria-hidden style={{ width: 1, height: 24, background: "var(--rule-hi)" }} />

              <button
                type="button"
                onClick={() => setShowFilters((s) => !s)}
                className="font-mono uppercase font-semibold inline-flex items-center gap-2 transition-colors shrink-0"
                style={{
                  fontSize: "0.64rem",
                  letterSpacing: "0.16em",
                  padding: "0 0.85rem",
                  minHeight: 44,
                  background: showFilters ? "var(--orange-mute)" : "var(--panel)",
                  border: `1px solid ${showFilters ? "var(--orange)" : "var(--rule-hi)"}`,
                  color: showFilters ? "var(--orange)" : "var(--ink-soft)",
                }}
              >
                {showFilters ? "Filters · ON" : "Filters"}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 11, height: 11 }}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Filter expansion (MTG only) — operator grid */}
        {gameTab === "mtg" && showFilters && (
          <div
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6"
            style={{ gap: 1, background: "var(--rule)", border: "1px solid var(--rule)" }}
          >
            {[
              {
                label: "Set Code",
                el: (
                  <input
                    type="text"
                    value={filterSet}
                    onChange={(e) => setFilterSet(e.target.value.toLowerCase())}
                    placeholder="mh3"
                    className="w-full font-mono text-ink placeholder:text-ink-faint focus:outline-none bg-transparent"
                    style={{ fontSize: "0.78rem", padding: "0.4rem 0", border: "none" }}
                  />
                ),
              },
              {
                label: "Color",
                el: (
                  <select
                    value={filterColor}
                    onChange={(e) => setFilterColor(e.target.value)}
                    className="w-full font-mono text-ink focus:outline-none bg-transparent"
                    style={{ fontSize: "0.78rem", padding: "0.4rem 0", border: "none" }}
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
                ),
              },
              {
                label: "Rarity",
                el: (
                  <select
                    value={filterRarity}
                    onChange={(e) => setFilterRarity(e.target.value)}
                    className="w-full font-mono text-ink focus:outline-none bg-transparent"
                    style={{ fontSize: "0.78rem", padding: "0.4rem 0", border: "none" }}
                  >
                    <option value="">Any</option>
                    <option value="common">Common</option>
                    <option value="uncommon">Uncommon</option>
                    <option value="rare">Rare</option>
                    <option value="mythic">Mythic</option>
                  </select>
                ),
              },
              {
                label: "Min $",
                el: (
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={filterMinPrice}
                    onChange={(e) => setFilterMinPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full font-mono text-ink placeholder:text-ink-faint focus:outline-none bg-transparent"
                    style={{ fontSize: "0.78rem", padding: "0.4rem 0", border: "none" }}
                  />
                ),
              },
              {
                label: "Max $",
                el: (
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={filterMaxPrice}
                    onChange={(e) => setFilterMaxPrice(e.target.value)}
                    placeholder="100.00"
                    className="w-full font-mono text-ink placeholder:text-ink-faint focus:outline-none bg-transparent"
                    style={{ fontSize: "0.78rem", padding: "0.4rem 0", border: "none" }}
                  />
                ),
              },
              {
                label: "Format",
                el: (
                  <select
                    value={filterFormat}
                    onChange={(e) => setFilterFormat(e.target.value)}
                    className="w-full font-mono text-ink focus:outline-none bg-transparent"
                    style={{ fontSize: "0.78rem", padding: "0.4rem 0", border: "none" }}
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
                ),
              },
            ].map((f) => (
              <div key={f.label} className="px-3 py-2" style={{ background: "var(--panel-mute)" }}>
                <div
                  className="font-mono uppercase font-semibold text-ink-faint mb-1"
                  style={{ fontSize: "0.55rem", letterSpacing: "0.22em" }}
                >
                  {f.label}
                </div>
                {f.el}
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && !addModal && (
          <div
            className="px-4 py-3 font-mono"
            style={{
              fontSize: "0.78rem",
              background: "var(--red-mute)",
              border: "1px solid var(--red)",
              color: "var(--red)",
            }}
          >
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-12 font-mono text-ink-soft" style={{ letterSpacing: "0.18em", fontSize: "0.7rem", textTransform: "uppercase" }}>
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Searching {gameTab === "mtg" ? "Scryfall" : gameTab === "pokemon" ? "Pokémon TCG" : "YGOPro"}…
          </div>
        )}

        {/* Listings zone — operator console panel */}
        {!loading && (cards.length > 0 || pokemonCards.length > 0) && (
          <section className="ar-zone active relative" style={{ minHeight: 200 }}>
            <div className="ar-zone-head">
              <span>
                Listings ·{" "}
                <b style={{ color: "var(--ink)" }}>
                  {resultCount} of {total.toLocaleString()}
                </b>
              </span>
              <span className="text-ink-faint">{activeGameLabel.toUpperCase()}</span>
            </div>

            {/* Pokemon / Yu-Gi-Oh: rich-row cards (no mana cost / color stripe / foil) */}
            {pokemonCards.length > 0 && (
              <div className="ar-stagger flex flex-col">
                {pokemonCards.map((card: Record<string, unknown>) => {
                  const cardId = String(card.pokemon_id || card.yugioh_id || "");
                  const cardName = String(card.name || "");
                  const setName = String(card.set_name || "");
                  const cardNumber = String(card.number || card.set_code || "");
                  const rarity = (card.rarity as string) || "";
                  const imageUrl = (card.image_url as string) || null;
                  const smallImageUrl = (card.small_image_url as string) || imageUrl;
                  const priceCents =
                    (card.price_market as number) ||
                    (card.price_tcgplayer as number) ||
                    null;

                  return (
                    <div
                      key={cardId}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setAddModal({
                          card: {
                            scryfall_id: cardId,
                            name: cardName,
                            set_name: setName,
                            set_code: "",
                            collector_number: cardNumber,
                            rarity: rarity || "common",
                            price_usd: priceCents
                              ? (priceCents / 100).toFixed(2)
                              : null,
                            price_usd_foil: null,
                            image_url: imageUrl,
                            small_image_url: smallImageUrl,
                            foil: false,
                            nonfoil: true,
                            type_line:
                              gameTab === "pokemon" ? "Pokémon" : "Yu-Gi-Oh",
                            mana_cost: "",
                          },
                          quantity: 1,
                          cost: "",
                          price: priceCents
                            ? (priceCents / 100).toFixed(2)
                            : "",
                          condition: "NM",
                          foil: false,
                        });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          (e.target as HTMLElement).click();
                        }
                      }}
                      className="ar-stripe grid items-center cursor-pointer transition-colors hover:bg-panel"
                      style={{
                        gridTemplateColumns: "56px 1fr 200px 56px",
                        gap: "0.85rem",
                        padding: "0.7rem 1rem",
                        borderBottom: "1px solid var(--rule-faint)",
                        minHeight: 84,
                      }}
                    >
                      {/* Thumb */}
                      <div
                        className="relative flex items-end justify-center font-mono"
                        style={{
                          width: 56,
                          height: 78,
                          background:
                            "linear-gradient(180deg,var(--panel-hi),var(--panel))",
                          border: "1px solid var(--rule-hi)",
                          color: "var(--ink-faint)",
                          fontSize: "0.5rem",
                          letterSpacing: "0.04em",
                          paddingBottom: 3,
                          overflow: "hidden",
                        }}
                      >
                        {smallImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={smallImageUrl}
                            alt={cardName}
                            loading="lazy"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        ) : (
                          <span>{cardNumber || "—"}</span>
                        )}
                      </div>

                      {/* Info */}
                      <div className="min-w-0">
                        <div
                          className="font-display text-ink truncate"
                          style={{ fontSize: "1.05rem", lineHeight: 1.05, fontWeight: 500 }}
                        >
                          {cardName}
                        </div>
                        <div
                          className="font-mono text-ink-faint mt-1 flex flex-wrap items-center gap-2"
                          style={{ fontSize: "0.66rem", letterSpacing: "0.04em" }}
                        >
                          <span
                            className="inline-flex items-center gap-1.5 font-semibold uppercase"
                            style={{
                              padding: "1px 6px",
                              background: "var(--panel)",
                              border: "1px solid var(--rule-hi)",
                              color: "var(--ink-soft)",
                              letterSpacing: "0.08em",
                            }}
                          >
                            <span
                              aria-hidden
                              style={{
                                display: "inline-block",
                                width: 6,
                                height: 6,
                                background: "currentColor",
                                clipPath:
                                  "polygon(50% 0%,100% 38%,82% 100%,18% 100%,0% 38%)",
                              }}
                            />
                            {setName || "—"}
                            {cardNumber ? ` · ${cardNumber}` : ""}
                          </span>
                          {rarity && (
                            <span
                              className={`font-semibold uppercase ${RARITY_TONE[rarity.toLowerCase()] || "text-ink-soft"}`}
                              style={{ letterSpacing: "0.04em" }}
                            >
                              {rarity}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Price */}
                      <div className="text-right font-mono">
                        {priceCents != null ? (
                          <>
                            <div
                              className="text-ink font-semibold flex items-baseline justify-end gap-2"
                              style={{ fontSize: "0.95rem", letterSpacing: "0.02em" }}
                            >
                              ${(priceCents / 100).toFixed(2)}
                              <span
                                aria-hidden
                                style={{
                                  display: "inline-block",
                                  width: 8,
                                  height: 8,
                                  borderRadius: "50%",
                                  background: "var(--teal)",
                                  boxShadow: "0 0 4px var(--teal)",
                                }}
                              />
                            </div>
                            <div className="text-ink-faint mt-1" style={{ fontSize: "0.62rem", letterSpacing: "0.05em" }}>
                              market
                            </div>
                          </>
                        ) : (
                          <span className="text-ink-faint" style={{ fontSize: "0.7rem" }}>
                            no price
                          </span>
                        )}
                      </div>

                      {/* Quick add */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          (e.currentTarget.closest('[role="button"]') as HTMLElement)?.click();
                        }}
                        aria-label={`Add ${cardName} to inventory`}
                        className="inline-flex items-center justify-center transition-colors hover:text-orange"
                        style={{
                          width: 44,
                          height: 44,
                          border: "1px solid var(--rule-hi)",
                          background: "var(--panel)",
                          color: "var(--ink-soft)",
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 16, height: 16 }}>
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* MTG: full rich-rows with mana pips, color identity stripe, foil tag, health dot */}
            {cards.length > 0 && (
              <div className="ar-stagger flex flex-col">
                {cards.map((card) => {
                  const ci = colorIdentityFromMana(card.mana_cost);
                  const pips = parseManaPips(card.mana_cost);
                  const inInv = isInInventory(card);
                  const hasFoil = card.foil && !card.nonfoil;
                  const hasMarket = !!card.price_usd;
                  const rarityLc = (card.rarity || "").toLowerCase();
                  const rarityTone = RARITY_TONE[rarityLc] || "text-ink-soft";

                  return (
                    <div
                      key={`${card.scryfall_id}-${card.set_code}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => can("inventory.adjust") && openAddModal(card)}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && can("inventory.adjust")) {
                          e.preventDefault();
                          openAddModal(card);
                        }
                      }}
                      className="ar-stripe grid items-center cursor-pointer transition-colors hover:bg-panel"
                      style={{
                        gridTemplateColumns:
                          "56px minmax(0, 1fr) 96px 100px 56px",
                        gap: "0.85rem",
                        padding: "0.7rem 1rem",
                        borderBottom: "1px solid var(--rule-faint)",
                        minHeight: 84,
                      }}
                    >
                      {/* Thumb with color identity left stripe */}
                      <div
                        className="relative flex items-end justify-center font-mono"
                        style={{
                          width: 56,
                          height: 78,
                          background:
                            "linear-gradient(180deg,var(--panel-hi),var(--panel))",
                          border: "1px solid var(--rule-hi)",
                          color: "var(--ink-faint)",
                          fontSize: "0.5rem",
                          letterSpacing: "0.04em",
                          paddingBottom: 3,
                          overflow: "hidden",
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: 3,
                            background: `linear-gradient(180deg,var(--m-${ci}),var(--m-${ci}-bg))`,
                          }}
                        />
                        {card.small_image_url || card.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={card.small_image_url || card.image_url || ""}
                            alt={card.name}
                            loading="lazy"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        ) : (
                          <span>{(card.set_code || "").toUpperCase()}</span>
                        )}
                      </div>

                      {/* Info: name + mana pips, set seal + rarity + foil tag */}
                      <div className="min-w-0">
                        <div className="flex items-baseline flex-wrap gap-2">
                          <span
                            className="font-display text-ink truncate"
                            style={{ fontSize: "1.05rem", lineHeight: 1.05, fontWeight: 500, letterSpacing: "0.005em" }}
                          >
                            {card.name}
                          </span>
                          {pips.length > 0 && (
                            <span className="inline-flex gap-0.5">
                              {pips.map((p, i) => {
                                const cls = pipColorClass(p);
                                return (
                                  <span
                                    key={i}
                                    className="inline-flex items-center justify-center font-mono font-bold"
                                    aria-label={`${p} mana`}
                                    style={{
                                      width: 16,
                                      height: 16,
                                      borderRadius: "50%",
                                      fontSize: "0.6rem",
                                      color: `var(--m-${cls})`,
                                      background: `var(--m-${cls}-bg)`,
                                      border: "1px solid rgba(168,173,184,0.2)",
                                    }}
                                  >
                                    {p}
                                  </span>
                                );
                              })}
                            </span>
                          )}
                          {inInv && (
                            <span
                              className="font-mono uppercase font-semibold inline-flex items-center gap-1"
                              style={{
                                padding: "1px 6px",
                                fontSize: "0.55rem",
                                letterSpacing: "0.18em",
                                color: "var(--teal)",
                                background: "var(--teal-mute)",
                                border: "1px solid rgba(94,176,155,0.35)",
                              }}
                            >
                              In stock
                            </span>
                          )}
                        </div>
                        <div
                          className="font-mono text-ink-faint mt-1 flex flex-wrap items-center gap-2"
                          style={{ fontSize: "0.66rem", letterSpacing: "0.04em" }}
                        >
                          {/* Set seal */}
                          <span
                            className="inline-flex items-center gap-1.5 font-semibold uppercase"
                            style={{
                              padding: "1px 6px",
                              background: "var(--panel)",
                              border: "1px solid var(--rule-hi)",
                              color: "var(--ink-soft)",
                              letterSpacing: "0.08em",
                            }}
                          >
                            <span
                              aria-hidden
                              style={{
                                display: "inline-block",
                                width: 6,
                                height: 6,
                                background: "currentColor",
                                clipPath:
                                  "polygon(50% 0%,100% 38%,82% 100%,18% 100%,0% 38%)",
                              }}
                            />
                            {(card.set_code || "").toUpperCase() || "—"} · {card.collector_number || "—"}
                          </span>
                          <span className={`font-semibold uppercase ${rarityTone}`} style={{ letterSpacing: "0.04em" }}>
                            {card.rarity}
                          </span>
                          {card.type_line && (
                            <span className="truncate">{card.type_line}</span>
                          )}
                        </div>
                      </div>

                      {/* Foil tag column */}
                      <div className="flex items-center justify-center">
                        {card.price_usd_foil ? (
                          <span
                            className="font-mono uppercase font-semibold inline-flex items-center"
                            style={{
                              padding: "2px 8px",
                              fontSize: "0.6rem",
                              letterSpacing: "0.18em",
                              color: "var(--yellow)",
                              background: "var(--yellow-mute)",
                              border: "1px solid rgba(251,219,101,0.35)",
                            }}
                          >
                            Foil
                          </span>
                        ) : hasFoil ? (
                          <span
                            className="font-mono uppercase font-semibold inline-flex items-center"
                            style={{
                              padding: "2px 8px",
                              fontSize: "0.6rem",
                              letterSpacing: "0.18em",
                              color: "var(--yellow)",
                              background: "var(--yellow-mute)",
                              border: "1px solid rgba(251,219,101,0.35)",
                            }}
                          >
                            Foil
                          </span>
                        ) : (
                          <span
                            className="font-mono uppercase font-semibold inline-flex items-center"
                            style={{
                              padding: "2px 8px",
                              fontSize: "0.6rem",
                              letterSpacing: "0.18em",
                              color: "var(--ink-soft)",
                              background: "var(--panel)",
                              border: "1px solid var(--rule-hi)",
                            }}
                          >
                            Std
                          </span>
                        )}
                      </div>

                      {/* Pricing */}
                      <div className="text-right font-mono">
                        {hasMarket ? (
                          <>
                            <div
                              className="text-ink font-semibold flex items-baseline justify-end gap-2"
                              style={{ fontSize: "0.95rem", letterSpacing: "0.02em" }}
                            >
                              ${card.price_usd}
                              <span
                                aria-hidden
                                aria-label="market price ok"
                                style={{
                                  display: "inline-block",
                                  width: 8,
                                  height: 8,
                                  borderRadius: "50%",
                                  background: "var(--teal)",
                                  boxShadow: "0 0 4px var(--teal)",
                                }}
                              />
                            </div>
                            <div className="text-ink-faint mt-1" style={{ fontSize: "0.62rem", letterSpacing: "0.05em" }}>
                              market
                            </div>
                            {card.price_usd_foil && (
                              <div className="text-yellow mt-0.5" style={{ fontSize: "0.62rem", letterSpacing: "0.05em" }}>
                                foil ${card.price_usd_foil}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-ink-faint" style={{ fontSize: "0.7rem" }}>
                            no price
                          </span>
                        )}
                      </div>

                      {/* Quick add */}
                      {can("inventory.adjust") && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openAddModal(card);
                          }}
                          aria-label={`${inInv ? "Update" : "Add"} ${card.name}`}
                          className="inline-flex items-center justify-center transition-colors hover:text-orange"
                          style={{
                            width: 44,
                            height: 44,
                            border: `1px solid ${inInv ? "var(--teal)" : "var(--rule-hi)"}`,
                            background: inInv ? "var(--teal-mute)" : "var(--panel)",
                            color: inInv ? "var(--teal)" : "var(--ink-soft)",
                          }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 16, height: 16 }}>
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Empty state — searched but no results */}
        {!loading && searched && cards.length === 0 && pokemonCards.length === 0 && (
          <div
            className="px-6 py-12 text-center"
            style={{
              background: "var(--panel-mute)",
              border: "1px solid var(--rule)",
            }}
          >
            <div
              className="font-display text-ink-faint"
              style={{ fontSize: "1.5rem", letterSpacing: "0.005em" }}
            >
              No cards found
            </div>
            <p className="mt-2 font-mono text-ink-faint" style={{ fontSize: "0.74rem", letterSpacing: "0.06em" }}>
              Try a different search term or relax filters.
            </p>
          </div>
        )}

        {/* Empty state — no search yet */}
        {!loading && !searched && (
          <div
            className="px-6 py-16 text-center"
            style={{
              background: "var(--panel-mute)",
              border: "1px solid var(--rule)",
            }}
          >
            <div
              className="font-display text-ink"
              style={{ fontSize: "1.6rem", letterSpacing: "0.005em" }}
            >
              Search the catalog
            </div>
            <p className="mt-2 font-mono text-ink-faint" style={{ fontSize: "0.74rem", letterSpacing: "0.06em" }}>
              {gameTab === "mtg"
                ? "Scryfall · 80,000+ MTG cards · search by name, set, or collector number"
                : gameTab === "pokemon"
                ? "Pokémon TCG · search by name, set, or number"
                : "YGOPro · search by name"}
            </p>
          </div>
        )}

        {/* Add to Inventory Modal — operator-token cleanup */}
        {addModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: "var(--overlay-bg)" }}
            onClick={() => {
              setAddModal(null);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setAddModal(null);
                setError(null);
              }
            }}
          >
            <div
              className="w-full max-w-lg shadow-2xl"
              style={{
                background: "var(--panel)",
                border: "1px solid var(--rule)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div
                className="flex items-center justify-between px-5"
                style={{
                  background: "var(--slate)",
                  borderBottom: "1px solid var(--rule)",
                  minHeight: 56,
                }}
              >
                <div>
                  <div
                    className="font-mono uppercase font-semibold text-ink-faint"
                    style={{ fontSize: "0.55rem", letterSpacing: "0.28em" }}
                  >
                    Catalog · Add
                  </div>
                  <div
                    className="font-display text-ink mt-0.5"
                    style={{ fontSize: "1.15rem", lineHeight: 1, fontWeight: 600, letterSpacing: "0.005em" }}
                  >
                    Add to Inventory
                  </div>
                </div>
                <button
                  onClick={() => {
                    setAddModal(null);
                    setError(null);
                  }}
                  className="flex items-center justify-center text-ink-soft hover:text-orange transition-colors"
                  style={{ width: 44, height: 44, border: "1px solid var(--rule-hi)", background: "var(--panel-mute)" }}
                  aria-label="Close"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
                    <path d="M6 6l12 12M6 18L18 6" />
                  </svg>
                </button>
              </div>

              {/* Modal body */}
              <div className="p-5">
                <div className="flex gap-4 mb-5">
                  {/* Card image */}
                  {addModal.card.small_image_url && (
                    <div className="shrink-0" style={{ width: 96 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={addModal.card.small_image_url}
                        alt={addModal.card.name}
                        className="w-full"
                        style={{ border: "1px solid var(--rule-hi)" }}
                      />
                    </div>
                  )}

                  {/* Card details */}
                  <div className="flex-1 min-w-0">
                    <div
                      className="font-display text-ink"
                      style={{ fontSize: "1.05rem", lineHeight: 1.1, fontWeight: 500, letterSpacing: "0.005em" }}
                    >
                      {addModal.card.name}
                    </div>
                    <div
                      className="font-mono text-ink-faint mt-1.5 flex flex-wrap gap-x-2 gap-y-1"
                      style={{ fontSize: "0.66rem", letterSpacing: "0.04em" }}
                    >
                      <span>{addModal.card.set_name || "—"}</span>
                      {addModal.card.collector_number && (
                        <span>· #{addModal.card.collector_number}</span>
                      )}
                      <span className={`uppercase font-semibold ${RARITY_TONE[(addModal.card.rarity || "").toLowerCase()] || "text-ink-soft"}`}>
                        · {addModal.card.rarity}
                      </span>
                    </div>
                    {addModal.card.type_line && (
                      <div className="font-mono text-ink-soft mt-1" style={{ fontSize: "0.7rem" }}>
                        {addModal.card.type_line}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-3">
                      {addModal.card.price_usd && (
                        <span className="font-mono text-teal" style={{ fontSize: "0.72rem", letterSpacing: "0.04em" }}>
                          Market ${addModal.card.price_usd}
                        </span>
                      )}
                      {addModal.card.price_usd_foil && (
                        <span className="font-mono text-yellow" style={{ fontSize: "0.72rem", letterSpacing: "0.04em" }}>
                          Foil ${addModal.card.price_usd_foil}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {error && (
                  <div
                    className="mb-3 px-3 py-2 font-mono"
                    style={{
                      fontSize: "0.74rem",
                      background: "var(--red-mute)",
                      border: "1px solid var(--red)",
                      color: "var(--red)",
                    }}
                  >
                    {error}
                  </div>
                )}

                {/* Form grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label
                      className="block font-mono uppercase font-semibold text-ink-faint mb-1.5"
                      style={{ fontSize: "0.55rem", letterSpacing: "0.22em" }}
                    >
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
                      className="w-full font-mono text-ink focus:outline-none"
                      style={{
                        background: "var(--panel-mute)",
                        border: "1px solid var(--rule-hi)",
                        padding: "0 0.85rem",
                        minHeight: 44,
                        fontSize: "0.92rem",
                      }}
                    />
                  </div>

                  <div>
                    <label
                      className="block font-mono uppercase font-semibold text-ink-faint mb-1.5"
                      style={{ fontSize: "0.55rem", letterSpacing: "0.22em" }}
                    >
                      Cost ($)
                    </label>
                    <input
                      type="text"
                      value={addModal.cost}
                      onChange={(e) =>
                        setAddModal({ ...addModal, cost: e.target.value })
                      }
                      onKeyDown={(e) => e.stopPropagation()}
                      className="w-full font-mono text-ink placeholder:text-ink-faint focus:outline-none"
                      placeholder="What you paid"
                      style={{
                        background: "var(--panel-mute)",
                        border: "1px solid var(--rule-hi)",
                        padding: "0 0.85rem",
                        minHeight: 44,
                        fontSize: "0.92rem",
                      }}
                    />
                  </div>

                  <div>
                    <label
                      className="block font-mono uppercase font-semibold text-ink-faint mb-1.5"
                      style={{ fontSize: "0.55rem", letterSpacing: "0.22em" }}
                    >
                      Sell Price ($)
                    </label>
                    <input
                      type="text"
                      value={addModal.price}
                      onChange={(e) =>
                        setAddModal({ ...addModal, price: e.target.value })
                      }
                      onKeyDown={(e) => e.stopPropagation()}
                      className="w-full font-mono text-ink placeholder:text-ink-faint focus:outline-none"
                      placeholder="0.00"
                      style={{
                        background: "var(--panel-mute)",
                        border: "1px solid var(--rule-hi)",
                        padding: "0 0.85rem",
                        minHeight: 44,
                        fontSize: "0.92rem",
                      }}
                    />
                  </div>

                  <div>
                    <label
                      className="block font-mono uppercase font-semibold text-ink-faint mb-1.5"
                      style={{ fontSize: "0.55rem", letterSpacing: "0.22em" }}
                    >
                      Condition
                    </label>
                    <select
                      value={addModal.condition}
                      onChange={(e) =>
                        setAddModal({ ...addModal, condition: e.target.value })
                      }
                      className="w-full font-mono text-ink focus:outline-none"
                      style={{
                        background: "var(--panel-mute)",
                        border: "1px solid var(--rule-hi)",
                        padding: "0 0.85rem",
                        minHeight: 44,
                        fontSize: "0.92rem",
                      }}
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
                <label
                  className="flex items-center gap-2 cursor-pointer mb-5 font-mono uppercase"
                  style={{ fontSize: "0.66rem", letterSpacing: "0.18em", color: "var(--ink-soft)" }}
                >
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
                    style={{
                      width: 18,
                      height: 18,
                      accentColor: "var(--orange)",
                    }}
                  />
                  Foil
                  {addModal.foil && (
                    <span className="text-yellow normal-case" style={{ letterSpacing: "0.04em", fontSize: "0.68rem" }}>
                      · foil pricing applied
                    </span>
                  )}
                </label>

                {/* Actions */}
                <div className="grid grid-cols-2" style={{ gap: 1, background: "var(--rule)", border: "1px solid var(--rule)" }}>
                  <button
                    onClick={() => {
                      setAddModal(null);
                      setError(null);
                    }}
                    className="font-display uppercase transition-colors"
                    style={{
                      minHeight: 56,
                      background: "var(--panel)",
                      color: "var(--ink-soft)",
                      letterSpacing: "0.06em",
                      fontWeight: 500,
                      fontSize: "0.92rem",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAdd}
                    disabled={submitting}
                    className="font-display uppercase transition-colors disabled:opacity-50"
                    style={{
                      minHeight: 56,
                      background: "var(--orange)",
                      color: "var(--void)",
                      letterSpacing: "0.06em",
                      fontWeight: 600,
                      fontSize: "0.95rem",
                    }}
                  >
                    {submitting ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <svg className="animate-spin" viewBox="0 0 24 24" fill="none" style={{ width: 16, height: 16 }}>
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Adding…
                      </span>
                    ) : isInInventory(addModal.card) ? (
                      "Update Stock"
                    ) : (
                      "Add to Inventory"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </FeatureGate>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 px-5 py-3 font-mono uppercase font-semibold animate-in slide-in-from-bottom-4"
          style={{
            background: "var(--teal)",
            color: "var(--void)",
            fontSize: "0.72rem",
            letterSpacing: "0.18em",
            border: "1px solid var(--teal)",
            boxShadow: "0 8px 30px -10px rgba(0,0,0,0.7)",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
