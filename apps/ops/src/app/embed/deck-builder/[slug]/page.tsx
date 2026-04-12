"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import { CardImageLight, PriceTagLight, StockBadge, ConditionBadge } from "@/components/tcg/shared";

/* ------------------------------------------------------------------ */
/*  /embed/deck-builder/[slug] — Embeddable deck builder widget        */
/*                                                                     */
/*  Public, no auth. Light theme (customer-facing).                    */
/*  Embed via iframe on any Shopify or external site:                   */
/*  <iframe src="https://afterroar.store/embed/deck-builder/store-slug" */
/*          width="100%" height="800" frameborder="0"></iframe>         */
/* ------------------------------------------------------------------ */

interface MetaDeck {
  name: string;
  metaShare?: number;
  format: string;
  searchQuery?: string;
  deckUrl?: string;
}

interface InventoryMatch {
  name: string;
  needed: number;
  in_stock: number;
  price_cents: number;
  image_url: string | null;
  status: "available" | "partial" | "unavailable";
  substitute?: { name: string; price_cents: number; reason: string };
  network?: Array<{ store_name: string; city: string | null; state: string | null; quantity: number }>;
}

interface Recommendation {
  type: string;
  name: string;
  reason: string;
  price_cents: number;
  image_url: string | null;
}

