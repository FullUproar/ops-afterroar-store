"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents, parseDollars } from "@/lib/types";
import type { InventoryItem, Customer } from "@/lib/types";
import type { PaymentMethod } from "@/lib/payment";
import {
  searchInventoryLocal,
  searchCustomersLocal,
  enqueueTx,
  decrementLocalInventory,
  updateLocalCustomerCredit,
} from "@/lib/offline-db";
import { useStoreName, useStoreSettings } from "@/lib/store-settings";
import { useStore } from "@/lib/store-context";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { useScanner } from "@/hooks/use-scanner";
import type { ScannerError } from "@/lib/scanner-manager";
import {
  saveCart as persistCart,
  loadCart as loadPersistedCart,
  clearCart as clearPersistedCart,
  createEmptyCart,
  parkCart,
  listParkedCarts,
  recallParkedCart,
  deleteParkedCart,
  getParkedCartCount,
  type ParkedCart,
} from "@/lib/cart-store";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface CartItem {
  /** null for manual items */
  inventory_item_id: string | null;
  name: string;
  category: string;
  price_cents: number;
  quantity: number;
  max_quantity: number;
}

interface CartDiscount {
  id: string;
  /** "item" discount targets a specific cart item, "cart" targets the whole cart */
  scope: "item" | "cart";
  /** Index of cart item (for item-scoped discounts) */
  itemIndex?: number;
  type: "percent" | "dollar";
  value: number; // percent (0-100) or cents
  reason: string;
}

interface LastReceipt {
  items: CartItem[];
  discounts: CartDiscount[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  paymentMethod: PaymentMethod;
  customerName: string | null;
  timestamp: string;
}

type ActivePanel = "search" | "scan" | "customer" | "quick" | "manual" | "discount" | null;

/* ------------------------------------------------------------------ */
/*  Register Page — full-screen receipt-tape-first POS terminal        */
/* ------------------------------------------------------------------ */
export default function RegisterPage() {
  const router = useRouter();
  const storeName = useStoreName();
  const storeSettings = useStoreSettings();
  const { staff, effectiveRole } = useStore();

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discounts, setDiscounts] = useState<CartDiscount[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);

  // Panels
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<InventoryItem[]>([]);

  // Quick add favorites
  const [favorites, setFavorites] = useState<InventoryItem[]>([]);

