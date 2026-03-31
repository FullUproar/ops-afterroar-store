"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatCents, parseDollars } from "@/lib/types";
import type { InventoryItem, Customer } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import type { PaymentMethod } from "@/lib/payment";
import {
  searchInventoryLocal,
  searchCustomersLocal,
  enqueueTx,
  decrementLocalInventory,
  updateLocalCustomerCredit,
} from "@/lib/offline-db";
import { useStoreName, useStoreSettings } from "@/lib/store-settings";
import { CategoryBrowser } from "@/components/category-browser";
import { BarcodeScanner } from "@/components/barcode-scanner";

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
  tax_cents: number;
  discount_cents?: number;
  credit_applied_cents: number;
  gift_card_applied_cents?: number;
  loyalty_discount_cents?: number;
  payment_method: string;
  total_cents: number;
  change_cents: number;
  customer_name: string | null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function CheckoutPage() {
  const storeName = useStoreName();
  const storeSettings = useStoreSettings();

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

  // Unlisted item state
  const [showUnlisted, setShowUnlisted] = useState(false);
  const [unlistedName, setUnlistedName] = useState("");
  const [unlistedPrice, setUnlistedPrice] = useState("");

  // AI camera state
  const [showCamera, setShowCamera] = useState(false);
  const [cameraProcessing, setCameraProcessing] = useState(false);
  const [cameraResult, setCameraResult] = useState<string | null>(null);

  // Browse mode (category navigation)
  const [browseMode, setBrowseMode] = useState(false);

  // Barcode scanner state
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);

  // Quick favorites state
  const [favorites, setFavorites] = useState<InventoryItem[]>([]);

  // Customer notes toast
  const [showCustomerNotes, setShowCustomerNotes] = useState(false);

  // Gift receipt toggle
  const [giftReceipt, setGiftReceipt] = useState(false);

  // Discount state
  const [cartDiscount, setCartDiscount] = useState<{ type: "percent" | "flat"; value: string; reason: string }>({
    type: "percent",
    value: "",
    reason: "",
  });
  const [showCartDiscount, setShowCartDiscount] = useState(false);
  const [itemDiscounts, setItemDiscounts] = useState<Record<string, { type: "percent" | "flat"; value: string }>>({});

  // Gift card state
  const [giftCardCode, setGiftCardCode] = useState("");
  const [giftCardBalance, setGiftCardBalance] = useState<number | null>(null);
  const [giftCardApply, setGiftCardApply] = useState(false);
  const [giftCardLookingUp, setGiftCardLookingUp] = useState(false);

  // Loyalty redemption state
  const [redeemLoyalty, setRedeemLoyalty] = useState(false);

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
  const rawSubtotal = cart.reduce((s, i) => s + i.price_cents * i.quantity, 0);
  const cartItemCount = cart.reduce((s, i) => s + i.quantity, 0);

  // Per-item discounts
  const itemDiscountTotal = cart.reduce((sum, item) => {
    const disc = itemDiscounts[item.inventory_item_id];
    if (!disc || !disc.value) return sum;
    const val = parseFloat(disc.value) || 0;
    if (disc.type === "percent") {
      return sum + Math.round(item.price_cents * item.quantity * val / 100);
    }
    return sum + Math.round(val * 100) * item.quantity;
  }, 0);

  // Cart-level discount
  const cartDiscountCents = (() => {
    if (!showCartDiscount || !cartDiscount.value) return 0;
    const val = parseFloat(cartDiscount.value) || 0;
    if (cartDiscount.type === "percent") {
      return Math.round(rawSubtotal * val / 100);
    }
    return Math.round(val * 100);
  })();

  const totalDiscountCents = itemDiscountTotal + cartDiscountCents;
  const subtotal = Math.max(0, rawSubtotal - totalDiscountCents);

  const taxRate = storeSettings.tax_rate_percent;
  const taxCents = storeSettings.tax_included_in_price
    ? 0 // Tax already in price — no additional charge
    : Math.round(subtotal * taxRate / 100);

  // Loyalty calculation
  const loyaltyPointsAvailable = customer?.loyalty_points ?? 0;
  const loyaltyCanRedeem = storeSettings.loyalty_enabled &&
    loyaltyPointsAvailable >= storeSettings.loyalty_min_redeem_points;
  const loyaltyDiscountCents = redeemLoyalty && loyaltyCanRedeem
    ? Math.min(
        Math.floor(loyaltyPointsAvailable / storeSettings.loyalty_redeem_points_per_dollar) * 100,
        subtotal + taxCents
      )
    : 0;
  const loyaltyPointsToRedeem = loyaltyDiscountCents > 0
    ? Math.ceil((loyaltyDiscountCents / 100) * storeSettings.loyalty_redeem_points_per_dollar)
    : 0;

  // Gift card applied
  const giftCardAppliedCents = giftCardApply && giftCardBalance
    ? Math.min(giftCardBalance, subtotal + taxCents - loyaltyDiscountCents)
    : 0;

  const totalBeforeCredit = subtotal + taxCents - loyaltyDiscountCents - giftCardAppliedCents;
  const creditApplied =
    applyCredit && customer
      ? Math.min(
          creditInput ? parseDollars(creditInput) : customer.credit_balance_cents,
          customer.credit_balance_cents,
          totalBeforeCredit
        )
      : 0;
  const amountDue = totalBeforeCredit - creditApplied;
  const tendered = tenderedInput ? parseDollars(tenderedInput) : 0;
  const change =
    paymentMethod === "cash" || paymentMethod === "split"
      ? Math.max(0, tendered - amountDue)
      : 0;

  // ---- Load quick favorites on mount ----
  useEffect(() => {
    fetch("/api/inventory/favorites")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        if (Array.isArray(data)) setFavorites(data);
      })
      .catch(() => {});
  }, []);

  // ---- Barcode scanner handler ----
  function handleBarcodeScan(code: string, _format: string) {
    setShowBarcodeScanner(false);
    // Search for the barcode
    setSearchQuery(code);
  }

  // ---- Inventory search (IndexedDB first, network update) ----
  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setSearchResults([]);
        setShowResults(false);
        return;
      }

      // Try IndexedDB first for instant results
      try {
        const localResults = await searchInventoryLocal(q.trim());
        if (localResults.length > 0) {
          const asInventory = localResults.map((r) => ({
            ...r,
            low_stock_threshold: 5,
            image_url: null,
            external_id: null,
            catalog_product_id: null,
            shared_to_catalog: false,
            created_at: "",
            updated_at: "",
          })) as InventoryItem[];
          // Check for exact barcode match -- auto-add
          const exactBarcode = asInventory.find(
            (d) => d.barcode && d.barcode === q.trim() && d.quantity > 0
          );
          if (exactBarcode) {
            addToCart(exactBarcode);
            setSearchQuery("");
            setSearchResults([]);
            setShowResults(false);
            return;
          }
          setSearchResults(asInventory.filter((d) => d.quantity > 0));
          setShowResults(true);
          setSelectedIndex(0);
        }
      } catch {
        // IndexedDB not available, fall through to network
      }

      // Also fetch from network to get fresh data
      try {
        const res = await fetch(
          `/api/inventory/search?q=${encodeURIComponent(q)}`
        );
        const data: InventoryItem[] = await res.json();
        if (Array.isArray(data)) {
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
        // Network failed — local results (if any) are already displayed
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

  // ---- Customer search (IndexedDB first, network update) ----
  const doCustomerSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setCustomerResults([]);
      return;
    }

    // Try IndexedDB first
    try {
      const localResults = await searchCustomersLocal(q.trim());
      if (localResults.length > 0) {
        setCustomerResults(
          localResults.map((c) => ({
            ...c,
            store_id: "",
            notes: null,
            afterroar_id: null,
            loyalty_points: 0,
            created_at: "",
            updated_at: "",
          })) as Customer[]
        );
      }
    } catch {
      // IndexedDB not available
    }

    // Also fetch from network
    try {
      const res = await fetch(
        `/api/customers?q=${encodeURIComponent(q)}`
      );
      const data = await res.json();
      if (Array.isArray(data)) {
        setCustomerResults(data);
      }
    } catch {
      // Network failed — local results already displayed
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

  // ---- Complete sale (online or offline) ----
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

    const clientTxId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
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
      client_tx_id: clientTxId,
      tax_cents: taxCents,
      discount_cents: totalDiscountCents,
      discount_reason: cartDiscount.reason || undefined,
      gift_card_code: giftCardAppliedCents > 0 ? giftCardCode : undefined,
      gift_card_amount_cents: giftCardAppliedCents > 0 ? giftCardAppliedCents : undefined,
      loyalty_points_redeem: loyaltyPointsToRedeem > 0 ? loyaltyPointsToRedeem : undefined,
      loyalty_discount_cents: loyaltyDiscountCents > 0 ? loyaltyDiscountCents : undefined,
    };

    // Build receipt client-side (used for both online and offline)
    const clientReceipt: ReceiptData = {
      store_name: storeName,
      date: new Date().toISOString(),
      items: cart.map((c) => ({
        name: c.name,
        quantity: c.quantity,
        price_cents: c.price_cents,
        total_cents: c.price_cents * c.quantity,
      })),
      subtotal_cents: subtotal,
      tax_cents: taxCents,
      discount_cents: totalDiscountCents,
      credit_applied_cents: creditApplied,
      gift_card_applied_cents: giftCardAppliedCents,
      loyalty_discount_cents: loyaltyDiscountCents,
      payment_method: paymentMethod,
      total_cents: amountDue,
      change_cents: change,
      customer_name: customer?.name ?? null,
    };

    // Try network first
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Checkout failed");
        setProcessing(false);
        return;
      }

      // Use server receipt if available, otherwise client receipt
      setReceipt(data.receipt ?? clientReceipt);
      clearCartState();
    } catch {
      // Network failed — queue for later sync
      try {
        await enqueueTx({
          clientTxId,
          type: "checkout",
          createdAt: new Date().toISOString(),
          status: "pending",
          retryCount: 0,
          lastError: null,
          payload,
          receipt: clientReceipt as unknown as Record<string, unknown>,
        });

        // Optimistic local updates
        for (const item of cart) {
          await decrementLocalInventory(item.inventory_item_id, item.quantity);
        }
        if (creditApplied > 0 && customer) {
          await updateLocalCustomerCredit(customer.id, -creditApplied);
        }

        // Show client-side receipt with offline indicator
        setReceipt({ ...clientReceipt, store_name: `${storeName} (Offline)` });
        clearCartState();
      } catch (queueErr) {
        alert("Failed to save transaction. Please try again.");
      }
    } finally {
      setProcessing(false);
    }
  }

  // ---- Add unlisted item to cart ----
  function addUnlistedItem() {
    if (!unlistedName.trim() || !unlistedPrice.trim()) return;
    const priceCents = parseDollars(unlistedPrice);
    if (priceCents <= 0) return;

    setCart((prev) => [
      ...prev,
      {
        inventory_item_id: `unlisted_${Date.now()}`,
        name: unlistedName.trim(),
        category: "other",
        price_cents: priceCents,
        quantity: 1,
        max_quantity: 999,
      },
    ]);
    setUnlistedName("");
    setUnlistedPrice("");
    setShowUnlisted(false);
    searchRef.current?.focus();
  }

  // ---- Camera AI product identification ----
  async function handleCameraCapture(imageDataUrl: string) {
    setCameraProcessing(true);
    setCameraResult(null);
    try {
      const res = await fetch("/api/inventory/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageDataUrl }),
      });
      const data = await res.json();
      if (data.query) {
        // AI identified something — search for it
        setSearchQuery(data.query);
        setCameraResult(data.description);
      } else {
        setCameraResult(data.description ?? "Could not identify this item");
      }
    } catch {
      setCameraResult("Camera identification unavailable");
    } finally {
      setCameraProcessing(false);
      setShowCamera(false);
    }
  }

  function clearCartState() {
    setCart([]);
    setCustomer(null);
    setApplyCredit(false);
    setCreditInput("");
    setPaymentMethod("cash");
    setTenderedInput("");
    setShowPayPanel(false);
    setCartDiscount({ type: "percent", value: "", reason: "" });
    setShowCartDiscount(false);
    setItemDiscounts({});
    setGiftCardCode("");
    setGiftCardBalance(null);
    setGiftCardApply(false);
    setRedeemLoyalty(false);
    setGiftReceipt(false);
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
        <div className="hidden md:block mb-3 md:mb-4"><PageHeader title="Register" /></div>

        <div className="flex-1 flex flex-col md:grid md:grid-cols-2 gap-4 md:gap-6 min-h-0">
          {/* ============ LEFT: Search + Results ============ */}
          <div className="flex flex-col gap-3 md:gap-4">
            {/* Search bar — sticky on mobile, full width, large tap target */}
            <div className="sticky top-0 z-10 bg-background -mx-4 px-4 md:mx-0 md:px-0 py-1 md:py-0 md:static">
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
                className="w-full rounded-xl border border-card-border bg-card px-4 py-3 md:py-4 text-base md:text-lg text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-blue-500 h-12 md:h-auto"
              />

              {/* Search results dropdown */}
              {showResults && searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-[60vh] md:max-h-80 overflow-y-auto rounded-xl border border-card-border bg-card shadow-xl">
                  {searchResults.map((item, idx) => (
                    <button
                      key={item.id}
                      onClick={() => addToCart(item)}
                      className={`flex w-full items-center justify-between px-4 py-3 md:py-3 min-h-13 text-left transition-colors ${
                        idx === selectedIndex
                          ? "bg-card-hover text-foreground"
                          : "text-foreground/70 hover:bg-card-hover active:bg-card-hover"
                      }`}
                    >
                      <div className="min-w-0 flex-1 mr-3">
                        <div className="font-medium truncate">{item.name}</div>
                        <div className="text-xs text-muted">
                          {item.category} &middot;{" "}
                          <span
                            className={
                              item.quantity === 0
                                ? "text-red-400 font-medium"
                                : item.quantity <= (item.low_stock_threshold ?? 5)
                                  ? "text-yellow-400"
                                  : "text-muted"
                            }
                          >
                            {item.quantity} in stock
                          </span>
                          {item.barcode && ` \u00b7 ${item.barcode}`}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-emerald-400 shrink-0">
                        {formatCents(item.price_cents)}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {showResults && searchQuery && searchResults.length === 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-card-border bg-card px-4 py-3 text-sm text-muted">
                  No items found for &quot;{searchQuery}&quot;
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => { setShowUnlisted(true); setShowResults(false); }}
                      className="rounded bg-card-hover px-3 py-2 md:px-2 md:py-1 text-xs text-zinc-200 hover:bg-card-hover active:bg-zinc-600"
                    >
                      Sell as unlisted item
                    </button>
                    <button
                      onClick={() => { setShowCamera(true); setShowResults(false); }}
                      className="rounded bg-card-hover px-3 py-2 md:px-2 md:py-1 text-xs text-zinc-200 hover:bg-card-hover active:bg-zinc-600"
                    >
                      Try camera ID
                    </button>
                  </div>
                </div>
              )}
              </div>
            </div>

            {/* Quick action buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setBrowseMode(!browseMode);
                  if (!browseMode) {
                    setShowUnlisted(false);
                    setShowResults(false);
                  }
                }}
                className={`rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                  browseMode
                    ? "bg-emerald-600 text-foreground"
                    : "bg-card-hover text-muted hover:text-foreground"
                }`}
              >
                Browse
              </button>
              <button
                onClick={() => {
                  setShowUnlisted(!showUnlisted);
                  if (!showUnlisted) setBrowseMode(false);
                }}
                className={`rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                  showUnlisted
                    ? "bg-accent text-foreground"
                    : "bg-card-hover text-muted hover:text-foreground"
                }`}
              >
                + Unlisted Item
              </button>
              <button
                onClick={() => setShowCamera(true)}
                className="rounded-xl bg-card-hover px-3 py-2 text-xs font-medium text-muted hover:text-foreground transition-colors"
              >
                Camera ID
              </button>
              <button
                onClick={() => setShowBarcodeScanner(true)}
                className="rounded-xl bg-card-hover px-3 py-2 text-xs font-medium text-muted hover:text-foreground transition-colors"
              >
                Scan Barcode
              </button>
            </div>

            {/* Quick Favorites */}
            {favorites.length > 0 && cart.length === 0 && !browseMode && !showUnlisted && (
              <div>
                <div className="text-xs text-muted mb-1.5">Quick Add</div>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  {favorites.map((fav) => (
                    <button
                      key={fav.id}
                      onClick={() => addToCart(fav)}
                      className="shrink-0 rounded-xl border border-card-border bg-card px-3 py-2 text-left hover:bg-card-hover active:bg-card-hover transition-colors min-h-[44px]"
                    >
                      <div className="text-xs font-medium text-foreground truncate max-w-[120px]">{fav.name}</div>
                      <div className="text-[10px] text-emerald-400">{formatCents(fav.price_cents)}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Category browser */}
            {browseMode && (
              <div className="rounded-xl border border-card-border bg-card p-3">
                <CategoryBrowser
                  onAddToCart={(item) => {
                    addToCart(item);
                  }}
                />
              </div>
            )}

            {/* Unlisted item form */}
            {showUnlisted && (
              <div className="rounded-xl border border-input-border bg-card-hover p-4 space-y-3">
                <div className="text-sm font-medium text-foreground">Sell Unlisted Item</div>
                <input
                  type="text"
                  placeholder="Item name (e.g. Small dragon figurine)"
                  value={unlistedName}
                  onChange={(e) => setUnlistedName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addUnlistedItem()}
                  autoFocus
                  className="w-full rounded-xl border border-zinc-600 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                />
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-2 text-muted">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Price"
                      value={unlistedPrice}
                      onChange={(e) => setUnlistedPrice(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addUnlistedItem()}
                      className="w-full rounded-xl border border-zinc-600 bg-card pl-7 pr-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={addUnlistedItem}
                    disabled={!unlistedName.trim() || !unlistedPrice.trim()}
                    className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => { setShowUnlisted(false); setUnlistedName(""); setUnlistedPrice(""); }}
                    className="rounded-xl bg-card-hover px-3 py-2 text-sm text-foreground/70 hover:bg-card-hover transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Camera AI result */}
            {cameraResult && (
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-sm text-indigo-300">
                {cameraProcessing ? "Identifying..." : cameraResult}
                <button
                  onClick={() => setCameraResult(null)}
                  className="ml-2 text-xs text-muted hover:text-foreground"
                >
                  dismiss
                </button>
              </div>
            )}

            {/* Customer attach */}
            <div className="rounded-xl border border-card-border bg-card p-4">
              {customer ? (
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-muted">Customer</div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-foreground">{customer.name}</span>
                        {customer.notes && (
                          <button
                            onClick={() => setShowCustomerNotes(!showCustomerNotes)}
                            className="text-blue-400 hover:text-blue-300 text-xs min-h-0"
                            title="View customer notes"
                          >
                            &#9432;
                          </button>
                        )}
                      </div>
                      <div className="text-xs text-muted">
                        Credit: {formatCents(customer.credit_balance_cents)}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setCustomer(null);
                        setApplyCredit(false);
                        setCreditInput("");
                        setShowCustomerNotes(false);
                        if (paymentMethod === "store_credit")
                          setPaymentMethod("cash");
                      }}
                      className="text-xs text-muted hover:text-red-400"
                    >
                      Remove
                    </button>
                  </div>
                  {/* Customer notes toast */}
                  {showCustomerNotes && customer.notes && (
                    <div className="mt-2 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-300">
                      {customer.notes}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowCustomerSearch(true)}
                    className="flex-1 rounded-md border border-card-border px-3 py-2 text-sm text-muted hover:border-zinc-600 hover:text-foreground"
                  >
                    + Attach Customer
                  </button>
                  <span className="rounded-full bg-card-hover px-3 py-1 text-xs font-medium text-foreground/70">
                    Guest
                  </span>
                </div>
              )}
            </div>

            {/* Cart items on mobile — shown inline below search */}
            <div className="md:hidden">{renderCart()}</div>
          </div>

          {/* ============ RIGHT: Cart ============ */}
          <div className="flex flex-col gap-3 md:gap-4">
            <div className="hidden md:block flex-1 min-h-0">
              {renderCart()}
            </div>

            {/* Cart discount toggle */}
            {cart.length > 0 && (
              <div>
                <button
                  onClick={() => setShowCartDiscount(!showCartDiscount)}
                  className={`rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                    showCartDiscount
                      ? "bg-amber-600 text-foreground"
                      : "bg-card-hover text-muted hover:text-foreground"
                  }`}
                >
                  {showCartDiscount ? "Remove Discount" : "Apply Discount"}
                </button>
                {showCartDiscount && (
                  <div className="mt-2 rounded-xl border border-input-border bg-card-hover p-3 space-y-2">
                    <div className="flex gap-2">
                      <select
                        value={cartDiscount.type}
                        onChange={(e) =>
                          setCartDiscount({
                            ...cartDiscount,
                            type: e.target.value as "percent" | "flat",
                          })
                        }
                        className="rounded border border-zinc-600 bg-card px-2 py-1 text-xs text-foreground focus:outline-none"
                      >
                        <option value="percent">% Off</option>
                        <option value="flat">$ Off</option>
                      </select>
                      <input
                        type="number"
                        step={cartDiscount.type === "percent" ? "1" : "0.01"}
                        min={0}
                        value={cartDiscount.value}
                        onChange={(e) =>
                          setCartDiscount({ ...cartDiscount, value: e.target.value })
                        }
                        placeholder={cartDiscount.type === "percent" ? "10" : "5.00"}
                        className="flex-1 rounded border border-zinc-600 bg-card px-2 py-1 text-xs text-foreground placeholder:text-muted focus:outline-none"
                      />
                    </div>
                    <input
                      type="text"
                      value={cartDiscount.reason}
                      onChange={(e) =>
                        setCartDiscount({ ...cartDiscount, reason: e.target.value })
                      }
                      placeholder="Reason (optional)"
                      className="w-full rounded border border-zinc-600 bg-card px-2 py-1 text-xs text-foreground placeholder:text-muted focus:outline-none"
                    />
                    {cartDiscountCents > 0 && (
                      <div className="text-xs text-amber-400">
                        -{formatCents(cartDiscountCents)} discount
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Subtotal bar — hidden on mobile when cart empty (shown in fixed bottom instead) */}
            <div className="hidden md:block rounded-xl border border-card-border bg-card p-4">
              <div className="flex justify-between text-lg font-semibold text-foreground">
                <span>Subtotal</span>
                <span>{formatCents(subtotal)}</span>
              </div>
              {cartItemCount > 0 && (
                <div className="text-sm text-muted mt-1">
                  {cartItemCount} item{cartItemCount !== 1 ? "s" : ""}
                  {totalDiscountCents > 0 && (
                    <span className="text-amber-400 ml-2">
                      (-{formatCents(totalDiscountCents)} discount)
                    </span>
                  )}
                </div>
              )}
              {taxCents > 0 && (
                <div className="flex justify-between text-sm text-muted mt-1">
                  <span>Tax ({taxRate}%)</span>
                  <span>{formatCents(taxCents)}</span>
                </div>
              )}
            </div>

            {/* PAY button — desktop only (mobile version is fixed at bottom) */}
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
              className={`hidden md:block w-full rounded-xl py-5 text-xl font-bold transition-colors ${
                cart.length > 0
                  ? "bg-emerald-600 text-foreground hover:bg-emerald-500 active:bg-emerald-700"
                  : "bg-card-hover text-zinc-600 cursor-not-allowed"
              }`}
            >
              PAY {subtotal > 0 ? formatCents(subtotal + taxCents) : ""}
            </button>
          </div>
        </div>

        {/* ============ MOBILE: Fixed bottom subtotal + PAY ============ */}
        {cart.length > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-card-border bg-background/95 backdrop-blur-sm px-4 pb-safe md:hidden">
            {/* Compact subtotal row */}
            <div className="flex items-center justify-between py-2">
              <div>
                <span className="text-sm text-muted">
                  {cartItemCount} item{cartItemCount !== 1 ? "s" : ""}
                </span>
                {totalDiscountCents > 0 && (
                  <span className="text-xs text-amber-400 ml-2">
                    -{formatCents(totalDiscountCents)}
                  </span>
                )}
                {taxCents > 0 && (
                  <span className="text-xs text-muted ml-2">
                    +{formatCents(taxCents)} tax
                  </span>
                )}
              </div>
              <span className="text-lg font-semibold text-foreground">
                {formatCents(subtotal + taxCents)}
              </span>
            </div>
            {/* Customer attach — compact on mobile */}
            {customer && (
              <div className="flex items-center justify-between py-1 text-xs text-muted">
                <span>Customer: <span className="text-foreground">{customer.name}</span></span>
                <button
                  onClick={() => {
                    setCustomer(null);
                    setApplyCredit(false);
                    setCreditInput("");
                    if (paymentMethod === "store_credit") setPaymentMethod("cash");
                  }}
                  className="text-zinc-600 hover:text-red-400 min-h-0"
                >
                  &times;
                </button>
              </div>
            )}
            {/* Big PAY button */}
            <button
              onClick={() => {
                if (customer?.email) {
                  setReceiptCustomerEmail(customer.email);
                } else {
                  setReceiptCustomerEmail(null);
                }
                setShowPayPanel(true);
              }}
              className="w-full rounded-xl bg-emerald-600 py-4 text-lg font-semibold text-foreground active:bg-emerald-700 transition-colors mb-2"
            >
              PAY {formatCents(subtotal + taxCents)}
            </button>
          </div>
        )}

        {/* ============ PAY SLIDE-OVER ============ */}
        {showPayPanel && (
          <div className="fixed inset-0 z-50 flex md:justify-end">
            {/* Backdrop — hidden on mobile (full-screen panel) */}
            <div
              className="absolute inset-0 bg-black/60 hidden md:block"
              onClick={() => setShowPayPanel(false)}
            />

            {/* Panel — full screen on mobile, side panel on desktop */}
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
              className="relative z-50 flex w-full md:max-w-md flex-col bg-background md:border-l md:border-card-border shadow-2xl md:animate-slide-in-right animate-slide-up">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-card-border px-6 py-4">
                <h2 className="text-lg font-semibold text-foreground">Payment</h2>
                <button
                  onClick={() => setShowPayPanel(false)}
                  className="text-muted hover:text-foreground text-xl leading-none"
                >
                  &times;
                </button>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {/* Order summary */}
                <div className="rounded-xl border border-card-border bg-card p-4">
                  <div className="text-sm font-medium text-muted mb-2">Order Summary</div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {cart.map((item) => (
                      <div
                        key={item.inventory_item_id}
                        className="flex justify-between text-sm"
                      >
                        <span className="text-foreground/70 truncate mr-2">
                          {item.name}
                          {item.quantity > 1 && (
                            <span className="text-muted ml-1">
                              x{item.quantity}
                            </span>
                          )}
                        </span>
                        <span className="text-foreground font-mono shrink-0">
                          {formatCents(item.price_cents * item.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {totalDiscountCents > 0 && (
                    <div className="mt-2 pt-2 border-t border-card-border flex justify-between text-sm text-amber-400">
                      <span>Discount</span>
                      <span className="font-mono">-{formatCents(totalDiscountCents)}</span>
                    </div>
                  )}
                  <div className={`${totalDiscountCents > 0 ? "mt-1" : "mt-2 pt-2 border-t border-card-border"} flex justify-between text-sm font-medium text-foreground`}>
                    <span>Subtotal</span>
                    <span className="font-mono">{formatCents(subtotal)}</span>
                  </div>
                  {taxCents > 0 && (
                    <div className="flex justify-between text-sm text-muted mt-1">
                      <span>Tax ({taxRate}%)</span>
                      <span className="font-mono">{formatCents(taxCents)}</span>
                    </div>
                  )}
                </div>

                {/* Loyalty points toggle */}
                {customer && loyaltyCanRedeem && (
                  <div className="rounded-xl border border-card-border bg-card p-4">
                    <label className="flex items-center gap-2 text-sm text-foreground/70">
                      <input
                        type="checkbox"
                        checked={redeemLoyalty}
                        onChange={(e) => setRedeemLoyalty(e.target.checked)}
                        className="rounded border-input-border bg-background"
                      />
                      Use {loyaltyPointsAvailable} loyalty points ({formatCents(
                        Math.floor(loyaltyPointsAvailable / storeSettings.loyalty_redeem_points_per_dollar) * 100
                      )} value)
                    </label>
                    {loyaltyDiscountCents > 0 && (
                      <div className="mt-2 flex justify-between text-sm text-purple-400">
                        <span>Loyalty discount ({loyaltyPointsToRedeem} pts)</span>
                        <span>-{formatCents(loyaltyDiscountCents)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Gift card */}
                <div className="rounded-xl border border-card-border bg-card p-4">
                  <div className="text-sm text-muted mb-2">Gift Card</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={giftCardCode}
                      onChange={(e) => {
                        setGiftCardCode(e.target.value.toUpperCase());
                        setGiftCardBalance(null);
                        setGiftCardApply(false);
                      }}
                      placeholder="Enter card code"
                      className="flex-1 rounded border border-card-border bg-background px-3 py-2 text-sm text-foreground font-mono placeholder:text-muted focus:border-accent focus:outline-none"
                    />
                    <button
                      onClick={async () => {
                        if (!giftCardCode.trim() || giftCardLookingUp) return;
                        setGiftCardLookingUp(true);
                        try {
                          const res = await fetch(`/api/gift-cards/${encodeURIComponent(giftCardCode)}`);
                          if (res.ok) {
                            const data = await res.json();
                            setGiftCardBalance(data.balance_cents);
                            setGiftCardApply(data.balance_cents > 0);
                          } else {
                            setGiftCardBalance(0);
                            setGiftCardApply(false);
                            alert("Gift card not found");
                          }
                        } finally {
                          setGiftCardLookingUp(false);
                        }
                      }}
                      disabled={!giftCardCode.trim() || giftCardLookingUp}
                      className="rounded bg-card-hover px-3 py-2 text-xs text-zinc-200 hover:bg-card-hover disabled:opacity-50 transition-colors"
                    >
                      {giftCardLookingUp ? "..." : "Look Up"}
                    </button>
                  </div>
                  {giftCardBalance !== null && giftCardBalance > 0 && (
                    <div className="mt-2">
                      <label className="flex items-center gap-2 text-sm text-foreground/70">
                        <input
                          type="checkbox"
                          checked={giftCardApply}
                          onChange={(e) => setGiftCardApply(e.target.checked)}
                          className="rounded border-input-border bg-background"
                        />
                        Apply {formatCents(giftCardBalance)} balance
                      </label>
                      {giftCardAppliedCents > 0 && (
                        <div className="mt-1 flex justify-between text-sm text-teal-400">
                          <span>Gift card applied</span>
                          <span>-{formatCents(giftCardAppliedCents)}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {giftCardBalance === 0 && (
                    <div className="mt-2 text-sm text-muted">No balance on this card.</div>
                  )}
                </div>

                {/* Store credit toggle -- only when customer attached with balance */}
                {customer && customer.credit_balance_cents > 0 && (
                  <div className="rounded-xl border border-card-border bg-card p-4">
                    <label className="flex items-center gap-2 text-sm text-foreground/70">
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
                        className="rounded border-input-border bg-background"
                      />
                      Apply Store Credit ({formatCents(customer.credit_balance_cents)} available)
                    </label>
                    {applyCredit && (
                      <div className="mt-2 flex items-center gap-1">
                        <span className="text-sm text-muted">$</span>
                        <input
                          type="text"
                          value={creditInput}
                          onChange={(e) => setCreditInput(e.target.value)}
                          className="w-24 rounded border border-card-border bg-background px-2 py-1 text-sm text-foreground"
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
                <div className="rounded-xl border border-card-border bg-card p-4">
                  <div className="mb-3 text-sm text-muted">Payment Method</div>
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
                        className={`rounded-md px-3 py-3 md:py-2 text-sm font-medium transition-colors ${
                          paymentMethod === m.value
                            ? "bg-accent text-foreground"
                            : m.disabled
                            ? "bg-card-hover text-zinc-600 cursor-not-allowed"
                            : "bg-card-hover text-foreground/70 hover:bg-card-hover active:bg-card-hover"
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
                        <label className="text-sm text-muted">
                          Amount Tendered
                        </label>
                        <div className="flex items-center gap-1">
                          <span className="text-muted">$</span>
                          <input
                            tabIndex={4}
                            type="text"
                            value={tenderedInput}
                            onChange={(e) => setTenderedInput(e.target.value)}
                            placeholder="0.00"
                            className="w-28 rounded border border-card-border bg-background px-3 py-2 text-right text-lg font-mono text-foreground focus:border-accent focus:outline-none"
                            autoFocus
                          />
                        </div>
                      </div>
                      {tendered > 0 && tendered >= amountDue && (
                        <div className="flex items-center justify-between rounded-md bg-card-hover px-3 py-2">
                          <span className="text-sm text-muted">Change</span>
                          <span className="text-lg font-bold text-emerald-400">
                            {formatCents(change)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Total due */}
                <div className="rounded-xl border border-card-border bg-card p-4">
                  <div className="flex justify-between text-lg font-semibold text-foreground">
                    <span>Total Due</span>
                    <span>{formatCents(amountDue)}</span>
                  </div>
                </div>
              </div>

              {/* Bottom actions — safe area padding on mobile */}
              <div className="border-t border-card-border px-6 py-4 pb-safe space-y-2">
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
                  className={`flex w-full items-center justify-center gap-2 rounded-xl py-4 md:py-4 text-lg font-bold transition-colors ${
                    canComplete
                      ? "bg-emerald-600 text-foreground hover:bg-emerald-500 active:bg-emerald-700"
                      : "bg-card-hover text-zinc-600 cursor-not-allowed"
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
                  className="w-full rounded-xl border border-card-border py-3 text-sm font-medium text-muted hover:bg-card hover:text-foreground active:bg-card transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Customer search modal — full screen on mobile */}
        {showCustomerSearch && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-0 md:pt-24"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                setShowCustomerSearch(false);
                setShowNewCustomerForm(false);
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
              className="w-full h-full md:h-auto md:max-w-md rounded-none md:rounded-xl border-0 md:border border-card-border bg-card p-4 shadow-2xl"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <input
                ref={customerSearchRef}
                type="text"
                value={customerQuery}
                onChange={(e) => {
                  setCustomerQuery(e.target.value);
                  setShowNewCustomerForm(false);
                }}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="Search customers by name..."
                className="mb-3 w-full rounded-md border border-card-border bg-background px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
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
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-foreground/70 hover:bg-card-hover"
                  >
                    <div>
                      <div className="font-medium text-foreground">{c.name}</div>
                      {c.email && (
                        <div className="text-xs text-muted">{c.email}</div>
                      )}
                    </div>
                    <div className="text-xs text-muted">
                      {formatCents(c.credit_balance_cents)}
                    </div>
                  </button>
                ))}

                {customerQuery && customerResults.length === 0 && !showNewCustomerForm && (
                  <div className="space-y-2 px-3 py-2">
                    <div className="text-sm text-muted">No customers found</div>
                    <button
                      onClick={() => {
                        setShowNewCustomerForm(true);
                        setNewCustName(customerQuery);
                      }}
                      className="w-full rounded-md border border-blue-600 bg-accent/10 px-3 py-2 text-sm font-medium text-blue-400 hover:bg-accent/20"
                    >
                      + Create New Customer
                    </button>
                  </div>
                )}
              </div>

              {/* Inline new customer form */}
              {showNewCustomerForm && (
                <div className="mt-3 space-y-2 border-t border-card-border pt-3">
                  <div className="text-sm font-medium text-foreground/70">New Customer</div>
                  <input
                    ref={newCustNameRef}
                    type="text"
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateCustomer();
                    }}
                    placeholder="Name (required)"
                    className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                  <input
                    type="email"
                    value={newCustEmail}
                    onChange={(e) => setNewCustEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateCustomer();
                    }}
                    placeholder="Email (optional)"
                    className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                  <input
                    type="tel"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateCustomer();
                    }}
                    placeholder="Phone (optional)"
                    className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                  <button
                    onClick={handleCreateCustomer}
                    disabled={!newCustName.trim() || creatingCustomer}
                    className={`w-full rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      newCustName.trim() && !creatingCustomer
                        ? "bg-accent text-foreground hover:bg-blue-500"
                        : "bg-card-hover text-zinc-600 cursor-not-allowed"
                    }`}
                  >
                    {creatingCustomer ? "Saving..." : "Save & Attach"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Barcode scanner */}
        {showBarcodeScanner && (
          <BarcodeScanner
            title="Scan Barcode"
            onScan={handleBarcodeScan}
            onClose={() => setShowBarcodeScanner(false)}
          />
        )}

        {/* Receipt modal — full screen on mobile */}
        {receipt && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-overlay-bg">
            <div
              id="receipt-printable"
              className="w-full md:max-w-md rounded-t-2xl md:rounded-xl border-0 md:border border-card-border bg-card p-5 md:p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              {/* Receipt header */}
              <div className="mb-4 text-center">
                {giftReceipt && (
                  <div className="mb-2 rounded-md bg-pink-500/20 px-2 py-1 text-xs font-bold text-pink-400 uppercase tracking-wider">
                    Gift Receipt
                  </div>
                )}
                <h2 className="text-xl font-semibold text-foreground">{receipt.store_name}</h2>
                <div className="text-sm text-muted">
                  {new Date(receipt.date).toLocaleString()}
                </div>
                {receipt.customer_name && !giftReceipt && (
                  <div className="mt-1 text-sm text-foreground/70">
                    Customer: {receipt.customer_name}
                  </div>
                )}
              </div>

              <div className="receipt-divider border-t border-dashed border-input-border" />

              {/* Items */}
              <div className="my-3 space-y-2">
                {receipt.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <div className="text-foreground/70">
                      <span>{item.name}</span>
                      {item.quantity > 1 && (
                        <span className="ml-1 text-muted">x{item.quantity}</span>
                      )}
                    </div>
                    {!giftReceipt && (
                      <div className="text-foreground/70 font-mono">
                        {formatCents(item.total_cents)}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="receipt-divider border-t border-dashed border-input-border" />

              {/* Totals — hidden on gift receipt */}
              {!giftReceipt && (
                <div className="my-3 space-y-1">
                  <div className="flex justify-between text-sm text-muted">
                    <span>Subtotal</span>
                    <span className="font-mono">{formatCents(receipt.subtotal_cents)}</span>
                  </div>
                  {receipt.discount_cents != null && receipt.discount_cents > 0 && (
                    <div className="flex justify-between text-sm text-amber-400">
                      <span>Discount</span>
                      <span className="font-mono">-{formatCents(receipt.discount_cents)}</span>
                    </div>
                  )}
                  {receipt.tax_cents > 0 && (
                    <div className="flex justify-between text-sm text-muted">
                      <span>Tax</span>
                      <span className="font-mono">{formatCents(receipt.tax_cents)}</span>
                    </div>
                  )}
                  {receipt.loyalty_discount_cents != null && receipt.loyalty_discount_cents > 0 && (
                    <div className="flex justify-between text-sm text-purple-400">
                      <span>Loyalty Discount</span>
                      <span className="font-mono">-{formatCents(receipt.loyalty_discount_cents)}</span>
                    </div>
                  )}
                  {receipt.gift_card_applied_cents != null && receipt.gift_card_applied_cents > 0 && (
                    <div className="flex justify-between text-sm text-teal-400">
                      <span>Gift Card</span>
                      <span className="font-mono">-{formatCents(receipt.gift_card_applied_cents)}</span>
                    </div>
                  )}
                  {receipt.credit_applied_cents > 0 && (
                    <div className="flex justify-between text-sm text-amber-400">
                      <span>Store Credit</span>
                      <span className="font-mono">-{formatCents(receipt.credit_applied_cents)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm text-muted">
                    <span>Payment</span>
                    <span>{paymentMethodLabel(receipt.payment_method)}</span>
                  </div>
                  <div className="flex justify-between border-t border-card-border pt-2 text-lg font-semibold text-foreground">
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
              )}
              {giftReceipt && (
                <div className="my-3 text-center text-sm text-muted">
                  This is a gift receipt. No prices shown.
                </div>
              )}

              <div className="receipt-divider border-t border-dashed border-input-border" />

              <div className="mt-2 text-center text-xs text-muted">
                Thank you for shopping at {receipt.store_name}!
              </div>

              {/* Gift receipt toggle (hidden in print) */}
              <div className="no-print mt-4">
                <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={giftReceipt}
                    onChange={(e) => setGiftReceipt(e.target.checked)}
                    className="rounded border-input-border bg-background"
                  />
                  Gift Receipt (hide prices)
                </label>
              </div>

              {/* Actions (hidden in print) */}
              <div className="no-print mt-3 space-y-2 md:space-y-0 md:grid md:grid-cols-3 md:gap-2 pb-safe">
                <button
                  onClick={handleNewSale}
                  className="w-full rounded-xl md:rounded-md bg-accent px-3 py-3 md:py-2 text-sm font-medium text-foreground hover:bg-blue-500 active:bg-blue-700"
                >
                  New Sale
                </button>
                <button
                  onClick={handlePrintReceipt}
                  className="w-full rounded-xl md:rounded-md bg-card-hover px-3 py-3 md:py-2 text-sm font-medium text-foreground/70 hover:bg-card-hover hover:text-foreground active:bg-card-hover"
                >
                  Print Receipt
                </button>
                {receiptCustomerEmail ? (
                  <button
                    onClick={handleEmailReceipt}
                    disabled={emailSending || emailSent}
                    className={`w-full rounded-xl md:rounded-md px-3 py-3 md:py-2 text-sm font-medium ${
                      emailSent
                        ? "bg-emerald-900/40 text-emerald-400 cursor-default"
                        : emailSending
                        ? "bg-card-hover text-muted cursor-wait"
                        : "bg-card-hover text-foreground/70 hover:bg-card-hover hover:text-foreground active:bg-card-hover"
                    }`}
                  >
                    {emailSent ? "Email Sent" : emailSending ? "Sending..." : "Email Receipt"}
                  </button>
                ) : (
                  <button
                    disabled
                    className="w-full rounded-xl md:rounded-md bg-card-hover px-3 py-3 md:py-2 text-sm font-medium text-zinc-600 cursor-not-allowed"
                    title="No customer email"
                  >
                    Email Receipt
                  </button>
                )}
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
        <div className="rounded-xl border border-card-border bg-card p-6 md:p-8 text-center text-muted">
          Cart is empty. Scan or search to add items.
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-card-border bg-card">
        <div className="flex items-center gap-2 border-b border-card-border px-4 py-2">
          <span className="text-sm font-medium text-muted">Cart</span>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-foreground">
            {cartItemCount}
          </span>
        </div>
        <div className="max-h-[40vh] md:max-h-72 divide-y divide-zinc-800 overflow-y-auto">
          {cart.map((item) => (
            <div
              key={item.inventory_item_id}
              className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {item.name}
                    </div>
                    <div className="text-xs text-muted">
                      {formatCents(item.price_cents)} each
                      {itemDiscounts[item.inventory_item_id] && itemDiscounts[item.inventory_item_id].value && (
                        <span className="text-amber-400 ml-1">
                          (-{itemDiscounts[item.inventory_item_id].type === "percent"
                            ? `${itemDiscounts[item.inventory_item_id].value}%`
                            : `$${itemDiscounts[item.inventory_item_id].value}`})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-sm font-semibold text-foreground">
                    {formatCents(item.price_cents * item.quantity)}
                  </div>
                </div>
                {/* Per-item discount toggle */}
                <button
                  onClick={() => {
                    if (itemDiscounts[item.inventory_item_id]) {
                      const { [item.inventory_item_id]: _, ...rest } = itemDiscounts;
                      setItemDiscounts(rest);
                    } else {
                      setItemDiscounts({
                        ...itemDiscounts,
                        [item.inventory_item_id]: { type: "percent", value: "" },
                      });
                    }
                  }}
                  className="text-[10px] text-zinc-600 hover:text-amber-400 transition-colors min-h-0 md:min-h-0"
                >
                  {itemDiscounts[item.inventory_item_id] ? "remove discount" : "discount"}
                </button>
                {itemDiscounts[item.inventory_item_id] && (
                  <div className="flex gap-1 mt-0.5">
                    <select
                      value={itemDiscounts[item.inventory_item_id].type}
                      onChange={(e) =>
                        setItemDiscounts({
                          ...itemDiscounts,
                          [item.inventory_item_id]: {
                            ...itemDiscounts[item.inventory_item_id],
                            type: e.target.value as "percent" | "flat",
                          },
                        })
                      }
                      className="rounded border border-input-border bg-card px-1 py-0.5 text-[10px] text-foreground focus:outline-none min-h-0"
                    >
                      <option value="percent">%</option>
                      <option value="flat">$</option>
                    </select>
                    <input
                      type="number"
                      step={itemDiscounts[item.inventory_item_id].type === "percent" ? "1" : "0.01"}
                      min={0}
                      value={itemDiscounts[item.inventory_item_id].value}
                      onChange={(e) =>
                        setItemDiscounts({
                          ...itemDiscounts,
                          [item.inventory_item_id]: {
                            ...itemDiscounts[item.inventory_item_id],
                            value: e.target.value,
                          },
                        })
                      }
                      placeholder="0"
                      className="w-14 rounded border border-input-border bg-card px-1 py-0.5 text-[10px] text-foreground placeholder:text-muted focus:outline-none min-h-0"
                    />
                  </div>
                )}
                {/* Mobile: qty controls inline below name */}
                <div className="flex items-center gap-2 mt-1.5 md:hidden">
                  <button
                    tabIndex={2}
                    onClick={() => updateQty(item.inventory_item_id, -1)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-card-hover text-muted active:bg-card-hover text-base font-bold min-h-0"
                  >
                    -
                  </button>
                  <span className="w-8 text-center text-sm font-medium text-foreground">
                    {item.quantity}
                  </span>
                  <button
                    tabIndex={2}
                    onClick={() => updateQty(item.inventory_item_id, 1)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-card-hover text-muted active:bg-card-hover text-base font-bold min-h-0"
                  >
                    +
                  </button>
                  <div className="flex-1" />
                  <button
                    tabIndex={2}
                    onClick={() => removeItem(item.inventory_item_id)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-600 active:bg-red-900/40 active:text-red-400 text-lg min-h-0"
                  >
                    &times;
                  </button>
                </div>
              </div>
              {/* Desktop: qty controls on right */}
              <div className="hidden md:flex items-center gap-1">
                <button
                  tabIndex={2}
                  onClick={() => updateQty(item.inventory_item_id, -1)}
                  className="flex h-7 w-7 items-center justify-center rounded bg-card-hover text-muted hover:bg-card-hover hover:text-foreground"
                >
                  -
                </button>
                <span className="w-8 text-center text-sm font-medium text-foreground">
                  {item.quantity}
                </span>
                <button
                  tabIndex={2}
                  onClick={() => updateQty(item.inventory_item_id, 1)}
                  className="flex h-7 w-7 items-center justify-center rounded bg-card-hover text-muted hover:bg-card-hover hover:text-foreground"
                >
                  +
                </button>
              </div>
              <div className="hidden md:block w-20 text-right text-sm font-semibold text-foreground">
                {formatCents(item.price_cents * item.quantity)}
              </div>
              <button
                tabIndex={2}
                onClick={() => removeItem(item.inventory_item_id)}
                className="hidden md:flex h-7 w-7 items-center justify-center rounded text-zinc-600 hover:bg-red-900/40 hover:text-red-400"
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
