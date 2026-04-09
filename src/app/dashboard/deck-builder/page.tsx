"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { FeatureGate } from "@/components/feature-gate";
import { formatCents } from "@/lib/types";
import { CardImage, StockBadge, PriceTag } from "@/components/tcg/shared";
import { FormatSelector } from "@/components/deck-builder/format-selector";
import { InventoryCard } from "@/components/deck-builder/inventory-card";
import { DeckSummary } from "@/components/deck-builder/deck-summary";
import { Recommendations as RecommendationsPanel } from "@/components/deck-builder/recommendations";
import { MetaArchetypes } from "@/components/deck-builder/meta-archetypes";
import { DeckBuilderEmptyState } from "@/components/deck-builder/empty-state";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface DeckCard {
  name: string;
  mana_cost: string | null;
  type_line: string;
  image_url: string | null;
  price_cents: number | null;
  set_name: string | null;
  rarity: string | null;
}

interface ParsedCard {
  quantity: number;
  name: string;
}

interface InventoryMatch {
  name: string;
  needed: number;
  in_stock: number;
  price_cents: number;
  inventory_item_id: string | null;
  image_url: string | null;
  status: "available" | "partial" | "unavailable";
  substitute?: {
    name: string;
    price_cents: number;
    inventory_item_id: string;
    image_url: string | null;
    reason: string;
  };
  network?: Array<{
    store_name: string;
    store_slug: string;
    city: string | null;
    state: string | null;
    quantity: number;
  }>;
}

interface LiveMetaResult {
  name: string;
  metaShare: number;
  format: string;
  deckUrl?: string;
}

interface CommanderSearchResult {
  name: string;
  color_identity: string[];
  image_url: string | null;
  type_line: string;
}

interface EDHRECCard {
  name: string;
  synergy: number;
  num_decks: number;
  potential_decks: number;
  category: string;
}

interface CommanderDeckResult {
  commander_name: string;
  num_decks: number;
  avg_price: number;
  color_identity: string[];
  synergy_cards: EDHRECCard[];
  inventory_matches: InventoryMatch[];
  substitutions: Array<{
    missing_card: string;
    substitute: string;
    substitute_synergy: number;
    in_stock: boolean;
  }>;
}

interface PokemonMetaDeck {
  archetype: string;
  placing: number;
  tournament_name: string;
  cards: Array<{ name: string; quantity: number; category: string }>;
}

/* ------------------------------------------------------------------ */
/*  Color identity helpers                                              */
/* ------------------------------------------------------------------ */

const COLOR_MAP: Record<string, { bg: string; text: string; label: string }> = {
  W: { bg: "bg-yellow-100", text: "text-yellow-800", label: "W" },
  U: { bg: "bg-blue-500/30", text: "text-blue-300", label: "U" },
  B: { bg: "bg-gray-600/50", text: "text-gray-200", label: "B" },
  R: { bg: "bg-red-500/30", text: "text-red-300", label: "R" },
  G: { bg: "bg-green-500/30", text: "text-green-300", label: "G" },
};

