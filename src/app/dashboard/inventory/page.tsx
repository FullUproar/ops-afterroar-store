"use client";

import { useState, useEffect, useCallback } from "react";
import { SearchInput } from "@/components/search-input";
import { useStore } from "@/lib/store-context";
import {
  InventoryItem,
  ItemCategory,
  formatCents,
  parseDollars,
} from "@/lib/types";

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

  // Initial load
  useEffect(() => {
    async function load() {
      try {
        const [invRes, locRes] = await Promise.all([
          fetch("/api/inventory"),
          fetch("/api/locations"),
        ]);
        if (invRes.ok) {
          const data = await invRes.json();
          setItems(data as InventoryItem[]);
        }
        if (locRes.ok) {
          const locData = await locRes.json();
          setLocations(locData);
        }
      } catch (err) {
        console.error("Failed to load inventory:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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

  const getCategoryLabel = (cat: string) =>
    CATEGORIES.find((c) => c.value === cat)?.label ?? cat;

  const getStockColor = (qty: number) => {
    if (qty === 0) return "text-red-500";
    if (qty <= 3) return "text-orange-400";
    return "text-white";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Inventory</h1>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          {showAddForm ? "Cancel" : "Add Item"}
        </button>
      </div>

      <SearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search by name, barcode, or SKU..."
      />

      {showAddForm && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">New Item</h2>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
                placeholder="Item name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Category
              </label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value as ItemCategory })
                }
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Price ($)
              </label>
              <input
                type="text"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Cost ($)
              </label>
              <input
                type="text"
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })}
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Quantity
              </label>
              <input
                type="number"
                min={0}
                value={form.quantity}
                onChange={(e) =>
                  setForm({ ...form, quantity: parseInt(e.target.value) || 0 })
                }
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Barcode
              </label>
              <input
                type="text"
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
                placeholder="Scan or type barcode"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Condition
              </label>
              <select
                value={form.condition}
                onChange={(e) =>
                  setForm({ ...form, condition: e.target.value })
                }
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Language
              </label>
              <input
                type="text"
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
                placeholder="English"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Set Name
              </label>
              <input
                type="text"
                value={form.set_name}
                onChange={(e) => setForm({ ...form, set_name: e.target.value })}
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
                placeholder="Set or expansion name"
              />
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.foil}
                  onChange={(e) => setForm({ ...form, foil: e.target.checked })}
                  className="rounded border-zinc-700 bg-zinc-950 text-indigo-600 focus:ring-indigo-500"
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
              className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={submitting}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Creating..." : "Create Item"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center text-zinc-500 py-12">
          Loading inventory...
        </div>
      ) : items.length === 0 ? (
        <div className="text-center text-zinc-500 py-12">
          {searchQuery
            ? "No items match your search."
            : "No inventory items yet. Add your first item above."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900 text-left text-zinc-400">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium text-right">Price</th>
                <th className="px-4 py-3 font-medium text-right">Cost</th>
                <th className="px-4 py-3 font-medium text-center">Qty</th>
                <th className="px-4 py-3 font-medium">Condition</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {can("inventory.adjust") && (
                  <th className="px-4 py-3 font-medium text-center">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="bg-zinc-950 hover:bg-zinc-900/50 transition-colors"
                >
                  <td className="px-4 py-3 text-white font-medium">
                    {item.name}
                    {Boolean((item.attributes as Record<string, unknown>)?.foil) && (
                      <span className="ml-2 inline-block rounded bg-yellow-900/50 px-1.5 py-0.5 text-xs text-yellow-400">
                        Foil
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {getCategoryLabel(item.category)}
                  </td>
                  <td className="px-4 py-3 text-right text-white">
                    {formatCents(item.price_cents)}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-400">
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
                          <div key={ll.location_id} className="text-[10px] text-zinc-400">
                            {ll.location_name}: <span className="text-white">{ll.quantity}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {showLocationBreakdown === item.id && locationLevels.length === 0 && (
                      <div className="mt-1 text-[10px] text-zinc-500">No location data</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {String((item.attributes as Record<string, unknown>)?.condition ?? "\u2014")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        item.active
                          ? "bg-green-900/50 text-green-400"
                          : "bg-zinc-800 text-zinc-500"
                      }`}
                    >
                      {item.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {can("inventory.adjust") && (
                    <td className="px-4 py-3 text-center">
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
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {adjust && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => {
            setAdjust(null);
            setAdjustError(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-white mb-1">
              Adjust Stock
            </h2>
            <p className="text-sm text-zinc-400 mb-4">{adjust.item.name}</p>

            {/* Current quantity */}
            <div className="mb-4 rounded-md bg-zinc-950 border border-zinc-800 px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-zinc-400">Current Quantity</span>
              <span className="text-lg font-bold text-white">
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
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                Add
              </button>
              <button
                onClick={() => setAdjust({ ...adjust, type: "remove" })}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  adjust.type === "remove"
                    ? "bg-red-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                Remove
              </button>
            </div>

            {/* Amount */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Amount
              </label>
              <input
                type="number"
                min={1}
                value={adjust.amount}
                onChange={(e) =>
                  setAdjust({ ...adjust, amount: e.target.value })
                }
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
                placeholder="Enter quantity"
                autoFocus
              />
            </div>

            {/* Reason */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Reason *
              </label>
              <select
                value={adjust.reason}
                onChange={(e) =>
                  setAdjust({ ...adjust, reason: e.target.value })
                }
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
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
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Notes (optional)
              </label>
              <textarea
                value={adjust.notes}
                onChange={(e) =>
                  setAdjust({ ...adjust, notes: e.target.value })
                }
                rows={2}
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none resize-none"
                placeholder="Additional details..."
              />
            </div>

            {/* Preview */}
            {adjust.amount && parseInt(adjust.amount, 10) > 0 && (
              <div className="mb-4 rounded-md bg-zinc-950 border border-zinc-800 px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-zinc-400">New Quantity</span>
                <span className="text-lg font-bold text-white">
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
                className="flex-1 rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdjustSubmit}
                disabled={adjustSubmitting}
                className={`flex-1 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors ${
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
    </div>
  );
}
