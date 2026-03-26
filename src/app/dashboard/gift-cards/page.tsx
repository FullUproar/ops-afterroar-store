"use client";

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store-context";
import { formatCents, parseDollars } from "@/lib/types";

interface GiftCard {
  id: string;
  code: string;
  balance_cents: number;
  initial_balance_cents: number;
  active: boolean;
  created_at: string;
}

interface GiftCardDetail extends GiftCard {
  history: Array<{
    id: string;
    type: string;
    amount_cents: number;
    description: string;
    created_at: string;
  }>;
}

export default function GiftCardsPage() {
  const { can } = useStore();
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createAmount, setCreateAmount] = useState("");
  const [creating, setCreating] = useState(false);

  // Detail modal
  const [detail, setDetail] = useState<GiftCardDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadCards = useCallback(async () => {
    try {
      const url = search
        ? `/api/gift-cards?q=${encodeURIComponent(search)}`
        : "/api/gift-cards";
      const res = await fetch(url);
      if (res.ok) {
        setCards(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => loadCards(), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [loadCards, search]);

  async function handleCreate() {
    if (creating || !createAmount) return;
    setCreating(true);
    try {
      const res = await fetch("/api/gift-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_cents: parseDollars(createAmount) }),
      });
      if (res.ok) {
        setShowCreate(false);
        setCreateAmount("");
        loadCards();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to create gift card");
      }
    } finally {
      setCreating(false);
    }
  }

  async function viewDetail(code: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/gift-cards/${encodeURIComponent(code)}`);
      if (res.ok) {
        setDetail(await res.json());
      }
    } finally {
      setDetailLoading(false);
    }
  }

  function maskCode(code: string): string {
    if (code.length <= 8) return code;
    return code.slice(0, 4) + "-****-****-" + code.slice(-4);
  }

  if (!can("customers.edit")) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-zinc-500">You don&apos;t have permission to manage gift cards.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Gift Cards</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          Create Gift Card
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by card code..."
        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
      />

      {/* Cards list */}
      {loading ? (
        <p className="text-zinc-400 text-center py-12">Loading gift cards...</p>
      ) : cards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 p-12 text-center">
          <p className="text-zinc-400">
            {search ? "No gift cards match your search." : "No gift cards yet."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900 text-left text-zinc-400">
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium text-right">Balance</th>
                <th className="px-4 py-3 font-medium text-right">Original</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {cards.map((card) => (
                <tr key={card.id} className="bg-zinc-950 hover:bg-zinc-900/50 transition-colors">
                  <td className="px-4 py-3 text-white font-mono text-xs">
                    {maskCode(card.code)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    <span
                      className={
                        card.balance_cents > 0 ? "text-emerald-400" : "text-zinc-500"
                      }
                    >
                      {formatCents(card.balance_cents)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-400 font-mono">
                    {formatCents(card.initial_balance_cents)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        card.active
                          ? "bg-green-900/50 text-green-400"
                          : "bg-zinc-800 text-zinc-500"
                      }`}
                    >
                      {card.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {new Date(card.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => viewDetail(card.code)}
                      className="rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white mb-4">Create Gift Card</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-zinc-500">$</span>
                <input
                  type="text"
                  value={createAmount}
                  onChange={(e) => setCreateAmount(e.target.value)}
                  placeholder="25.00"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 pl-7 pr-4 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 rounded-lg border border-zinc-700 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !createAmount}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {(detail || detailLoading) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setDetail(null)}
        >
          <div
            className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading && !detail ? (
              <p className="text-zinc-400">Loading...</p>
            ) : detail ? (
              <>
                <h2 className="text-lg font-bold text-white mb-1">Gift Card Detail</h2>
                <div className="mb-4 space-y-2">
                  <div className="text-sm">
                    <span className="text-zinc-400">Code: </span>
                    <span className="text-white font-mono">{detail.code}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-zinc-400">Balance: </span>
                    <span className="text-emerald-400 font-mono font-medium">
                      {formatCents(detail.balance_cents)}
                    </span>
                    <span className="text-zinc-500 ml-2">
                      of {formatCents(detail.initial_balance_cents)}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-zinc-400">Status: </span>
                    <span className={detail.active ? "text-green-400" : "text-zinc-500"}>
                      {detail.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>

                <h3 className="text-sm font-semibold text-zinc-300 mb-2">Transaction History</h3>
                {detail.history?.length === 0 ? (
                  <p className="text-sm text-zinc-500">No transactions yet.</p>
                ) : (
                  <div className="space-y-1">
                    {detail.history?.map((h) => (
                      <div
                        key={h.id}
                        className="flex justify-between text-sm rounded-md bg-zinc-950 px-3 py-2"
                      >
                        <div>
                          <div className="text-zinc-300">{h.description}</div>
                          <div className="text-xs text-zinc-500">
                            {new Date(h.created_at).toLocaleString()}
                          </div>
                        </div>
                        <div
                          className={`font-mono ${
                            h.amount_cents >= 0 ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {h.amount_cents >= 0 ? "+" : ""}
                          {formatCents(h.amount_cents)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setDetail(null)}
                  className="mt-4 w-full rounded-lg border border-zinc-700 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  Close
                </button>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
