"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatCents, parseDollars, type ItemCategory } from "@/lib/types";
import type { InventoryItem } from "@/lib/types";
import { NumericKeypad } from "@/components/numeric-keypad";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface LookupProduct {
  name: string;
  brand: string;
  description: string;
  category: string;
  image_url: string | null;
  upc: string;
  suggested_price_cents: number | null;
  bgg: {
    id: string;
    rating: number;
    min_players: number;
    max_players: number;
    playtime: string;
    image: string;
  } | null;
}

interface LookupResult {
  found: boolean;
  source: "upcitemdb" | "catalog" | "not_found";
  rate_limited?: boolean;
  catalog_product_id?: string;
  product: LookupProduct | null;
}

type ModalState = "loading" | "found" | "not_found" | "rate_limited" | "assign";

const CATEGORIES: { value: ItemCategory; label: string }[] = [
  { value: "board_game", label: "Board Game" },
  { value: "sealed", label: "Sealed Product" },
  { value: "tcg_single", label: "TCG Single" },
  { value: "miniature", label: "Miniature" },
  { value: "accessory", label: "Accessory" },
  { value: "food_drink", label: "Food & Drink" },
  { value: "other", label: "Other" },
];

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface BarcodeLearnModalProps {
  barcode: string;
  onClose: () => void;
  /** Called when a new item is added to inventory. Returns the created item. */
  onItemCreated?: (item: InventoryItem, addToCart: boolean) => void;
  /** Called when an existing item gets the barcode assigned. */
  onBarcodeAssigned?: (item: InventoryItem) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function BarcodeLearnModal({
  barcode,
  onClose,
  onItemCreated,
  onBarcodeAssigned,
}: BarcodeLearnModalProps) {
  const [state, setState] = useState<ModalState>("loading");
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ItemCategory>("other");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [editingField, setEditingField] = useState<"price" | "cost" | "qty" | null>(null);

  // Assign to existing
  const [assignQuery, setAssignQuery] = useState("");
  const [assignResults, setAssignResults] = useState<InventoryItem[]>([]);
  const [assignSearching, setAssignSearching] = useState(false);

  const assignDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fetchedRef = useRef(false);

  // ---- Fetch lookup on mount ----
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    async function doLookup() {
      try {
        const res = await fetch(
          `/api/barcode/lookup?code=${encodeURIComponent(barcode)}`
        );
        if (!res.ok) {
          setState("not_found");
          return;
        }
        const data: LookupResult = await res.json();
        setLookup(data);

        if (data.rate_limited) {
          setState("rate_limited");
          return;
        }

        if (data.found && data.product) {
          const p = data.product;
          setName(p.name || "");
          setCategory((p.category as ItemCategory) || "other");
          if (p.suggested_price_cents) {
            setPrice((p.suggested_price_cents / 100).toFixed(2));
          }
          setState("found");
        } else {
          setState("not_found");
        }
      } catch {
        setState("not_found");
      }
    }

    doLookup();
  }, [barcode]);

  // ---- Assign search ----
  useEffect(() => {
    if (state !== "assign") return;
    if (!assignQuery.trim()) {
      setAssignResults([]);
      return;
    }

    if (assignDebounceRef.current) clearTimeout(assignDebounceRef.current);
    assignDebounceRef.current = setTimeout(async () => {
      setAssignSearching(true);
      try {
        const res = await fetch(
          `/api/inventory/search?q=${encodeURIComponent(assignQuery.trim())}`
        );
        if (res.ok) {
          const data = await res.json();
          setAssignResults(Array.isArray(data) ? data : []);
        }
      } catch {
        // ignore
      } finally {
        setAssignSearching(false);
      }
    }, 300);

    return () => {
      if (assignDebounceRef.current) clearTimeout(assignDebounceRef.current);
    };
  }, [assignQuery, state]);

  // ---- Create inventory item ----
  const handleCreate = useCallback(
    async (addToCart: boolean) => {
      if (!name.trim()) {
        setError("Name is required");
        return;
      }

      setSubmitting(true);
      setError(null);

      try {
        const priceCents = parseDollars(price);
        const costCents = parseDollars(cost);
        const qty = parseInt(quantity, 10) || 1;

        const product = lookup?.product;
        const bgg = product?.bgg;

        // Build attributes
        const attributes: Record<string, unknown> = {};
        if (product?.brand) attributes.brand = product.brand;
        if (bgg) {
          attributes.bgg_id = bgg.id;
          attributes.bgg_rating = bgg.rating;
          attributes.min_players = bgg.min_players;
          attributes.max_players = bgg.max_players;
          attributes.playtime = bgg.playtime;
        }

        // Create inventory item
        const res = await fetch("/api/inventory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            category,
            price_cents: priceCents,
            cost_cents: costCents,
            quantity: qty,
            barcode,
            attributes,
          }),
        });

        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error || "Failed to create item");
        }

        const newItem: InventoryItem = await res.json();

        // Also create/update catalog product for future lookups
        try {
          await fetch("/api/barcode/catalog", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              inventory_item_id: newItem.id,
              barcode,
              name: name.trim(),
              category,
              image_url: product?.image_url || null,
              description: product?.description || null,
              brand: product?.brand || null,
              bgg_id: bgg?.id || null,
              bgg_rating: bgg?.rating || null,
              bgg_image: bgg?.image || null,
              min_players: bgg?.min_players || null,
              max_players: bgg?.max_players || null,
              playtime: bgg?.playtime || null,
              source: lookup?.source || "manual",
              catalog_product_id: lookup?.catalog_product_id || null,
            }),
          });
        } catch {
          // Catalog linking is best-effort — don't block the flow
        }

        onItemCreated?.(newItem, addToCart);
        onClose();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to create item");
      } finally {
        setSubmitting(false);
      }
    },
    [name, category, price, cost, quantity, barcode, lookup, onItemCreated, onClose]
  );

  // ---- Assign barcode to existing item ----
  const handleAssign = useCallback(
    async (item: InventoryItem) => {
      setSubmitting(true);
      setError(null);

      try {
        const res = await fetch("/api/inventory", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id, barcode }),
        });

        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error || "Failed to assign barcode");
        }

        const updated: InventoryItem = await res.json();
        onBarcodeAssigned?.(updated);
        onClose();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to assign barcode");
      } finally {
        setSubmitting(false);
      }
    },
    [barcode, onBarcodeAssigned, onClose]
  );

  // ---- Render ----
  const product = lookup?.product;
  const bgg = product?.bgg;

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      />

      {/* Modal — stop all events from reaching backdrop */}
      <div
        className="relative w-full sm:max-w-lg max-h-[90vh] overflow-y-auto bg-card border border-card-border rounded-t-2xl sm:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-card border-b border-card-border rounded-t-2xl">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground truncate">
              New Barcode: {barcode}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="ml-3 shrink-0 p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card-hover transition-colors"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Loading state */}
          {state === "loading" && (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted">Looking up barcode...</p>
            </div>
          )}

          {/* Rate limited */}
          {state === "rate_limited" && (
            <div className="text-center py-6 space-y-3">
              <div className="text-3xl">&#x23F3;</div>
              <p className="text-sm text-muted">
                UPC lookup temporarily unavailable (rate limit). Add manually:
              </p>
            </div>
          )}

          {/* Not found */}
          {state === "not_found" && (
            <div className="text-center py-6 space-y-3">
              <div className="text-3xl">&#x1F50D;</div>
              <p className="text-sm text-muted">
                Product not found in UPC database. Add manually:
              </p>
            </div>
          )}

          {/* Found — product info */}
          {state === "found" && product && (
            <div className="flex gap-4">
              {product.image_url && (
                <div className="shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-background border border-card-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-foreground truncate">
                  {product.name}
                </h3>
                {product.brand && (
                  <p className="text-sm text-muted">by {product.brand}</p>
                )}
                <div className="flex flex-wrap gap-2 mt-1 text-sm text-muted">
                  {bgg && (
                    <>
                      <span>
                        {CATEGORIES.find((c) => c.value === category)?.label || category}
                      </span>
                      {bgg.min_players > 0 && (
                        <span>
                          {bgg.min_players === bgg.max_players
                            ? `${bgg.min_players} players`
                            : `${bgg.min_players}-${bgg.max_players} players`}
                        </span>
                      )}
                      {bgg.playtime && bgg.playtime !== "0" && (
                        <span>{bgg.playtime} min</span>
                      )}
                    </>
                  )}
                </div>
                {bgg && bgg.rating > 0 && (
                  <p className="text-sm text-amber-500 mt-1">
                    BGG Rating: {bgg.rating.toFixed(1)} &#x2605;
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Assign to existing flow */}
          {state === "assign" && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                Assign barcode to existing item
              </h3>
              <input
                type="text"
                value={assignQuery}
                onChange={(e) => setAssignQuery(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="Search inventory by name..."
                className="w-full rounded-xl border border-input-border bg-input-bg px-3 py-2.5 text-lg text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                autoFocus
              />
              {assignSearching && (
                <p className="text-sm text-muted">Searching...</p>
              )}
              {assignResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto border border-card-border rounded-xl divide-y divide-card-border">
                  {assignResults.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleAssign(item)}
                      disabled={submitting}
                      className="w-full text-left px-4 py-3 hover:bg-card-hover transition-colors disabled:opacity-50"
                    >
                      <div className="text-lg font-medium text-foreground truncate">
                        {item.name}
                      </div>
                      <div className="flex gap-2 text-sm text-muted mt-0.5">
                        <span>{formatCents(item.price_cents)}</span>
                        <span>Qty: {item.quantity}</span>
                        {item.barcode && (
                          <span className="text-amber-500">
                            Has barcode: {item.barcode}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {assignQuery.trim() && !assignSearching && assignResults.length === 0 && (
                <p className="text-sm text-muted text-center py-2">No items found</p>
              )}
              <button
                onClick={() => setState(lookup?.found ? "found" : "not_found")}
                className="w-full text-sm text-muted hover:text-foreground text-center py-2 transition-colors"
              >
                &larr; Back to add new
              </button>
            </div>
          )}

          {/* Add form (shown for found, not_found, rate_limited states) */}
          {(state === "found" || state === "not_found" || state === "rate_limited") && (
            <div className="space-y-4">
              <div className="border-t border-card-border pt-4">
                <h3 className="text-sm font-semibold text-muted mb-3">
                  Add to Inventory
                </h3>

                {error && (
                  <p className="text-sm text-red-400 mb-3">{error}</p>
                )}

                <div className="space-y-3">
                  {/* Name */}
                  <div>
                    <label className="block text-base font-medium text-muted mb-1">
                      Name *
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      className="w-full rounded-xl border border-input-border bg-input-bg px-3 py-2.5 text-lg text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                      placeholder="Product name"
                      autoFocus
                    />
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-base font-medium text-muted mb-1">
                      Category
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as ItemCategory)}
                      className="w-full rounded-xl border border-input-border bg-input-bg px-3 py-2.5 text-foreground focus:border-accent focus:outline-none"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Price + Cost + Quantity — tap to edit with keypad */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-base font-medium text-muted mb-1">Price</label>
                      <button
                        type="button"
                        onClick={() => setEditingField(editingField === "price" ? null : "price")}
                        className={`w-full rounded-xl border px-3 py-3 text-lg font-mono font-bold text-left transition-colors ${
                          editingField === "price" ? "border-accent bg-accent/10 text-accent" : "border-input-border bg-input-bg text-foreground"
                        }`}
                      >
                        ${price || "0.00"}
                      </button>
                    </div>
                    <div>
                      <label className="block text-base font-medium text-muted mb-1">Cost</label>
                      <button
                        type="button"
                        onClick={() => setEditingField(editingField === "cost" ? null : "cost")}
                        className={`w-full rounded-xl border px-3 py-3 text-lg font-mono font-bold text-left transition-colors ${
                          editingField === "cost" ? "border-accent bg-accent/10 text-accent" : "border-input-border bg-input-bg text-foreground"
                        }`}
                      >
                        ${cost || "0.00"}
                      </button>
                    </div>
                    <div>
                      <label className="block text-base font-medium text-muted mb-1">Qty</label>
                      <button
                        type="button"
                        onClick={() => setEditingField(editingField === "qty" ? null : "qty")}
                        className={`w-full rounded-xl border px-3 py-3 text-lg font-mono font-bold text-left transition-colors ${
                          editingField === "qty" ? "border-accent bg-accent/10 text-accent" : "border-input-border bg-input-bg text-foreground"
                        }`}
                      >
                        {quantity || "1"}
                      </button>
                    </div>
                  </div>

                  {/* Inline numeric keypad for active field */}
                  {editingField && (
                    <div className="rounded-xl border border-card-border overflow-hidden" style={{ height: 320 }}>
                      <NumericKeypad
                        value={editingField === "price" ? price : editingField === "cost" ? cost : quantity}
                        onChange={(v) => {
                          if (editingField === "price") setPrice(v);
                          else if (editingField === "cost") setCost(v);
                          else setQuantity(v);
                        }}
                        onSubmit={() => setEditingField(null)}
                        submitLabel="Done"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="space-y-2 pt-1">
                <button
                  onClick={() => handleCreate(true)}
                  disabled={submitting || !name.trim()}
                  className="w-full rounded-xl bg-accent px-4 py-3 text-lg font-semibold text-foreground hover:opacity-90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Adding to inventory...
                    </span>
                  ) : "Add to Inventory & Cart"}
                </button>

                <button
                  onClick={() => handleCreate(false)}
                  disabled={submitting || !name.trim()}
                  className="w-full rounded-xl border border-card-border px-4 py-3 text-lg font-medium text-foreground hover:bg-card-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Add to Inventory Only
                </button>

                <button
                  onClick={() => {
                    setError(null);
                    setState("assign");
                  }}
                  className="w-full text-sm text-muted hover:text-foreground text-center py-2 transition-colors"
                >
                  Skip &mdash; Assign to Existing Item
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
