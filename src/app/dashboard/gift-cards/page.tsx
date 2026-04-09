"use client";

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store-context";
import { formatCents, parseDollars } from "@/lib/types";
import { PageHeader } from "@/components/page-header";

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

  const [detailError, setDetailError] = useState<string | null>(null);

  async function viewDetail(code: string) {
    setDetailLoading(true);
    setDetail(null);
    setDetailError(null);
    try {
      const res = await fetch(`/api/gift-cards/${encodeURIComponent(code)}`);
      if (res.ok) {
        setDetail(await res.json());
      } else {
        setDetailError("Failed to load gift card details");
      }
    } catch {
      setDetailError("Network error loading gift card");
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
        <p className="text-muted">You don&apos;t have permission to manage gift cards.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gift Cards"
        action={
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-foreground hover:opacity-90 transition-colors"
          >
            Create Gift Card
          </button>
        }
      />

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by card code..."
        className="w-full rounded-xl border border-card-border bg-card px-4 py-3 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
      />

      {/* Cards list */}
      {loading ? (
        <p className="text-muted text-center py-12">Loading gift cards...</p>
      ) : cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-card-border bg-card/50 p-12 text-center">
          <p className="text-muted">
            {search ? "No gift cards match your search." : "No gift cards yet."}
          </p>
          {!search && (
            <button
              onClick={() => setShowCreate(true)}
              className="mt-3 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-foreground hover:opacity-90 transition-colors"
            >
              Create Your First Gift Card
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="md:hidden space-y-2">
            {cards.map((card) => (
              <button
                key={card.id}
                onClick={() => viewDetail(card.code)}
                className="w-full rounded-xl border border-card-border bg-card p-3 text-left min-h-11 active:bg-card-hover"
              >
                <div className="flex items-center justify-between">
                  <span className="text-foreground font-mono text-xs">{maskCode(card.code)}</span>
                  <span
                    className={`font-mono font-medium ${
                      card.balance_cents > 0 ? "text-emerald-400" : "text-muted"
                    }`}
                  >
                    {formatCents(card.balance_cents)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted">
                  <span>{card.active ? "Active" : "Inactive"}</span>
                  <span>of {formatCents(card.initial_balance_cents)}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-card-border scroll-visible">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-card text-left text-muted">
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
                  <tr key={card.id} className="bg-background hover:bg-card-hover transition-colors">
                    <td className="px-4 py-3 text-foreground font-mono text-xs">
                      {maskCode(card.code)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      <span
                        className={
                          card.balance_cents > 0 ? "text-emerald-400" : "text-muted"
                        }
                      >
                        {formatCents(card.balance_cents)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-muted font-mono">
                      {formatCents(card.initial_balance_cents)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          card.active
                            ? "border-green-500/30 text-green-600 dark:text-green-400"
                            : "bg-card-hover text-muted"
                        }`}
                      >
                        {card.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {new Date(card.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => viewDetail(card.code)}
                        className="rounded bg-card-hover px-3 py-1 text-xs text-foreground/80 hover:bg-card-hover hover:text-foreground transition-colors"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-bg"
          onClick={() => setShowCreate(false)}
          onKeyDown={(e) => e.key === "Escape" && setShowCreate(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-card-border bg-card p-6 shadow-2xl mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">Create Gift Card</h2>
              <button
                onClick={() => setShowCreate(false)}
                className="flex items-center justify-center h-8 w-8 rounded-full text-muted hover:text-foreground active:bg-card-hover transition-colors text-lg"
              >
                &times;
              </button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-muted mb-1">
                Amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted">$</span>
                <input
                  type="text"
                  value={createAmount}
                  onChange={(e) => setCreateAmount(e.target.value)}
                  placeholder="25.00"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  className="w-full rounded-xl border border-card-border bg-background pl-7 pr-4 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 rounded-xl border border-card-border py-2 text-sm text-foreground/80 hover:bg-card-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !createAmount}
                className="flex-1 rounded-xl bg-accent py-2 text-sm font-medium text-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-bg"
          onClick={() => setDetail(null)}
          onKeyDown={(e) => e.key === "Escape" && setDetail(null)}
        >
          <div
            className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-xl border border-card-border bg-card p-6 shadow-2xl mx-4 scroll-visible"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading && !detail ? (
              <p className="text-muted">Loading...</p>
            ) : detailError ? (
              <div className="text-center py-4">
                <p className="text-red-400 text-sm">{detailError}</p>
                <button onClick={() => setDetail(null)} className="mt-2 text-xs text-muted hover:text-foreground">Close</button>
              </div>
            ) : detail ? (
              <>
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-lg font-bold text-foreground">Gift Card Detail</h2>
                  <button
                    onClick={() => setDetail(null)}
                    className="flex items-center justify-center h-8 w-8 rounded-full text-muted hover:text-foreground active:bg-card-hover transition-colors text-lg"
                  >
                    &times;
                  </button>
                </div>
                <div className="mb-4 space-y-2">
                  <div className="text-sm">
                    <span className="text-muted">Code: </span>
                    <span className="text-foreground font-mono">{detail.code}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted">Balance: </span>
                    <span className="text-emerald-400 font-mono font-medium">
                      {formatCents(detail.balance_cents)}
                    </span>
                    <span className="text-muted ml-2">
                      of {formatCents(detail.initial_balance_cents)}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted">Status: </span>
                    <span className={detail.active ? "text-green-400" : "text-muted"}>
                      {detail.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>

                <h3 className="text-sm font-semibold text-foreground/80 mb-2">Transaction History</h3>
                {detail.history?.length === 0 ? (
                  <p className="text-sm text-muted">No transactions yet.</p>
                ) : (
                  <div className="space-y-1">
                    {detail.history?.map((h) => (
                      <div
                        key={h.id}
                        className="flex justify-between text-sm rounded-md bg-background px-3 py-2"
                      >
                        <div>
                          <div className="text-foreground/80">{h.description}</div>
                          <div className="text-xs text-muted">
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
                  className="mt-4 w-full rounded-xl border border-card-border py-2 text-sm text-foreground/80 hover:bg-card-hover transition-colors"
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
