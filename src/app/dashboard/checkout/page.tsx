"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatCents, parseDollars } from "@/lib/types";
import type { InventoryItem, Customer } from "@/lib/types";
import type { PaymentMethod } from "@/lib/payment";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface CartItem {
  inventory_item_id: string;
  name: string;
  category: string;
  price_cents: number;
  quantity: number;
  max_quantity: number;
}

interface ReceiptItem {
  name: string;
  quantity: number;
  price_cents: number;
  total_cents: number;
}

interface ReceiptData {
  store_name: string;
  date: string;
  items: ReceiptItem[];
  subtotal_cents: number;
  credit_applied_cents: number;
  payment_method: string;
  total_cents: number;
  change_cents: number;
  customer_name: string | null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function CheckoutPage() {
  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [applyCredit, setApplyCredit] = useState(false);
  const [creditInput, setCreditInput] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [tenderedInput, setTenderedInput] = useState("");
  const [processing, setProcessing] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<InventoryItem[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Customer search state
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);

  // Inline customer creation state
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustEmail, setNewCustEmail] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  // Pay slide-over state
  const [showPayPanel, setShowPayPanel] = useState(false);

  // Receipt modal state
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [receiptCustomerEmail, setReceiptCustomerEmail] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const customerSearchRef = useRef<HTMLInputElement>(null);
  const newCustNameRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ---- Derived values ----
  const subtotal = cart.reduce((s, i) => s + i.price_cents * i.quantity, 0);
  const cartItemCount = cart.reduce((s, i) => s + i.quantity, 0);
  const creditApplied =
    applyCredit && customer
      ? Math.min(
          creditInput ? parseDollars(creditInput) : customer.credit_balance_cents,
          customer.credit_balance_cents,
          subtotal
        )
      : 0;
  const amountDue = subtotal - creditApplied;
  const tendered = tenderedInput ? parseDollars(tenderedInput) : 0;
  const change =
    paymentMethod === "cash" || paymentMethod === "split"
      ? Math.max(0, tendered - amountDue)
      : 0;