const FORMATS = [
  { key: "standard", label: "Standard" },
  { key: "modern", label: "Modern" },
  { key: "pioneer", label: "Pioneer" },
  { key: "commander", label: "Commander" },
  { key: "pokemon", label: "Pokémon" },
];

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function EmbedDeckBuilder() {
  const { slug } = useParams<{ slug: string }>();

  const [format, setFormat] = useState("standard");
  const [storeName, setStoreName] = useState("");
  const [metaDecks, setMetaDecks] = useState<MetaDeck[]>([]);
  const [inventory, setInventory] = useState<InventoryMatch[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [decklistText, setDecklistText] = useState("");
  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [selectedArchetype, setSelectedArchetype] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"meta" | "paste">("meta");

  const api = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch("/api/public/deck-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store: slug, ...body }),
      });
      if (!res.ok) return null;
      return res.json();
    },
    [slug],
  );

  async function loadMeta(fmt: string) {
    setMetaLoading(true);
    setMetaDecks([]);
    setInventory([]);
    setRecommendations([]);
    setSelectedArchetype(null);
    try {
      const data = await api({ action: "suggest", format: fmt });
      if (data?.decks) {
        setMetaDecks(data.decks);
        if (data.store_name) setStoreName(data.store_name);
      }
    } catch {
      // ignore
    } finally {
      setMetaLoading(false);
    }
  }

  // Auto-load meta decks for default format on mount
  useEffect(() => {
    loadMeta(format);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function selectArchetype(archetype: string) {
    setLoading(true);
    setSelectedArchetype(archetype);
    setInventory([]);
    setRecommendations([]);
    try {
      const data = await api({ action: "fetch_deck", archetype, format });
      if (data?.inventory) {
        setInventory(data.inventory);
        setRecommendations(data.recommendations ?? []);
        if (data.store_name) setStoreName(data.store_name);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function checkDecklist() {
    if (!decklistText.trim()) return;
    setLoading(true);
    setInventory([]);
    setRecommendations([]);
    setSelectedArchetype("Custom Decklist");
    try {
      const data = await api({ action: "parse_and_match", decklist: decklistText });
      if (data?.inventory) {
        setInventory(data.inventory);
        setRecommendations(data.recommendations ?? []);
        if (data.store_name) setStoreName(data.store_name);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  // Stats
  const totalCards = inventory.reduce((s, m) => s + m.needed, 0);
  const inStockCards = inventory.filter((m) => m.status === "available").reduce((s, m) => s + m.needed, 0);
  const partialCards = inventory.filter((m) => m.status === "partial").reduce((s, m) => s + Math.min(m.in_stock, m.needed), 0);
  const estimatedTotal = inventory.filter((m) => m.status !== "unavailable").reduce((s, m) => s + m.price_cents * Math.min(m.in_stock, m.needed), 0);

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", maxWidth: 720, margin: "0 auto", padding: 16, color: "#1a1a2e", background: "#ffffff", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #e5e7eb" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Deck Builder</div>
          {storeName && <div style={{ fontSize: 13, color: "#666" }}>Powered by {storeName}</div>}
        </div>
        <div style={{ fontSize: 11, color: "#999", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "#FF8200" }}>&#x2666;</span> afterroar
        </div>
      </div>

      {/* Format tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, overflowX: "auto" }}>
        {FORMATS.map((f) => (
          <button
            key={f.key}
            onClick={() => { setFormat(f.key); loadMeta(f.key); setActiveTab("meta"); }}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "1px solid", fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
              background: format === f.key ? "#FF8200" : "#fff",
              color: format === f.key ? "#fff" : "#666",
              borderColor: format === f.key ? "#FF8200" : "#e5e7eb",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Tab switcher: Meta / Paste */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        <button
          onClick={() => setActiveTab("meta")}
          style={{ padding: "6px 12px", fontSize: 13, fontWeight: 500, borderRadius: 6, border: "none", cursor: "pointer", background: activeTab === "meta" ? "#f3f4f6" : "transparent", color: activeTab === "meta" ? "#1a1a2e" : "#999" }}
        >
          Top Decks
        </button>
        <button
          onClick={() => setActiveTab("paste")}
          style={{ padding: "6px 12px", fontSize: 13, fontWeight: 500, borderRadius: 6, border: "none", cursor: "pointer", background: activeTab === "paste" ? "#f3f4f6" : "transparent", color: activeTab === "paste" ? "#1a1a2e" : "#999" }}
        >
          Paste Decklist
        </button>
      </div>

      {/* Meta decks */}
      {activeTab === "meta" && (
        <div style={{ marginBottom: 16 }}>
          {metaLoading && <div style={{ textAlign: "center", padding: 24, color: "#999" }}>Loading meta...</div>}
          {!metaLoading && metaDecks.length === 0 && (
            <div style={{ textAlign: "center", padding: 24, color: "#999" }}>
              Select a format above to see top decks
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {metaDecks.map((deck) => (
              <button
                key={deck.name}
                onClick={() => selectArchetype(deck.name)}
                disabled={loading}
                style={{
                  padding: "10px 16px", borderRadius: 10, border: "1px solid",
                  cursor: loading ? "wait" : "pointer", textAlign: "left", flex: "1 1 200px", minWidth: 180,
                  background: selectedArchetype === deck.name ? "#FFF7ED" : "#fff",
                  borderColor: selectedArchetype === deck.name ? "#FF8200" : "#e5e7eb",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>{deck.name}</div>
                {deck.metaShare && (
                  <div style={{ fontSize: 12, color: "#FF8200", marginTop: 2 }}>{deck.metaShare.toFixed(1)}% of meta</div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Paste decklist */}
      {activeTab === "paste" && (
        <div style={{ marginBottom: 16 }}>
          <textarea
            value={decklistText}
            onChange={(e) => setDecklistText(e.target.value)}
            placeholder={"4 Lightning Bolt\n4 Monastery Swiftspear\n2 Embercleave\n..."}
            rows={8}
            style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #e5e7eb", fontFamily: "monospace", fontSize: 14, resize: "vertical", boxSizing: "border-box" }}
          />
          <button
            onClick={checkDecklist}
            disabled={loading || !decklistText.trim()}
            style={{ marginTop: 8, padding: "10px 24px", borderRadius: 10, background: "#FF8200", color: "#fff", fontWeight: 600, fontSize: 14, border: "none", cursor: loading ? "wait" : "pointer", opacity: !decklistText.trim() ? 0.4 : 1 }}
          >
            {loading ? "Checking..." : "Check Inventory"}
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && <div style={{ textAlign: "center", padding: 24, color: "#999" }}>Matching against inventory...</div>}

      {/* Results */}
      {!loading && inventory.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
            {selectedArchetype} — Inventory Check
          </div>

          {/* Cards list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {inventory.map((match, i) => (
              <div key={`${match.name}-${i}`}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: match.status === "available" ? "#f0fdf4" : match.status === "partial" ? "#fffbeb" : "#fef2f2",
                }}>
                  {match.image_url && (
                    <CardImageLight src={match.image_url} width={36} height={50} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{match.name}</div>
                    <div style={{ fontSize: 12, color: "#666" }}>
                      Need {match.needed} / Have {match.in_stock}
                    </div>
                  </div>
                  <StockBadge quantity={match.in_stock} needed={match.needed} theme="light" />
                  {match.price_cents > 0 && (
                    <PriceTagLight cents={match.price_cents} size="sm" />
                  )}
                </div>

                {/* Substitute */}
                {match.substitute && match.status !== "available" && (
                  <div style={{ marginLeft: 46, fontSize: 12, padding: "4px 10px", borderRadius: 6, background: "#fffbeb", border: "1px solid #fde68a", marginTop: 2, color: "#92400e" }}>
                    ↳ Try instead: <strong>{match.substitute.name}</strong> — {match.substitute.reason} ({fmt(match.substitute.price_cents)})
                  </div>
                )}

                {/* Network */}
                {match.network && match.network.length > 0 && (
                  <div style={{ marginLeft: 46, fontSize: 12, padding: "4px 10px", borderRadius: 6, background: "#f5f3ff", border: "1px solid #ddd6fe", marginTop: 2, color: "#5b21b6" }}>
                    🌐 Available at: {match.network.map((n, ni) => (
                      <span key={ni}><strong>{n.store_name}</strong>{n.city ? ` (${n.city}${n.state ? `, ${n.state}` : ""})` : ""} ×{n.quantity}{ni < match.network!.length - 1 ? " · " : ""}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Summary */}
          <div style={{ marginTop: 16, padding: 16, borderRadius: 12, background: "#f9fafb", border: "1px solid #e5e7eb" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
              <span style={{ color: "#666" }}>Total cards needed</span>
              <span style={{ fontWeight: 600 }}>{totalCards}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
              <span style={{ color: "#666" }}>Available in store</span>
              <span style={{ fontWeight: 600, color: "#166534" }}>{inStockCards + partialCards}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
              <span style={{ color: "#666" }}>Need to source elsewhere</span>
              <span style={{ fontWeight: 600, color: "#991b1b" }}>{totalCards - inStockCards - partialCards}</span>
            </div>
            <div style={{ borderTop: "1px solid #e5e7eb", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 16 }}>
              <span style={{ fontWeight: 700 }}>Estimated total</span>
              <PriceTagLight cents={estimatedTotal} size="lg" />
            </div>
          </div>

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                You Might Also Need
              </div>
              {recommendations.map((rec, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", marginBottom: 4 }}>
                  {rec.image_url && (
                    <CardImageLight src={rec.image_url} width={32} height={32} />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{rec.name}</div>
                    <div style={{ fontSize: 12, color: "#999" }}>{rec.reason}</div>
                  </div>
                  <PriceTagLight cents={rec.price_cents} size="sm" />
                </div>
              ))}
            </div>
          )}

          {/* CTA */}
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "#999", marginBottom: 8 }}>
              Visit <strong>{storeName || "the store"}</strong> to purchase these cards
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 32, paddingTop: 12, borderTop: "1px solid #f3f4f6", textAlign: "center", fontSize: 11, color: "#ccc" }}>
        Deck Builder by <span style={{ color: "#FF8200" }}>Afterroar</span> Store Ops
      </div>
    </div>
  );
}