function ColorPips({ colors }: { colors: string[] }) {
  if (!colors || colors.length === 0) return null;
  return (
    <span className="inline-flex gap-0.5 ml-1">
      {colors.map((c) => {
        const info = COLOR_MAP[c];
        if (!info) return null;
        return (
          <span
            key={c}
            className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${info.bg} ${info.text}`}
          >
            {info.label}
          </span>
        );
      })}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Formats                                                             */
/* ------------------------------------------------------------------ */

const FORMATS = [
  { key: "standard", label: "MTG — Standard", game: "mtg" },
  { key: "modern", label: "MTG — Modern", game: "mtg" },
  { key: "pioneer", label: "MTG — Pioneer", game: "mtg" },
  { key: "commander", label: "MTG — Commander", game: "mtg" },
  { key: "pokemon", label: "Pokemon TCG", game: "pokemon" },
  { key: "yugioh", label: "Yu-Gi-Oh!", game: "yugioh" },
] as const;

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

function DeckBuilderContent() {
  const router = useRouter();

  // State
  const [format, setFormat] = useState("standard");
  const [searchQuery, setSearchQuery] = useState("");
  const [decklistText, setDecklistText] = useState("");
  const [searchResults, setSearchResults] = useState<DeckCard[]>([]);
  const [parsedCards, setParsedCards] = useState<ParsedCard[]>([]);
  const [inventoryResults, setInventoryResults] = useState<InventoryMatch[]>([]);
  const [metaDecks, setMetaDecks] = useState<LiveMetaResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [matchLoading, setMatchLoading] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [recommendations, setRecommendations] = useState<Array<{ type: string; name: string; reason: string; price_cents: number; inventory_item_id: string; image_url: string | null }>>([]);
  const [metaLoading, setMetaLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"search" | "paste">("search");

  // Commander state
  const [commanderQuery, setCommanderQuery] = useState("");
  const [commanderResults, setCommanderResults] = useState<CommanderSearchResult[]>([]);
  const [commanderData, setCommanderData] = useState<CommanderDeckResult | null>(null);
  const [commanderLoading, setCommanderLoading] = useState(false);
  const [commanderSearchLoading, setCommanderSearchLoading] = useState(false);

  // Pokemon state
  const [pokemonDecks, setPokemonDecks] = useState<PokemonMetaDeck[]>([]);
  const [pokemonLoading, setPokemonLoading] = useState(false);

  const currentFormat = FORMATS.find((f) => f.key === format);
  const isCommander = format === "commander";
  const isPokemon = format === "pokemon";
  const isYugioh = format === "yugioh";

  // Fetch meta deck suggestions
  const loadSuggestions = useCallback(async (fmt: string) => {
    const fmtInfo = FORMATS.find((f) => f.key === fmt);
    if (!fmtInfo) return;

    if (fmt === "pokemon") {
      setPokemonLoading(true);
      try {
        const res = await fetch("/api/deck-builder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "pokemon_meta" }),
        });
        if (res.ok) {
          const data = await res.json();
          setPokemonDecks(data.decks ?? []);
        }
      } catch {
        // ignore
      } finally {
        setPokemonLoading(false);
      }
      return;
    }

    if (fmt === "commander" || fmt === "yugioh") {
      setMetaDecks([]);
      return;
    }

    setMetaLoading(true);
    try {
      const res = await fetch("/api/deck-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "meta", format: fmt, game: fmtInfo.game }),
      });
      if (res.ok) {
        const data = await res.json();
        setMetaDecks(data.archetypes ?? []);
      }
    } catch {
      // ignore
    } finally {
      setMetaLoading(false);
    }
  }, []);

  // Load suggestions on format change
  const handleFormatChange = useCallback(
    (fmt: string) => {
      setFormat(fmt);
      setSearchResults([]);
      setInventoryResults([]);
      setParsedCards([]);
      setCommanderData(null);
      setCommanderResults([]);
      setPokemonDecks([]);
      setMetaDecks([]);
      loadSuggestions(fmt);
    },
    [loadSuggestions],
  );

  // Initial load
  useEffect(() => {
    loadSuggestions("standard");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search Scryfall for cards
  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setInventoryResults([]);
    try {
      const res = await fetch("/api/deck-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "search",
          query: searchQuery.trim(),
          format: format !== "other" && format !== "yugioh" && format !== "pokemon" ? format : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.cards ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  // Fetch a real tournament decklist for an archetype
  async function handleFetchDeck(archetype: string) {
    setLoading(true);
    setInventoryResults([]);
    try {
      const res = await fetch("/api/deck-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fetch_deck",
          archetype,
          format,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const cards: ParsedCard[] = data.cards ?? [];
        setParsedCards(cards);
        if (data.inventory) {
          setInventoryResults(data.inventory);
        }
        if (data.recommendations) {
          setRecommendations(data.recommendations);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  // Commander search
  async function handleCommanderSearch() {
    if (!commanderQuery.trim()) return;
    setCommanderSearchLoading(true);
    try {
      const res = await fetch("/api/deck-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "commander_search", query: commanderQuery.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setCommanderResults(data.commanders ?? []);
      }
    } catch {
      // ignore
    } finally {
      setCommanderSearchLoading(false);
    }
  }

  // Select a commander and fetch EDHREC data
  async function handleSelectCommander(name: string) {
    setCommanderLoading(true);
    setCommanderResults([]);
    setInventoryResults([]);
    try {
      const res = await fetch("/api/deck-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "commander", commander: name }),
      });
      if (res.ok) {
        const data: CommanderDeckResult = await res.json();
        setCommanderData(data);
        setInventoryResults(data.inventory_matches);
      }
    } catch {
      // ignore
    } finally {
      setCommanderLoading(false);
    }
  }

  // Parse pasted decklist text
  async function handleParseDeck() {
    if (!decklistText.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/deck-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "parse", decklist: decklistText }),
      });
      if (res.ok) {
        const data = await res.json();
        const cards: ParsedCard[] = data.cards ?? [];
        setParsedCards(cards);
        if (cards.length > 0) {
          await checkInventory(cards);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  // Add search results to parsed list and check inventory
  async function handleCheckSearchResults() {
    if (searchResults.length === 0) return;
    const cards: ParsedCard[] = searchResults.map((c) => ({
      quantity: 1,
      name: c.name,
    }));
    setParsedCards(cards);
    await checkInventory(cards);
  }

  // Match cards against store inventory
  async function checkInventory(cards: ParsedCard[]) {
    setMatchLoading(true);
    try {
      const res = await fetch("/api/deck-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "match", cards, format, in_stock_only: inStockOnly }),
      });
      if (res.ok) {
        const data = await res.json();
        setInventoryResults(data.results ?? []);
        setRecommendations(data.recommendations ?? []);
      }
    } catch {
      // ignore
    } finally {
      setMatchLoading(false);
    }
  }

  // Add a single card to register cart via localStorage
  function addToCart(match: InventoryMatch) {
    if (!match.inventory_item_id || match.in_stock <= 0) return;
    const qty = Math.min(match.needed, match.in_stock);
    const existing = getDeckBuilderCart();
    const idx = existing.findIndex(
      (c) => c.inventory_item_id === match.inventory_item_id,
    );
    if (idx >= 0) {
      existing[idx].quantity += qty;
    } else {
      existing.push({
        inventory_item_id: match.inventory_item_id,
        name: match.name,
        price_cents: match.price_cents,
        quantity: qty,
        image_url: match.image_url,
      });
    }
    localStorage.setItem("deck-builder-cart", JSON.stringify(existing));
  }

  // Add all available to register cart and navigate
  function addAllToCart() {
    const items = inventoryResults
      .filter((m) => m.status !== "unavailable" && m.inventory_item_id)
      .map((m) => ({
        inventory_item_id: m.inventory_item_id,
        name: m.name,
        price_cents: m.price_cents,
        quantity: Math.min(m.needed, m.in_stock),
        image_url: m.image_url,
      }));

    if (items.length === 0) return;
    localStorage.setItem("deck-builder-cart", JSON.stringify(items));
    router.push("/dashboard/register");
  }

  // Summary stats
  const totalCards = inventoryResults.reduce((s, m) => s + m.needed, 0);
  const inStockCards = inventoryResults.reduce(
    (s, m) => s + Math.min(m.needed, m.in_stock),
    0,
  );
  const needToOrder = totalCards - inStockCards;
  const estimatedTotal = inventoryResults
    .filter((m) => m.status !== "unavailable")
    .reduce((s, m) => s + m.price_cents * Math.min(m.needed, m.in_stock), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Deck Builder" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ---- Left Panel: Deck Building ---- */}
        <div className="space-y-4">
          {/* Format selector — grouped by game */}
          <FormatSelector value={format} onChange={handleFormatChange} />

          {/* ---- Commander Tab ---- */}
          {isCommander && (
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-muted uppercase tracking-wider">
                Search Commanders
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={commanderQuery}
                  onChange={(e) => setCommanderQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCommanderSearch();
                  }}
                  placeholder="Search for a commander (e.g. Yuriko)..."
                  className="flex-1 rounded-xl border border-input-border bg-input-bg px-4 py-2.5 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  style={{ fontSize: 16 }}
                />
                <button
                  onClick={handleCommanderSearch}
                  disabled={commanderSearchLoading || !commanderQuery.trim()}
                  className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  {commanderSearchLoading ? "..." : "Search"}
                </button>
              </div>

              {/* Commander search results */}
              {commanderResults.length > 0 && (
                <div className="max-h-72 overflow-y-auto space-y-1.5 rounded-xl border border-card-border bg-card p-2 scroll-visible">
                  {commanderResults.map((cmdr) => (
                    <button
                      key={cmdr.name}
                      onClick={() => handleSelectCommander(cmdr.name)}
                      className="w-full flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-card-hover transition-colors text-left"
                      style={{ minHeight: "auto" }}
                    >
                      {cmdr.image_url && (
                        <CardImage src={cmdr.image_url} size="sm" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">
                          {cmdr.name}
                          <ColorPips colors={cmdr.color_identity} />
                        </div>
                        <div className="text-xs text-muted truncate">
                          {cmdr.type_line}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {commanderLoading && (
                <div className="flex flex-col items-center justify-center h-24 text-muted gap-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-4 w-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                    Loading EDHREC synergy data...
                  </div>
                  <span className="text-xs opacity-60">This can take 5-10 seconds for popular commanders</span>
                </div>
              )}

              {/* Commander synergy cards */}
              {commanderData && !commanderLoading && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-card-border bg-card p-3 space-y-1">
                    <div className="text-base font-bold text-foreground">
                      {commanderData.commander_name}
                      <ColorPips colors={commanderData.color_identity} />
                    </div>
                    <div className="flex gap-4 text-xs text-muted">
                      <span>{commanderData.num_decks.toLocaleString()} decks on EDHREC</span>
                      <span>Avg ${commanderData.avg_price.toFixed(0)}</span>
                    </div>
                  </div>

                  <label className="block text-sm font-semibold text-muted uppercase tracking-wider">
                    Top Synergy Cards ({commanderData.synergy_cards.length})
                  </label>
                  <div className="max-h-80 overflow-y-auto space-y-1 rounded-xl border border-card-border bg-card p-2 scroll-visible">
                    {commanderData.synergy_cards.slice(0, 30).map((card, i) => (
                      <div
                        key={`${card.name}-${i}`}
                        className="flex items-center gap-3 rounded-lg px-3 py-1.5 hover:bg-card-hover transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">
                            {card.name}
                          </div>
                          <div className="text-xs text-muted">
                            {card.category}
                          </div>
                        </div>
                        <div className="shrink-0 text-xs font-mono">
                          <span className={card.synergy > 0 ? "text-green-400" : "text-muted"}>
                            {card.synergy > 0 ? "+" : ""}{(card.synergy * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="shrink-0 text-xs text-muted">
                          {card.num_decks.toLocaleString()} decks
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Substitution suggestions */}
                  {commanderData.substitutions.length > 0 && (
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-muted uppercase tracking-wider">
                        In-Stock Substitutions
                      </label>
                      <div className="space-y-1 rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-2">
                        {commanderData.substitutions.map((sub, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 text-sm px-2 py-1"
                          >
                            <span className="text-red-400 line-through truncate flex-1">
                              {sub.missing_card}
                            </span>
                            <span className="text-muted shrink-0">{"->"}</span>
                            <span className="text-green-400 truncate flex-1">
                              {sub.substitute}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ---- Pokemon Tab ---- */}
          {isPokemon && (
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-muted uppercase tracking-wider">
                Recent Tournament Decks
              </label>
              {pokemonLoading && (
                <div className="flex items-center justify-center h-24 text-muted">
                  Loading tournament data...
                </div>
              )}
              {!pokemonLoading && pokemonDecks.length === 0 && (
                <div className="text-sm text-muted p-4 text-center rounded-xl border border-card-border bg-card">
                  No tournament data available. Try again later.
                </div>
              )}
              {pokemonDecks.length > 0 && (
                <div className="space-y-2 max-h-[28rem] overflow-y-auto scroll-visible">
                  {pokemonDecks.map((deck, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-card-border bg-card p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-bold text-foreground">
                            {deck.archetype}
                          </div>
                          <div className="text-xs text-muted">
                            {deck.tournament_name} — #{deck.placing}
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const cards: ParsedCard[] = deck.cards.map((c) => ({
                              quantity: c.quantity,
                              name: c.name,
                            }));
                            setParsedCards(cards);
                            checkInventory(cards);
                          }}
                          className="rounded-lg bg-accent/20 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/30 transition-colors"
                          style={{ minHeight: "auto" }}
                        >
                          Check Inventory
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {deck.cards
                          .filter((c) => c.category === "pokemon")
                          .slice(0, 6)
                          .map((c, j) => (
                            <span
                              key={j}
                              className="rounded border border-card-border bg-card-hover px-2 py-0.5 text-xs text-foreground"
                            >
                              {c.quantity}x {c.name}
                            </span>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Still allow pasting a Pokemon decklist */}
              <div className="pt-2 border-t border-card-border space-y-2">
                <label className="block text-sm font-semibold text-muted uppercase tracking-wider">
                  Paste Decklist
                </label>
                <textarea
                  value={decklistText}
                  onChange={(e) => setDecklistText(e.target.value)}
                  placeholder={`Paste Pokemon decklist here...\n\n4 Charizard ex\n2 Arcanine\n4 Professor's Research`}
                  rows={6}
                  className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-3 text-foreground placeholder:text-muted focus:border-accent focus:outline-none font-mono text-sm"
                />
                <button
                  onClick={handleParseDeck}
                  disabled={loading || !decklistText.trim()}
                  className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  {loading ? "Parsing..." : "Parse & Check Inventory"}
                </button>
              </div>
            </div>
          )}

          {/* ---- MTG Competitive + Yu-Gi-Oh (search + paste) ---- */}
          {!isCommander && !isPokemon && (
            <>
              {/* Meta deck suggestions — live data */}
              <MetaArchetypes
                decks={metaDecks}
                loading={metaLoading}
                onSelect={handleFetchDeck}
              />

              {/* Tab: Search vs Paste */}
              <div className="flex gap-1 bg-card-hover rounded-xl p-1">
                <button
                  onClick={() => setActiveTab("search")}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                    activeTab === "search"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                  style={{ minHeight: "auto" }}
                >
                  Search Cards
                </button>
                <button
                  onClick={() => setActiveTab("paste")}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                    activeTab === "paste"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                  style={{ minHeight: "auto" }}
                >
                  Paste Decklist
                </button>
              </div>

              {activeTab === "search" ? (
                <div className="space-y-3">
                  {/* Search input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSearch();
                      }}
                      placeholder={
                        isYugioh
                          ? "Search Yu-Gi-Oh cards..."
                          : "Search cards (e.g. red creature cmc<=3)..."
                      }
                      className="flex-1 rounded-xl border border-input-border bg-input-bg px-4 py-2.5 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                      style={{ fontSize: 16 }}
                    />
                    <button
                      onClick={handleSearch}
                      disabled={loading || !searchQuery.trim()}
                      className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
                    >
                      {loading ? "..." : "Search"}
                    </button>
                  </div>

                  {/* Search results */}
                  {searchResults.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted">
                          {searchResults.length} cards found
                        </span>
                        <button
                          onClick={handleCheckSearchResults}
                          disabled={matchLoading}
                          className="rounded-lg bg-accent/20 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/30 transition-colors"
                          style={{ minHeight: "auto" }}
                        >
                          {matchLoading ? "Checking..." : "Check Inventory"}
                        </button>
                      </div>
                      <div className="max-h-96 overflow-y-auto space-y-1.5 rounded-xl border border-card-border bg-card p-2 scroll-visible">
                        {searchResults.map((card, i) => (
                          <div
                            key={`${card.name}-${i}`}
                            className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-card-hover transition-colors"
                          >
                            {card.image_url && (
                              <CardImage src={card.image_url} size="sm" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-foreground truncate">
                                {card.name}
                              </div>
                              <div className="text-xs text-muted truncate">
                                {card.type_line}
                                {card.mana_cost && (
                                  <span className="ml-2 opacity-70">
                                    {card.mana_cost}
                                  </span>
                                )}
                              </div>
                            </div>
                            {card.price_cents != null && (
                              <PriceTag cents={card.price_cents} size="sm" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Paste decklist */}
                  <textarea
                    value={decklistText}
                    onChange={(e) => setDecklistText(e.target.value)}
                    placeholder={`Paste decklist here:\n\n4 Lightning Bolt\n4 Monastery Swiftspear\n2 Embercleave\n20 Mountain`}
                    rows={12}
                    className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-3 text-foreground placeholder:text-muted focus:border-accent focus:outline-none font-mono text-sm"
                  />
                  <button
                    onClick={handleParseDeck}
                    disabled={loading || !decklistText.trim()}
                    className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
                  >
                    {loading ? "Parsing..." : "Parse & Check Inventory"}
                  </button>

                  {/* Parsed cards preview */}
                  {parsedCards.length > 0 && !inventoryResults.length && (
                    <div className="rounded-xl border border-card-border bg-card p-3">
                      <div className="text-sm font-semibold text-muted mb-2">
                        Parsed: {parsedCards.length} unique cards,{" "}
                        {parsedCards.reduce((s, c) => s + c.quantity, 0)} total
                      </div>
                      <div className="space-y-1 max-h-48 overflow-y-auto scroll-visible">
                        {parsedCards.map((c, i) => (
                          <div
                            key={i}
                            className="flex justify-between text-sm text-foreground px-2 py-1"
                          >
                            <span>{c.name}</span>
                            <span className="text-muted font-mono">
                              x{c.quantity}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ---- Right Panel: Inventory Match Results ---- */}
        <div className="space-y-4">
          {matchLoading && (
            <div className="flex items-center justify-center h-32 text-muted">
              Checking store inventory...
            </div>
          )}

          {inventoryResults.length > 0 && (
            <>
              <div className="text-sm font-semibold text-muted uppercase tracking-wider">
                Inventory Match
              </div>

              <div className="space-y-3 max-h-[32rem] overflow-y-auto pr-1 scroll-visible">
                {inventoryResults.map((match, i) => (
                  <InventoryCard
                    key={`${match.name}-${i}`}
                    match={match}
                    onAddToCart={() => addToCart(match)}
                    onAddSubstitute={
                      match.substitute
                        ? () =>
                            addToCart({
                              name: match.substitute!.name,
                              needed: match.needed - match.in_stock,
                              in_stock: 1,
                              price_cents: match.substitute!.price_cents,
                              inventory_item_id: match.substitute!.inventory_item_id,
                              image_url: match.substitute!.image_url,
                              status: "available",
                            })
                        : undefined
                    }
                  />
                ))}
              </div>

              {/* In Stock Only toggle */}
              <div className="flex items-center justify-between rounded-xl border border-card-border bg-card px-4 py-2.5">
                <span className="text-sm text-muted">Show only in-stock cards</span>
                <button
                  onClick={() => {
                    setInStockOnly(!inStockOnly);
                    // Re-run inventory match with the new setting
                    if (parsedCards.length > 0) {
                      checkInventory(parsedCards);
                    }
                  }}
                  className={`relative w-10 h-5 rounded-full transition-colors ${inStockOnly ? "bg-accent" : "bg-card-hover border border-card-border"}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${inStockOnly ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>

              {/* Summary — sticky at bottom */}
              <DeckSummary
                totalCards={totalCards}
                inStockCards={inStockCards}
                needToOrder={needToOrder}
                estimatedTotal={estimatedTotal}
                onAddAllToCart={addAllToCart}
              />

              {/* Recommendations carousel */}
              <RecommendationsPanel
                items={recommendations}
                onAdd={(rec) => {
                  const cartItems = [{ inventory_item_id: rec.inventory_item_id, name: rec.name, price_cents: rec.price_cents, quantity: 1 }];
                  const existing = localStorage.getItem("deck-builder-cart");
                  const merged = existing ? [...JSON.parse(existing), ...cartItems] : cartItems;
                  localStorage.setItem("deck-builder-cart", JSON.stringify(merged));
                  setRecommendations((prev) => prev.filter((r) => r.inventory_item_id !== rec.inventory_item_id));
                }}
              />
            </>
          )}

          {!matchLoading && inventoryResults.length === 0 && (
            <DeckBuilderEmptyState format={format} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helper: get deck-builder cart from localStorage                     */
/* ------------------------------------------------------------------ */

interface DeckBuilderCartItem {
  inventory_item_id: string | null;
  name: string;
  price_cents: number;
  quantity: number;
  image_url: string | null;
}

function getDeckBuilderCart(): DeckBuilderCartItem[] {
  try {
    const raw = localStorage.getItem("deck-builder-cart");
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

/* ------------------------------------------------------------------ */
/*  Page Export — wrapped in FeatureGate                                */
/* ------------------------------------------------------------------ */

export default function DeckBuilderPage() {
  return (
    <FeatureGate module="tcg_engine">
      <DeckBuilderContent />
    </FeatureGate>
  );
}