  // Customer search
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);

  // Manual item
  const [manualName, setManualName] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualQty, setManualQty] = useState("1");

  // Discount panel
  const [discountScope, setDiscountScope] = useState<"item" | "cart">("item");
  const [discountType, setDiscountType] = useState<"percent" | "dollar">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");

  // USB scanner status
  const [scannerFlash, setScannerFlash] = useState<"none" | "success" | "error">("none");
  const [scannerErrorText, setScannerErrorText] = useState<string | null>(null);
  const [lastAddedIndex, setLastAddedIndex] = useState<number | null>(null);
  const scannerErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scannerFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Payment
  const [showPaySheet, setShowPaySheet] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [tenderedInput, setTenderedInput] = useState("");
  const [showCashInput, setShowCashInput] = useState(false);
  const [showCreditConfirm, setShowCreditConfirm] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Quantity edit
  const [editingQtyIndex, setEditingQtyIndex] = useState<number | null>(null);
  const [editQtyValue, setEditQtyValue] = useState("");

  // Success flash
  const [showSuccess, setShowSuccess] = useState(false);

  // Last receipt
  const [lastReceipt, setLastReceipt] = useState<LastReceipt | null>(null);
  const [showLastReceipt, setShowLastReceipt] = useState(false);

  // Park / Recall
  const [showParkInput, setShowParkInput] = useState(false);
  const [parkLabel, setParkLabel] = useState("");
  const [showRecallSheet, setShowRecallSheet] = useState(false);
  const [parkedCarts, setParkedCarts] = useState<ParkedCart[]>([]);
  const [parkedCount, setParkedCount] = useState(0);
  const [parkConflictCart, setParkConflictCart] = useState<ParkedCart | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Cart persistence
  const cartIdRef = useRef<string>(createEmptyCart().id);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Swipe-to-delete
  const [swipingIndex, setSwipingIndex] = useState<number | null>(null);

  // Fullscreen
  const [isFullscreen, setIsFullscreen] = useState(false);
  const lastLogoTap = useRef<number>(0);

  // Refs
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const customerDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const tenderedRef = useRef<HTMLInputElement>(null);
  const cartEndRef = useRef<HTMLDivElement>(null);
  const searchCache = useRef<Map<string, InventoryItem[]>>(new Map());

  // ---- Beep sound helper ----
  const playBeep = useCallback((freq = 1200, duration = 0.08, vol = 0.08) => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.value = vol;
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {}
  }, []);

  // ---- Panel toggle helper ----
  const togglePanel = useCallback((panel: ActivePanel) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  }, []);

  // ---- USB barcode scanner integration ----
  const scannerEnabled = !showPaySheet && activePanel !== "scan";

  const {
    hiddenInputRef: scannerInputRef,
    lastScan,
    pause: pauseScanner,
    resume: resumeScanner,
    status: scannerStatus,
  } = useScanner({
    onScan: useCallback(async (barcode: string) => {
      playBeep(1200, 0.08, 0.08);

      setScannerErrorText(null);
      if (scannerErrorTimerRef.current) clearTimeout(scannerErrorTimerRef.current);

      setScannerFlash("success");
      if (scannerFlashTimerRef.current) clearTimeout(scannerFlashTimerRef.current);
      scannerFlashTimerRef.current = setTimeout(() => setScannerFlash("none"), 600);

      let found: InventoryItem | null = null;

      try {
        const localResults = await searchInventoryLocal(barcode);
        const match = localResults.find(
          (r) => r.barcode === barcode && r.quantity > 0
        );
        if (match) {
          found = {
            ...match,
            low_stock_threshold: 5,
            image_url: null,
            external_id: null,
            catalog_product_id: null,
            shared_to_catalog: false,
            created_at: "",
            updated_at: "",
          } as InventoryItem;
        }
      } catch {}

      if (!found) {
        try {
          const res = await fetch(
            `/api/inventory/search?q=${encodeURIComponent(barcode)}`
          );
          const data: InventoryItem[] = await res.json();
          if (Array.isArray(data)) {
            found =
              data.find((d) => d.barcode === barcode && d.quantity > 0) ?? null;
          }
        } catch {}
      }

      if (found) {
        addToCart(found);
      } else {
        playBeep(400, 0.15, 0.06);
        setScannerFlash("error");
        if (scannerFlashTimerRef.current) clearTimeout(scannerFlashTimerRef.current);
        scannerFlashTimerRef.current = setTimeout(() => setScannerFlash("none"), 1000);

        const errorMsg = `No match for barcode: ${barcode}`;
        setScannerErrorText(errorMsg);
        if (scannerErrorTimerRef.current) clearTimeout(scannerErrorTimerRef.current);
        scannerErrorTimerRef.current = setTimeout(
          () => setScannerErrorText(null),
          5000
        );

        // Open search panel with barcode
        setSearchQuery(barcode);
        setActivePanel("search");
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playBeep]),
    onHumanTyping: useCallback((text: string) => {
      setSearchQuery((prev) => prev + text);
      setActivePanel("search");
      searchRef.current?.focus();
    }, []),
    onError: useCallback((error: ScannerError) => {
      setScannerFlash("error");
      if (scannerFlashTimerRef.current) clearTimeout(scannerFlashTimerRef.current);
      scannerFlashTimerRef.current = setTimeout(() => setScannerFlash("none"), 1000);

      const errorMsg =
        error.type === "partial_scan"
          ? `Partial scan: ${error.rawInput}`
          : error.type === "garbled"
            ? `Garbled input: ${error.rawInput}`
            : `Scanner error: ${error.message}`;

      setScannerErrorText(errorMsg);
      if (scannerErrorTimerRef.current) clearTimeout(scannerErrorTimerRef.current);
      scannerErrorTimerRef.current = setTimeout(
        () => setScannerErrorText(null),
        5000
      );

      if (error.rawInput && error.type !== "garbled") {
        setSearchQuery(error.rawInput);
        setActivePanel("search");
      }
    }, []),
    enabled: scannerEnabled,
  });

  // Pause/resume scanner when overlays open/close
  useEffect(() => {
    if (showPaySheet || activePanel === "scan") {
      pauseScanner();
    } else {
      resumeScanner();
    }
  }, [showPaySheet, activePanel, pauseScanner, resumeScanner]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (scannerErrorTimerRef.current) clearTimeout(scannerErrorTimerRef.current);
      if (scannerFlashTimerRef.current) clearTimeout(scannerFlashTimerRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  // ---- Cart persistence: load on mount ----
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    const persisted = loadPersistedCart();
    if (persisted && persisted.items.length > 0) {
      cartIdRef.current = persisted.id;
      setCart(persisted.items as CartItem[]);
      setCustomer(persisted.customer);
      setDiscounts(persisted.discounts as CartDiscount[]);
    }
    setParkedCount(getParkedCartCount());
  }, []);

  // ---- Cart persistence: auto-save on change (debounced 100ms) ----
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (cart.length === 0 && !customer && discounts.length === 0) {
        clearPersistedCart();
      } else {
        persistCart({
          id: cartIdRef.current,
          items: cart,
          customer,
          discounts,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }, 100);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [cart, customer, discounts]);

  // ---- Toast auto-dismiss ----
  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 2000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // ---- Derived values (synchronous) ----
  const subtotal = cart.reduce((s, i) => s + i.price_cents * i.quantity, 0);
  const cartItemCount = cart.reduce((s, i) => s + i.quantity, 0);
  const taxRate = storeSettings.tax_rate_percent;

  // Calculate total discount
  const discountCents = discounts.reduce((sum, d) => {
    if (d.scope === "cart") {
      if (d.type === "percent") {
        return sum + Math.round(subtotal * d.value / 100);
      }
      return sum + d.value;
    }
    // Item-scoped
    if (d.itemIndex != null && d.itemIndex < cart.length) {
      const item = cart[d.itemIndex];
      const lineTotal = item.price_cents * item.quantity;
      if (d.type === "percent") {
        return sum + Math.round(lineTotal * d.value / 100);
      }
      return sum + d.value;
    }
    return sum;
  }, 0);

  const discountedSubtotal = Math.max(0, subtotal - discountCents);
  const taxCents = storeSettings.tax_included_in_price
    ? 0
    : Math.round(discountedSubtotal * taxRate / 100);
  const total = discountedSubtotal + taxCents;

  // Credit available
  const creditAvailable = customer?.credit_balance_cents ?? 0;
  const creditToApply = showCreditConfirm
    ? Math.min(creditAvailable, total)
    : 0;
  const amountDue = total - creditToApply;

  const tendered = tenderedInput ? parseDollars(tenderedInput) : 0;
  const change = paymentMethod === "cash" ? Math.max(0, tendered - amountDue) : 0;

  // ---- Load favorites on mount ----
  useEffect(() => {
    fetch("/api/inventory/favorites?limit=8")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setFavorites(data);
      })
      .catch(() => {});
  }, []);

  // ---- Listen for register-scan event from nav ----
  useEffect(() => {
    function handleScanEvent() {
      setActivePanel("scan");
    }
    window.addEventListener("register-scan", handleScanEvent);
    return () => window.removeEventListener("register-scan", handleScanEvent);
  }, []);

  // ---- Fullscreen change listener ----
  useEffect(() => {
    function handleFsChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // ---- Inventory search ----
  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setSearchResults([]);
        return;
      }

      const trimmed = q.trim();

      // Check cache first
      const cached = searchCache.current.get(trimmed.toLowerCase());
      if (cached) {
        const exactBarcode = cached.find(
          (d) => d.barcode && d.barcode === trimmed && d.quantity > 0
        );
        if (exactBarcode) {
          addToCart(exactBarcode);
          setSearchQuery("");
          setSearchResults([]);
          setActivePanel(null);
          return;
        }
        setSearchResults(cached.filter((d) => d.quantity > 0));
      }

      // Try IndexedDB
      try {
        const localResults = await searchInventoryLocal(trimmed);
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

          const exactBarcode = asInventory.find(
            (d) => d.barcode && d.barcode === trimmed && d.quantity > 0
          );
          if (exactBarcode) {
            addToCart(exactBarcode);
            setSearchQuery("");
            setSearchResults([]);
            setActivePanel(null);
            return;
          }
          const filtered = asInventory.filter((d) => d.quantity > 0);
          searchCache.current.set(trimmed.toLowerCase(), filtered);
          setSearchResults(filtered);
        }
      } catch {}

      // Network fetch
      try {
        const res = await fetch(
          `/api/inventory/search?q=${encodeURIComponent(trimmed)}`
        );
        const data: InventoryItem[] = await res.json();
        if (Array.isArray(data)) {
          const exactBarcode = data.find(
            (d) => d.barcode && d.barcode === trimmed && d.quantity > 0
          );
          if (exactBarcode) {
            addToCart(exactBarcode);
            setSearchQuery("");
            setSearchResults([]);
            setActivePanel(null);
            return;
          }
          const filtered = data.filter((d) => d.quantity > 0);
          searchCache.current.set(trimmed.toLowerCase(), filtered);
          setSearchResults(filtered);
        }
      } catch {}
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart]
  );

  useEffect(() => {
    if (activePanel !== "search") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(searchQuery), 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, doSearch, activePanel]);

  // ---- Customer search ----
  const doCustomerSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setCustomerResults([]);
      return;
    }
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
    } catch {}
    try {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (Array.isArray(data)) setCustomerResults(data);
    } catch {}
  }, []);

  useEffect(() => {
    if (activePanel !== "customer") return;
    if (customerDebounceRef.current) clearTimeout(customerDebounceRef.current);
    customerDebounceRef.current = setTimeout(
      () => doCustomerSearch(customerQuery),
      200
    );
    return () => {
      if (customerDebounceRef.current) clearTimeout(customerDebounceRef.current);
    };
  }, [customerQuery, activePanel, doCustomerSearch]);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showPaySheet) {
          setShowPaySheet(false);
          setShowCashInput(false);
          setShowCreditConfirm(false);
        } else if (showLastReceipt) {
          setShowLastReceipt(false);
        } else if (activePanel) {
          setActivePanel(null);
        }
      }
      if (e.key === "F2") {
        e.preventDefault();
        setActivePanel("search");
        setTimeout(() => searchRef.current?.focus(), 50);
      }
      // Enter on empty search with items -> PAY
      if (e.key === "Enter" && !searchQuery.trim() && cart.length > 0 && !showPaySheet && !activePanel) {
        e.preventDefault();
        setShowPaySheet(true);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [searchQuery, cart, showPaySheet, activePanel, showLastReceipt]);

  // ---- Cart helpers ----
  // eslint-disable-next-line react-hooks/exhaustive-deps
  function addToCart(item: InventoryItem) {
    setCart((prev) => {
      const existingIdx = prev.findIndex((c) => c.inventory_item_id === item.id);
      if (existingIdx >= 0) {
        const existing = prev[existingIdx];
        if (existing.quantity >= item.quantity) return prev;
        const updated = [...prev];
        updated[existingIdx] = { ...existing, quantity: existing.quantity + 1 };
        setLastAddedIndex(existingIdx);
        return updated;
      }
      const newItem: CartItem = {
        inventory_item_id: item.id,
        name: item.name,
        category: item.category,
        price_cents: item.price_cents,
        quantity: 1,
        max_quantity: item.quantity,
      };
      setLastAddedIndex(prev.length);
      return [...prev, newItem];
    });
    // Clear flash after animation
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setLastAddedIndex(null), 500);
    // Scroll to bottom
    setTimeout(() => cartEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    // Close search panel after add
    setSearchQuery("");
    setSearchResults([]);
    if (activePanel === "search" || activePanel === "quick") {
      setActivePanel(null);
    }
  }

  function addManualItem() {
    const name = manualName.trim();
    const priceCents = parseDollars(manualPrice);
    const qty = parseInt(manualQty, 10) || 1;
    if (!name || priceCents <= 0) return;

    setCart((prev) => {
      setLastAddedIndex(prev.length);
      return [
        ...prev,
        {
          inventory_item_id: null,
          name,
          category: "other",
          price_cents: priceCents,
          quantity: qty,
          max_quantity: 999,
        },
      ];
    });
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setLastAddedIndex(null), 500);
    setTimeout(() => cartEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    setManualName("");
    setManualPrice("");
    setManualQty("1");
    setActivePanel(null);
  }

  function removeItem(index: number) {
    // Remove any discounts targeting this item
    setDiscounts((prev) =>
      prev
        .filter((d) => !(d.scope === "item" && d.itemIndex === index))
        .map((d) => {
          // Adjust indices for items after the removed one
          if (d.scope === "item" && d.itemIndex != null && d.itemIndex > index) {
            return { ...d, itemIndex: d.itemIndex - 1 };
          }
          return d;
        })
    );
    setCart((prev) => prev.filter((_, i) => i !== index));
    setSwipingIndex(null);
  }

  function commitQtyEdit(index: number) {
    const newQty = parseInt(editQtyValue, 10);
    if (!newQty || newQty <= 0) {
      removeItem(index);
    } else {
      setCart((prev) =>
        prev.map((c, i) =>
          i === index
            ? { ...c, quantity: Math.min(newQty, c.max_quantity) }
            : c
        )
      );
    }
    setEditingQtyIndex(null);
    setEditQtyValue("");
  }

  // ---- Discount helpers ----
  function applyDiscount() {
    const val = parseFloat(discountValue);
    if (!val || val <= 0) return;

    const newDiscount: CartDiscount = {
      id: `d_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      scope: discountScope,
      type: discountType,
      value: discountType === "dollar" ? parseDollars(discountValue) : val,
      reason: discountReason.trim(),
    };

    if (discountScope === "item" && cart.length > 0) {
      newDiscount.itemIndex = cart.length - 1; // Apply to last item
    }

    setDiscounts((prev) => [...prev, newDiscount]);
    setDiscountValue("");
    setDiscountReason("");
    setActivePanel(null);
  }

  function removeDiscount(id: string) {
    setDiscounts((prev) => prev.filter((d) => d.id !== id));
  }

  // ---- Barcode scan handler (camera scanner) ----
  function handleBarcodeScan(code: string) {
    setActivePanel(null);
    setSearchQuery(code);
    setActivePanel("search");
    playBeep();
  }

  // ---- Complete sale ----
  async function handleCompleteSale(method: PaymentMethod) {
    if (cart.length === 0 || processing) return;
    if (method === "cash" && tendered < amountDue && amountDue > 0) return;

    setProcessing(true);
    const clientTxId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const payload = {
      items: cart.map((c) => ({
        inventory_item_id: c.inventory_item_id,
        quantity: c.quantity,
        price_cents: c.price_cents,
      })),
      customer_id: customer?.id ?? null,
      payment_method: method,
      amount_tendered_cents: method === "cash" ? tendered : amountDue,
      credit_applied_cents: creditToApply,
      event_id: null,
      client_tx_id: clientTxId,
      tax_cents: taxCents,
      discount_cents: discountCents,
    };

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Checkout failed");
        setProcessing(false);
        return;
      }

      saleComplete(method);
    } catch {
      // Offline fallback
      try {
        await enqueueTx({
          clientTxId,
          type: "checkout",
          createdAt: new Date().toISOString(),
          status: "pending",
          retryCount: 0,
          lastError: null,
          payload,
          receipt: {} as Record<string, unknown>,
        });
        for (const item of cart) {
          if (item.inventory_item_id) {
            await decrementLocalInventory(item.inventory_item_id, item.quantity);
          }
        }
        if (creditToApply > 0 && customer) {
          await updateLocalCustomerCredit(customer.id, -creditToApply);
        }
        saleComplete(method);
      } catch {
        alert("Failed to save transaction. Please try again.");
      }
    } finally {
      setProcessing(false);
    }
  }

  function saleComplete(method: PaymentMethod) {
    // Save last receipt
    setLastReceipt({
      items: [...cart],
      discounts: [...discounts],
      subtotalCents: subtotal,
      discountCents,
      taxCents,
      totalCents: total,
      paymentMethod: method,
      customerName: customer?.name ?? null,
      timestamp: new Date().toISOString(),
    });

    // Flash success
    setShowSuccess(true);

    // Clear everything
    setCart([]);
    setDiscounts([]);
    setCustomer(null);
    setShowPaySheet(false);
    setShowCashInput(false);
    setShowCreditConfirm(false);
    setTenderedInput("");
    setPaymentMethod("cash");
    setActivePanel(null);

    // Clear persisted cart (but NOT parked carts)
    clearPersistedCart();
    cartIdRef.current = createEmptyCart().id;

    // Hide success after 1s
    setTimeout(() => setShowSuccess(false), 1000);
  }

  // ---- Park / Recall helpers ----
  function handleParkCart(label?: string) {
    if (cart.length === 0) return;
    parkCart(
      {
        id: cartIdRef.current,
        items: cart,
        customer,
        discounts,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      label
    );
    // Clear active cart
    setCart([]);
    setDiscounts([]);
    setCustomer(null);
    clearPersistedCart();
    cartIdRef.current = createEmptyCart().id;
    setParkedCount(getParkedCartCount());
    setShowParkInput(false);
    setParkLabel("");
    setToastMessage("Cart parked");
  }

  function handleRecallCart(parkedCart: ParkedCart) {
    // If current cart has items, ask to park first
    if (cart.length > 0) {
      setParkConflictCart(parkedCart);
      return;
    }
    doRecall(parkedCart.parkId);
  }

  function doRecall(parkId: string) {
    const recalled = recallParkedCart(parkId);
    if (!recalled) return;
    cartIdRef.current = recalled.id;
    setCart(recalled.items as CartItem[]);
    setCustomer(recalled.customer);
    setDiscounts(recalled.discounts as CartDiscount[]);
    setParkedCount(getParkedCartCount());
    setShowRecallSheet(false);
    setParkConflictCart(null);
    setToastMessage("Cart recalled");
  }

  function handleDeleteParked(parkId: string) {
    deleteParkedCart(parkId);
    setParkedCarts(listParkedCarts());
    setParkedCount(getParkedCartCount());
  }

  function openRecallSheet() {
    setParkedCarts(listParkedCarts());
    setShowRecallSheet(true);
  }

  // ---- Fullscreen toggle ----
  function handleLogoTap() {
    const now = Date.now();
    if (now - lastLogoTap.current < 400) {
      // Double tap
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    }
    lastLogoTap.current = now;
  }

  // ---- Time ago helper ----
  function getTimeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  // ---- Render helpers ----
  const hasCart = cart.length > 0;
  const staffName = staff?.name?.split(" ")[0] ?? "Staff";
  const roleLabel = effectiveRole
    ? effectiveRole.charAt(0).toUpperCase() + effectiveRole.slice(1)
    : "";

  // Get discount for a specific item index
  function getItemDiscounts(index: number) {
    return discounts.filter((d) => d.scope === "item" && d.itemIndex === index);
  }

  function itemDiscountCents(index: number) {
    const item = cart[index];
    const lineTotal = item.price_cents * item.quantity;
    return getItemDiscounts(index).reduce((sum, d) => {
      if (d.type === "percent") return sum + Math.round(lineTotal * d.value / 100);
      return sum + d.value;
    }, 0);
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden select-none">
      {/* ====== HIDDEN SCANNER INPUT ====== */}
      <input
        ref={scannerInputRef}
        className="fixed opacity-0 pointer-events-none"
        style={{ position: "fixed", top: -9999, left: -9999, width: 0, height: 0 }}
        tabIndex={-1}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-hidden="true"
        data-scanner-input="true"
      />

      {/* ====== SUCCESS FLASH ====== */}
      {showSuccess && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-green-600/90 pointer-events-none">
          <div className="text-center text-white">
            <div className="text-7xl mb-3">{"\u2713"}</div>
            <div className="text-2xl font-bold">Sale Complete</div>
          </div>
        </div>
      )}

      {/* ====== TOAST ====== */}
      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-60 bg-card border border-card-border rounded-xl px-4 py-2 shadow-lg text-sm text-foreground pointer-events-none animate-slide-down">
          {toastMessage}
        </div>
      )}

      {/* ====== HEADER ====== */}
      <header className="shrink-0 flex items-center justify-between px-4 h-12 border-b border-card-border bg-card">
        <div className="flex items-center gap-2">
          {/* Scanner status dot */}
          <span
            className={`inline-block w-2 h-2 rounded-full transition-colors duration-150 ${
              scannerFlash === "success"
                ? "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]"
                : scannerFlash === "error"
                  ? "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.6)]"
                  : scannerStatus === "listening"
                    ? "bg-green-500 animate-pulse"
                    : scannerStatus === "paused"
                      ? "bg-gray-500"
                      : "bg-amber-400 animate-pulse"
            }`}
            title={
              scannerStatus === "listening"
                ? `Scanner ready${lastScan ? ` — Last: ${lastScan.code}` : ""}`
                : scannerStatus === "paused"
                  ? "Scanner paused"
                  : "Processing scan..."
            }
          />
          <button
            onClick={handleLogoTap}
            className="text-sm font-bold text-foreground tracking-wide uppercase"
            style={{ minHeight: "auto" }}
          >
            {storeName}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">
            {staffName}{roleLabel ? ` \u00B7 ${roleLabel}` : ""}
          </span>
          {!isFullscreen && (
            <button
              onClick={() => document.documentElement.requestFullscreen().catch(() => {})}
              className="text-muted hover:text-foreground transition-colors"
              title="Enter fullscreen"
              style={{ minHeight: "auto" }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            </button>
          )}
          {isFullscreen && (
            <button
              onClick={() => document.exitFullscreen().catch(() => {})}
              className="text-muted hover:text-foreground transition-colors"
              title="Exit fullscreen"
              style={{ minHeight: "auto" }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              </svg>
            </button>
          )}
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted hover:text-foreground hover:bg-card-hover transition-colors"
            title="Exit register"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      {/* ====== ACTION BAR ====== */}
      <div className="shrink-0 flex items-center gap-1 px-2 h-14 border-b border-card-border bg-card overflow-x-auto">
        <div className="flex items-center gap-1 shrink-0">
          {/* Search */}
          <button
            onClick={() => {
              togglePanel("search");
              setTimeout(() => searchRef.current?.focus(), 50);
            }}
            className={`flex items-center justify-center w-12 h-12 rounded-xl transition-colors ${
              activePanel === "search"
                ? "bg-accent text-white"
                : "text-muted hover:text-foreground hover:bg-card-hover"
            }`}
            title="Search (F2)"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </button>

          {/* Camera scan */}
          <button
            onClick={() => togglePanel("scan")}
            className={`flex items-center justify-center w-12 h-12 rounded-xl transition-colors ${
              activePanel === "scan"
                ? "bg-accent text-white"
                : "text-muted hover:text-foreground hover:bg-card-hover"
            }`}
            title="Camera scan"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
            </svg>
          </button>

          {/* Customer */}
          <button
            onClick={() => {
              if (customer && activePanel !== "customer") {
                // If customer attached and panel not open, open it
                togglePanel("customer");
              } else if (customer && activePanel === "customer") {
                setActivePanel(null);
              } else {
                togglePanel("customer");
                setCustomerQuery("");
                setCustomerResults([]);
              }
            }}
            className={`flex items-center justify-center rounded-xl transition-colors ${
              activePanel === "customer"
                ? "bg-accent text-white"
                : customer
                  ? "bg-accent/20 text-accent"
                  : "text-muted hover:text-foreground hover:bg-card-hover"
            }`}
            style={{ minWidth: 48, height: 48 }}
            title={customer ? customer.name : "Attach customer"}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </button>

          {/* Quick Add */}
          <button
            onClick={() => togglePanel("quick")}
            className={`flex items-center justify-center w-12 h-12 rounded-xl transition-colors ${
              activePanel === "quick"
                ? "bg-accent text-white"
                : "text-muted hover:text-foreground hover:bg-card-hover"
            }`}
            title="Quick add"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </button>

          {/* Manual Item */}
          <button
            onClick={() => togglePanel("manual")}
            className={`flex items-center justify-center w-12 h-12 rounded-xl transition-colors ${
              activePanel === "manual"
                ? "bg-accent text-white"
                : "text-muted hover:text-foreground hover:bg-card-hover"
            }`}
            title="Manual item"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
          </button>

          {/* Discount */}
          <button
            onClick={() => togglePanel("discount")}
            className={`flex items-center justify-center w-12 h-12 rounded-xl transition-colors ${
              activePanel === "discount"
                ? "bg-accent text-white"
                : discounts.length > 0
                  ? "bg-amber-500/20 text-amber-400"
                  : "text-muted hover:text-foreground hover:bg-card-hover"
            }`}
            title="Discount"
          >
            <span className="text-lg font-bold">%</span>
          </button>
        </div>

        {/* Running total (right side) */}
        <div className="flex-1" />
        <div className="shrink-0 text-right pr-1">
          <div className="text-lg font-bold text-foreground tabular-nums">
            {hasCart ? formatCents(total) : "$0.00"}
          </div>
        </div>
      </div>

      {/* ====== SCANNER ERROR BAR ====== */}
      {scannerErrorText && (
        <div className="shrink-0 px-4 py-1.5 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs">
          {scannerErrorText}
        </div>
      )}

      {/* ====== MAIN CONTENT AREA (desktop: split, mobile: stacked) ====== */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* ---- Receipt tape (left on desktop, fills screen on mobile) ---- */}
        <div className="flex-1 overflow-y-auto" style={{ scrollBehavior: "smooth" }}>
          {cart.length === 0 && !activePanel ? (
            <div className="flex items-center justify-center h-full text-muted text-sm">
              Scan or search to add items
            </div>
          ) : (
            <div className="py-2">
              {cart.map((item, index) => {
                const lineTotal = item.price_cents * item.quantity;
                const itemDisc = itemDiscountCents(index);
                const isSwiping = swipingIndex === index;

                return (
                  <div key={`${item.inventory_item_id ?? "manual"}-${index}`}>
                    {/* Cart line item */}
                    <div
                      className={`group relative flex items-center px-4 py-2.5 transition-colors duration-200 ${
                        lastAddedIndex === index ? "animate-cart-flash" : ""
                      } ${isSwiping ? "bg-red-500/10" : "hover:bg-card-hover/50"}`}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setSwipingIndex(isSwiping ? null : index);
                      }}
                      onTouchStart={(e) => {
                        const touch = e.touches[0];
                        const startX = touch.clientX;
                        const el = e.currentTarget;
                        function onMove(ev: TouchEvent) {
                          const diff = startX - ev.touches[0].clientX;
                          if (diff > 60) {
                            setSwipingIndex(index);
                            el.removeEventListener("touchmove", onMove);
                          }
                        }
                        el.addEventListener("touchmove", onMove, { passive: true });
                        el.addEventListener("touchend", () => {
                          el.removeEventListener("touchmove", onMove);
                        }, { once: true });
                      }}
                    >
                      {/* Item name */}
                      <div className="flex-1 min-w-0 pr-3">
                        <span className="text-sm text-foreground truncate block">
                          {item.name}
                          {!item.inventory_item_id && (
                            <span className="text-xs text-muted ml-1">(manual)</span>
                          )}
                        </span>
                      </div>

                      {/* Quantity — tappable */}
                      {editingQtyIndex === index ? (
                        <input
                          type="number"
                          inputMode="numeric"
                          value={editQtyValue}
                          onChange={(e) => setEditQtyValue(e.target.value)}
                          onBlur={() => commitQtyEdit(index)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitQtyEdit(index);
                          }}
                          autoFocus
                          className="w-14 rounded-md border border-input-border bg-input-bg px-2 py-0.5 text-center text-sm text-foreground focus:border-accent focus:outline-none"
                          style={{ minHeight: "auto" }}
                        />
                      ) : (
                        <button
                          onClick={() => {
                            setEditingQtyIndex(index);
                            setEditQtyValue(String(item.quantity));
                          }}
                          className="shrink-0 text-xs text-muted hover:text-foreground tabular-nums px-1"
                          style={{ minHeight: "auto" }}
                        >
                          x{item.quantity}
                        </button>
                      )}

                      {/* Line total — right-aligned, monospace-ish */}
                      <div className="shrink-0 w-20 text-right text-sm font-medium text-foreground tabular-nums font-mono">
                        {formatCents(lineTotal)}
                      </div>

                      {/* Delete button (visible on swipe / hover on desktop) */}
                      {isSwiping && (
                        <button
                          onClick={() => removeItem(index)}
                          className="absolute right-0 top-0 bottom-0 w-16 bg-red-500 text-white flex items-center justify-center text-xs font-medium"
                        >
                          Delete
                        </button>
                      )}
                    </div>

                    {/* Item-level discounts */}
                    {getItemDiscounts(index).map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center px-4 py-1 text-xs"
                      >
                        <span className="flex-1 text-amber-400 italic">
                          {"\u2500"} Discount ({d.type === "percent" ? `${d.value}%` : formatCents(d.value)})
                          {d.reason && ` \u2014 ${d.reason}`}
                        </span>
                        <span className="tabular-nums font-mono text-amber-400">
                          -{formatCents(itemDisc)}
                        </span>
                        <button
                          onClick={() => removeDiscount(d.id)}
                          className="ml-2 text-muted hover:text-red-400 text-xs"
                          style={{ minHeight: "auto" }}
                        >
                          {"\u00D7"}
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}

              {/* Cart-level discounts */}
              {discounts.filter((d) => d.scope === "cart").map((d) => {
                const discAmt = d.type === "percent"
                  ? Math.round(subtotal * d.value / 100)
                  : d.value;
                return (
                  <div
                    key={d.id}
                    className="flex items-center px-4 py-1.5 text-xs border-t border-card-border/50"
                  >
                    <span className="flex-1 text-amber-400 italic">
                      {"\u2500"} Cart Discount ({d.type === "percent" ? `${d.value}%` : formatCents(d.value)})
                      {d.reason && ` \u2014 ${d.reason}`}
                    </span>
                    <span className="tabular-nums font-mono text-amber-400">
                      -{formatCents(discAmt)}
                    </span>
                    <button
                      onClick={() => removeDiscount(d.id)}
                      className="ml-2 text-muted hover:text-red-400 text-xs"
                      style={{ minHeight: "auto" }}
                    >
                      {"\u00D7"}
                    </button>
                  </div>
                );
              })}

              {/* Scroll anchor */}
              <div ref={cartEndRef} />
            </div>
          )}
        </div>

        {/* ---- Right panel (desktop): active panel content ---- */}
        {activePanel && activePanel !== "scan" && (
          <div className="hidden lg:block lg:w-[40%] xl:w-[38%] border-l border-card-border bg-card overflow-y-auto">
            {renderPanelContent()}
          </div>
        )}
      </div>

      {/* ====== PANEL OVERLAY (mobile: slides up below action bar) ====== */}
      {activePanel && activePanel !== "scan" && (
        <div className="lg:hidden absolute left-0 right-0 z-30 bg-card border-b border-card-border shadow-lg animate-slide-down"
          style={{ top: scannerErrorText ? "calc(6.5rem + 26px)" : "6.5rem", maxHeight: "50vh", overflowY: "auto" }}
        >
          {renderPanelContent()}
        </div>
      )}

      {/* ====== SUMMARY BAR + PAY BUTTON ====== */}
      <div className="shrink-0 border-t border-card-border bg-card">
        {hasCart && (
          <div className="px-4 py-2 space-y-0.5">
            <div className="flex justify-between text-xs text-muted">
              <span>Subtotal</span>
              <span className="tabular-nums font-mono">{formatCents(subtotal)}</span>
            </div>
            {taxCents > 0 && (
              <div className="flex justify-between text-xs text-muted">
                <span>Tax ({taxRate}%)</span>
                <span className="tabular-nums font-mono">{formatCents(taxCents)}</span>
              </div>
            )}
            {discountCents > 0 && (
              <div className="flex justify-between text-xs text-amber-400">
                <span>Discount</span>
                <span className="tabular-nums font-mono">-{formatCents(discountCents)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold text-foreground pt-1 border-t border-card-border/50">
              <span>TOTAL</span>
              <span className="tabular-nums font-mono">{formatCents(total)}</span>
            </div>
          </div>
        )}

        <div className="px-4 pb-3 pt-1">
          <button
            onClick={() => {
              if (hasCart) setShowPaySheet(true);
            }}
            disabled={!hasCart}
            className="w-full rounded-xl font-bold text-white transition-colors disabled:opacity-30"
            style={{
              height: 56,
              fontSize: 18,
              backgroundColor: hasCart ? "#16a34a" : undefined,
              minHeight: 56,
            }}
          >
            {hasCart ? `PAY ${formatCents(total)}` : "PAY"}
          </button>
        </div>
      </div>

      {/* ====== STATUS BAR ====== */}
      <div className="shrink-0 flex items-center justify-between px-4 h-8 border-t border-card-border bg-card/80 text-xs text-muted">
        <div className="flex items-center gap-2 min-w-0">
          {/* Park button — only when cart has items */}
          {hasCart && (
            <button
              onClick={() => setShowParkInput(true)}
              className="hover:text-foreground transition-colors shrink-0 flex items-center gap-1"
              style={{ minHeight: "auto" }}
              title="Park this cart"
            >
              <span>{"⏸"}</span> Park
            </button>
          )}
          {/* Recall button — only when parked carts exist */}
          {parkedCount > 0 && (
            <button
              onClick={openRecallSheet}
              className="hover:text-foreground transition-colors shrink-0 flex items-center gap-1"
              style={{ minHeight: "auto" }}
              title="Recall a parked cart"
            >
              <span>{"▶"}</span> Recall
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-accent text-white text-[10px] font-bold">
                {parkedCount}
              </span>
            </button>
          )}
          {(hasCart || parkedCount > 0) && <span className="text-card-border">|</span>}
          <button
            onClick={() => {
              if (customer) {
                togglePanel("customer");
              } else {
                setActivePanel("customer");
                setCustomerQuery("");
                setCustomerResults([]);
              }
            }}
            className="hover:text-foreground transition-colors truncate"
            style={{ minHeight: "auto" }}
          >
            {customer ? customer.name : "Guest"}
            {customer && customer.credit_balance_cents > 0 && (
              <span className="ml-1 text-accent">{formatCents(customer.credit_balance_cents)}</span>
            )}
          </button>
        </div>
        {lastReceipt && (
          <button
            onClick={() => setShowLastReceipt(true)}
            className="hover:text-foreground transition-colors shrink-0"
            style={{ minHeight: "auto" }}
          >
            Last Receipt
          </button>
        )}
      </div>

      {/* ====== PAYMENT SHEET ====== */}
      {showPaySheet && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              if (!processing) {
                setShowPaySheet(false);
                setShowCashInput(false);
                setShowCreditConfirm(false);
              }
            }}
          />
          <div className="relative bg-card rounded-t-2xl border-t border-card-border animate-slide-up"
            style={{ maxHeight: "70vh" }}
          >
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xl font-bold text-foreground tabular-nums font-mono">
                  {formatCents(amountDue)}
                </span>
                <button
                  onClick={() => {
                    if (!processing) {
                      setShowPaySheet(false);
                      setShowCashInput(false);
                      setShowCreditConfirm(false);
                    }
                  }}
                  className="text-muted hover:text-foreground text-sm"
                  style={{ minHeight: "auto" }}
                >
                  Cancel
                </button>
              </div>

              {showCashInput ? (
                <div className="space-y-4">
                  <div className="text-sm text-muted">Amount tendered:</div>
                  <input
                    ref={tenderedRef}
                    type="text"
                    inputMode="decimal"
                    value={tenderedInput}
                    onChange={(e) => setTenderedInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && tendered >= amountDue) {
                        handleCompleteSale("cash");
                      }
                    }}
                    placeholder={formatCents(amountDue)}
                    autoFocus
                    className="w-full rounded-xl border border-input-border bg-input-bg px-4 text-foreground placeholder:text-muted focus:border-accent focus:outline-none text-center font-bold font-mono"
                    style={{ height: 60, fontSize: 28 }}
                  />
                  {tendered > 0 && tendered >= amountDue && (
                    <div className="text-center text-xl font-bold text-green-400 tabular-nums font-mono">
                      Change: {formatCents(change)}
                    </div>
                  )}
                  <button
                    onClick={() => handleCompleteSale("cash")}
                    disabled={processing || (amountDue > 0 && tendered < amountDue)}
                    className="w-full rounded-xl font-bold text-white disabled:opacity-30 transition-colors"
                    style={{ height: 56, fontSize: 18, backgroundColor: "#16a34a", minHeight: 56 }}
                  >
                    {processing ? "Processing..." : "Done"}
                  </button>
                </div>
              ) : showCreditConfirm ? (
                <div className="space-y-4">
                  <div className="text-sm text-muted">
                    Apply {formatCents(creditToApply)} store credit from {customer?.name}?
                  </div>
                  {total > creditAvailable && (
                    <div className="text-sm text-muted">
                      Remaining {formatCents(total - creditToApply)} will need another payment method.
                    </div>
                  )}
                  <button
                    onClick={() => handleCompleteSale("store_credit")}
                    disabled={processing}
                    className="w-full rounded-xl font-bold text-white disabled:opacity-30 transition-colors"
                    style={{ height: 56, fontSize: 18, backgroundColor: "#16a34a", minHeight: 56 }}
                  >
                    {processing ? "Processing..." : "Apply Credit"}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      setShowCashInput(true);
                      setTimeout(() => tenderedRef.current?.focus(), 50);
                    }}
                    className="w-full flex items-center gap-4 rounded-xl border border-card-border bg-card-hover px-5 text-foreground hover:bg-accent-light active:bg-accent-light transition-colors"
                    style={{ height: 64, fontSize: 18, minHeight: 56 }}
                  >
                    <span className="text-2xl">{"\uD83D\uDCB5"}</span>
                    <span className="font-medium">Cash</span>
                  </button>

                  <button
                    onClick={() => handleCompleteSale("card")}
                    disabled={processing}
                    className="w-full flex items-center gap-4 rounded-xl border border-card-border bg-card-hover px-5 text-foreground hover:bg-accent-light active:bg-accent-light transition-colors disabled:opacity-50"
                    style={{ height: 64, fontSize: 18, minHeight: 56 }}
                  >
                    <span className="text-2xl">{"\uD83D\uDCB3"}</span>
                    <span className="font-medium">
                      {processing ? "Processing..." : "Card"}
                    </span>
                  </button>

                  <button
                    onClick={() => handleCompleteSale("external")}
                    disabled={processing}
                    className="w-full flex items-center gap-4 rounded-xl border border-card-border bg-card-hover px-5 text-foreground hover:bg-accent-light active:bg-accent-light transition-colors disabled:opacity-50"
                    style={{ height: 64, fontSize: 18, minHeight: 56 }}
                  >
                    <span className="text-2xl">{"\uD83D\uDD33"}</span>
                    <span className="font-medium">External Terminal</span>
                  </button>

                  {customer && creditAvailable > 0 && (
                    <button
                      onClick={() => setShowCreditConfirm(true)}
                      className="w-full flex items-center gap-4 rounded-xl border border-card-border bg-card-hover px-5 text-foreground hover:bg-accent-light active:bg-accent-light transition-colors"
                      style={{ height: 64, fontSize: 18, minHeight: 56 }}
                    >
                      <span className="text-2xl">{"\uD83D\uDCB0"}</span>
                      <span className="font-medium">
                        Store Credit ({formatCents(creditAvailable)})
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====== LAST RECEIPT MODAL ====== */}
      {showLastReceipt && lastReceipt && (
        <div className="absolute inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 no-print" onClick={() => setShowLastReceipt(false)} />
          <div className="relative bg-card rounded-2xl border border-card-border w-full max-w-sm mx-4 max-h-[80vh] overflow-y-auto no-print">
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-foreground">Last Receipt</span>
                <button
                  onClick={() => setShowLastReceipt(false)}
                  className="text-muted hover:text-foreground"
                  style={{ minHeight: "auto" }}
                >
                  {"\u00D7"}
                </button>
              </div>

              <div className="text-xs text-muted">
                {new Date(lastReceipt.timestamp).toLocaleString()}
                {lastReceipt.customerName && ` \u2014 ${lastReceipt.customerName}`}
              </div>

              <div className="border-t border-card-border pt-2 space-y-1">
                {lastReceipt.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-foreground truncate pr-2">
                      {item.name} <span className="text-muted">x{item.quantity}</span>
                    </span>
                    <span className="tabular-nums font-mono text-foreground shrink-0">
                      {formatCents(item.price_cents * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-card-border pt-2 space-y-0.5 text-xs">
                <div className="flex justify-between text-muted">
                  <span>Subtotal</span>
                  <span className="tabular-nums font-mono">{formatCents(lastReceipt.subtotalCents)}</span>
                </div>
                {lastReceipt.discountCents > 0 && (
                  <div className="flex justify-between text-amber-400">
                    <span>Discount</span>
                    <span className="tabular-nums font-mono">-{formatCents(lastReceipt.discountCents)}</span>
                  </div>
                )}
                {lastReceipt.taxCents > 0 && (
                  <div className="flex justify-between text-muted">
                    <span>Tax</span>
                    <span className="tabular-nums font-mono">{formatCents(lastReceipt.taxCents)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-foreground pt-1">
                  <span>TOTAL</span>
                  <span className="tabular-nums font-mono">{formatCents(lastReceipt.totalCents)}</span>
                </div>
                <div className="text-muted pt-1">
                  Paid: {lastReceipt.paymentMethod}
                </div>
              </div>

              <button
                onClick={() => window.print()}
                className="w-full rounded-xl border border-card-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-card-hover transition-colors"
                style={{ minHeight: 44 }}
              >
                Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====== PRINTABLE RECEIPT (hidden on screen, shown on print) ====== */}
      {lastReceipt && (
        <div className="print-receipt hidden">
          <div className="receipt-store-name">{storeName}</div>
          {storeSettings.receipt_header && (
            <div className="receipt-header">{storeSettings.receipt_header}</div>
          )}
          <div className="receipt-date">
            {new Date(lastReceipt.timestamp).toLocaleDateString()}{" "}
            {new Date(lastReceipt.timestamp).toLocaleTimeString()}
          </div>
          {lastReceipt.customerName && (
            <div className="receipt-customer">Customer: {lastReceipt.customerName}</div>
          )}
          <div className="receipt-divider">{"--------------------------------"}</div>
          {lastReceipt.items.map((item, i) => (
            <div key={i} className="receipt-line">
              <span className="receipt-item-name">{item.name}</span>
              <span className="receipt-item-detail">
                {item.quantity > 1 ? `  x${item.quantity}` : ""}
                {"  "}{formatCents(item.price_cents * item.quantity)}
              </span>
            </div>
          ))}
          <div className="receipt-divider">{"--------------------------------"}</div>
          <div className="receipt-line">
            <span>Subtotal</span>
            <span>{formatCents(lastReceipt.subtotalCents)}</span>
          </div>
          {lastReceipt.discountCents > 0 && (
            <div className="receipt-line">
              <span>Discount</span>
              <span>-{formatCents(lastReceipt.discountCents)}</span>
            </div>
          )}
          {lastReceipt.taxCents > 0 && (
            <div className="receipt-line">
              <span>Tax ({taxRate}%)</span>
              <span>{formatCents(lastReceipt.taxCents)}</span>
            </div>
          )}
          <div className="receipt-divider">{"================================"}</div>
          <div className="receipt-line receipt-total">
            <span>TOTAL</span>
            <span>{formatCents(lastReceipt.totalCents)}</span>
          </div>
          <div className="receipt-line">
            <span>Paid</span>
            <span>{lastReceipt.paymentMethod.toUpperCase()}</span>
          </div>
          <div className="receipt-divider">{"--------------------------------"}</div>
          <div className="receipt-footer">
            {storeSettings.receipt_footer || "Thank you for shopping with us!"}
          </div>
          <div className="receipt-barcode">
            {"||||| |||| ||||| |||| |||||"}
          </div>
        </div>
      )}

      {/* ====== PARK INPUT MODAL ====== */}
      {showParkInput && (
        <div className="absolute inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setShowParkInput(false); setParkLabel(""); }} />
          <div className="relative bg-card rounded-2xl border border-card-border w-full max-w-sm mx-4">
            <div className="p-5 space-y-4">
              <div className="text-base font-bold text-foreground">Park Cart</div>
              <p className="text-sm text-muted">
                Save this cart ({cartItemCount} item{cartItemCount !== 1 ? "s" : ""}, {formatCents(total)}) and start a new transaction.
              </p>
              <input
                type="text"
                value={parkLabel}
                onChange={(e) => setParkLabel(e.target.value)}
                placeholder={`Cart #${getParkedCartCount() + 1}`}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleParkCart(parkLabel || undefined);
                }}
                className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-2.5 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                style={{ fontSize: 16 }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowParkInput(false); setParkLabel(""); }}
                  className="flex-1 rounded-xl border border-card-border px-4 py-2.5 text-sm font-medium text-muted hover:text-foreground hover:bg-card-hover transition-colors"
                  style={{ minHeight: 44 }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleParkCart(parkLabel || undefined)}
                  className="flex-1 rounded-xl font-medium text-white transition-colors"
                  style={{ height: 44, backgroundColor: "var(--accent)", minHeight: 44 }}
                >
                  Park
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== RECALL SHEET ====== */}
      {showRecallSheet && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setShowRecallSheet(false); setParkConflictCart(null); }} />
          <div className="relative bg-card rounded-t-2xl border-t border-card-border animate-slide-up" style={{ maxHeight: "70vh" }}>
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-foreground">Parked Carts</span>
                <button
                  onClick={() => { setShowRecallSheet(false); setParkConflictCart(null); }}
                  className="text-muted hover:text-foreground"
                  style={{ minHeight: "auto" }}
                >
                  {"\u00D7"}
                </button>
              </div>

              {/* Conflict dialog */}
              {parkConflictCart && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                  <p className="text-sm text-foreground">
                    You have items in your current cart. What would you like to do?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        // Park current cart first, then recall
                        handleParkCart();
                        setTimeout(() => doRecall(parkConflictCart.parkId), 50);
                      }}
                      className="flex-1 rounded-xl border border-card-border px-3 py-2 text-sm font-medium text-foreground hover:bg-card-hover transition-colors"
                      style={{ minHeight: 40 }}
                    >
                      Park current first
                    </button>
                    <button
                      onClick={() => {
                        // Replace current cart
                        doRecall(parkConflictCart.parkId);
                      }}
                      className="flex-1 rounded-xl border border-red-500/30 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                      style={{ minHeight: 40 }}
                    >
                      Replace
                    </button>
                  </div>
                </div>
              )}

              {parkedCarts.length === 0 ? (
                <div className="flex items-center justify-center h-24 text-muted text-sm">
                  No parked carts
                </div>
              ) : (
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {parkedCarts.map((pc) => {
                    const ago = getTimeAgo(pc.parkedAt);
                    return (
                      <div key={pc.parkId} className="flex items-center gap-2">
                        <button
                          onClick={() => handleRecallCart(pc)}
                          className="flex-1 flex items-center justify-between rounded-xl px-4 py-3 text-left bg-card-hover hover:bg-accent-light active:bg-accent-light transition-colors border border-card-border"
                          style={{ minHeight: 52 }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-foreground truncate">
                              {pc.label}
                            </div>
                            <div className="text-xs text-muted">
                              {pc.itemCount} item{pc.itemCount !== 1 ? "s" : ""}
                              {" \u00B7 "}{formatCents(pc.totalCents)}
                              {" \u00B7 "}{ago}
                              {pc.customer && ` \u00B7 ${pc.customer.name}`}
                            </div>
                          </div>
                          <svg className="w-4 h-4 text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteParked(pc.parkId)}
                          className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete"
                          style={{ minHeight: "auto" }}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====== BARCODE SCANNER (camera) ====== */}
      {activePanel === "scan" && (
        <BarcodeScanner
          onScan={(code) => handleBarcodeScan(code)}
          onClose={() => setActivePanel(null)}
          title="Scan Barcode"
        />
      )}
    </div>
  );

  /* ================================================================== */
  /*  Panel content renderer                                             */
  /* ================================================================== */
  function renderPanelContent() {
    switch (activePanel) {
      case "search":
        return (
          <div className="p-3 space-y-2">
            <div className="relative">
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products or scan barcode..."
                className="w-full rounded-xl border border-input-border bg-input-bg pl-4 pr-10 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                style={{ height: 48, fontSize: 16 }}
                autoComplete="off"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSearchResults([]);
                    setScannerErrorText(null);
                    searchRef.current?.focus();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground text-xl leading-none"
                  style={{ minHeight: "auto" }}
                >
                  {"\u00D7"}
                </button>
              )}
            </div>

            {searchResults.length > 0 ? (
              <div className="space-y-1">
                {searchResults.slice(0, 20).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-left bg-card hover:bg-card-hover active:bg-accent-light transition-colors border border-card-border"
                    style={{ minHeight: 52 }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground truncate">
                        {item.name}
                      </div>
                      <div className="text-xs text-muted">{item.category} {"\u00B7"} qty {item.quantity}</div>
                    </div>
                    <div className="text-sm font-bold text-foreground ml-3 tabular-nums font-mono">
                      {formatCents(item.price_cents)}
                    </div>
                  </button>
                ))}
              </div>
            ) : searchQuery.trim() ? (
              <div className="flex items-center justify-center h-24 text-muted text-sm">
                No products found
              </div>
            ) : null}
          </div>
        );

      case "customer":
        return (
          <div className="p-3 space-y-3">
            {customer ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-foreground">{customer.name}</div>
                    {customer.email && <div className="text-xs text-muted">{customer.email}</div>}
                  </div>
                  {customer.credit_balance_cents > 0 && (
                    <div className="text-sm font-medium text-accent tabular-nums font-mono">
                      {formatCents(customer.credit_balance_cents)} credit
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setCustomer(null);
                    setActivePanel(null);
                  }}
                  className="w-full rounded-xl border border-red-500/30 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                  style={{ minHeight: 44 }}
                >
                  Detach Customer
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  placeholder="Search by name, email, or phone..."
                  autoFocus
                  className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-3 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  style={{ fontSize: 16, minHeight: 48 }}
                />
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {customerResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCustomer(c);
                        setActivePanel(null);
                      }}
                      className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-left bg-card-hover hover:bg-accent-light active:bg-accent-light transition-colors"
                      style={{ minHeight: 52 }}
                    >
                      <div>
                        <div className="text-sm font-medium text-foreground">{c.name}</div>
                        {c.email && <div className="text-xs text-muted">{c.email}</div>}
                      </div>
                      {c.credit_balance_cents > 0 && (
                        <div className="text-xs font-medium text-accent tabular-nums">
                          {formatCents(c.credit_balance_cents)}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        );

      case "quick":
        return (
          <div className="p-3">
            {favorites.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {favorites.slice(0, 8).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    className="flex flex-col items-center justify-center rounded-xl border border-card-border bg-card hover:bg-card-hover active:bg-accent-light px-3 py-4 transition-colors text-center"
                    style={{ minHeight: 80 }}
                  >
                    <div className="text-sm font-medium text-foreground leading-tight truncate w-full">
                      {item.name}
                    </div>
                    <div className="text-xs font-bold text-accent mt-1 tabular-nums font-mono">
                      {formatCents(item.price_cents)}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-24 text-muted text-sm">
                No favorites configured
              </div>
            )}
          </div>
        );

      case "manual":
        return (
          <div className="p-3 space-y-3">
            <div className="text-xs font-semibold text-muted uppercase tracking-wider">Manual Item</div>
            <input
              type="text"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="Item name"
              autoFocus
              className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-2.5 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              style={{ fontSize: 16 }}
            />
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={manualPrice}
                onChange={(e) => setManualPrice(e.target.value)}
                placeholder="Price (e.g. 5.99)"
                className="flex-1 rounded-xl border border-input-border bg-input-bg px-4 py-2.5 text-foreground placeholder:text-muted focus:border-accent focus:outline-none font-mono"
                style={{ fontSize: 16 }}
              />
              <input
                type="number"
                inputMode="numeric"
                value={manualQty}
                onChange={(e) => setManualQty(e.target.value)}
                placeholder="Qty"
                className="w-20 rounded-xl border border-input-border bg-input-bg px-3 py-2.5 text-center text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                style={{ fontSize: 16 }}
              />
            </div>
            <button
              onClick={addManualItem}
              disabled={!manualName.trim() || !manualPrice}
              className="w-full rounded-xl font-medium text-white disabled:opacity-30 transition-colors"
              style={{ height: 48, backgroundColor: "#16a34a" }}
            >
              Add to Cart
            </button>
          </div>
        );

      case "discount":
        return (
          <div className="p-3 space-y-3">
            <div className="text-xs font-semibold text-muted uppercase tracking-wider">Apply Discount</div>

            {/* Scope toggle */}
            <div className="flex gap-1 bg-card-hover rounded-xl p-1">
              <button
                onClick={() => setDiscountScope("item")}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                  discountScope === "item"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
                style={{ minHeight: "auto" }}
              >
                Last Item
              </button>
              <button
                onClick={() => setDiscountScope("cart")}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                  discountScope === "cart"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
                style={{ minHeight: "auto" }}
              >
                Whole Cart
              </button>
            </div>

            {/* Type toggle */}
            <div className="flex gap-1 bg-card-hover rounded-xl p-1">
              <button
                onClick={() => setDiscountType("percent")}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                  discountType === "percent"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
                style={{ minHeight: "auto" }}
              >
                % Off
              </button>
              <button
                onClick={() => setDiscountType("dollar")}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                  discountType === "dollar"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
                style={{ minHeight: "auto" }}
              >
                $ Off
              </button>
            </div>

            <input
              type="text"
              inputMode="decimal"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder={discountType === "percent" ? "e.g. 10" : "e.g. 5.00"}
              autoFocus
              className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-2.5 text-foreground placeholder:text-muted focus:border-accent focus:outline-none font-mono text-center"
              style={{ fontSize: 20 }}
            />

            <input
              type="text"
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
              placeholder="Reason (optional)"
              className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-2.5 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              style={{ fontSize: 14 }}
            />

            {discountCents > 0 && (
              <div className="text-xs text-amber-400">
                Current total discount: -{formatCents(discountCents)}
              </div>
            )}

            <button
              onClick={applyDiscount}
              disabled={!discountValue || !cart.length}
              className="w-full rounded-xl font-medium text-white disabled:opacity-30 transition-colors"
              style={{ height: 48, backgroundColor: "#d97706" }}
            >
              Apply Discount
            </button>
          </div>
        );

      default:
        return null;
    }
  }
}
