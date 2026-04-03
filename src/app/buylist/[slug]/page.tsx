"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";

/* ------------------------------------------------------------------ */
/*  Public Buylist — /buylist/[store-slug]                              */
/*  Customer-facing page showing what the store is buying + prices.     */
/*  No auth required. Shareable link.                                  */
/*  "Check what we're paying before you walk in."                      */
/* ------------------------------------------------------------------ */

interface BuylistItem {
  id: string;
  name: string;
  game: string;
  set_name: string | null;
  market_price_cents: number;
  offer_nm_cents: number;
  offer_lp_cents: number;
  offer_mp_cents: number;
  current_qty: number;
  velocity_indicator: "hot" | "normal" | "cold";
}

function formatCents(cents: number): string {
  return "$" + (cents / 100).toFixed(2);
}

export default function PublicBuylistPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [storeName, setStoreName] = useState("");
  const [items, setItems] = useState<BuylistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [gameFilter, setGameFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "price" | "offer">("offer");
  const [creditBonus, setCreditBonus] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      try {
        // Get store info
        const storeRes = await fetch(`/api/clock?store=${encodeURIComponent(slug)}`);
        if (!storeRes.ok) { setError("Store not found"); setLoading(false); return; }
        const storeData = await storeRes.json();
        setStoreName(storeData.store.name);

        // Get buylist
        const res = await fetch(`/api/buylist/public?store=${encodeURIComponent(slug)}`);
        if (!res.ok) { setError("Buylist not available"); setLoading(false); return; }
        const data = await res.json();
        setItems(data.buylist || []);
        setCreditBonus(data.credit_bonus_percent || 0);
      } catch {
        setError("Unable to load buylist");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  // Filter and sort
  const games = [...new Set(items.map((i) => i.game))];
  const filtered = items
    .filter((i) => gameFilter === "all" || i.game === gameFilter)
    .filter((i) => !search || i.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "price") return b.market_price_cents - a.market_price_cents;
      return b.offer_nm_cents - a.offer_nm_cents;
    });

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#0a0a1a]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#0a0a1a] p-6">
        <p className="text-lg text-zinc-300">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#0a0a1a] text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 px-4 py-6 text-center">
        <p className="text-xs uppercase tracking-widest text-amber-500/70 font-semibold">{storeName}</p>
        <h1 className="text-2xl font-bold mt-1">What We&apos;re Buying</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Prices update daily. Bring your cards in for an offer.
          {creditBonus > 0 && (
            <span className="block mt-1 text-amber-400">
              +{creditBonus}% bonus when you take store credit!
            </span>
          )}
        </p>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Search + filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cards..."
            className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <select
              value={gameFilter}
              onChange={(e) => setGameFilter(e.target.value)}
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
            >
              <option value="all">All Games</option>
              {games.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "name" | "price" | "offer")}
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
            >
              <option value="offer">Highest Offer</option>
              <option value="price">Market Price</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>

        {/* Results count */}
        <p className="text-xs text-zinc-500">{filtered.length} cards</p>

        {/* Buylist table */}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
            <p className="text-zinc-500">No cards match your search.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900 text-zinc-500 text-left">
                  <th className="px-4 py-3 font-medium">Card</th>
                  <th className="px-4 py-3 font-medium text-right">Market</th>
                  <th className="px-4 py-3 font-medium text-right">NM</th>
                  <th className="px-4 py-3 font-medium text-right">LP</th>
                  <th className="px-4 py-3 font-medium text-right">MP</th>
                  <th className="px-4 py-3 font-medium text-center">Demand</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-900/50 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <span className="text-zinc-100 font-medium">{item.name}</span>
                        {item.set_name && (
                          <span className="block text-[11px] text-zinc-600">{item.set_name} {"\u00B7"} {item.game}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-400 tabular-nums">{formatCents(item.market_price_cents)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-amber-400 tabular-nums">{formatCents(item.offer_nm_cents)}</td>
                    <td className="px-4 py-3 text-right text-zinc-300 tabular-nums">{formatCents(item.offer_lp_cents)}</td>
                    <td className="px-4 py-3 text-right text-zinc-400 tabular-nums">{formatCents(item.offer_mp_cents)}</td>
                    <td className="px-4 py-3 text-center">
                      {item.velocity_indicator === "hot" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-900/30 text-red-400 px-2 py-0.5 text-[10px] font-medium">
                          {"\u{1F525}"} Hot
                        </span>
                      )}
                      {item.velocity_indicator === "cold" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-900/30 text-blue-400 px-2 py-0.5 text-[10px] font-medium">
                          Stocked
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Credit bonus callout */}
        {creditBonus > 0 && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-900/10 p-4 text-center">
            <p className="text-sm text-amber-300">
              Take store credit instead of cash and get <strong>{creditBonus}% more</strong> on every offer!
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-6">
          <p className="text-xs text-zinc-600">
            Prices are estimates based on market data. Final offers may vary based on card condition and current stock.
          </p>
          <p className="text-xs text-zinc-700 mt-2">
            Powered by Afterroar Store Ops
          </p>
        </div>
      </div>
    </div>
  );
}
