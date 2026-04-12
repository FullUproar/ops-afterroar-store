"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

/* ------------------------------------------------------------------ */
/*  QR Table Ordering — /order/[store-slug]/[table-label]              */
/*  Customer scans QR at their table, sees menu, orders from phone.    */
/*  No app install, no auth. Orders go to KDS.                         */
/* ------------------------------------------------------------------ */

interface MenuItem {
  id: string;
  name: string;
  category: string;
  price_cents: number;
  description: string | null;
  age_restricted: boolean;
  available: boolean;
}

interface Modifier {
  id: string;
  name: string;
  options: Array<{ name: string; price_cents: number }>;
  required: boolean;
  multi_select: boolean;
  applies_to: string[];
}

function formatCents(cents: number): string {
  return "$" + (cents / 100).toFixed(2);
}

const CATEGORY_LABELS: Record<string, string> = {
  drink: "Drinks",
  food: "Food",
  snack: "Snacks",
  alcohol: "Drinks (21+)",
  other: "Other",
};

export default function QROrderPage() {
  const params = useParams();
  const slug = params.slug as string;
  const tableLabel = decodeURIComponent(params.table as string);

  const [storeName, setStoreName] = useState("");
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<Array<{ item: MenuItem; qty: number; mods: string[] }>>([]);
  const [ordering, setOrdering] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [tabId, setTabId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // Get store info
        const storeRes = await fetch(`/api/clock?store=${encodeURIComponent(slug)}`);
        if (!storeRes.ok) { setError("Store not found"); return; }
        const storeData = await storeRes.json();
        setStoreName(storeData.store.name);

        // Get menu
        const menuRes = await fetch(`/api/cafe/public-menu?store=${encodeURIComponent(slug)}`);
        if (menuRes.ok) {
          const data = await menuRes.json();
          setMenuItems(data.menu_items || []);
          setModifiers(data.modifiers || []);
          if (data.tab_id) setTabId(data.tab_id);
        }
      } catch {
        setError("Unable to load menu");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id);
      if (existing) {
        return prev.map((c) => c.item.id === item.id ? { ...c, qty: c.qty + 1 } : c);
      }
      return [...prev, { item, qty: 1, mods: [] }];
    });
  }

  function removeFromCart(itemId: string) {
    setCart((prev) => prev.filter((c) => c.item.id !== itemId));
  }

  async function placeOrder() {
    if (cart.length === 0) return;
    setOrdering(true);
    try {
      const res = await fetch("/api/cafe/public-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_slug: slug,
          table_label: tableLabel,
          tab_id: tabId,
          items: cart.map((c) => ({
            menu_item_id: c.item.id,
            name: c.item.name,
            price_cents: c.item.price_cents,
            quantity: c.qty,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTabId(data.tab_id);
        setOrderPlaced(true);
        setCart([]);
        setTimeout(() => setOrderPlaced(false), 5000);
      }
    } catch {
      setError("Failed to place order");
    } finally {
      setOrdering(false);
    }
  }

  const cartTotal = cart.reduce((s, c) => s + c.item.price_cents * c.qty, 0);
  const cartCount = cart.reduce((s, c) => s + c.qty, 0);
  const categories = [...new Set(menuItems.map((i) => i.category))];

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-white">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-white p-6">
        <p className="text-lg text-gray-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10">
        <p className="text-xs text-amber-600 font-semibold uppercase tracking-wider">{storeName}</p>
        <h1 className="text-lg font-bold text-gray-900">Table {tableLabel}</h1>
      </header>

      {/* Order placed banner */}
      {orderPlaced && (
        <div className="bg-green-50 border-b border-green-200 px-4 py-3 text-center">
          <p className="text-sm text-green-700 font-medium">{"\u2713"} Order placed! Your items are being prepared.</p>
        </div>
      )}

      {/* Menu */}
      <div className="px-4 py-4 space-y-6 pb-32">
        {categories.map((cat) => (
          <div key={cat}>
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">
              {CATEGORY_LABELS[cat] || cat}
            </h2>
            <div className="space-y-2">
              {menuItems.filter((i) => i.category === cat && i.available).map((item) => (
                <button
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className="w-full flex items-center justify-between bg-white rounded-xl border border-gray-200 p-3 hover:border-amber-300 active:bg-amber-50 transition-colors text-left"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.name}</p>
                    {item.description && <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>}
                    {item.age_restricted && <p className="text-[10px] text-red-500 mt-0.5">21+ ID Required</p>}
                  </div>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums shrink-0 ml-3">{formatCents(item.price_cents)}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Cart footer */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 safe-area-pb">
          {/* Cart items */}
          <div className="space-y-1 mb-3 max-h-32 overflow-y-auto">
            {cart.map((c) => (
              <div key={c.item.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-gray-900">{c.item.name}{c.qty > 1 ? ` x${c.qty}` : ""}</span>
                  <button onClick={() => removeFromCart(c.item.id)} className="text-gray-400 hover:text-red-500 text-xs">{"\u00D7"}</button>
                </div>
                <span className="text-gray-700 tabular-nums">{formatCents(c.item.price_cents * c.qty)}</span>
              </div>
            ))}
          </div>
          <button
            onClick={placeOrder}
            disabled={ordering}
            className="w-full rounded-xl bg-amber-500 py-3 text-base font-bold text-white active:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {ordering ? "Placing order..." : `Order — ${formatCents(cartTotal)}`}
          </button>
        </div>
      )}
    </div>
  );
}
