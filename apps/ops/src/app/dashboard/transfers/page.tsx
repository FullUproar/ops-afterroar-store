"use client";

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store-context";
import { formatCents } from "@/lib/types";
import { PageHeader } from "@/components/page-header";

interface Location {
  id: string;
  name: string;
  code: string | null;
  type: string;
  active: boolean;
}

interface Transfer {
  id: string;
  from_location_id: string;
  to_location_id: string;
  staff_id: string | null;
  status: string;
  notes: string | null;
  items: Array<{ inventory_item_id: string; quantity: number }>;
  created_at: string;
  completed_at: string | null;
}

interface InventorySearchResult {
  id: string;
  name: string;
  quantity: number;
  price_cents: number;
}

export default function TransfersPage() {
  const { can } = useStore();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  // Location name map
  const [locationMap, setLocationMap] = useState<Record<string, string>>({});

  // New transfer form
  const [showNew, setShowNew] = useState(false);
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [transferItems, setTransferItems] = useState<
    Array<{ inventory_item_id: string; name: string; quantity: number; max_qty: number }>
  >([]);
  const [transferNotes, setTransferNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Item search
  const [itemSearch, setItemSearch] = useState("");
  const [itemResults, setItemResults] = useState<InventorySearchResult[]>([]);

  const loadData = useCallback(async () => {
    try {
      const [transfersRes, locationsRes] = await Promise.all([
        fetch("/api/transfers"),
        fetch("/api/locations"),
      ]);
      if (transfersRes.ok) setTransfers(await transfersRes.json());
      if (locationsRes.ok) {
        const locs = await locationsRes.json();
        setLocations(locs);
        const map: Record<string, string> = {};
        for (const loc of locs) {
          map[loc.id] = loc.name;
        }
        setLocationMap(map);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Item search
  useEffect(() => {
    if (!itemSearch.trim()) {
      setItemResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/inventory/search?q=${encodeURIComponent(itemSearch)}`
        );
        if (res.ok) {
          const data = await res.json();
          setItemResults(data.slice(0, 10));
        }
      } catch {
        // ignore
      }
    }, 300);
    return () => clearTimeout(t);
  }, [itemSearch]);

  function addTransferItem(item: InventorySearchResult) {
    if (transferItems.find((t) => t.inventory_item_id === item.id)) return;
    setTransferItems([
      ...transferItems,
      {
        inventory_item_id: item.id,
        name: item.name,
        quantity: 1,
        max_qty: item.quantity,
      },
    ]);
    setItemSearch("");
    setItemResults([]);
  }

  async function handleSubmitTransfer() {
    if (submitting) return;
    if (!fromLocationId || !toLocationId || transferItems.length === 0) {
      alert("Please select locations and add at least one item.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_location_id: fromLocationId,
          to_location_id: toLocationId,
          items: transferItems.map((i) => ({
            inventory_item_id: i.inventory_item_id,
            quantity: i.quantity,
          })),
          notes: transferNotes.trim() || null,
        }),
      });
      if (res.ok) {
        setShowNew(false);
        setFromLocationId("");
        setToLocationId("");
        setTransferItems([]);
        setTransferNotes("");
        loadData();
      } else {
        const data = await res.json();
        alert(data.error || "Transfer failed");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const statusColor = (s: string) => {
    switch (s) {
      case "completed":
        return "bg-green-900/50 text-green-400";
      case "pending":
        return "bg-yellow-900/50 text-yellow-400";
      case "in_transit":
        return "bg-blue-900/50 text-blue-400";
      case "cancelled":
        return "bg-card-hover text-muted";
      default:
        return "bg-card-hover text-muted";
    }
  };

  if (!can("inventory.adjust")) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted">You don&apos;t have permission to manage transfers.</p>
      </div>
    );
  }

  if (loading) {
    return <p className="text-muted py-12 text-center">Loading transfers...</p>;
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <PageHeader
        title="Transfers"
        action={
          <button
            onClick={() => setShowNew(true)}
            disabled={locations.length < 2}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            New Transfer
          </button>
        }
      />

      {locations.length < 2 && (
        <div className="rounded-xl border border-yellow-800/50 bg-yellow-900/10 p-4 text-sm text-yellow-400">
          You need at least 2 locations to create transfers. Add locations in Settings first.
        </div>
      )}

      {/* Transfer list */}
      {transfers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-input-border bg-card-hover p-12 text-center">
          <p className="text-muted">No transfers yet.</p>
        </div>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="md:hidden space-y-2">
            {transfers.map((t) => (
              <div key={t.id} className="rounded-xl border border-card-border bg-card p-3 min-h-11">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">
                    {locationMap[t.from_location_id] || 'Unknown'} &rarr; {locationMap[t.to_location_id] || 'Unknown'}
                  </span>
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(t.status)}`}
                  >
                    {t.status}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted">
                  <span>{Array.isArray(t.items) ? t.items.length : 0} items</span>
                  <span>{new Date(t.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-card-border scroll-visible">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border bg-card text-left text-muted">
                  <th className="px-4 py-3 font-medium">From</th>
                  <th className="px-4 py-3 font-medium">To</th>
                  <th className="px-4 py-3 font-medium text-center">Items</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {transfers.map((t) => (
                  <tr key={t.id} className="bg-background hover:bg-card-hover transition-colors">
                    <td className="px-4 py-3 text-foreground">
                      {locationMap[t.from_location_id] || t.from_location_id}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {locationMap[t.to_location_id] || t.to_location_id}
                    </td>
                    <td className="px-4 py-3 text-center text-foreground/70">
                      {Array.isArray(t.items) ? t.items.length : 0}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(t.status)}`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {new Date(t.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* New Transfer Modal */}
      {showNew && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-bg"
          onClick={() => setShowNew(false)}
          onKeyDown={(e) => e.key === "Escape" && setShowNew(false)}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-card-border bg-card p-6 shadow-2xl mx-4 scroll-visible"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">New Transfer</h2>
              <button
                onClick={() => setShowNew(false)}
                className="flex items-center justify-center h-8 w-8 rounded-full text-muted hover:text-foreground active:bg-card-hover transition-colors text-lg"
              >
                &times;
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  From Location
                </label>
                <select
                  value={fromLocationId}
                  onChange={(e) => setFromLocationId(e.target.value)}
                  className="w-full rounded-xl border border-card-border bg-background px-3 py-2 text-foreground focus:border-accent focus:outline-none"
                >
                  <option value="">Select...</option>
                  {locations
                    .filter((l) => l.active && l.id !== toLocationId)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  To Location
                </label>
                <select
                  value={toLocationId}
                  onChange={(e) => setToLocationId(e.target.value)}
                  className="w-full rounded-xl border border-card-border bg-background px-3 py-2 text-foreground focus:border-accent focus:outline-none"
                >
                  <option value="">Select...</option>
                  {locations
                    .filter((l) => l.active && l.id !== fromLocationId)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Add items */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-muted mb-1">
                Add Items
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder="Search inventory..."
                  className="w-full rounded-xl border border-card-border bg-background px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                />
                {itemResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-xl border border-card-border bg-card shadow-xl scroll-visible">
                    {itemResults.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => addTransferItem(item)}
                        className="flex w-full items-center justify-between px-3 py-2 text-sm text-foreground/70 hover:bg-card-hover"
                      >
                        <span>{item.name}</span>
                        <span className="text-xs text-muted">{item.quantity} in stock</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Transfer items list */}
            {transferItems.length > 0 && (
              <div className="mb-4 space-y-2">
                {transferItems.map((item) => (
                  <div
                    key={item.inventory_item_id}
                    className="flex items-center justify-between rounded-xl bg-background border border-card-border px-3 py-2"
                  >
                    <span className="text-sm text-foreground truncate mr-2">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={item.max_qty}
                        value={item.quantity}
                        onChange={(e) => {
                          const qty = Math.max(
                            1,
                            Math.min(parseInt(e.target.value) || 1, item.max_qty)
                          );
                          setTransferItems(
                            transferItems.map((t) =>
                              t.inventory_item_id === item.inventory_item_id
                                ? { ...t, quantity: qty }
                                : t
                            )
                          );
                        }}
                        className="w-16 rounded border border-input-border bg-card px-2 py-1 text-sm text-foreground text-center focus:border-accent focus:outline-none"
                      />
                      <button
                        onClick={() =>
                          setTransferItems(
                            transferItems.filter(
                              (t) => t.inventory_item_id !== item.inventory_item_id
                            )
                          )
                        }
                        className="text-muted hover:text-red-400 text-sm"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Notes */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-muted mb-1">
                Notes (optional)
              </label>
              <textarea
                value={transferNotes}
                onChange={(e) => setTransferNotes(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-card-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowNew(false)}
                className="flex-1 rounded-xl border border-input-border py-2 text-sm text-foreground/70 hover:bg-card-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitTransfer}
                disabled={
                  submitting ||
                  !fromLocationId ||
                  !toLocationId ||
                  transferItems.length === 0
                }
                className="flex-1 rounded-xl bg-accent py-2 text-sm font-medium text-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                {submitting ? "Transferring..." : "Submit Transfer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
