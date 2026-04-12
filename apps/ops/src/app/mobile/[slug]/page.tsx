"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

/* ------------------------------------------------------------------ */
/*  Mobile Register — /mobile/[slug]                                   */
/*  Access-code paired, PIN-auth, slimmed-down POS for phone.          */
/*  3-step flow: Pair → Activate (PIN) → Sell                         */
/* ------------------------------------------------------------------ */

interface StaffOption { id: string; name: string }
interface CartItem {
  inventory_item_id: string;
  name: string;
  price_cents: number;
  quantity: number;
}
interface SearchResult {
  id: string;
  name: string;
  price_cents: number;
  quantity: number;
  category: string;
}
interface Guardrails {
  max_tx_per_session: number | null;
  max_tx_cents: number | null;
  allow_discounts: boolean;
  allow_refunds: boolean;
  allow_cash: boolean;
}

type Stage = "check" | "pair" | "activate" | "register";

function formatCents(cents: number): string {
  return "$" + (cents / 100).toFixed(2);
}

export default function MobileRegisterPage() {
  const params = useParams();
  const slug = params.slug as string;

  // Flow state
  const [stage, setStage] = useState<Stage>("check");
  const [storeName, setStoreName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Pair state
  const [accessCode, setAccessCode] = useState("");
  const [pairing, setPairing] = useState(false);

  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [guardrails, setGuardrails] = useState<Guardrails | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  // Activate state
  const [selectedStaff, setSelectedStaff] = useState<StaffOption | null>(null);
  const [pin, setPin] = useState("");
  const [activating, setActivating] = useState(false);
  const [staffName, setStaffName] = useState("");

  // Register state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [saleComplete, setSaleComplete] = useState<string | null>(null);
  const [txCount, setTxCount] = useState(0);

  const searchRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pinInputRef = useRef<HTMLInputElement>(null);

  // Step 1: Check if mobile register is enabled
  useEffect(() => {
    async function check() {
      try {
        const res = await fetch(`/api/mobile?store=${encodeURIComponent(slug)}`);
        const data = await res.json();
        if (!res.ok || !data.enabled) {
          setError("Mobile register is not enabled for this store.");
          return;
        }
        setStoreName(data.store.name);
        setStage("pair");
      } catch {
        setError("Unable to connect. Check your internet.");
      }
    }
    check();
  }, [slug]);

  // Step 2: Pair device
  async function handlePair() {
    setPairing(true);
    setError(null);
    try {
      const res = await fetch("/api/mobile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "pair",
          store_slug: slug,
          access_code: accessCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Pairing failed");
        setPairing(false);
        return;
      }
      setSessionId(data.session_id);
      setStaffList(data.staff);
      setGuardrails(data.guardrails);
      setExpiresAt(data.expires_at);
      setStoreName(data.store.name);
      setStage("activate");
    } catch {
      setError("Connection error");
    } finally {
      setPairing(false);
    }
  }

  // Step 3: Activate with PIN
  async function handleActivate() {
    if (!selectedStaff) return;
    setActivating(true);
    setError(null);
    try {
      const res = await fetch("/api/mobile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "activate",
          session_id: sessionId,
          staff_id: selectedStaff.id,
          pin,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid PIN");
        setActivating(false);
        return;
      }
      setStaffName(data.staff_name);
      setStage("register");
    } catch {
      setError("Connection error");
    } finally {
      setActivating(false);
    }
  }

  // Search inventory
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!query.trim()) { setSearchResults([]); return; }

    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        // Use the public clock API's store to get the store ID, then search inventory
        // Actually, we need an inventory search endpoint that works with session auth
        const res = await fetch(`/api/inventory/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data: SearchResult[] = await res.json();
          setSearchResults(data.filter(d => d.quantity > 0).slice(0, 20));
        }
      } catch {
        // Search failed silently
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  // Add to cart
  function addToCart(item: SearchResult) {
    setCart((prev) => {
      const existing = prev.find((c) => c.inventory_item_id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.inventory_item_id === item.id
            ? { ...c, quantity: c.quantity + 1 }
            : c
        );
      }
      return [...prev, {
        inventory_item_id: item.id,
        name: item.name,
        price_cents: item.price_cents,
        quantity: 1,
      }];
    });
    setSearchQuery("");
    setSearchResults([]);
    searchRef.current?.focus();
  }

  // Remove from cart
  function removeFromCart(itemId: string) {
    setCart((prev) => prev.filter((c) => c.inventory_item_id !== itemId));
  }

  // Cart total
  const cartTotal = cart.reduce((s, i) => s + i.price_cents * i.quantity, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  // Process sale
  async function handleCheckout(method: "card" | "cash") {
    if (cart.length === 0) return;

    // Check guardrails
    if (guardrails?.max_tx_cents && cartTotal > guardrails.max_tx_cents) {
      setError(`Total exceeds mobile limit (${formatCents(guardrails.max_tx_cents)})`);
      return;
    }

    setProcessing(true);
    setError(null);
    try {
      const res = await fetch("/api/mobile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "checkout",
          session_id: sessionId,
          pin,
          items: cart.map((c) => ({
            inventory_item_id: c.inventory_item_id,
            quantity: c.quantity,
            price_cents: c.price_cents,
          })),
          payment_method: method,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Checkout failed");
        setProcessing(false);
        return;
      }

      setTxCount(data.session_tx_count);
      setSaleComplete(`${formatCents(data.total_cents)} — ${method}`);
      setCart([]);
      setTimeout(() => setSaleComplete(null), 3000);
    } catch {
      setError("Connection error. Sale NOT processed.");
    } finally {
      setProcessing(false);
    }
  }

  // ---- CHECK: loading ----
  if (stage === "check") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#0a0a1a]">
        {error ? (
          <div className="text-center p-6">
            <p className="text-lg text-zinc-300">{error}</p>
            <p className="mt-2 text-sm text-zinc-500">Ask your store owner to enable mobile register in Settings.</p>
          </div>
        ) : (
          <div className="text-center">
            <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            <p className="text-sm text-zinc-400">Connecting...</p>
          </div>
        )}
      </div>
    );
  }

  // ---- PAIR: enter access code ----
  if (stage === "pair") {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#0a0a1a] p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <p className="text-xs uppercase tracking-widest text-amber-500/70 font-semibold">{storeName}</p>
            <h1 className="text-2xl font-bold text-zinc-100 mt-2">Mobile Register</h1>
            <p className="text-sm text-zinc-500 mt-1">Enter the store access code to pair this device</p>
          </div>

          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={accessCode}
            onChange={(e) => { setAccessCode(e.target.value.replace(/\D/g, "")); setError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && accessCode.length === 6) handlePair(); }}
            placeholder="000000"
            autoFocus
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-5 py-4 text-center text-3xl font-mono tracking-[0.5em] text-zinc-100 placeholder:text-zinc-700 focus:border-amber-500 focus:outline-none"
          />

          {error && (
            <p className="mt-3 text-center text-sm text-red-400">{error}</p>
          )}

          <button
            onClick={handlePair}
            disabled={pairing || accessCode.length !== 6}
            className="mt-4 w-full rounded-xl bg-amber-600 py-4 text-lg font-bold text-white active:bg-amber-700 disabled:opacity-40 transition-all"
          >
            {pairing ? "Pairing..." : "Pair Device"}
          </button>

          <p className="mt-4 text-center text-[10px] text-zinc-600">
            Get the access code from your store owner or manager
          </p>
        </div>
      </div>
    );
  }

  // ---- ACTIVATE: pick staff + PIN ----
  if (stage === "activate") {
    if (!selectedStaff) {
      return (
        <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#0a0a1a] p-6">
          <div className="w-full max-w-sm">
            <div className="text-center mb-6">
              <p className="text-xs uppercase tracking-widest text-green-500/70 font-semibold">Paired</p>
              <h2 className="text-xl font-bold text-zinc-100 mt-1">Who are you?</h2>
            </div>
            <div className="space-y-2">
              {staffList.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setSelectedStaff(s); setPin(""); setTimeout(() => pinInputRef.current?.focus(), 100); }}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4 text-left text-lg font-medium text-zinc-200 active:bg-zinc-800 transition-colors"
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#0a0a1a] p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <p className="text-lg font-semibold text-zinc-200">{selectedStaff.name}</p>
            <p className="text-sm text-zinc-500">Enter your PIN</p>
          </div>

          <input
            ref={pinInputRef}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={8}
            value={pin}
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && pin.length >= 4) handleActivate(); }}
            placeholder="PIN"
            autoFocus
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-5 py-4 text-center text-2xl font-mono tracking-[0.5em] text-zinc-100 placeholder:text-zinc-600 placeholder:tracking-normal focus:border-amber-500 focus:outline-none"
          />

          {error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}

          <button
            onClick={handleActivate}
            disabled={activating || pin.length < 4}
            className="mt-4 w-full rounded-xl bg-green-600 py-4 text-lg font-bold text-white active:bg-green-700 disabled:opacity-40 transition-all"
          >
            {activating ? "..." : "Start Selling"}
          </button>

          <button
            onClick={() => { setSelectedStaff(null); setPin(""); setError(null); }}
            className="mt-2 w-full text-center text-sm text-zinc-500 hover:text-zinc-300 transition-colors py-2"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // ---- REGISTER: search, cart, checkout ----
  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0a0a1a]">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-4 h-12 border-b border-zinc-800 bg-zinc-900">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-amber-500">{storeName}</span>
          <span className="text-xs text-zinc-500">{staffName}</span>
        </div>
        <div className="flex items-center gap-2">
          {guardrails?.max_tx_per_session && (
            <span className="text-[10px] text-zinc-600">
              {txCount}/{guardrails.max_tx_per_session} sales
            </span>
          )}
          <button
            onClick={() => {
              setStage("activate");
              setSelectedStaff(null);
              setPin("");
              setStaffName("");
              setCart([]);
              setSearchQuery("");
              setSearchResults([]);
            }}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Switch
          </button>
        </div>
      </header>

      {/* Sale complete banner */}
      {saleComplete && (
        <div className="bg-green-900/30 border-b border-green-500/30 px-4 py-2 text-center text-sm text-green-300 font-medium">
          {"\u2713"} {saleComplete}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="bg-red-900/30 border-b border-red-500/30 px-4 py-2 text-center text-sm text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-400">{"\u00D7"}</button>
        </div>
      )}

      {/* Search */}
      <div className="px-3 py-2 border-b border-zinc-800">
        <input
          ref={searchRef}
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search items or scan barcode..."
          autoFocus
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
        />
      </div>

      {/* Search results */}
      {searchResults.length > 0 && (
        <div className="max-h-48 overflow-y-auto border-b border-zinc-800">
          {searchResults.map((item) => (
            <button
              key={item.id}
              onClick={() => addToCart(item)}
              className="flex w-full items-center justify-between px-4 py-3 border-b border-zinc-800/50 text-left active:bg-zinc-800 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-200 truncate">{item.name}</p>
                <p className="text-[11px] text-zinc-500">{item.quantity} in stock</p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-zinc-200 tabular-nums ml-3">
                {formatCents(item.price_cents)}
              </span>
            </button>
          ))}
        </div>
      )}

      {searching && (
        <p className="text-center text-xs text-zinc-500 py-2">Searching...</p>
      )}

      {/* Cart */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {cart.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-zinc-600 text-sm">
            Search for items to add to cart
          </div>
        ) : (
          <div className="space-y-1">
            {cart.map((item) => (
              <div
                key={item.inventory_item_id}
                className="flex items-center justify-between rounded-xl bg-zinc-900 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-200 truncate">{item.name}</p>
                  <p className="text-xs text-zinc-500">
                    {item.quantity > 1 ? `${item.quantity} × ` : ""}
                    {formatCents(item.price_cents)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-sm font-semibold text-zinc-200 tabular-nums">
                    {formatCents(item.price_cents * item.quantity)}
                  </span>
                  <button
                    onClick={() => removeFromCart(item.inventory_item_id)}
                    className="text-zinc-600 hover:text-red-400 transition-colors text-lg"
                  >
                    {"\u00D7"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer: total + pay buttons */}
      {cart.length > 0 && (
        <div className="shrink-0 border-t border-zinc-800 bg-zinc-900 px-3 py-3 space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-sm text-zinc-400">{cartCount} item{cartCount !== 1 ? "s" : ""}</span>
            <span className="text-xl font-bold text-zinc-100 tabular-nums">{formatCents(cartTotal)}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleCheckout("card")}
              disabled={processing}
              className="flex-1 rounded-xl bg-indigo-600 py-3.5 text-base font-bold text-white active:bg-indigo-700 disabled:opacity-40 transition-all"
            >
              {processing ? "..." : "Card"}
            </button>
            {guardrails?.allow_cash !== false && (
              <button
                onClick={() => handleCheckout("cash")}
                disabled={processing}
                className="flex-1 rounded-xl bg-green-600 py-3.5 text-base font-bold text-white active:bg-green-700 disabled:opacity-40 transition-all"
              >
                {processing ? "..." : "Cash"}
              </button>
            )}
          </div>
          {guardrails?.max_tx_cents ? (
            <p className="text-[10px] text-zinc-600 text-center">
              Max per sale: {formatCents(guardrails.max_tx_cents)}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