  // ---- Inventory search ----
  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setSearchResults([]);
        setShowResults(false);
        return;
      }
      try {
        const res = await fetch(
          `/api/inventory/search?q=${encodeURIComponent(q)}`
        );
        const data: InventoryItem[] = await res.json();
        if (Array.isArray(data)) {
          // Check for exact barcode match -- auto-add
          const exactBarcode = data.find(
            (d) => d.barcode && d.barcode === q.trim() && d.quantity > 0
          );
          if (exactBarcode) {
            addToCart(exactBarcode);
            setSearchQuery("");
            setSearchResults([]);
            setShowResults(false);
            return;
          }
          setSearchResults(data.filter((d) => d.quantity > 0));
          setShowResults(true);
          setSelectedIndex(0);
        }
      } catch {
        // ignore
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(searchQuery), 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, doSearch]);

  // ---- Customer search ----
  const doCustomerSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setCustomerResults([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/customers?q=${encodeURIComponent(q)}`
      );
      const data = await res.json();
      if (Array.isArray(data)) {
        setCustomerResults(data);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!showCustomerSearch) return;
    const t = setTimeout(() => doCustomerSearch(customerQuery), 200);
    return () => clearTimeout(t);
  }, [customerQuery, showCustomerSearch, doCustomerSearch]);

  useEffect(() => {
    if (showCustomerSearch && customerSearchRef.current) {
      customerSearchRef.current.focus();
    }
  }, [showCustomerSearch]);

  useEffect(() => {
    if (showNewCustomerForm && newCustNameRef.current) {
      newCustNameRef.current.focus();
    }
  }, [showNewCustomerForm]);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "F4") {
        e.preventDefault();
        if (showPayPanel) {
          handleCompleteSale();
        } else if (cart.length > 0) {
          setShowPayPanel(true);
        }
      }
      if (e.key === "Escape" && showPayPanel) {
        setShowPayPanel(false);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, paymentMethod, tendered, creditApplied, customer, processing, showPayPanel]);

  // ---- Cart helpers ----
  function addToCart(item: InventoryItem) {
    setCart((prev) => {
      const existing = prev.find(
        (c) => c.inventory_item_id === item.id
      );
      if (existing) {
        if (existing.quantity >= item.quantity) return prev;
        return prev.map((c) =>
          c.inventory_item_id === item.id
            ? { ...c, quantity: c.quantity + 1 }
            : c
        );
      }
      return [
        ...prev,
        {
          inventory_item_id: item.id,
          name: item.name,
          category: item.category,
          price_cents: item.price_cents,
          quantity: 1,
          max_quantity: item.quantity,
        },
      ];
    });
    setSearchQuery("");
    setShowResults(false);
    searchRef.current?.focus();
  }

  function updateQty(id: string, delta: number) {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.inventory_item_id !== id) return c;
          const newQty = c.quantity + delta;
          if (newQty <= 0) return null;
          if (newQty > c.max_quantity) return c;
          return { ...c, quantity: newQty };
        })
        .filter(Boolean) as CartItem[]
    );
  }

  function removeItem(id: string) {
    setCart((prev) => prev.filter((c) => c.inventory_item_id !== id));
  }

  // ---- Inline customer creation ----
  async function handleCreateCustomer() {
    if (!newCustName.trim() || creatingCustomer) return;
    setCreatingCustomer(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCustName.trim(),
          email: newCustEmail.trim() || null,
          phone: newCustPhone.trim() || null,
        }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        setCustomer(data);
        setShowCustomerSearch(false);
        setShowNewCustomerForm(false);
        setNewCustName("");
        setNewCustEmail("");
        setNewCustPhone("");
        setCustomerQuery("");
        setCustomerResults([]);
      } else {
        alert(data.error || "Failed to create customer");
      }
    } catch {
      alert("Network error creating customer");
    } finally {
      setCreatingCustomer(false);
    }
  }

  // ---- Complete sale ----
  async function handleCompleteSale() {
    if (cart.length === 0 || processing) return;

    if (
      (paymentMethod === "cash" || paymentMethod === "split") &&
      tendered < amountDue
    ) {
      return; // insufficient tendered
    }

    if (
      (paymentMethod === "store_credit" || paymentMethod === "split") &&
      !customer
    ) {
      return;
    }

    setProcessing(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((c) => ({
            inventory_item_id: c.inventory_item_id,
            quantity: c.quantity,
            price_cents: c.price_cents,
          })),
          customer_id: customer?.id ?? null,
          payment_method: paymentMethod,
          amount_tendered_cents: tendered,
          credit_applied_cents: creditApplied,
          event_id: null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Checkout failed");
        setProcessing(false);
        return;
      }

      // Show receipt modal
      if (data.receipt) {
        setReceipt(data.receipt);
      }

      // Clear cart state (but keep receipt modal open)
      setCart([]);
      setCustomer(null);
      setApplyCredit(false);
      setCreditInput("");
      setPaymentMethod("cash");
      setTenderedInput("");
      setShowPayPanel(false);
    } catch {
      alert("Network error");
    } finally {
      setProcessing(false);
    }
  }

  // ---- Receipt helpers ----
  function handleNewSale() {
    setReceipt(null);
    setEmailSent(false);
    searchRef.current?.focus();
  }

  function handlePrintReceipt() {
    window.print();
  }

  async function handleEmailReceipt() {
    if (!receipt || emailSending) return;

    if (!receiptCustomerEmail) {
      alert("No customer email available");
      return;
    }

    setEmailSending(true);
    try {
      const res = await fetch("/api/receipts/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_email: receiptCustomerEmail,
          receipt,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEmailSent(true);
      } else {
        alert(data.error || "Failed to send receipt email");
      }
    } catch {
      alert("Network error sending email");
    } finally {
      setEmailSending(false);
    }
  }

  // ---- Search keyboard nav ----
  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (!showResults || searchResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, searchResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      addToCart(searchResults[selectedIndex]);
    } else if (e.key === "Escape") {
      setShowResults(false);
    }
  }

  // ---- Can complete? ----
  const canComplete =
    cart.length > 0 &&
    !processing &&
    (paymentMethod === "card" || paymentMethod === "store_credit"
      ? true
      : tendered >= amountDue);

  const paymentMethodLabel = (m: string) => {
    switch (m) {
      case "cash": return "Cash";
      case "card": return "Card";
      case "store_credit": return "Store Credit";
      case "split": return "Split";
      default: return m;
    }
  };

  return (
    <>
      {/* Print-only receipt styles */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #receipt-printable, #receipt-printable * { visibility: visible !important; }
          #receipt-printable {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 80mm !important;
            max-width: 80mm !important;
            padding: 4mm !important;
            margin: 0 !important;
            background: white !important;
            color: black !important;
            font-family: "Courier New", Courier, monospace !important;
            font-size: 12px !important;
            line-height: 1.4 !important;
          }
          #receipt-printable .no-print { display: none !important; }
          #receipt-printable h2 { font-size: 16px !important; margin: 0 0 4px 0 !important; }
          #receipt-printable .receipt-divider { border-top: 1px dashed black !important; margin: 6px 0 !important; }
        }
      `}</style>

      <div className="relative mx-auto max-w-7xl h-full flex flex-col">
        <h1 className="mb-4 text-2xl font-bold text-white">Register</h1>

        <div className="flex-1 grid gap-6 lg:grid-cols-2 min-h-0">
          {/* ============ LEFT: Search + Results ============ */}
          <div className="flex flex-col gap-4">
            <div className="relative">
              <input
                ref={searchRef}
                autoFocus
                tabIndex={1}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => searchResults.length > 0 && setShowResults(true)}
                placeholder="Scan barcode or search...  (F2)"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-4 text-lg text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />

              {/* Search results dropdown */}
              {showResults && searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl">
                  {searchResults.map((item, idx) => (
                    <button
                      key={item.id}
                      onClick={() => addToCart(item)}
                      className={`flex w-full items-center justify-between px-4 py-3 text-left transition-colors ${
                        idx === selectedIndex
                          ? "bg-zinc-800 text-white"
                          : "text-zinc-300 hover:bg-zinc-800"
                      }`}
                    >
                      <div>
                        <div className="font-medium">{item.name}</div>
                        <div className="text-xs text-zinc-500">
                          {item.category} &middot; {item.quantity} in stock
                          {item.barcode && ` \u00b7 ${item.barcode}`}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-emerald-400">
                        {formatCents(item.price_cents)}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {showResults && searchQuery && searchResults.length === 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-500">
                  No items found
                </div>
              )}
            </div>

            {/* Customer attach */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              {customer ? (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-zinc-400">Customer</div>
                    <div className="font-medium text-white">{customer.name}</div>
                    <div className="text-xs text-zinc-500">
                      Credit: {formatCents(customer.credit_balance_cents)}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setCustomer(null);
                      setApplyCredit(false);
                      setCreditInput("");
                      if (paymentMethod === "store_credit")
                        setPaymentMethod("cash");
                    }}
                    className="text-xs text-zinc-500 hover:text-red-400"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowCustomerSearch(true)}
                    className="flex-1 rounded-md border border-zinc-800 px-3 py-2 text-sm text-zinc-400 hover:border-zinc-600 hover:text-white"
                  >
                    + Attach Customer
                  </button>
                  <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300">
                    Guest
                  </span>
                </div>
              )}
            </div>

            {/* Cart items on mobile */}
            <div className="lg:hidden">{renderCart()}</div>
          </div>

          {/* ============ RIGHT: Cart ============ */}
          <div className="flex flex-col gap-4">
            <div className="hidden lg:block flex-1 min-h-0">
              {renderCart()}
            </div>

            {/* Subtotal bar */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex justify-between text-lg font-bold text-white">
                <span>Subtotal</span>
                <span>{formatCents(subtotal)}</span>
              </div>
              {cartItemCount > 0 && (
                <div className="text-sm text-zinc-500 mt-1">
                  {cartItemCount} item{cartItemCount !== 1 ? "s" : ""}
                </div>
              )}
            </div>

            {/* PAY button */}
            <button
              onClick={() => {
                if (customer?.email) {
                  setReceiptCustomerEmail(customer.email);
                } else {
                  setReceiptCustomerEmail(null);
                }
                setShowPayPanel(true);
              }}
              disabled={cart.length === 0}
              className={`w-full rounded-lg py-5 text-xl font-bold transition-colors ${
                cart.length > 0
                  ? "bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700"
                  : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
              }`}
            >
              PAY {subtotal > 0 ? formatCents(subtotal) : ""}
            </button>
          </div>
        </div>

        {/* ============ PAY SLIDE-OVER ============ */}
        {showPayPanel && (
          <div className="fixed inset-0 z-40 flex justify-end">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setShowPayPanel(false)}
            />

            {/* Panel */}
            <div className="relative z-50 flex w-full max-w-md flex-col bg-zinc-950 border-l border-zinc-800 shadow-2xl animate-slide-in-right">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
                <h2 className="text-lg font-bold text-white">Payment</h2>
                <button
                  onClick={() => setShowPayPanel(false)}
                  className="text-zinc-500 hover:text-white text-xl leading-none"
                >
                  &times;
                </button>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {/* Order summary */}
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                  <div className="text-sm font-medium text-zinc-400 mb-2">Order Summary</div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {cart.map((item) => (
                      <div
                        key={item.inventory_item_id}
                        className="flex justify-between text-sm"
                      >
                        <span className="text-zinc-300 truncate mr-2">
                          {item.name}
                          {item.quantity > 1 && (
                            <span className="text-zinc-500 ml-1">
                              x{item.quantity}
                            </span>
                          )}
                        </span>
                        <span className="text-white font-mono shrink-0">
                          {formatCents(item.price_cents * item.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 pt-2 border-t border-zinc-800 flex justify-between text-sm font-medium text-white">
                    <span>Subtotal</span>
                    <span className="font-mono">{formatCents(subtotal)}</span>
                  </div>
                </div>

                {/* Store credit toggle -- only when customer attached with balance */}
                {customer && customer.credit_balance_cents > 0 && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                    <label className="flex items-center gap-2 text-sm text-zinc-300">
                      <input
                        type="checkbox"
                        checked={applyCredit}
                        onChange={(e) => {
                          setApplyCredit(e.target.checked);
                          if (e.target.checked) {
                            setCreditInput(
                              (
                                Math.min(
                                  customer.credit_balance_cents,
                                  subtotal
                                ) / 100
                              ).toFixed(2)
                            );
                          }
                        }}
                        className="rounded border-zinc-700 bg-zinc-950"
                      />
                      Apply Store Credit ({formatCents(customer.credit_balance_cents)} available)
                    </label>
                    {applyCredit && (
                      <div className="mt-2 flex items-center gap-1">
                        <span className="text-sm text-zinc-400">$</span>
                        <input
                          type="text"
                          value={creditInput}
                          onChange={(e) => setCreditInput(e.target.value)}
                          className="w-24 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-white"
                        />
                      </div>
                    )}
                    {creditApplied > 0 && (
                      <div className="mt-2 flex justify-between text-sm text-amber-400">
                        <span>Credit applied</span>
                        <span>-{formatCents(creditApplied)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Payment method */}
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                  <div className="mb-3 text-sm text-zinc-400">Payment Method</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { value: "cash", label: "Cash" },
                        { value: "card", label: "Card" },
                        {
                          value: "store_credit",
                          label: "Credit",
                          disabled:
                            !customer || customer.credit_balance_cents <= 0,
                        },
                      ] as {
                        value: PaymentMethod;
                        label: string;
                        disabled?: boolean;
                      }[]
                    ).map((m) => (
                      <button
                        key={m.value}
                        tabIndex={3}
                        disabled={m.disabled}
                        onClick={() => {
                          setPaymentMethod(m.value);
                          if (m.value === "store_credit" && customer) {
                            setApplyCredit(true);
                            setCreditInput(
                              (
                                Math.min(
                                  customer.credit_balance_cents,
                                  subtotal
                                ) / 100
                              ).toFixed(2)
                            );
                          }
                        }}
                        className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                          paymentMethod === m.value
                            ? "bg-blue-600 text-white"
                            : m.disabled
                            ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {/* Cash tendered */}
                  {(paymentMethod === "cash" || paymentMethod === "split") && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm text-zinc-400">
                          Amount Tendered
                        </label>
                        <div className="flex items-center gap-1">
                          <span className="text-zinc-400">$</span>
                          <input
                            tabIndex={4}
                            type="text"
                            value={tenderedInput}
                            onChange={(e) => setTenderedInput(e.target.value)}
                            placeholder="0.00"
                            className="w-28 rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-right text-lg font-mono text-white focus:border-blue-500 focus:outline-none"
                            autoFocus
                          />
                        </div>
                      </div>
                      {tendered > 0 && tendered >= amountDue && (
                        <div className="flex items-center justify-between rounded-md bg-zinc-800 px-3 py-2">
                          <span className="text-sm text-zinc-400">Change</span>
                          <span className="text-lg font-bold text-emerald-400">
                            {formatCents(change)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Total due */}
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                  <div className="flex justify-between text-lg font-bold text-white">
                    <span>Total Due</span>
                    <span>{formatCents(amountDue)}</span>
                  </div>
                </div>
              </div>

              {/* Bottom actions */}
              <div className="border-t border-zinc-800 px-6 py-4 space-y-2">
                <button
                  tabIndex={5}
                  onClick={() => {
                    if (customer?.email) {
                      setReceiptCustomerEmail(customer.email);
                    } else {
                      setReceiptCustomerEmail(null);
                    }
                    handleCompleteSale();
                  }}
                  disabled={!canComplete}
                  className={`flex w-full items-center justify-center gap-2 rounded-lg py-4 text-lg font-bold transition-colors ${
                    canComplete
                      ? "bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700"
                      : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                  }`}
                >
                  {processing && (
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {processing ? "Processing..." : "Complete Sale  (F4)"}
                </button>
                <button
                  onClick={() => setShowPayPanel(false)}
                  className="w-full rounded-lg border border-zinc-800 py-3 text-sm font-medium text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Customer search modal */}
        {showCustomerSearch && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-24"
            onClick={() => {
              setShowCustomerSearch(false);
              setShowNewCustomerForm(false);
            }}
          >
            <div
              className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                ref={customerSearchRef}
                type="text"
                value={customerQuery}
                onChange={(e) => {
                  setCustomerQuery(e.target.value);
                  setShowNewCustomerForm(false);
                }}
                placeholder="Search customers by name..."
                className="mb-3 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
              />
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {customerResults.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCustomer(c);
                      setShowCustomerSearch(false);
                      setCustomerQuery("");
                      setCustomerResults([]);
                      setShowNewCustomerForm(false);
                    }}
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    <div>
                      <div className="font-medium text-white">{c.name}</div>
                      {c.email && (
                        <div className="text-xs text-zinc-500">{c.email}</div>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {formatCents(c.credit_balance_cents)}
                    </div>
                  </button>
                ))}

                {customerQuery && customerResults.length === 0 && !showNewCustomerForm && (
                  <div className="space-y-2 px-3 py-2">
                    <div className="text-sm text-zinc-500">No customers found</div>
                    <button
                      onClick={() => {
                        setShowNewCustomerForm(true);
                        setNewCustName(customerQuery);
                      }}
                      className="w-full rounded-md border border-blue-600 bg-blue-600/10 px-3 py-2 text-sm font-medium text-blue-400 hover:bg-blue-600/20"
                    >
                      + Create New Customer
                    </button>
                  </div>
                )}
              </div>

              {/* Inline new customer form */}
              {showNewCustomerForm && (
                <div className="mt-3 space-y-2 border-t border-zinc-800 pt-3">
                  <div className="text-sm font-medium text-zinc-300">New Customer</div>
                  <input
                    ref={newCustNameRef}
                    type="text"
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateCustomer();
                    }}
                    placeholder="Name (required)"
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                  />
                  <input
                    type="email"
                    value={newCustEmail}
                    onChange={(e) => setNewCustEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateCustomer();
                    }}
                    placeholder="Email (optional)"
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                  />
                  <input
                    type="tel"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateCustomer();
                    }}
                    placeholder="Phone (optional)"
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    onClick={handleCreateCustomer}
                    disabled={!newCustName.trim() || creatingCustomer}
                    className={`w-full rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      newCustName.trim() && !creatingCustomer
                        ? "bg-blue-600 text-white hover:bg-blue-500"
                        : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                    }`}
                  >
                    {creatingCustomer ? "Saving..." : "Save & Attach"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Receipt modal */}
        {receipt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div
              id="receipt-printable"
              className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
            >
              {/* Receipt header */}
              <div className="mb-4 text-center">
                <h2 className="text-xl font-bold text-white">{receipt.store_name}</h2>
                <div className="text-sm text-zinc-400">
                  {new Date(receipt.date).toLocaleString()}
                </div>
                {receipt.customer_name && (
                  <div className="mt-1 text-sm text-zinc-300">
                    Customer: {receipt.customer_name}
                  </div>
                )}
              </div>

              <div className="receipt-divider border-t border-dashed border-zinc-700" />

              {/* Items */}
              <div className="my-3 space-y-2">
                {receipt.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <div className="text-zinc-300">
                      <span>{item.name}</span>
                      {item.quantity > 1 && (
                        <span className="ml-1 text-zinc-500">x{item.quantity}</span>
                      )}
                    </div>
                    <div className="text-zinc-300 font-mono">
                      {formatCents(item.total_cents)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="receipt-divider border-t border-dashed border-zinc-700" />

              {/* Totals */}
              <div className="my-3 space-y-1">
                <div className="flex justify-between text-sm text-zinc-400">
                  <span>Subtotal</span>
                  <span className="font-mono">{formatCents(receipt.subtotal_cents)}</span>
                </div>
                {receipt.credit_applied_cents > 0 && (
                  <div className="flex justify-between text-sm text-amber-400">
                    <span>Store Credit</span>
                    <span className="font-mono">-{formatCents(receipt.credit_applied_cents)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm text-zinc-400">
                  <span>Payment</span>
                  <span>{paymentMethodLabel(receipt.payment_method)}</span>
                </div>
                <div className="flex justify-between border-t border-zinc-800 pt-2 text-lg font-bold text-white">
                  <span>Total</span>
                  <span className="font-mono">{formatCents(receipt.total_cents)}</span>
                </div>
                {receipt.change_cents > 0 && (
                  <div className="flex justify-between text-sm font-semibold text-emerald-400">
                    <span>Change</span>
                    <span className="font-mono">{formatCents(receipt.change_cents)}</span>
                  </div>
                )}
              </div>

              <div className="receipt-divider border-t border-dashed border-zinc-700" />

              <div className="mt-2 text-center text-xs text-zinc-500">
                Thank you for shopping at {receipt.store_name}!
              </div>

              {/* Actions (hidden in print) */}
              <div className="no-print mt-5 grid grid-cols-3 gap-2">
                <button
                  onClick={handlePrintReceipt}
                  className="rounded-md bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white"
                >
                  Print Receipt
                </button>
                {receiptCustomerEmail ? (
                  <button
                    onClick={handleEmailReceipt}
                    disabled={emailSending || emailSent}
                    className={`rounded-md px-3 py-2 text-sm font-medium ${
                      emailSent
                        ? "bg-emerald-900/40 text-emerald-400 cursor-default"
                        : emailSending
                        ? "bg-zinc-800 text-zinc-500 cursor-wait"
                        : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white"
                    }`}
                  >
                    {emailSent ? "Email Sent" : emailSending ? "Sending..." : "Email Receipt"}
                  </button>
                ) : (
                  <button
                    disabled
                    className="rounded-md bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-600 cursor-not-allowed"
                    title="No customer email"
                  >
                    Email Receipt
                  </button>
                )}
                <button
                  onClick={handleNewSale}
                  className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
                >
                  New Sale
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );

  /* ---- Shared cart renderer ---- */
  function renderCart() {
    if (cart.length === 0) {
      return (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-500">
          Cart is empty. Scan or search to add items.
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900">
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2">
          <span className="text-sm font-medium text-zinc-400">Cart</span>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-bold text-white">
            {cartItemCount}
          </span>
        </div>
        <div className="max-h-72 divide-y divide-zinc-800 overflow-y-auto">
          {cart.map((item) => (
            <div
              key={item.inventory_item_id}
              className="flex items-center gap-3 px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-medium text-white">
                  {item.name}
                </div>
                <div className="text-xs text-zinc-500">
                  {formatCents(item.price_cents)} each
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  tabIndex={2}
                  onClick={() => updateQty(item.inventory_item_id, -1)}
                  className="flex h-7 w-7 items-center justify-center rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                >
                  -
                </button>
                <span className="w-8 text-center text-sm font-medium text-white">
                  {item.quantity}
                </span>
                <button
                  tabIndex={2}
                  onClick={() => updateQty(item.inventory_item_id, 1)}
                  className="flex h-7 w-7 items-center justify-center rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                >
                  +
                </button>
              </div>
              <div className="w-20 text-right text-sm font-semibold text-white">
                {formatCents(item.price_cents * item.quantity)}
              </div>
              <button
                tabIndex={2}
                onClick={() => removeItem(item.inventory_item_id)}
                className="flex h-7 w-7 items-center justify-center rounded text-zinc-600 hover:bg-red-900/40 hover:text-red-400"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }
}
