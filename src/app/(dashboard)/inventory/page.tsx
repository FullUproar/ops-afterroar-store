"use client";

import { useState, useEffect, useCallback } from "react";
import { SearchInput } from "@/components/search-input";
import { createClient } from "@/lib/supabase/client";
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

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<NewItemForm>({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial load
  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data: staff } = await supabase
          .from("staff")
          .select("store_id")
          .eq("user_id", user.id)
          .single();

        if (!staff) return;

        const { data } = await supabase
          .from("inventory")
          .select("*")
          .eq("store_id", staff.store_id)
          .order("name")
          .range(0, 49);

        if (data) setItems(data as InventoryItem[]);
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
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data: staff } = await supabase
          .from("staff")
          .select("store_id")
          .eq("user_id", user.id)
          .single();

        if (!staff) return;

        const { data } = await supabase
          .from("inventory")
          .select("*")
          .eq("store_id", staff.store_id)
          .order("name")
          .range(0, 49);

        if (data) setItems(data as InventoryItem[]);
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

  const handleQuantityChange = useCallback(
    async (item: InventoryItem, delta: number) => {
      const newQty = Math.max(0, item.quantity + delta);

      // Optimistic update
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, quantity: newQty } : i))
      );

      try {
        const res = await fetch("/api/inventory", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id, quantity: newQty }),
        });

        if (!res.ok) {
          // Revert on failure
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id ? { ...i, quantity: item.quantity } : i
            )
          );
        }
      } catch {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, quantity: item.quantity } : i
          )
        );
      }
    },
    []
  );

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
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleQuantityChange(item, -1)}
                        className="flex h-6 w-6 items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                      >
                        -
                      </button>
                      <span
                        className={`min-w-[2rem] text-center font-medium ${getStockColor(item.quantity)}`}
                      >
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => handleQuantityChange(item, 1)}
                        className="flex h-6 w-6 items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {String((item.attributes as Record<string, unknown>)?.condition ?? "—")}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
