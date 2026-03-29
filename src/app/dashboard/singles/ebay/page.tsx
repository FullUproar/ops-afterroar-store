"use client";

import { useState, useEffect, useCallback } from "react";
import { formatCents } from "@/lib/types";
import { PageHeader } from "@/components/page-header";

/* ---------- types ---------- */

interface EbayItem {
  id: string;
  name: string;
  price_cents: number;
  cost_cents: number;
  quantity: number;
  image_url: string | null;
  game: string | null;
  set_name: string | null;
  condition: string;
  foil: boolean;
  rarity: string | null;
  ebay_listing_id: string | null;
  ebay_offer_id: string | null;
  listed_on_ebay: boolean;
}

type FilterMode = "all" | "listed" | "unlisted";

/* ---------- component ---------- */

export default function EbayListingsPage() {
  const [items, setItems] = useState<EbayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [listedCount, setListedCount] = useState(0);
  const [ebayConfigured, setEbayConfigured] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("all");

  // Actions
  const [listing, setListing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<{
    updated: number;
    removed: number;
    errors: string[];
  } | null>(null);
  const [error, setError] = useState("");

  // Fetch items
  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("filter", filter);
      params.set("limit", "100");

      const res = await fetch(`/api/ebay/listings?${params}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();

      setItems(data.items || []);
      setListedCount(data.listed_count || 0);
      setEbayConfigured(data.ebay_configured || false);
    } catch {
      setError("Failed to load listings");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // List on eBay
  async function listOnEbay(itemId: string) {
    setListing(itemId);
    setError("");

    try {
      const res = await fetch("/api/ebay/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventory_item_id: itemId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to list");
      }

      const result = await res.json();

      // Update local state
      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId
            ? {
                ...i,
                listed_on_ebay: true,
                ebay_listing_id: result.listing_id,
                ebay_offer_id: result.offer_id,
              }
            : i
        )
      );
      setListedCount((c) => c + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list");
    } finally {
      setListing(null);
    }
  }

  // Remove from eBay
  async function removeFromEbay(itemId: string) {
    setRemoving(itemId);
    setError("");

    try {
      const res = await fetch("/api/ebay/listings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventory_item_id: itemId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to remove");
      }

      // Update local state
      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId
            ? {
                ...i,
                listed_on_ebay: false,
                ebay_listing_id: null,
                ebay_offer_id: null,
              }
            : i
        )
      );
      setListedCount((c) => Math.max(0, c - 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setRemoving(null);
    }
  }

  // Sync all
  async function syncAll() {
    setSyncing(true);
    setError("");
    setSyncReport(null);

    try {
      const res = await fetch("/api/ebay/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Sync failed");
      }

      const result = await res.json();
      setSyncReport({
        updated: result.updated,
        removed: result.removed,
        errors: result.errors || [],
      });

      // Refresh items
      fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const listedItems = items.filter((i) => i.listed_on_ebay);
  const unlistedItems = items.filter((i) => !i.listed_on_ebay);

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-8">
      <PageHeader
        title="eBay Listings"
        backHref="/dashboard/singles"
        action={
          ebayConfigured ? (
            <button
              onClick={syncAll}
              disabled={syncing}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-foreground hover:opacity-90 transition-colors disabled:opacity-50"
            >
              {syncing ? "Syncing..." : "Sync Now"}
            </button>
          ) : undefined
        }
      />

      {/* eBay not configured warning */}
      {!ebayConfigured && !loading && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-400">
          <p className="font-medium">eBay not connected</p>
          <p className="text-amber-400/80 mt-1">
            Set the EBAY_USER_TOKEN environment variable to enable eBay
            integration. You can still browse your singles and prepare items for
            listing.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
          <button
            onClick={() => setError("")}
            className="ml-2 text-red-300 hover:text-red-200"
          >
            dismiss
          </button>
        </div>
      )}

      {syncReport && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400">
          Sync complete: {syncReport.updated} updated, {syncReport.removed}{" "}
          removed
          {syncReport.errors.length > 0 && (
            <span className="text-amber-400">
              , {syncReport.errors.length} error
              {syncReport.errors.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-card-border bg-card p-3">
          <div className="text-[10px] text-muted uppercase tracking-wider">
            Listed
          </div>
          <div className="text-xl font-bold text-foreground tabular-nums mt-0.5">
            {listedCount}
          </div>
        </div>
        <div className="rounded-xl border border-card-border bg-card p-3">
          <div className="text-[10px] text-muted uppercase tracking-wider">
            Available
          </div>
          <div className="text-xl font-bold text-foreground tabular-nums mt-0.5">
            {items.filter((i) => !i.listed_on_ebay).length}
          </div>
        </div>
        <div className="rounded-xl border border-card-border bg-card p-3">
          <div className="text-[10px] text-muted uppercase tracking-wider">
            Listed Value
          </div>
          <div className="text-xl font-bold text-foreground tabular-nums mt-0.5">
            {formatCents(
              listedItems.reduce((s, i) => s + i.price_cents * i.quantity, 0)
            )}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1.5">
        {(["all", "listed", "unlisted"] as FilterMode[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              filter === f
                ? "bg-accent text-foreground"
                : "bg-card-hover text-muted hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Items */}
      {loading ? (
        <div className="text-center py-12 text-muted text-sm">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted text-sm">
          No items found for this filter.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Listed section */}
          {filter !== "unlisted" && listedItems.length > 0 && (
            <div>
              {filter === "all" && (
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                  Listed on eBay
                </h3>
              )}
              <div className="divide-y divide-card-border rounded-xl border border-card-border bg-card overflow-hidden">
                {listedItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt=""
                        className="w-10 h-14 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-14 rounded bg-card-hover shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          {item.name}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-300 border border-blue-500/30">
                          {item.condition}
                          {item.foil ? " Foil" : ""}
                        </span>
                      </div>
                      <div className="text-xs text-muted mt-0.5">
                        {item.set_name || ""}
                        {item.quantity > 1 && ` \u00b7 Qty: ${item.quantity}`}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold text-foreground tabular-nums">
                        {formatCents(item.price_cents)}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {item.ebay_listing_id && (
                          <a
                            href={`https://www.ebay.com/itm/${item.ebay_listing_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-indigo-400 hover:text-indigo-300"
                          >
                            View
                          </a>
                        )}
                        <button
                          onClick={() => removeFromEbay(item.id)}
                          disabled={removing === item.id}
                          className="text-[10px] text-red-400 hover:text-red-300 disabled:opacity-50"
                        >
                          {removing === item.id ? "..." : "End"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unlisted section */}
          {filter !== "listed" && unlistedItems.length > 0 && (
            <div>
              {filter === "all" && (
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                  Available to List
                </h3>
              )}
              <div className="divide-y divide-card-border rounded-xl border border-card-border bg-card overflow-hidden">
                {unlistedItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt=""
                        className="w-10 h-14 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-14 rounded bg-card-hover shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          {item.name}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-card-hover text-muted">
                          {item.condition}
                          {item.foil ? " Foil" : ""}
                        </span>
                      </div>
                      <div className="text-xs text-muted mt-0.5">
                        {item.set_name || ""}
                        {item.quantity > 1 && ` \u00b7 Qty: ${item.quantity}`}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold text-foreground tabular-nums">
                        {formatCents(item.price_cents)}
                      </div>
                      {ebayConfigured && (
                        <button
                          onClick={() => listOnEbay(item.id)}
                          disabled={listing === item.id}
                          className="mt-1 text-[10px] font-medium text-accent hover:text-accent/80 disabled:opacity-50"
                        >
                          {listing === item.id ? "Listing..." : "List on eBay"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
