"use client";

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store-context";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/shared/ui";

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  image_url: string | null;
  available: boolean;
  checkout: {
    id: string;
    customer_name: string | null;
    table_number: string | null;
    checked_out_at: string;
    expected_return_at: string | null;
    status: string;
    time_elapsed_minutes: number;
  } | null;
}

interface ActiveCheckout {
  id: string;
  inventory_item_id: string;
  inventory_item: { id: string; name: string; image_url?: string; category?: string };
  customer: { id: string; name: string } | null;
  staff: { id: string; name: string } | null;
  table_number: string | null;
  checked_out_at: string;
  expected_return_at: string | null;
  returned_at: string | null;
  return_condition: string | null;
  return_notes: string | null;
  status: string;
  time_elapsed_minutes: number;
}

interface Customer {
  id: string;
  name: string;
  email: string | null;
}

function formatElapsed(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function GameLibraryPage() {
  const { can } = useStore();
  const [view, setView] = useState<"available" | "active">("available");

  // Available games
  const [games, setGames] = useState<InventoryItem[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);

  // Active checkouts
  const [checkouts, setCheckouts] = useState<ActiveCheckout[]>([]);
  const [checkoutsLoading, setCheckoutsLoading] = useState(false);

  // Checkout modal
  const [checkoutModal, setCheckoutModal] = useState<InventoryItem | null>(null);
  const [checkoutCustomerId, setCheckoutCustomerId] = useState("");
  const [checkoutTable, setCheckoutTable] = useState("");
  const [checkoutDuration, setCheckoutDuration] = useState("4");
  const [checkingOut, setCheckingOut] = useState(false);

  // Customer search
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [selectedCustomerName, setSelectedCustomerName] = useState("");

  // Return modal
  const [returnModal, setReturnModal] = useState<ActiveCheckout | null>(null);
  const [returnCondition, setReturnCondition] = useState("Good");
  const [returnNotes, setReturnNotes] = useState("");
  const [returning, setReturning] = useState(false);

  const loadGames = useCallback(async () => {
    setGamesLoading(true);
    try {
      const res = await fetch("/api/game-checkouts/available");
      if (res.ok) setGames(await res.json());
    } finally {
      setGamesLoading(false);
    }
  }, []);

  const loadCheckouts = useCallback(async () => {
    setCheckoutsLoading(true);
    try {
      const res = await fetch("/api/game-checkouts?status=all");
      if (res.ok) {
        const data: ActiveCheckout[] = await res.json();
        // Show active (out + overdue) first, then returned
        setCheckouts(
          data.sort((a, b) => {
            const order: Record<string, number> = { overdue: 0, out: 1, returned: 2 };
            return (order[a.status] ?? 3) - (order[b.status] ?? 3);
          })
        );
      }
    } finally {
      setCheckoutsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "available") {
      loadGames();
    } else {
      loadCheckouts();
    }
  }, [view, loadGames, loadCheckouts]);

  // Auto-refresh active checkouts every 30s
  useEffect(() => {
    if (view !== "active") return;
    const interval = setInterval(loadCheckouts, 30000);
    return () => clearInterval(interval);
  }, [view, loadCheckouts]);

  // Customer search
  useEffect(() => {
    if (!customerSearch || customerSearch.length < 2) {
      setCustomerResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setCustomerSearching(true);
      try {
        const res = await fetch(`/api/customers?q=${encodeURIComponent(customerSearch)}`);
        if (res.ok) {
          const data = await res.json();
          setCustomerResults(Array.isArray(data) ? data.slice(0, 8) : []);
        }
      } finally {
        setCustomerSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [customerSearch]);

  async function handleCheckout() {
    if (!checkoutModal || checkingOut) return;
    setCheckingOut(true);
    try {
      const res = await fetch("/api/game-checkouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventory_item_id: checkoutModal.id,
          customer_id: checkoutCustomerId || undefined,
          table_number: checkoutTable || undefined,
          duration_hours: checkoutDuration === "all_day" ? 12 : parseInt(checkoutDuration),
        }),
      });
      if (res.ok) {
        setCheckoutModal(null);
        resetCheckoutForm();
        loadGames();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to check out game");
      }
    } finally {
      setCheckingOut(false);
    }
  }

  function resetCheckoutForm() {
    setCheckoutCustomerId("");
    setCheckoutTable("");
    setCheckoutDuration("4");
    setCustomerSearch("");
    setCustomerResults([]);
    setSelectedCustomerName("");
  }

  async function handleReturn() {
    if (!returnModal || returning) return;
    setReturning(true);
    try {
      const res = await fetch(`/api/game-checkouts/${returnModal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "return",
          condition: returnCondition,
          notes: returnNotes || undefined,
        }),
      });
      if (res.ok) {
        setReturnModal(null);
        setReturnCondition("Good");
        setReturnNotes("");
        loadCheckouts();
        loadGames();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to return game");
      }
    } finally {
      setReturning(false);
    }
  }

  async function handleMarkOverdue(checkout: ActiveCheckout) {
    const res = await fetch(`/api/game-checkouts/${checkout.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_overdue" }),
    });
    if (res.ok) {
      loadCheckouts();
    } else {
      const data = await res.json();
      alert(data.error || "Failed to mark overdue");
    }
  }

  if (!can("inventory.view")) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted">You don&apos;t have permission to view the game library.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <PageHeader title="Game Library" />
        <div className="flex gap-1 rounded-xl border border-card-border bg-card p-1">
          <button
            onClick={() => setView("available")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              view === "available"
                ? "bg-card-hover text-foreground"
                : "text-muted hover:text-zinc-200"
            }`}
          >
            Available Games
          </button>
          <button
            onClick={() => setView("active")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              view === "active"
                ? "bg-card-hover text-foreground"
                : "text-muted hover:text-zinc-200"
            }`}
          >
            Active Checkouts
          </button>
        </div>
      </div>

      {/* ===== AVAILABLE GAMES VIEW ===== */}
      {view === "available" && (
        <>
          {gamesLoading ? (
            <p className="text-muted text-center py-12">Loading game library...</p>
          ) : games.length === 0 ? (
            <EmptyState
              icon="&#x1F3B2;"
              title="No lendable games"
              description="Mark board games as 'Lendable' in your Inventory page — they'll appear here for check-out."
              action={{ label: "Go to Inventory", href: "/dashboard/inventory" }}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {games.map((game) => (
                <div
                  key={game.id}
                  className="rounded-xl border border-card-border bg-card p-4 flex flex-col"
                >
                  {/* Image placeholder */}
                  <div className="mb-3 flex h-32 items-center justify-center rounded-md bg-card-hover text-4xl text-zinc-600">
                    {game.image_url ? (
                      <img
                        src={game.image_url}
                        alt={game.name}
                        className="h-full w-full rounded-md object-cover"
                      />
                    ) : (
                      "♜"
                    )}
                  </div>

                  <h3 className="font-semibold text-foreground text-sm mb-1 line-clamp-2">
                    {game.name}
                  </h3>
                  <p className="text-xs text-muted mb-3">{game.category}</p>

                  {/* Availability badge */}
                  {game.available ? (
                    <span className="inline-flex items-center self-start rounded-full border px-2.5 py-0.5 text-xs font-medium text-green-400 bg-green-900/30 border-green-800 mb-3">
                      Available
                    </span>
                  ) : (
                    <span className="inline-flex items-center self-start rounded-full border px-2.5 py-0.5 text-xs font-medium text-red-400 bg-red-900/30 border-red-800 mb-3">
                      Checked Out
                      {game.checkout?.table_number
                        ? ` \u2014 Table ${game.checkout.table_number}`
                        : ""}
                    </span>
                  )}

                  {game.available && (
                    <button
                      onClick={() => {
                        resetCheckoutForm();
                        setCheckoutModal(game);
                      }}
                      className="mt-auto rounded-xl bg-accent px-4 py-2 text-sm font-medium text-foreground hover:opacity-90 transition-colors"
                    >
                      Check Out
                    </button>
                  )}

                  {!game.available && game.checkout && (
                    <div className="mt-auto text-xs text-muted">
                      {game.checkout.customer_name && (
                        <p>{game.checkout.customer_name}</p>
                      )}
                      <p>{formatElapsed(game.checkout.time_elapsed_minutes)} ago</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ===== ACTIVE CHECKOUTS VIEW ===== */}
      {view === "active" && (
        <>
          {checkoutsLoading ? (
            <p className="text-muted text-center py-12">Loading checkouts...</p>
          ) : checkouts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-input-border bg-card-hover p-12 text-center">
              <p className="text-muted">No checkouts recorded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-card-border scroll-visible">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-card-border bg-card text-left text-muted">
                    <th className="px-4 py-3 font-medium">Game</th>
                    <th className="px-4 py-3 font-medium">Customer / Table</th>
                    <th className="px-4 py-3 font-medium">Checked Out</th>
                    <th className="px-4 py-3 font-medium">Expected Return</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {checkouts.map((co) => {
                    const isOverdue =
                      co.status === "overdue" ||
                      (co.status === "out" &&
                        co.expected_return_at &&
                        new Date(co.expected_return_at) < new Date());

                    return (
                      <tr
                        key={co.id}
                        className={`transition-colors ${
                          co.status === "returned"
                            ? "bg-background/50 text-muted"
                            : isOverdue
                            ? "bg-orange-950/20"
                            : "bg-background hover:bg-card-hover"
                        }`}
                      >
                        <td className="px-4 py-3 text-foreground font-medium">
                          {co.inventory_item.name}
                        </td>
                        <td className="px-4 py-3 text-foreground/70">
                          {co.customer?.name || "Walk-in"}
                          {co.table_number && (
                            <span className="ml-2 text-muted">
                              Table {co.table_number}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {co.status !== "returned" ? (
                            <span>{formatElapsed(co.time_elapsed_minutes)} ago</span>
                          ) : (
                            new Date(co.checked_out_at).toLocaleString()
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {co.expected_return_at
                            ? new Date(co.expected_return_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "\u2014"}
                        </td>
                        <td className="px-4 py-3">
                          {co.status === "returned" ? (
                            <span className="inline-block rounded-full border px-2 py-0.5 text-xs font-medium text-muted bg-card-hover border-input-border">
                              Returned
                              {co.return_condition && co.return_condition !== "Good"
                                ? ` (${co.return_condition})`
                                : ""}
                            </span>
                          ) : co.status === "overdue" || isOverdue ? (
                            <span className="inline-block rounded-full border px-2 py-0.5 text-xs font-medium text-orange-400 bg-orange-900/30 border-orange-800">
                              Overdue
                            </span>
                          ) : (
                            <span className="inline-block rounded-full border px-2 py-0.5 text-xs font-medium text-green-400 bg-green-900/30 border-green-800">
                              Out
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {co.status !== "returned" && (
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => {
                                  setReturnCondition("Good");
                                  setReturnNotes("");
                                  setReturnModal(co);
                                }}
                                className="rounded bg-card-hover px-3 py-1 text-xs text-foreground/70 hover:bg-card-hover hover:text-foreground transition-colors"
                              >
                                Return
                              </button>
                              {co.status === "out" &&
                                co.expected_return_at &&
                                new Date(co.expected_return_at) < new Date() && (
                                  <button
                                    onClick={() => handleMarkOverdue(co)}
                                    className="rounded bg-orange-900/50 px-3 py-1 text-xs text-orange-300 hover:bg-orange-800/50 transition-colors"
                                  >
                                    Mark Overdue
                                  </button>
                                )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ===== CHECKOUT MODAL ===== */}
      {checkoutModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-bg"
          onClick={() => setCheckoutModal(null)}
          onKeyDown={(e) => e.key === "Escape" && setCheckoutModal(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-card-border bg-card p-6 shadow-2xl mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-semibold text-foreground">Check Out Game</h2>
              <button onClick={() => setCheckoutModal(null)} className="flex items-center justify-center h-8 w-8 rounded-full text-muted hover:text-foreground active:bg-card-hover transition-colors text-lg">&times;</button>
            </div>
            <p className="text-sm text-muted mb-4">{checkoutModal.name}</p>

            {/* Customer search */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-muted mb-1">
                Customer (optional)
              </label>
              {selectedCustomerName ? (
                <div className="flex items-center gap-2 rounded-xl border border-card-border bg-background px-3 py-2">
                  <span className="text-foreground text-sm flex-1">{selectedCustomerName}</span>
                  <button
                    onClick={() => {
                      setCheckoutCustomerId("");
                      setSelectedCustomerName("");
                      setCustomerSearch("");
                    }}
                    className="text-muted hover:text-foreground/70 text-xs"
                  >
                    Clear
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search customers..."
                    className="w-full rounded-xl border border-card-border bg-background px-3 py-2 text-foreground text-sm placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                  {customerSearching && (
                    <span className="absolute right-3 top-2.5 text-xs text-muted">
                      Searching...
                    </span>
                  )}
                  {customerResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 max-h-40 overflow-y-auto rounded-xl border border-input-border bg-card shadow-lg z-10 scroll-visible">
                      {customerResults.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setCheckoutCustomerId(c.id);
                            setSelectedCustomerName(c.name);
                            setCustomerSearch("");
                            setCustomerResults([]);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm text-foreground/70 hover:bg-card-hover hover:text-foreground"
                        >
                          {c.name}
                          {c.email && (
                            <span className="ml-2 text-xs text-muted">{c.email}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Table number */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-muted mb-1">
                Table Number (optional)
              </label>
              <input
                type="text"
                value={checkoutTable}
                onChange={(e) => setCheckoutTable(e.target.value)}
                placeholder="e.g. 7"
                className="w-full rounded-xl border border-card-border bg-background px-3 py-2 text-foreground text-sm placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>

            {/* Duration */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-muted mb-1">
                Duration
              </label>
              <select
                value={checkoutDuration}
                onChange={(e) => setCheckoutDuration(e.target.value)}
                className="w-full rounded-xl border border-card-border bg-background px-3 py-2 text-foreground text-sm focus:border-accent focus:outline-none"
              >
                <option value="1">1 hour</option>
                <option value="2">2 hours</option>
                <option value="3">3 hours</option>
                <option value="4">4 hours</option>
                <option value="all_day">All Day</option>
              </select>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setCheckoutModal(null)}
                className="flex-1 rounded-xl border border-input-border py-2 text-sm text-foreground/70 hover:bg-card-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCheckout}
                disabled={checkingOut}
                className="flex-1 rounded-xl bg-accent py-2 text-sm font-medium text-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                {checkingOut ? "Checking Out..." : "Check Out"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== RETURN MODAL ===== */}
      {returnModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-bg"
          onClick={() => setReturnModal(null)}
          onKeyDown={(e) => e.key === "Escape" && setReturnModal(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-card-border bg-card p-6 shadow-2xl mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-semibold text-foreground">Return Game</h2>
              <button onClick={() => setReturnModal(null)} className="flex items-center justify-center h-8 w-8 rounded-full text-muted hover:text-foreground active:bg-card-hover transition-colors text-lg">&times;</button>
            </div>
            <p className="text-sm text-muted mb-4">
              {returnModal.inventory_item.name}
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-muted mb-1">
                Condition
              </label>
              <select
                value={returnCondition}
                onChange={(e) => setReturnCondition(e.target.value)}
                className="w-full rounded-xl border border-card-border bg-background px-3 py-2 text-foreground text-sm focus:border-accent focus:outline-none"
              >
                <option value="Good">Good</option>
                <option value="Minor Wear">Minor Wear</option>
                <option value="Damaged">Damaged</option>
                <option value="Missing Pieces">Missing Pieces</option>
              </select>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-muted mb-1">
                Notes (optional)
              </label>
              <textarea
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="Any notes about the return..."
                rows={3}
                className="w-full rounded-xl border border-card-border bg-background px-3 py-2 text-foreground text-sm placeholder:text-muted focus:border-accent focus:outline-none resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setReturnModal(null)}
                className="flex-1 rounded-xl border border-input-border py-2 text-sm text-foreground/70 hover:bg-card-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReturn}
                disabled={returning}
                className="flex-1 rounded-xl bg-accent py-2 text-sm font-medium text-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                {returning ? "Returning..." : "Confirm Return"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
