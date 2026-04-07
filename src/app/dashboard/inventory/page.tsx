"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { SearchInput } from "@/components/search-input";
import { useStore } from "@/lib/store-context";
import {
  InventoryItem,
  ItemCategory,
  formatCents,
  parseDollars,
} from "@/lib/types";
import { StatusBadge } from "@/components/mobile-card";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/shared/ui";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { BarcodeLearnModal } from "@/components/barcode-learn-modal";
import { PrintLabelsModal } from "@/components/print-labels-modal";
import { useScanner } from "@/hooks/use-scanner";

const CATEGORIES: { value: ItemCategory; label: string }[] = [
  { value: "tcg_single", label: "TCG Single" },
  { value: "sealed", label: "Sealed" },
  { value: "board_game", label: "Board Game" },
  { value: "miniature", label: "Miniature" },
  { value: "accessory", label: "Accessory" },
  { value: "food_drink", label: "Food & Drink" },
  { value: "other", label: "Other" },
];

const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"] as const;

const ADJUSTMENT_REASONS = [
  "Received shipment",
  "Damaged/defective",
  "Physical count correction",
  "Theft/shrinkage",
  "Returned to supplier",
  "Other",
];

interface NewItemForm {
  name: string;
  category: ItemCategory;
  price: string;
  cost: string;
  quantity: number;
  barcode: string;
  condition: string;
  foil: boolean;
  language: string;
  set_name: string;
}

const EMPTY_FORM: NewItemForm = {
  name: "",
  category: "other",
  price: "",
  cost: "",
  quantity: 1,
  barcode: "",
  condition: "NM",
  foil: false,
  language: "English",
  set_name: "",
};

interface AdjustState {
  item: InventoryItem;
  type: "add" | "remove";
  amount: string;
  reason: string;
  notes: string;
}

export default function InventoryPage() {
  const { can } = useStore();

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<NewItemForm>({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Sorting
  type SortField = "name" | "price" | "quantity" | "category";
  type SortDir = "asc" | "desc";
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Stock adjustment modal
  const [adjust, setAdjust] = useState<AdjustState | null>(null);

  // Location breakdown
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [showLocationBreakdown, setShowLocationBreakdown] = useState<string | null>(null);
  const [locationLevels, setLocationLevels] = useState<
    Array<{ location_id: string; location_name: string; quantity: number }>
  >([]);
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // Print labels modal
  const [showLabels, setShowLabels] = useState(false);

  // Shopify sync
  const [showShopifySync, setShowShopifySync] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Scan to add
  const [showScanner, setShowScanner] = useState(false);
  const [learnBarcode, setLearnBarcode] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  // USB/Bluetooth barcode scanner support (same as register)
  useScanner({
    onScan: (code) => handleInventoryScan(code),
    enabled: !showScanner && !learnBarcode && !showAddForm,
  });

  const loadInventory = useCallback(async () => {
    try {
      setLoadError(null);
      const [invRes, locRes] = await Promise.all([
        fetch("/api/inventory"),
        fetch("/api/locations"),
      ]);
      if (!invRes.ok) {
        setLoadError("Failed to load inventory. Try again.");
        return;
      }
      const data = await invRes.json();
      setItems(data as InventoryItem[]);
      if (locRes.ok) {
        const locData = await locRes.json();
        setLocations(locData);
      }
    } catch {
      setLoadError("Failed to load inventory. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/inventory/search?q=${encodeURIComponent(searchQuery.trim())}`
        );
        if (res.ok) {
          const data = await res.json();
          setItems(data);
        }
      } catch (err) {
        console.error("Search failed:", err);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset to full list when search is cleared
  useEffect(() => {
    if (searchQuery.trim() === "") {
      (async () => {
        const res = await fetch("/api/inventory");
        if (res.ok) {
          const data = await res.json();
          setItems(data as InventoryItem[]);
        }
      })();
    }
  }, [searchQuery]);

  const handleCreate = useCallback(async () => {
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          category: form.category,
          price_cents: parseDollars(form.price),
          cost_cents: parseDollars(form.cost),
          quantity: form.quantity,
          barcode: form.barcode.trim() || null,
          attributes: {
            condition: form.condition,
            foil: form.foil,
            language: form.language.trim() || "English",
            set_name: form.set_name.trim() || null,
          },
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to create item");
      }

      const newItem = await res.json();
      setItems((prev) => [newItem, ...prev]);
      setForm({ ...EMPTY_FORM });
      setShowAddForm(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [form]);

  const handleAdjustSubmit = useCallback(async () => {
    if (!adjust) return;

    const amount = parseInt(adjust.amount, 10);
    if (!amount || amount <= 0) {
      setAdjustError("Enter a valid amount greater than 0");
      return;
    }

    if (!adjust.reason) {
      setAdjustError("Please select a reason");
      return;
    }

    const adjustment = adjust.type === "add" ? amount : -amount;

    setAdjustSubmitting(true);
    setAdjustError(null);

    try {
      const res = await fetch("/api/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: adjust.item.id,
          adjustment,
          reason: adjust.reason,
          notes: adjust.notes.trim() || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to adjust stock");
      }

      const updatedItem = await res.json();
      setItems((prev) =>
        prev.map((i) => (i.id === updatedItem.id ? updatedItem : i))
      );
      setAdjust(null);
    } catch (err: any) {
      setAdjustError(err.message);
    } finally {
      setAdjustSubmitting(false);
    }
  }, [adjust]);

  async function handleToggleCatalogShare(item: InventoryItem) {
    if (item.shared_to_catalog) {
      // Unshare: set shared_to_catalog = false, catalog_product_id = null
      try {
        const res = await fetch("/api/inventory/catalog-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inventory_item_id: item.id,
            action: "unshare",
          }),
        });
        if (res.ok) {
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? { ...i, shared_to_catalog: false, catalog_product_id: null }
                : i
            )
          );
        }
      } catch {
        // Silently fail
      }
    } else {
      // Share to catalog
      try {
        const res = await fetch("/api/catalog/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inventory_item_id: item.id }),
        });
        if (res.ok) {
          const data = await res.json();
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? {
                    ...i,
                    shared_to_catalog: true,
                    catalog_product_id: data.catalog_product_id,
                  }
                : i
            )
          );
        }
      } catch {
        // Silently fail
      }
    }
  }

  async function handleToggleLendable(item: InventoryItem) {
    const newValue = !item.lendable;
    try {
      const res = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, lendable: newValue }),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, lendable: newValue } : i))
        );
      }
    } catch {
      // Silently fail
    }
  }

  const getCategoryLabel = (cat: string) =>
    CATEGORIES.find((c) => c.value === cat)?.label ?? cat;

  const getStockColor = (qty: number) => {
    if (qty === 0) return "text-red-500";
    if (qty <= 3) return "text-orange-400";
    return "text-foreground";
  };

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function getSortArrow(field: SortField) {
    if (sortField !== field) return "";
    return sortDir === "asc" ? " \u25B2" : " \u25BC";
  }

  async function handleInventoryScan(code: string) {
    setShowScanner(false);
    setScanMessage(null);

    // Check if item already exists
    try {
      const res = await fetch(`/api/inventory/search?q=${encodeURIComponent(code)}`);
      if (res.ok) {
        const data: InventoryItem[] = await res.json();
        const match = data.find((d) => d.barcode === code);
        if (match) {
          // Highlight existing item and filter to it
          setSearchQuery(code);
          setScanMessage(`\u2713 ${match.name} — ${match.quantity} in stock`);
          setTimeout(() => setScanMessage(null), 5000);
          return;
        }
      }
    } catch {}

    // Not found — open learn modal for UPC lookup + auto-fill
    setLearnBarcode(code);
  }

  const sortedItems = [...items].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortField) {
      case "name":
        return dir * a.name.localeCompare(b.name);
      case "price":
        return dir * (a.price_cents - b.price_cents);
      case "quantity":
        return dir * (a.quantity - b.quantity);
      case "category":
        return dir * a.category.localeCompare(b.category);
      default:
        return 0;
    }
  });

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title={`Inventory${items.length > 0 ? ` (${items.length})` : ""}`}
        action={
          <div className="flex gap-1.5 sm:gap-2">
            <button
              onClick={() => setShowShopifySync(!showShopifySync)}
              className="hidden sm:block rounded-xl border border-blue-500/30 px-4 py-2 text-sm font-medium text-blue-400 hover:bg-blue-500/10 transition-colors"
            >
              Shopify Sync
            </button>
            <button
              onClick={() => setShowLabels(true)}
              className="hidden sm:block rounded-xl border border-card-border px-4 py-2 text-sm font-medium text-muted hover:bg-card-hover transition-colors"
            >
              Print Labels
            </button>
            <button
              onClick={() => setShowScanner(true)}
              className="flex items-center gap-1.5 rounded-xl border border-card-border px-2.5 sm:px-4 py-2 text-sm font-medium text-muted hover:bg-card-hover transition-colors shrink-0"
            >
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" title="Scanner listening" />
              <span className="hidden sm:inline">Scan to Add</span>
              <span className="sm:hidden">Scan</span>
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="rounded-xl bg-accent px-3 sm:px-4 py-2 text-sm font-medium text-foreground hover:opacity-90 transition-colors shrink-0"
            >
              {showAddForm ? "Cancel" : "Add Item"}
            </button>
          </div>
        }
      />

      {/* Shopify Sync Panel */}
      {showShopifySync && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-950/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-blue-400">Shopify Inventory Sync</h3>
            <button onClick={() => setShowShopifySync(false)} className="text-xs text-muted hover:text-foreground">Close</button>
          </div>
          <p className="text-xs text-muted">Manage online allocation for all Shopify-linked items at once.</p>
          <div className="flex flex-wrap gap-2">
            {[
              { action: "sync_from_shopify", label: "Sync from Shopify", desc: "Set allocations to match current Shopify quantities" },
              { action: "match_stock", label: "All Stock Online", desc: "Set allocation = full stock for every item" },
              { action: "zero_all", label: "Take All Offline", desc: "Set all allocations to 0" },
              { action: "push_all", label: "Push to Shopify", desc: "Push current allocations to Shopify" },
            ].map((btn) => (
              <button
                key={btn.action}
                onClick={async () => {
                  setSyncing(true);
                  setSyncResult(null);
                  try {
                    const res = await fetch("/api/inventory/shopify-sync", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: btn.action }),
                    });
                    const data = await res.json();
                    setSyncResult(res.ok ? `${btn.label}: ${data.updated ?? 0} items updated` : data.error);
                  } catch {
                    setSyncResult("Sync failed");
                  } finally {
                    setSyncing(false);
                  }
                }}
                disabled={syncing}
                title={btn.desc}
                className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs font-medium text-blue-300 hover:bg-blue-500/15 disabled:opacity-50 transition-colors"
              >
                {syncing ? "..." : btn.label}
              </button>
            ))}
          </div>
          {syncResult && <p className="text-xs text-blue-300">{syncResult}</p>}
        </div>
      )}

      <SearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search by name, barcode, or SKU..."
      />

      {scanMessage && (
        <div className="rounded-xl bg-emerald-500/20 border border-emerald-500/40 px-4 py-2 text-sm text-emerald-300">
          {scanMessage}
        </div>
      )}

      {showAddForm && (
        <div className="rounded-xl border border-card-border bg-card p-6 space-y-4 shadow-sm dark:shadow-none">
          <h2 className="text-lg font-semibold text-foreground">New Item</h2>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-muted mb-1">
                Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-xl border border-input-border bg-input-bg px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                placeholder="Item name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-1">
                Category
              </label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value as ItemCategory })
                }
                className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-foreground focus:border-indigo-500 focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-1">
                Price ($)
              </label>
              <input
                type="text"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="w-full rounded-xl border border-input-border bg-input-bg px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-1">
                Cost ($)
              </label>
              <input
                type="text"
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })}
                className="w-full rounded-xl border border-input-border bg-input-bg px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-1">
                Quantity
              </label>
              <input
                type="number"
                min={0}
                value={form.quantity}
                onChange={(e) =>
                  setForm({ ...form, quantity: parseInt(e.target.value) || 0 })
                }
                className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-foreground focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-1">
                Barcode
              </label>
              <input
                type="text"
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                className="w-full rounded-xl border border-input-border bg-input-bg px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                placeholder="Scan or type barcode"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-1">
                Condition
              </label>
              <select
                value={form.condition}
                onChange={(e) =>
                  setForm({ ...form, condition: e.target.value })
                }
                className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-foreground focus:border-indigo-500 focus:outline-none"
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-1">
                Language
              </label>
              <input
                type="text"
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
                className="w-full rounded-xl border border-input-border bg-input-bg px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                placeholder="English"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-1">
                Set Name
              </label>
              <input
                type="text"
                value={form.set_name}
                onChange={(e) => setForm({ ...form, set_name: e.target.value })}
                className="w-full rounded-xl border border-input-border bg-input-bg px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                placeholder="Set or expansion name"
              />
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.foil}
                  onChange={(e) => setForm({ ...form, foil: e.target.checked })}
                  className="rounded border-zinc-700 bg-background text-indigo-600 focus:ring-indigo-500"
                />
                Foil / Holographic
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => {
                setShowAddForm(false);
                setForm({ ...EMPTY_FORM });
                setError(null);
              }}
              className="rounded-xl border border-card-border px-4 py-2 text-sm text-muted hover:bg-card-hover transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={submitting}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Creating..." : "Create Item"}
            </button>
          </div>
        </div>
      )}

      {loadError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
          <p className="text-sm text-red-400">{loadError}</p>
          <button
            onClick={() => { setLoadError(null); loadInventory(); }}
            className="mt-2 text-xs text-red-300 underline hover:text-red-200"
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center text-muted py-12">
          Loading inventory...
        </div>
      ) : items.length === 0 && !loadError ? (
        <EmptyState
          icon="&#x1F4E6;"
          title={searchQuery ? "No items match your search" : "No inventory items yet"}
          description={searchQuery ? undefined : "Add your first item to start tracking inventory."}
          action={!searchQuery ? { label: "Add Your First Item", onClick: () => setShowAddForm(true) } : undefined}
        />
      ) : (
        <>
          {/* Mobile sort controls */}
          <div className="md:hidden flex gap-2 flex-wrap">
            {([
              { field: "name" as SortField, label: "Name" },
              { field: "price" as SortField, label: "Price" },
              { field: "quantity" as SortField, label: "Qty" },
              { field: "category" as SortField, label: "Category" },
            ]).map((s) => (
              <button
                key={s.field}
                onClick={() => handleSort(s.field)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  sortField === s.field
                    ? "border-accent bg-accent-light text-accent"
                    : "border-card-border bg-card text-muted hover:border-accent/50"
                }`}
              >
                {s.label}{getSortArrow(s.field)}
              </button>
            ))}
          </div>

          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {sortedItems.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-card-border bg-card p-4 shadow-sm dark:shadow-none"
              >
                <div className="flex items-center justify-between">
                  <Link
                    href={`/dashboard/inventory/${item.id}`}
                    className="font-semibold text-foreground truncate mr-2 leading-snug hover:text-accent transition-colors"
                  >
                    {item.name}
                    {Boolean((item.attributes as Record<string, unknown>)?.foil) && (
                      <StatusBadge variant="pending" className="ml-1.5">Foil</StatusBadge>
                    )}
                    {item.shared_to_catalog && (
                      <StatusBadge variant="info" className="ml-1.5">Shared</StatusBadge>
                    )}
                    {item.catalog_product_id && !item.shared_to_catalog && (
                      <StatusBadge variant="info" className="ml-1.5">Linked</StatusBadge>
                    )}
                  </Link>
                  <span className="text-sm font-semibold text-foreground whitespace-nowrap tabular-nums">
                    {formatCents(item.price_cents)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-xs text-muted">{getCategoryLabel(item.category)}</span>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-medium ${getStockColor(item.quantity)}`}>
                      Qty: {item.quantity}
                    </span>
                    {can("inventory.adjust") && (
                      <div className="flex items-center gap-1">
                        {item.category === "board_game" && (
                          <button
                            onClick={() => handleToggleLendable(item)}
                            className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors min-h-11 flex items-center ${
                              item.lendable
                                ? "bg-green-600/20 text-green-400 hover:bg-green-600/30"
                                : "bg-zinc-700/50 text-muted hover:bg-zinc-700"
                            }`}
                          >
                            {item.lendable ? "Lendable" : "Lend"}
                          </button>
                        )}
                        <button
                          onClick={() => handleToggleCatalogShare(item)}
                          className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors min-h-11 flex items-center ${
                            item.shared_to_catalog
                              ? "bg-blue-600/20 text-blue-400 hover:bg-blue-600/30"
                              : "bg-zinc-700/50 text-muted hover:bg-zinc-700"
                          }`}
                        >
                          {item.shared_to_catalog ? "Unshare" : "Share"}
                        </button>
                        <button
                          onClick={() =>
                            setAdjust({
                              item,
                              type: "add",
                              amount: "",
                              reason: "",
                              notes: "",
                            })
                          }
                          className="rounded-md bg-indigo-600/20 px-3 py-1.5 text-xs font-medium text-indigo-400 hover:bg-indigo-600/30 transition-colors min-h-11 flex items-center"
                        >
                          Adjust
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-card-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-card text-left text-muted">
                  <th
                    className="px-4 py-3 font-medium cursor-pointer hover:text-foreground select-none transition-colors"
                    onClick={() => handleSort("name")}
                  >
                    Name{getSortArrow("name")}
                  </th>
                  <th
                    className="px-4 py-3 font-medium cursor-pointer hover:text-foreground select-none transition-colors"
                    onClick={() => handleSort("category")}
                  >
                    Category{getSortArrow("category")}
                  </th>
                  <th
                    className="px-4 py-3 font-medium text-right cursor-pointer hover:text-foreground select-none transition-colors"
                    onClick={() => handleSort("price")}
                  >
                    Price{getSortArrow("price")}
                  </th>
                  <th className="px-4 py-3 font-medium text-right">Cost</th>
                  <th
                    className="px-4 py-3 font-medium text-center cursor-pointer hover:text-foreground select-none transition-colors"
                    onClick={() => handleSort("quantity")}
                  >
                    Qty{getSortArrow("quantity")}
                  </th>
                  <th className="px-4 py-3 font-medium">Condition</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  {can("inventory.adjust") && (
                    <th className="px-4 py-3 font-medium text-center">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {sortedItems.map((item) => (
                  <tr
                    key={item.id}
                    className="bg-background hover:bg-card/50 transition-colors"
                  >
                    <td className="px-4 py-3 text-foreground font-medium">
                      <Link
                        href={`/dashboard/inventory/${item.id}`}
                        className="hover:text-accent transition-colors"
                      >
                        {item.name}
                      </Link>
                      {Boolean((item.attributes as Record<string, unknown>)?.foil) && (
                        <span className="ml-2 inline-block rounded bg-yellow-900/50 px-1.5 py-0.5 text-xs text-yellow-400">
                          Foil
                        </span>
                      )}
                      {item.lendable && (
                        <span className="ml-2 inline-block rounded bg-green-900/50 px-1.5 py-0.5 text-xs text-green-400">
                          Lendable
                        </span>
                      )}
                      {item.shared_to_catalog && (
                        <span className="ml-2 inline-block rounded bg-blue-900/50 px-1.5 py-0.5 text-xs text-blue-400">
                          Shared
                        </span>
                      )}
                      {item.catalog_product_id && !item.shared_to_catalog && (
                        <span className="ml-2 inline-block rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-muted">
                          Linked
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {getCategoryLabel(item.category)}
                    </td>
                    <td className="px-4 py-3 text-right text-foreground">
                      {formatCents(item.price_cents)}
                    </td>
                    <td className="px-4 py-3 text-right text-muted">
                      {formatCents(item.cost_cents)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`font-medium ${getStockColor(item.quantity)}`}
                      >
                        {item.quantity}
                      </span>
                      {locations.length > 0 && (
                        <button
                          onClick={async () => {
                            if (showLocationBreakdown === item.id) {
                              setShowLocationBreakdown(null);
                              return;
                            }
                            setShowLocationBreakdown(item.id);
                            try {
                              const res = await fetch(`/api/inventory/levels?item_id=${item.id}`);
                              if (res.ok) {
                                const data = await res.json();
                                setLocationLevels(data);
                              }
                            } catch {
                              setLocationLevels([]);
                            }
                          }}
                          className="block mx-auto mt-0.5 text-[10px] text-zinc-500 hover:text-blue-400 transition-colors"
                        >
                          {showLocationBreakdown === item.id ? "hide" : "by location"}
                        </button>
                      )}
                      {showLocationBreakdown === item.id && locationLevels.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {locationLevels.map((ll) => (
                            <div key={ll.location_id} className="text-[10px] text-muted">
                              {ll.location_name}: <span className="text-foreground">{ll.quantity}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {showLocationBreakdown === item.id && locationLevels.length === 0 && (
                        <div className="mt-1 text-[10px] text-zinc-500">No location data</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {String((item.attributes as Record<string, unknown>)?.condition ?? "\u2014")}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge variant={item.active ? "success" : "info"}>
                        {item.active ? "Active" : "Inactive"}
                      </StatusBadge>
                    </td>
                    {can("inventory.adjust") && (
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {item.category === "board_game" && (
                            <button
                              onClick={() => handleToggleLendable(item)}
                              className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                                item.lendable
                                  ? "bg-green-600/20 text-green-400 hover:bg-green-600/30"
                                  : "bg-zinc-700/50 text-muted hover:bg-zinc-700"
                              }`}
                            >
                              {item.lendable ? "Lendable" : "Lend"}
                            </button>
                          )}
                          <button
                            onClick={() => handleToggleCatalogShare(item)}
                            className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                              item.shared_to_catalog
                                ? "bg-blue-600/20 text-blue-400 hover:bg-blue-600/30"
                                : "bg-zinc-700/50 text-muted hover:bg-zinc-700"
                            }`}
                          >
                            {item.shared_to_catalog ? "Unshare" : "Share"}
                          </button>
                          <button
                            onClick={() =>
                              setAdjust({
                                item,
                                type: "add",
                                amount: "",
                                reason: "",
                                notes: "",
                              })
                            }
                            className="rounded-md bg-indigo-600/20 px-3 py-1.5 text-xs font-medium text-indigo-400 hover:bg-indigo-600/30 transition-colors"
                          >
                            Adjust Stock
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Stock Adjustment Modal */}
      {adjust && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-bg"
          onClick={() => {
            setAdjust(null);
            setAdjustError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setAdjust(null);
              setAdjustError(null);
            }
          }}
        >
          <div
            ref={(el: HTMLDivElement | null) => {
              if (!el) return;
              const handler = (e: FocusEvent) => {
                const target = e.target as HTMLElement;
                if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") {
                  setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
                }
              };
              el.addEventListener("focusin", handler);
              return () => el.removeEventListener("focusin", handler);
            }}
            className="w-full max-w-md rounded-xl border border-card-border bg-card p-6 shadow-2xl mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-semibold text-foreground">
                Adjust Stock
              </h2>
              <button
                onClick={() => {
                  setAdjust(null);
                  setAdjustError(null);
                }}
                className="flex items-center justify-center h-8 w-8 rounded-full text-muted hover:text-foreground active:bg-card-hover transition-colors text-lg"
              >
                &times;
              </button>
            </div>
            <p className="text-sm text-muted mb-4">{adjust.item.name}</p>

            {/* Current quantity */}
            <div className="mb-4 rounded-md bg-background border border-card-border px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-muted">Current Quantity</span>
              <span className="text-lg font-bold text-foreground">
                {adjust.item.quantity}
              </span>
            </div>

            {adjustError && (
              <p className="mb-3 text-sm text-red-400">{adjustError}</p>
            )}

            {/* Add / Remove toggle */}
            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => setAdjust({ ...adjust, type: "add" })}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  adjust.type === "add"
                    ? "bg-emerald-600 text-foreground"
                    : "bg-zinc-800 text-muted hover:bg-zinc-700"
                }`}
              >
                Add
              </button>
              <button
                onClick={() => setAdjust({ ...adjust, type: "remove" })}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  adjust.type === "remove"
                    ? "bg-red-600 text-foreground"
                    : "bg-zinc-800 text-muted hover:bg-zinc-700"
                }`}
              >
                Remove
              </button>
            </div>

            {/* Amount */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-muted mb-1">
                Amount
              </label>
              <input
                type="number"
                min={1}
                value={adjust.amount}
                onChange={(e) =>
                  setAdjust({ ...adjust, amount: e.target.value })
                }
                className="w-full rounded-xl border border-input-border bg-input-bg px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                placeholder="Enter quantity"
                autoFocus
              />
            </div>

            {/* Reason */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-muted mb-1">
                Reason *
              </label>
              <select
                value={adjust.reason}
                onChange={(e) =>
                  setAdjust({ ...adjust, reason: e.target.value })
                }
                className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-foreground focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Select a reason...</option>
                {ADJUSTMENT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-muted mb-1">
                Notes (optional)
              </label>
              <textarea
                value={adjust.notes}
                onChange={(e) =>
                  setAdjust({ ...adjust, notes: e.target.value })
                }
                rows={2}
                className="w-full rounded-xl border border-input-border bg-input-bg px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none resize-none"
                placeholder="Additional details..."
              />
            </div>

            {/* Preview */}
            {adjust.amount && parseInt(adjust.amount, 10) > 0 && (
              <div className="mb-4 rounded-md bg-background border border-card-border px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-muted">New Quantity</span>
                <span className="text-lg font-bold text-foreground">
                  {adjust.type === "add"
                    ? adjust.item.quantity + parseInt(adjust.amount, 10)
                    : Math.max(
                        0,
                        adjust.item.quantity - parseInt(adjust.amount, 10)
                      )}
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setAdjust(null);
                  setAdjustError(null);
                }}
                className="flex-1 rounded-xl border border-card-border px-4 py-2 text-sm text-muted hover:bg-card-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdjustSubmit}
                disabled={adjustSubmitting}
                className={`flex-1 rounded-md px-4 py-2 text-sm font-medium text-foreground transition-colors ${
                  adjust.type === "add"
                    ? "bg-emerald-600 hover:bg-emerald-500"
                    : "bg-red-600 hover:bg-red-500"
                } disabled:opacity-50`}
              >
                {adjustSubmitting ? "Adjusting..." : "Confirm Adjustment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Scanner overlay */}
      {showScanner && (
        <BarcodeScanner
          onScan={(code) => handleInventoryScan(code)}
          onClose={() => setShowScanner(false)}
          title="Scan to Add"
        />
      )}

      {/* Print Labels Modal */}
      {showLabels && (
        <PrintLabelsModal onClose={() => setShowLabels(false)} />
      )}

      {/* Learn Barcode Modal */}
      {learnBarcode && (
        <BarcodeLearnModal
          barcode={learnBarcode}
          onClose={() => setLearnBarcode(null)}
          onItemCreated={(item) => {
            setItems((prev) => [item, ...prev]);
            setScanMessage(`Added: ${item.name}`);
            setTimeout(() => setScanMessage(null), 4000);
          }}
          onBarcodeAssigned={(item) => {
            setItems((prev) =>
              prev.map((i) => (i.id === item.id ? item : i))
            );
            setScanMessage(`Barcode assigned to ${item.name}`);
            setTimeout(() => setScanMessage(null), 4000);
          }}
        />
      )}
    </div>
  );
}
