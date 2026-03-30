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
import { BarcodeLearnModal } from "@/components/barcode-learn-modal";
import { NumericKeypad } from "@/components/numeric-keypad";
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

type ActivePanel = "search" | "scan" | "customer" | "quick" | "manual" | "discount" | "more" | "price_check" | "store_credit" | "returns" | "loyalty" | "gift_card" | "no_sale" | "flag_issue" | "void_last" | null;

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
  const [learnBarcode, setLearnBarcode] = useState<string | null>(null);
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
  const [showChangeDue, setShowChangeDue] = useState<number | null>(null); // cents of change to give back
  const [processing, setProcessing] = useState(false);

  // Quantity edit
  const [editingQtyIndex, setEditingQtyIndex] = useState<number | null>(null);
  const [editQtyValue, setEditQtyValue] = useState("");

  // Success screen (persistent for non-cash sales — replaces brief flash)
  const [showSuccess, setShowSuccess] = useState(false);

  // Last receipt
  const [lastReceipt, setLastReceipt] = useState<LastReceipt | null>(null);
  const [showLastReceipt, setShowLastReceipt] = useState(false);

  // Item added confirmation
  const [itemAddedMessage, setItemAddedMessage] = useState<string | null>(null);
  const itemAddedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Error banner (replaces alert())
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const errorBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Receipt sending state
  const [sendingReceipt, setSendingReceipt] = useState<"email" | "text" | null>(null);

  // More menu panels
  const [priceCheckQuery, setPriceCheckQuery] = useState("");
  const [priceCheckResults, setPriceCheckResults] = useState<InventoryItem[]>([]);
  const [creditCustomer, setCreditCustomer] = useState<Customer | null>(null);
  const [creditCustomerQuery, setCreditCustomerQuery] = useState("");
  const [creditCustomerResults, setCreditCustomerResults] = useState<Customer[]>([]);
  const [creditCustomerDetail, setCreditCustomerDetail] = useState<{ credit_balance_cents: number; ledger_entries: Array<{ id: string; type: string; amount_cents: number; description: string | null; created_at: string }> } | null>(null);
  const [creditIssueAmount, setCreditIssueAmount] = useState("");
  const [creditIssueReason, setCreditIssueReason] = useState("");
  const [creditIssuing, setCreditIssuing] = useState(false);
  const [giftCardCode, setGiftCardCode] = useState("");
  const [giftCardResult, setGiftCardResult] = useState<{ balance_cents: number; code: string; active: boolean } | null>(null);
  const [giftCardError, setGiftCardError] = useState<string | null>(null);
  const [giftCardLoading, setGiftCardLoading] = useState(false);
  const [flagType, setFlagType] = useState("wrong_price");
  const [flagNotes, setFlagNotes] = useState("");
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  const [voidTransaction, setVoidTransaction] = useState<{ id: string; amount_cents: number; created_at: string; description: string | null; metadata: Record<string, unknown> } | null>(null);
  const [voidLoading, setVoidLoading] = useState(false);
  const [voidProcessing, setVoidProcessing] = useState(false);
  const [loyaltyCustomer, setLoyaltyCustomer] = useState<{ id: string; name: string; loyalty_points: number; loyalty_entries: Array<{ id: string; type: string; points: number; description: string | null; created_at: string }> } | null>(null);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
  const [returnSearchQuery, setReturnSearchQuery] = useState("");
  const [returnSales, setReturnSales] = useState<Array<{ id: string; created_at: string; customer_name: string; amount_cents: number; payment_method: string; items: Array<{ inventory_item_id: string; name: string; category: string | null; quantity: number; price_cents: number; max_returnable: number }> }>>([]);
  const [returnSalesLoading, setReturnSalesLoading] = useState(false);
  const [returnSelectedSale, setReturnSelectedSale] = useState<typeof returnSales[0] | null>(null);
  const [returnSelectedItems, setReturnSelectedItems] = useState<Array<{ inventory_item_id: string; name: string; price_cents: number; quantity: number; selected: boolean }>>([]);
  const [returnRefundMethod, setReturnRefundMethod] = useState<"cash" | "store_credit">("cash");
  const [returnProcessing, setReturnProcessing] = useState(false);
  const [ageVerifyItems, setAgeVerifyItems] = useState<Array<{ name: string; index: number }>>([]);
  const [ageVerifyConfirmed, setAgeVerifyConfirmed] = useState<Set<number>>(new Set());
  const [showAgeVerify, setShowAgeVerify] = useState(false);
  // Gift card payment in checkout flow
  const [showGiftCardPayment, setShowGiftCardPayment] = useState(false);
  const [giftCardPayCode, setGiftCardPayCode] = useState("");
  const [giftCardPayLoading, setGiftCardPayLoading] = useState(false);
  const [giftCardPayError, setGiftCardPayError] = useState<string | null>(null);

  // Park / Recall
  const [showParkInput, setShowParkInput] = useState(false);
  const [parkLabel, setParkLabel] = useState("");
  const [showRecallSheet, setShowRecallSheet] = useState(false);
  const [parkedCarts, setParkedCarts] = useState<ParkedCart[]>([]);
  const [parkedCount, setParkedCount] = useState(0);
  const [parkConflictCart, setParkConflictCart] = useState<ParkedCart | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

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
  // tenderedRef removed — NumericKeypad manages its own display
  const cartEndRef = useRef<HTMLDivElement>(null);
  const searchCache = useRef<Map<string, InventoryItem[]>>(new Map());

  // Only auto-focus inputs on desktop (prevents mobile keyboard popping up)
  const isTouchDevice = typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);
  const focusSearch = useCallback(() => {
    if (!isTouchDevice) searchRef.current?.focus();
  }, [isTouchDevice]);

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
  const scannerEnabled = !showPaySheet && activePanel !== "scan" && activePanel !== "customer" && activePanel !== "more" && activePanel !== "price_check" && activePanel !== "store_credit" && activePanel !== "returns" && activePanel !== "gift_card" && activePanel !== "flag_issue";

  const {
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

        // Open learn barcode modal instead of just showing error
        setLearnBarcode(barcode);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playBeep]),
    onHumanTyping: useCallback((text: string) => {
      setSearchQuery((prev) => prev + text);
      setActivePanel("search");
      focusSearch();
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
    if (showPaySheet || activePanel === "scan" || activePanel === "customer" || activePanel === "more" || activePanel === "price_check" || activePanel === "store_credit" || activePanel === "returns" || activePanel === "gift_card" || activePanel === "flag_issue") {
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
      if (itemAddedTimerRef.current) clearTimeout(itemAddedTimerRef.current);
      if (errorBannerTimerRef.current) clearTimeout(errorBannerTimerRef.current);
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
        if (showSuccess) {
          setShowSuccess(false);
          setCustomer(null);
        } else if (showChangeDue !== null) {
          setShowChangeDue(null);
          setCustomer(null);
        } else if (showPaySheet) {
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
        setTimeout(() => focusSearch(), 50);
      }
      // Enter on empty search with items -> PAY
      if (e.key === "Enter" && !searchQuery.trim() && cart.length > 0 && !showPaySheet && !activePanel) {
        e.preventDefault();
        setShowPaySheet(true);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [searchQuery, cart, showPaySheet, activePanel, showLastReceipt, showSuccess, showChangeDue]);

  // ---- Cart helpers ----
  // Show item-added confirmation
  function showItemAdded(name: string) {
    setItemAddedMessage(name);
    if (itemAddedTimerRef.current) clearTimeout(itemAddedTimerRef.current);
    itemAddedTimerRef.current = setTimeout(() => setItemAddedMessage(null), 1500);
  }

  // Show error banner (replaces alert())
  function showError(message: string) {
    // Map common errors to user-friendly messages
    let friendly = message;
    if (/payment.*fail/i.test(message)) {
      friendly = "Card payment failed. Try again or use a different method.";
    } else if (/insufficient.*inventory/i.test(message) || /not enough.*stock/i.test(message)) {
      friendly = "Not enough stock. Check inventory.";
    } else if (/network|fetch|connect/i.test(message)) {
      friendly = "Connection lost. Transaction saved offline.";
    }
    setErrorBanner(friendly);
    if (errorBannerTimerRef.current) clearTimeout(errorBannerTimerRef.current);
    errorBannerTimerRef.current = setTimeout(() => setErrorBanner(null), 5000);
  }

  // Send email receipt
  async function sendEmailReceipt() {
    if (!lastReceipt || !customer?.email) return;
    setSendingReceipt("email");
    try {
      const res = await fetch("/api/receipts/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_email: customer.email,
          receipt: {
            store_name: storeName,
            date: lastReceipt.timestamp,
            items: lastReceipt.items.map((item) => ({
              name: item.name,
              quantity: item.quantity,
              price_cents: item.price_cents,
              total_cents: item.price_cents * item.quantity,
            })),
            subtotal_cents: lastReceipt.subtotalCents,
            tax_cents: lastReceipt.taxCents,
            discount_cents: lastReceipt.discountCents,
            credit_applied_cents: 0,
            payment_method: lastReceipt.paymentMethod,
            total_cents: lastReceipt.totalCents,
            change_cents: 0,
            customer_name: lastReceipt.customerName,
          },
        }),
      });
      if (res.ok) {
        setToastMessage("Receipt sent");
      } else {
        setToastMessage("Failed to send receipt");
      }
    } catch {
      setToastMessage("Failed to send receipt");
    } finally {
      setSendingReceipt(null);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  function addToCart(item: InventoryItem) {
    showItemAdded(item.name);
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
    // Close search panel after add and dismiss keyboard
    setSearchQuery("");
    setSearchResults([]);
    if (activePanel === "search" || activePanel === "quick") {
      setActivePanel(null);
    }
    (document.activeElement as HTMLElement)?.blur();
  }

  function addManualItem() {
    const name = manualName.trim();
    const priceCents = parseDollars(manualPrice);
    const qty = parseInt(manualQty, 10) || 1;
    if (!name || priceCents <= 0) return;

    showItemAdded(name);
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
    (document.activeElement as HTMLElement)?.blur();
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
    (document.activeElement as HTMLElement)?.blur();
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
    (document.activeElement as HTMLElement)?.blur();
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
        showError(data.error || "Checkout failed");
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
        showError("Failed to save transaction. Please try again.");
      }
    } finally {
      setProcessing(false);
    }
  }

  function saleComplete(method: PaymentMethod) {
    // For cash: calculate change to show on persistent screen
    const cashChange = method === "cash" ? Math.max(0, tendered - total) : 0;

    // Save last receipt (capture customer before clearing)
    const receiptCustomer = customer;
    setLastReceipt({
      items: [...cart],
      discounts: [...discounts],
      subtotalCents: subtotal,
      discountCents,
      taxCents,
      totalCents: total,
      paymentMethod: method,
      customerName: receiptCustomer?.name ?? null,
      timestamp: new Date().toISOString(),
    });

    // Dismiss keyboard
    (document.activeElement as HTMLElement)?.blur();

    // Clear cart and payment state — but keep customer ref for receipt buttons
    setCart([]);
    setDiscounts([]);
    setShowPaySheet(false);
    setShowCashInput(false);
    setShowCreditConfirm(false);
    setShowGiftCardPayment(false);
    setGiftCardPayCode("");
    setGiftCardPayError(null);
    setTenderedInput("");
    setPaymentMethod("cash");
    setActivePanel(null);

    // Clear persisted cart (but NOT parked carts)
    clearPersistedCart();
    cartIdRef.current = createEmptyCart().id;

    if (method === "cash" && cashChange > 0) {
      // Show persistent change-due screen — cashier dismisses when done
      setShowChangeDue(cashChange);
      // TODO: trigger cash drawer open here
    } else {
      // Non-cash: persistent success screen with receipt buttons
      setShowSuccess(true);
      // Don't auto-dismiss — cashier taps "Next Customer" to continue
    }
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

  // ---- Price Check search ----
  const priceCheckDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (activePanel !== "price_check") return;
    if (priceCheckDebounceRef.current) clearTimeout(priceCheckDebounceRef.current);
    if (!priceCheckQuery.trim()) { setPriceCheckResults([]); return; }
    priceCheckDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/inventory/search?q=${encodeURIComponent(priceCheckQuery.trim())}`);
        const data: InventoryItem[] = await res.json();
        if (Array.isArray(data)) setPriceCheckResults(data);
      } catch {}
    }, 200);
    return () => { if (priceCheckDebounceRef.current) clearTimeout(priceCheckDebounceRef.current); };
  }, [priceCheckQuery, activePanel]);

  // ---- Store Credit customer search ----
  const creditDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (activePanel !== "store_credit" || creditCustomer) return;
    if (creditDebounceRef.current) clearTimeout(creditDebounceRef.current);
    if (!creditCustomerQuery.trim()) { setCreditCustomerResults([]); return; }
    creditDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers?q=${encodeURIComponent(creditCustomerQuery.trim())}`);
        const data = await res.json();
        if (Array.isArray(data)) setCreditCustomerResults(data);
      } catch {}
    }, 200);
    return () => { if (creditDebounceRef.current) clearTimeout(creditDebounceRef.current); };
  }, [creditCustomerQuery, activePanel, creditCustomer]);

  // Load store credit panel when customer is attached
  useEffect(() => {
    if (activePanel === "store_credit") {
      const c = customer || creditCustomer;
      if (c) {
        loadCreditCustomerDetail(c.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePanel]);

  async function loadCreditCustomerDetail(customerId: string) {
    try {
      const res = await fetch(`/api/customers/${customerId}`);
      const data = await res.json();
      setCreditCustomerDetail({
        credit_balance_cents: data.credit_balance_cents ?? 0,
        ledger_entries: (data.ledger_entries ?? []).filter((e: { type: string }) =>
          ["credit_issue", "credit_deduct", "credit_redeem"].includes(e.type)
        ).slice(0, 20),
      });
    } catch {}
  }

  async function handleIssueCredit() {
    const c = customer || creditCustomer;
    if (!c) return;
    const cents = parseDollars(creditIssueAmount);
    if (cents <= 0) return;
    setCreditIssuing(true);
    try {
      const res = await fetch(`/api/customers/${c.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "adjust_credit",
          amount_cents: cents,
          description: creditIssueReason.trim() || "Manual credit issue from register",
        }),
      });
      if (res.ok) {
        setCreditIssueAmount("");
        setCreditIssueReason("");
        loadCreditCustomerDetail(c.id);
        setToastMessage(`${formatCents(cents)} credit issued`);
        // Update the attached customer's balance if it's the same customer
        if (customer && customer.id === c.id) {
          setCustomer({ ...customer, credit_balance_cents: customer.credit_balance_cents + cents });
        }
      } else {
        const data = await res.json().catch(() => ({}));
        showError(data.error || "Failed to issue credit");
      }
    } catch {
      showError("Failed to issue credit");
    } finally {
      setCreditIssuing(false);
    }
  }

  // ---- Gift Card lookup ----
  async function lookupGiftCard(code: string) {
    if (!code.trim()) return;
    setGiftCardLoading(true);
    setGiftCardError(null);
    try {
      const res = await fetch(`/api/gift-cards/${encodeURIComponent(code.trim().toUpperCase())}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setGiftCardError(data.error || "Gift card not found");
        setGiftCardResult(null);
      } else {
        const data = await res.json();
        setGiftCardResult(data);
      }
    } catch {
      setGiftCardError("Failed to look up gift card");
    } finally {
      setGiftCardLoading(false);
    }
  }

  // ---- Flag Issue ----
  async function handleFlagSubmit() {
    if (!flagNotes.trim()) return;
    setFlagSubmitting(true);
    try {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: flagType,
          description: flagNotes.trim(),
        }),
      });
      if (res.ok) {
        setToastMessage("Issue reported");
        setFlagType("wrong_price");
        setFlagNotes("");
        setActivePanel(null);
      } else {
        const data = await res.json().catch(() => ({}));
        showError(data.error || "Failed to report issue");
      }
    } catch {
      showError("Failed to report issue");
    } finally {
      setFlagSubmitting(false);
    }
  }

  // ---- Void Last ----
  async function loadLastVoidable() {
    setVoidLoading(true);
    try {
      const res = await fetch("/api/void");
      const data = await res.json();
      setVoidTransaction(data.transaction ?? null);
    } catch {
      setVoidTransaction(null);
    } finally {
      setVoidLoading(false);
    }
  }

  async function handleVoid() {
    if (!voidTransaction) return;
    setVoidProcessing(true);
    try {
      const res = await fetch("/api/void", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ledger_entry_id: voidTransaction.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setToastMessage(`Voided ${formatCents(data.amount_voided_cents)}`);
        setVoidTransaction(null);
        setActivePanel(null);
      } else {
        const data = await res.json().catch(() => ({}));
        showError(data.error || "Failed to void transaction");
      }
    } catch {
      showError("Failed to void transaction");
    } finally {
      setVoidProcessing(false);
    }
  }

  // ---- Loyalty panel ----
  async function loadLoyalty() {
    const c = customer;
    if (!c) return;
    setLoyaltyLoading(true);
    try {
      const res = await fetch(`/api/customers/${c.id}`);
      const data = await res.json();
      setLoyaltyCustomer({
        id: data.id,
        name: data.name,
        loyalty_points: data.loyalty_points ?? 0,
        loyalty_entries: (data.loyalty_entries ?? []).slice(0, 20),
      });
    } catch {
      setLoyaltyCustomer(null);
    } finally {
      setLoyaltyLoading(false);
    }
  }

  // ---- No Sale ----
  async function handleNoSale() {
    try {
      const res = await fetch("/api/drawer/no-sale", { method: "POST" });
      if (res.ok) {
        setToastMessage("Drawer opened — No Sale");
        setActivePanel(null);
      } else {
        showError("Failed to open drawer");
      }
    } catch {
      showError("Failed to open drawer");
    }
  }

  // ---- Return search from register ----
  const returnDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (activePanel !== "returns") return;
    if (returnDebounceRef.current) clearTimeout(returnDebounceRef.current);
    if (!returnSearchQuery.trim()) { setReturnSales([]); return; }
    returnDebounceRef.current = setTimeout(async () => {
      setReturnSalesLoading(true);
      try {
        const res = await fetch(`/api/returns/sales?q=${encodeURIComponent(returnSearchQuery.trim())}`);
        const data = await res.json();
        if (Array.isArray(data)) setReturnSales(data);
      } catch {}
      setReturnSalesLoading(false);
    }, 250);
    return () => { if (returnDebounceRef.current) clearTimeout(returnDebounceRef.current); };
  }, [returnSearchQuery, activePanel]);

  function selectReturnSale(sale: typeof returnSales[0]) {
    setReturnSelectedSale(sale);
    setReturnSelectedItems(
      sale.items
        .filter(i => i.max_returnable > 0)
        .map(i => ({
          inventory_item_id: i.inventory_item_id,
          name: i.name,
          price_cents: i.price_cents,
          quantity: 1,
          selected: false,
        }))
    );
  }

  async function processInlineReturn() {
    if (!returnSelectedSale) return;
    const selected = returnSelectedItems.filter(i => i.selected);
    if (selected.length === 0) return;
    setReturnProcessing(true);
    try {
      const res = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          original_ledger_entry_id: returnSelectedSale.id,
          items: selected.map(i => ({
            inventory_item_id: i.inventory_item_id,
            name: i.name,
            category: null,
            quantity: i.quantity,
            price_cents: i.price_cents,
            restock: true,
          })),
          refund_method: returnRefundMethod,
          credit_bonus_percent: 0,
          reason: "customer_request",
          reason_notes: null,
          restocking_fee_percent: 0,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setToastMessage(`Return processed: ${formatCents(data.total_refund_cents)} ${returnRefundMethod === "store_credit" ? "credit" : "cash"}`);
        setReturnSelectedSale(null);
        setReturnSelectedItems([]);
        setReturnSearchQuery("");
        setReturnSales([]);
        setActivePanel(null);
      } else {
        const data = await res.json().catch(() => ({}));
        showError(data.error || "Failed to process return");
      }
    } catch {
      showError("Failed to process return");
    } finally {
      setReturnProcessing(false);
    }
  }

  // ---- Gift Card Payment in checkout flow ----
  async function handleGiftCardPayment() {
    if (!giftCardPayCode.trim() || cart.length === 0) return;
    setGiftCardPayLoading(true);
    setGiftCardPayError(null);
    try {
      // Look up the gift card first
      const lookupRes = await fetch(`/api/gift-cards/${encodeURIComponent(giftCardPayCode.trim().toUpperCase())}`);
      if (!lookupRes.ok) {
        const data = await lookupRes.json().catch(() => ({}));
        setGiftCardPayError(data.error || "Gift card not found");
        setGiftCardPayLoading(false);
        return;
      }
      const card = await lookupRes.json();
      if (!card.active) {
        setGiftCardPayError("Gift card is inactive");
        setGiftCardPayLoading(false);
        return;
      }
      if (card.balance_cents <= 0) {
        setGiftCardPayError("Gift card has no balance");
        setGiftCardPayLoading(false);
        return;
      }

      const amountToCharge = Math.min(card.balance_cents, amountDue);

      // Process checkout with gift card
      const payload = {
        items: cart.map((c) => ({
          inventory_item_id: c.inventory_item_id,
          quantity: c.quantity,
          price_cents: c.price_cents,
        })),
        customer_id: customer?.id ?? null,
        payment_method: "gift_card" as PaymentMethod,
        amount_tendered_cents: amountToCharge,
        credit_applied_cents: creditToApply,
        event_id: null,
        tax_cents: taxCents,
        discount_cents: discountCents,
        gift_card_code: giftCardPayCode.trim().toUpperCase(),
        gift_card_amount_cents: amountToCharge,
      };

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setGiftCardPayError(data.error || "Payment failed");
        setGiftCardPayLoading(false);
        return;
      }

      setShowGiftCardPayment(false);
      setGiftCardPayCode("");
      saleComplete("gift_card" as PaymentMethod);
    } catch {
      setGiftCardPayError("Payment failed");
    } finally {
      setGiftCardPayLoading(false);
    }
  }

  // ---- Age verification check before checkout ----
  function checkAgeRestrictions(): boolean {
    const restricted: Array<{ name: string; index: number }> = [];
    cart.forEach((item, idx) => {
      // Check if item has age_restricted attribute (set via inventory management)
      if (item.inventory_item_id) {
        // We check client-side flag; items with age_restricted in attributes
        // would need the attribute on the cart item. For now we use a simple pattern.
        // TODO: load attributes from inventory data when adding to cart
      }
    });
    if (restricted.length > 0) {
      setAgeVerifyItems(restricted);
      setShowAgeVerify(true);
      return false;
    }
    return true;
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
      {/* ====== SUCCESS SCREEN (persistent for non-cash) ====== */}
      {showSuccess && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-card">
          <div className="text-center space-y-4">
            <div className="text-7xl text-green-400">{"\u2713"}</div>
            <div className="text-2xl font-bold text-foreground">Sale Complete</div>
            {lastReceipt && (
              <div className="text-4xl font-mono font-bold text-foreground tabular-nums">
                {formatCents(lastReceipt.totalCents)}
              </div>
            )}

            {/* Receipt buttons */}
            {customer && (
              <div className="flex items-center justify-center gap-3 pt-4">
                {customer.email && (
                  <button
                    onClick={sendEmailReceipt}
                    disabled={sendingReceipt === "email"}
                    className="flex items-center gap-2 rounded-xl border border-card-border bg-card-hover px-5 text-sm font-medium text-foreground hover:bg-accent/10 active:scale-[0.97] transition-all disabled:opacity-50"
                    style={{ height: 48, touchAction: "manipulation" }}
                  >
                    <span>{"\uD83D\uDCE7"}</span>
                    {sendingReceipt === "email" ? "Sending..." : "Email Receipt"}
                  </button>
                )}
                {customer.phone && (
                  <button
                    onClick={() => setToastMessage("SMS receipts coming soon")}
                    className="flex items-center gap-2 rounded-xl border border-card-border bg-card-hover px-5 text-sm font-medium text-foreground hover:bg-accent/10 active:scale-[0.97] transition-all"
                    style={{ height: 48, touchAction: "manipulation" }}
                  >
                    <span>{"\uD83D\uDCF1"}</span>
                    Text Receipt
                  </button>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => {
              setShowSuccess(false);
              setCustomer(null);
            }}
            className="mt-12 rounded-xl font-bold text-white active:scale-[0.98] transition-transform select-none px-12"
            style={{
              height: 56,
              fontSize: 18,
              backgroundColor: "#16a34a",
              touchAction: "manipulation",
            }}
          >
            Next Customer
          </button>
        </div>
      )}

      {/* ====== TOAST ====== */}
      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-60 bg-card border border-card-border rounded-xl px-4 py-2 shadow-lg text-sm text-foreground pointer-events-none animate-slide-down">
          {toastMessage}
        </div>
      )}

      {/* ====== ERROR BANNER ====== */}
      {errorBanner && (
        <div className="absolute top-0 left-0 right-0 z-[65] flex items-center gap-3 px-4 py-3 bg-red-500/15 border-b border-red-500/30 animate-slide-down">
          <span className="flex-1 text-sm font-medium text-red-400">{errorBanner}</span>
          <button
            onClick={() => {
              setErrorBanner(null);
              if (errorBannerTimerRef.current) clearTimeout(errorBannerTimerRef.current);
            }}
            className="shrink-0 text-red-400 hover:text-red-300 text-lg leading-none"
            style={{ minHeight: "auto" }}
          >
            {"\u00D7"}
          </button>
        </div>
      )}

      {/* ====== ITEM ADDED CONFIRMATION ====== */}
      {itemAddedMessage && (
        <div className="absolute top-12 left-0 right-0 z-[55] flex items-center justify-center pointer-events-none">
          <div className="px-4 py-1.5 text-sm font-medium text-green-400 animate-fade-out">
            {"\u2713"} {itemAddedMessage} added
          </div>
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
          {process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_") && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-semibold uppercase tracking-wider border border-amber-500/30">
              Test Mode
            </span>
          )}
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
            onClick={() => {
              if (cart.length > 0) {
                setShowExitConfirm(true);
              } else {
                router.push("/dashboard");
              }
            }}
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
              setTimeout(() => focusSearch(), 50);
            }}
            className={`flex flex-col items-center justify-center w-12 lg:w-14 h-12 rounded-xl transition-colors ${
              activePanel === "search"
                ? "bg-accent text-white"
                : "text-muted hover:text-foreground hover:bg-card-hover"
            }`}
            title="Search (F2)"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <span className="hidden lg:block text-[9px] leading-none mt-0.5 font-medium">Search</span>
          </button>

          {/* Camera scan */}
          <button
            onClick={() => togglePanel("scan")}
            className={`flex flex-col items-center justify-center w-12 lg:w-14 h-12 rounded-xl transition-colors ${
              activePanel === "scan"
                ? "bg-accent text-white"
                : "text-muted hover:text-foreground hover:bg-card-hover"
            }`}
            title="Camera scan"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
            </svg>
            <span className="hidden lg:block text-[9px] leading-none mt-0.5 font-medium">Scan</span>
          </button>

          {/* Customer */}
          <button
            onClick={() => {
              if (customer && activePanel !== "customer") {
                togglePanel("customer");
              } else if (customer && activePanel === "customer") {
                setActivePanel(null);
              } else {
                togglePanel("customer");
                setCustomerQuery("");
                setCustomerResults([]);
              }
            }}
            className={`flex flex-col items-center justify-center rounded-xl transition-colors ${
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
            <span className="hidden lg:block text-[9px] leading-none mt-0.5 font-medium">Cust</span>
          </button>

          {/* Quick Add */}
          <button
            onClick={() => togglePanel("quick")}
            className={`flex flex-col items-center justify-center w-12 lg:w-14 h-12 rounded-xl transition-colors ${
              activePanel === "quick"
                ? "bg-accent text-white"
                : "text-muted hover:text-foreground hover:bg-card-hover"
            }`}
            title="Quick add"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
            <span className="hidden lg:block text-[9px] leading-none mt-0.5 font-medium">Quick</span>
          </button>

          {/* Manual Item */}
          <button
            onClick={() => togglePanel("manual")}
            className={`flex flex-col items-center justify-center w-12 lg:w-14 h-12 rounded-xl transition-colors ${
              activePanel === "manual"
                ? "bg-accent text-white"
                : "text-muted hover:text-foreground hover:bg-card-hover"
            }`}
            title="Manual item"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
            <span className="hidden lg:block text-[9px] leading-none mt-0.5 font-medium">Add</span>
          </button>

          {/* Discount */}
          <button
            onClick={() => togglePanel("discount")}
            className={`flex flex-col items-center justify-center w-12 lg:w-14 h-12 rounded-xl transition-colors ${
              activePanel === "discount"
                ? "bg-accent text-white"
                : discounts.length > 0
                  ? "bg-amber-500/20 text-amber-400"
                  : "text-muted hover:text-foreground hover:bg-card-hover"
            }`}
            title="Discount"
          >
            <span className="text-lg font-bold">%</span>
            <span className="hidden lg:block text-[9px] leading-none mt-0.5 font-medium">Disc</span>
          </button>

          {/* More */}
          <button
            onClick={() => togglePanel("more")}
            className={`flex flex-col items-center justify-center w-12 lg:w-14 h-12 rounded-xl transition-colors ${
              activePanel === "more" || ["price_check", "store_credit", "returns", "loyalty", "gift_card", "flag_issue", "void_last"].includes(activePanel ?? "")
                ? "bg-accent text-white"
                : "text-muted hover:text-foreground hover:bg-card-hover"
            }`}
            title="More actions"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
            </svg>
            <span className="hidden lg:block text-[9px] leading-none mt-0.5 font-medium">More</span>
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
        {/* Tapping receipt tape dismisses the on-screen keyboard */}
        <div className="flex-1 overflow-y-auto" style={{ scrollBehavior: "smooth" }} onClick={() => (document.activeElement as HTMLElement)?.blur()}>
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

                      {/* Quantity — tap to type, stopPropagation for scanner */}
                      {editingQtyIndex === index ? (
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={editQtyValue}
                          onChange={(e) => setEditQtyValue(e.target.value.replace(/\D/g, ""))}
                          onBlur={() => commitQtyEdit(index)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") commitQtyEdit(index);
                            if (e.key === "Escape") { setEditingQtyIndex(null); (document.activeElement as HTMLElement)?.blur(); }
                          }}
                          autoFocus
                          className="w-14 rounded-md border border-accent bg-input-bg px-2 py-1 text-center text-sm font-bold text-foreground focus:outline-none"
                          style={{ minHeight: "auto" }}
                        />
                      ) : (
                        <button
                          onClick={() => {
                            setEditingQtyIndex(index);
                            setEditQtyValue(String(item.quantity));
                          }}
                          className="shrink-0 rounded-md bg-card-hover px-2 py-1 text-sm font-medium text-foreground tabular-nums active:scale-95 transition-transform"
                          style={{ minHeight: 32 }}
                        >
                          x{item.quantity}
                        </button>
                      )}

                      {/* Line total */}
                      <div className="shrink-0 w-16 text-right text-sm font-medium text-foreground tabular-nums font-mono">
                        {formatCents(lineTotal)}
                      </div>

                      {/* Delete — always visible, compact */}
                      <button
                        onClick={() => removeItem(index)}
                        className="shrink-0 ml-1 text-red-400 hover:text-red-300 active:scale-95 transition-transform"
                        style={{ minHeight: "auto", padding: "4px" }}
                        title="Remove item"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>

                      {/* Swipe delete (mobile fallback) */}
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
          {showGiftCardPayment ? (
            /* Gift card payment input */
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={giftCardPayCode}
                  onChange={(e) => setGiftCardPayCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") handleGiftCardPayment();
                    if (e.key === "Escape") { setShowGiftCardPayment(false); setGiftCardPayCode(""); setGiftCardPayError(null); }
                  }}
                  placeholder="Enter gift card code"
                  autoFocus
                  className="flex-1 rounded-xl border border-input-border bg-input-bg px-4 text-foreground placeholder:text-muted focus:border-accent focus:outline-none font-mono uppercase"
                  style={{ height: 56, fontSize: 16 }}
                />
                <button
                  onClick={handleGiftCardPayment}
                  disabled={giftCardPayLoading || !giftCardPayCode.trim()}
                  className="shrink-0 rounded-xl px-6 font-semibold text-white disabled:opacity-30 active:scale-[0.97] transition-transform"
                  style={{ height: 56, backgroundColor: "#16a34a" }}
                >
                  {giftCardPayLoading ? "..." : "Pay"}
                </button>
                <button
                  onClick={() => { setShowGiftCardPayment(false); setGiftCardPayCode(""); setGiftCardPayError(null); }}
                  className="shrink-0 rounded-xl text-muted hover:text-foreground border border-card-border bg-card-hover active:scale-[0.97] transition-transform"
                  style={{ height: 56, width: 56 }}
                >
                  {"\u2715"}
                </button>
              </div>
              {giftCardPayError && <div className="text-xs text-red-400 px-1">{giftCardPayError}</div>}
            </div>
          ) : showPaySheet && !showCashInput ? (
            /* Inline payment method buttons — replaces PAY button */
            <div className="flex gap-2">
              <button
                onClick={() => setShowCashInput(true)}
                className="flex-1 rounded-xl font-semibold text-foreground border border-card-border bg-card-hover active:scale-[0.97] transition-transform"
                style={{ height: 56 }}
              >
                Cash
              </button>
              <button
                onClick={() => handleCompleteSale("card")}
                disabled={processing}
                className="flex-1 rounded-xl font-semibold text-white active:scale-[0.97] transition-transform disabled:opacity-50"
                style={{ height: 56, backgroundColor: "#2563eb" }}
              >
                {processing ? "..." : "Card"}
              </button>
              <button
                onClick={() => setShowGiftCardPayment(true)}
                className="flex-1 rounded-xl font-semibold text-foreground border border-amber-500/30 bg-amber-500/5 active:scale-[0.97] transition-transform"
                style={{ height: 56 }}
              >
                Gift Card
              </button>
              {customer && creditAvailable > 0 ? (
                <button
                  onClick={() => handleCompleteSale("store_credit")}
                  disabled={processing}
                  className="flex-1 rounded-xl font-semibold text-foreground border border-accent bg-accent/10 active:scale-[0.97] transition-transform disabled:opacity-50"
                  style={{ height: 56 }}
                >
                  Credit
                </button>
              ) : (
                <button
                  onClick={() => handleCompleteSale("external")}
                  disabled={processing}
                  className="flex-1 rounded-xl font-semibold text-foreground border border-card-border bg-card-hover active:scale-[0.97] transition-transform disabled:opacity-50"
                  style={{ height: 56 }}
                >
                  Other
                </button>
              )}
              <button
                onClick={() => { setShowPaySheet(false); setShowCashInput(false); setShowCreditConfirm(false); setShowGiftCardPayment(false); }}
                className="shrink-0 rounded-xl text-muted hover:text-foreground border border-card-border bg-card-hover active:scale-[0.97] transition-transform"
                style={{ height: 56, width: 56 }}
              >
                ✕
              </button>
            </div>
          ) : !showPaySheet ? (
            /* PAY button — normal state */
            <button
              onClick={() => {
                if (hasCart) setShowPaySheet(true);
              }}
              disabled={!hasCart}
              className="w-full rounded-xl font-bold text-white transition-colors disabled:opacity-30 active:scale-[0.98]"
              style={{
                height: 56,
                fontSize: 18,
                backgroundColor: hasCart ? "#16a34a" : undefined,
                minHeight: 56,
              }}
            >
              {hasCart ? `PAY ${formatCents(total)}` : "PAY"}
            </button>
          ) : null}
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
      {/* Cash keypad — full viewport overlay, only when cash is selected */}
      {showCashInput && (
        <div className="fixed inset-0 z-50 flex flex-col bg-card">
          <div className="flex items-center justify-between px-4 py-2 border-b border-card-border">
            <span className="text-lg font-bold text-foreground tabular-nums font-mono">
              Due: {formatCents(amountDue)}
            </span>
            <button
              onClick={() => { if (!processing) setShowCashInput(false); }}
              className="text-muted hover:text-foreground text-sm px-3 py-1"
              style={{ minHeight: "auto" }}
            >
              Back
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <NumericKeypad
              value={tenderedInput}
              onChange={setTenderedInput}
              onSubmit={() => handleCompleteSale("cash")}
              submitLabel={
                processing
                  ? "Processing..."
                  : amountDue > 0 && tendered < amountDue
                    ? "Insufficient"
                    : `Done \u2014 Change ${formatCents(change)}`
              }
              submitDisabled={processing || (amountDue > 0 && tendered < amountDue)}
              totalCents={amountDue}
              changeCents={change}
              showChange={true}
              processing={processing}
            />
          </div>
        </div>
      )}

      {/* ====== CHANGE DUE SCREEN ====== */}
      {showChangeDue !== null && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-card">
          <div className="text-center space-y-4">
            <div className="text-muted text-lg">Change Due</div>
            <div className="text-7xl font-mono font-bold text-green-400 tabular-nums">
              ${(showChangeDue / 100).toFixed(2)}
            </div>
            <div className="text-muted text-sm">Give change and tap to continue</div>

            {/* Receipt buttons — only if customer attached with contact info */}
            {customer && (
              <div className="flex items-center justify-center gap-3 pt-4">
                {customer.email && (
                  <button
                    onClick={sendEmailReceipt}
                    disabled={sendingReceipt === "email"}
                    className="flex items-center gap-2 rounded-xl border border-card-border bg-card-hover px-5 text-sm font-medium text-foreground hover:bg-accent/10 active:scale-[0.97] transition-all disabled:opacity-50"
                    style={{ height: 48, touchAction: "manipulation" }}
                  >
                    <span>{"\uD83D\uDCE7"}</span>
                    {sendingReceipt === "email" ? "Sending..." : "Email Receipt"}
                  </button>
                )}
                {customer.phone && (
                  <button
                    onClick={() => setToastMessage("SMS receipts coming soon")}
                    className="flex items-center gap-2 rounded-xl border border-card-border bg-card-hover px-5 text-sm font-medium text-foreground hover:bg-accent/10 active:scale-[0.97] transition-all"
                    style={{ height: 48, touchAction: "manipulation" }}
                  >
                    <span>{"\uD83D\uDCF1"}</span>
                    Text Receipt
                  </button>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => {
              setShowChangeDue(null);
              setCustomer(null);
            }}
            className="mt-12 rounded-xl font-bold text-white active:scale-[0.98] transition-transform select-none px-12"
            style={{
              height: 56,
              fontSize: 18,
              backgroundColor: "#16a34a",
              touchAction: "manipulation",
            }}
          >
            Done
          </button>
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
                  e.stopPropagation();
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

      {/* ====== EXIT CONFIRM DIALOG ====== */}
      {showExitConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowExitConfirm(false)} />
          <div className="relative bg-card rounded-2xl border border-card-border w-full max-w-sm mx-4">
            <div className="p-5 space-y-4">
              <div className="text-base font-bold text-foreground">Exit Register?</div>
              <p className="text-sm text-muted">
                You have {cartItemCount} item{cartItemCount !== 1 ? "s" : ""} ({formatCents(total)}) in your cart.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    handleParkCart();
                    setShowExitConfirm(false);
                    router.push("/dashboard");
                  }}
                  className="w-full rounded-xl font-medium text-white transition-colors"
                  style={{ height: 44, backgroundColor: "var(--accent)", minHeight: 44 }}
                >
                  Park Cart
                </button>
                <button
                  onClick={() => {
                    setCart([]);
                    setDiscounts([]);
                    setCustomer(null);
                    clearPersistedCart();
                    cartIdRef.current = createEmptyCart().id;
                    setShowExitConfirm(false);
                    router.push("/dashboard");
                  }}
                  className="w-full rounded-xl border border-red-500/30 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                  style={{ minHeight: 44 }}
                >
                  Clear Cart
                </button>
                <button
                  onClick={() => setShowExitConfirm(false)}
                  className="w-full rounded-xl border border-card-border px-4 py-2.5 text-sm font-medium text-muted hover:text-foreground hover:bg-card-hover transition-colors"
                  style={{ minHeight: 44 }}
                >
                  Cancel
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

      {/* ====== BARCODE LEARN MODAL ====== */}
      {learnBarcode && (
        <BarcodeLearnModal
          barcode={learnBarcode}
          onClose={() => setLearnBarcode(null)}
          onItemCreated={(item, addToCartFlag) => {
            if (addToCartFlag) {
              addToCart(item);
            }
            showItemAdded(`${item.name} added to inventory`);
          }}
          onBarcodeAssigned={(item) => {
            showItemAdded(`Barcode assigned to ${item.name}`);
          }}
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
                type="search"
                inputMode="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="Search products or scan barcode..."
                className="w-full rounded-xl border border-input-border bg-input-bg pl-4 pr-10 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                style={{ height: 48, fontSize: 16 }}
                autoComplete="off"
                autoFocus={!isTouchDevice}
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSearchResults([]);
                    setScannerErrorText(null);
                    focusSearch();
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
                  type="search"
                  inputMode="search"
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
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
                        (document.activeElement as HTMLElement)?.blur();
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
              onKeyDown={(e) => e.stopPropagation()}
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
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="Price (e.g. 5.99)"
                className="flex-1 rounded-xl border border-input-border bg-input-bg px-4 py-2.5 text-foreground placeholder:text-muted focus:border-accent focus:outline-none font-mono"
                style={{ fontSize: 16 }}
              />
              <input
                type="number"
                inputMode="numeric"
                value={manualQty}
                onChange={(e) => setManualQty(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
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
              onKeyDown={(e) => e.stopPropagation()}
              placeholder={discountType === "percent" ? "e.g. 10" : "e.g. 5.00"}
              autoFocus
              className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-2.5 text-foreground placeholder:text-muted focus:border-accent focus:outline-none font-mono text-center"
              style={{ fontSize: 20 }}
            />

            <input
              type="text"
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
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

      /* ============ MORE MENU ============ */
      case "more":
        return (
          <div className="p-3 space-y-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">More Actions</span>
              <button onClick={() => setActivePanel(null)} className="text-muted hover:text-foreground" style={{ minHeight: "auto" }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {[
              { panel: "price_check" as ActivePanel, icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9" /></svg>, label: "Price Check" },
              { panel: "store_credit" as ActivePanel, icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>, label: "Store Credit" },
              { panel: "returns" as ActivePanel, icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>, label: "Process Return" },
              { panel: "loyalty" as ActivePanel, icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>, label: "Loyalty Points" },
              { panel: "gift_card" as ActivePanel, icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>, label: "Gift Card" },
              { panel: "no_sale" as ActivePanel, icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>, label: "No Sale (Open Drawer)", action: () => handleNoSale() },
              { panel: "flag_issue" as ActivePanel, icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>, label: "Flag Issue" },
              { panel: "void_last" as ActivePanel, icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>, label: "Void Last Transaction" },
            ].map((item) => (
              <button
                key={item.panel}
                onClick={() => {
                  if (item.action) {
                    item.action();
                  } else {
                    setActivePanel(item.panel);
                    if (item.panel === "void_last") loadLastVoidable();
                    if (item.panel === "loyalty") loadLoyalty();
                    if (item.panel === "store_credit" && customer) {
                      setCreditCustomer(null); // use attached customer
                    }
                  }
                }}
                className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left text-foreground hover:bg-card-hover active:bg-accent-light transition-colors"
                style={{ minHeight: 48 }}
              >
                <span className="shrink-0 text-muted">{item.icon}</span>
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            ))}
          </div>
        );

      /* ============ PRICE CHECK ============ */
      case "price_check":
        return (
          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <button onClick={() => setActivePanel("more")} className="text-xs text-muted hover:text-foreground" style={{ minHeight: "auto" }}>
                <svg className="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                Back
              </button>
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">Price Check</span>
            </div>
            <input
              type="search"
              inputMode="search"
              value={priceCheckQuery}
              onChange={(e) => setPriceCheckQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Search product name or barcode..."
              autoFocus
              className="w-full rounded-xl border border-input-border bg-input-bg px-4 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              style={{ height: 48, fontSize: 16 }}
            />
            {priceCheckResults.length > 0 ? (
              <div className="space-y-1">
                {priceCheckResults.slice(0, 15).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl px-4 py-3 bg-card border border-card-border"
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground">{item.name}</div>
                        <div className="text-xs text-muted mt-0.5">
                          {item.category}
                          {item.barcode && <span className="ml-2 font-mono">{item.barcode}</span>}
                        </div>
                      </div>
                      <div className="text-right ml-3">
                        <div className="text-sm font-bold text-foreground tabular-nums font-mono">{formatCents(item.price_cents)}</div>
                        {effectiveRole !== "cashier" && (
                          <div className="text-xs text-muted tabular-nums font-mono">Cost: {formatCents(item.cost_cents)}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs">
                      <span className={`font-medium ${item.quantity > 0 ? "text-green-400" : "text-red-400"}`}>
                        {item.quantity > 0 ? `${item.quantity} in stock` : "Out of stock"}
                      </span>
                      {item.sku && <span className="text-muted">SKU: {item.sku}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : priceCheckQuery.trim() ? (
              <div className="flex items-center justify-center h-20 text-muted text-sm">No products found</div>
            ) : (
              <div className="flex items-center justify-center h-20 text-muted text-sm">Search for a product to check price</div>
            )}
          </div>
        );

      /* ============ STORE CREDIT ============ */
      case "store_credit": {
        const creditTarget = customer || creditCustomer;
        return (
          <div className="p-3 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <button onClick={() => { setActivePanel("more"); setCreditCustomer(null); setCreditCustomerDetail(null); }} className="text-xs text-muted hover:text-foreground" style={{ minHeight: "auto" }}>
                <svg className="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                Back
              </button>
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">Store Credit</span>
            </div>

            {!creditTarget ? (
              <>
                <input
                  type="search"
                  inputMode="search"
                  value={creditCustomerQuery}
                  onChange={(e) => setCreditCustomerQuery(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="Search customer..."
                  autoFocus
                  className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-3 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  style={{ fontSize: 16 }}
                />
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {creditCustomerResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCreditCustomer(c);
                        loadCreditCustomerDetail(c.id);
                      }}
                      className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-left bg-card-hover hover:bg-accent-light transition-colors"
                      style={{ minHeight: 48 }}
                    >
                      <div>
                        <div className="text-sm font-medium text-foreground">{c.name}</div>
                        {c.email && <div className="text-xs text-muted">{c.email}</div>}
                      </div>
                      <div className="text-sm font-medium text-accent tabular-nums font-mono">
                        {formatCents(c.credit_balance_cents)}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-card-border bg-card-hover p-4">
                  <div className="text-sm font-medium text-foreground">{creditTarget.name}</div>
                  <div className="text-3xl font-bold text-accent tabular-nums font-mono mt-2">
                    {formatCents(creditCustomerDetail?.credit_balance_cents ?? creditTarget.credit_balance_cents)}
                  </div>
                  <div className="text-xs text-muted mt-1">Available Store Credit</div>
                  {cart.length > 0 && (creditCustomerDetail?.credit_balance_cents ?? creditTarget.credit_balance_cents) > 0 && (
                    <div className="text-xs text-accent mt-2">Credit available as payment at checkout</div>
                  )}
                </div>

                {/* Issue Credit */}
                <div className="rounded-xl border border-card-border bg-card p-4 space-y-2">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wider">Issue Credit</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={creditIssueAmount}
                      onChange={(e) => setCreditIssueAmount(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      placeholder="Amount (e.g. 10.00)"
                      className="flex-1 rounded-xl border border-input-border bg-input-bg px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none font-mono"
                      style={{ fontSize: 14 }}
                    />
                  </div>
                  <input
                    type="text"
                    value={creditIssueReason}
                    onChange={(e) => setCreditIssueReason(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder="Reason (optional)"
                    className="w-full rounded-xl border border-input-border bg-input-bg px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                    style={{ fontSize: 14 }}
                  />
                  <button
                    onClick={handleIssueCredit}
                    disabled={creditIssuing || !creditIssueAmount}
                    className="w-full rounded-xl font-medium text-white disabled:opacity-30 transition-colors"
                    style={{ height: 40, backgroundColor: "#16a34a" }}
                  >
                    {creditIssuing ? "Issuing..." : "Issue Credit"}
                  </button>
                </div>

                {/* Recent credit transactions */}
                {creditCustomerDetail && creditCustomerDetail.ledger_entries.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-muted uppercase tracking-wider">Recent Activity</div>
                    {creditCustomerDetail.ledger_entries.map((e) => (
                      <div key={e.id} className="flex items-center justify-between rounded-lg px-3 py-2 text-xs bg-card-hover">
                        <div>
                          <span className="text-foreground">{e.description || e.type}</span>
                          <span className="ml-2 text-muted">{new Date(e.created_at).toLocaleDateString()}</span>
                        </div>
                        <span className={`tabular-nums font-mono font-medium ${e.amount_cents >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {e.amount_cents >= 0 ? "+" : ""}{formatCents(e.amount_cents)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        );
      }

      /* ============ INLINE RETURNS ============ */
      case "returns":
        return (
          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <button onClick={() => { setActivePanel("more"); setReturnSelectedSale(null); setReturnSelectedItems([]); setReturnSearchQuery(""); setReturnSales([]); }} className="text-xs text-muted hover:text-foreground" style={{ minHeight: "auto" }}>
                <svg className="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                Back
              </button>
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">Process Return</span>
            </div>

            {!returnSelectedSale ? (
              <>
                <input
                  type="search"
                  inputMode="search"
                  value={returnSearchQuery}
                  onChange={(e) => setReturnSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="Search by customer name..."
                  autoFocus
                  className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-3 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  style={{ fontSize: 16 }}
                />
                {returnSalesLoading && <div className="text-xs text-muted">Searching...</div>}
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {returnSales.map((sale) => {
                    const hasReturnable = sale.items.some(i => i.max_returnable > 0);
                    return (
                      <button
                        key={sale.id}
                        onClick={() => hasReturnable && selectReturnSale(sale)}
                        disabled={!hasReturnable}
                        className={`w-full rounded-xl px-4 py-3 text-left border transition-colors ${hasReturnable ? "border-card-border bg-card-hover hover:border-accent/50" : "border-card-border bg-card opacity-50 cursor-not-allowed"}`}
                        style={{ minHeight: 48 }}
                      >
                        <div className="flex justify-between">
                          <span className="text-sm font-medium text-foreground">{sale.customer_name}</span>
                          <span className="text-sm tabular-nums font-mono text-foreground">{formatCents(sale.amount_cents)}</span>
                        </div>
                        <div className="text-xs text-muted mt-0.5">
                          {new Date(sale.created_at).toLocaleDateString()} {new Date(sale.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          <span className="ml-2">{sale.items.map(i => i.name).join(", ")}</span>
                        </div>
                        {!hasReturnable && <div className="text-xs text-red-400 mt-0.5">All items already returned</div>}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="text-xs text-muted">
                  Sale to {returnSelectedSale.customer_name} on {new Date(returnSelectedSale.created_at).toLocaleDateString()} — {formatCents(returnSelectedSale.amount_cents)}
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {returnSelectedItems.map((item, idx) => (
                    <div
                      key={item.inventory_item_id}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2 border transition-colors ${item.selected ? "border-accent/50 bg-accent/5" : "border-card-border bg-card-hover"}`}
                    >
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => setReturnSelectedItems(prev => prev.map((it, i) => i === idx ? { ...it, selected: !it.selected } : it))}
                        className="h-4 w-4 rounded border-zinc-600 bg-card text-indigo-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-foreground truncate">{item.name}</div>
                      </div>
                      <span className="text-sm font-mono tabular-nums text-foreground">{formatCents(item.price_cents)}</span>
                    </div>
                  ))}
                </div>

                {/* Refund method */}
                <div className="flex gap-1 bg-card-hover rounded-xl p-1">
                  {(["cash", "store_credit"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setReturnRefundMethod(m)}
                      className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${returnRefundMethod === m ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
                      style={{ minHeight: "auto" }}
                    >
                      {m === "store_credit" ? "Store Credit" : "Cash"}
                    </button>
                  ))}
                </div>

                {/* Summary + submit */}
                {(() => {
                  const sel = returnSelectedItems.filter(i => i.selected);
                  const refundTotal = sel.reduce((s, i) => s + i.price_cents * i.quantity, 0);
                  return (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted">
                        {sel.length} item{sel.length !== 1 ? "s" : ""}: {formatCents(refundTotal)}
                      </span>
                      <button
                        onClick={processInlineReturn}
                        disabled={returnProcessing || sel.length === 0}
                        className="rounded-xl px-6 py-2 text-sm font-medium text-white disabled:opacity-30 transition-colors"
                        style={{ backgroundColor: "#16a34a" }}
                      >
                        {returnProcessing ? "Processing..." : "Process Return"}
                      </button>
                    </div>
                  );
                })()}

                <button
                  onClick={() => { setReturnSelectedSale(null); setReturnSelectedItems([]); }}
                  className="text-xs text-muted hover:text-foreground"
                  style={{ minHeight: "auto" }}
                >
                  Choose different sale
                </button>
              </>
            )}
          </div>
        );

      /* ============ LOYALTY ============ */
      case "loyalty":
        return (
          <div className="p-3 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <button onClick={() => setActivePanel("more")} className="text-xs text-muted hover:text-foreground" style={{ minHeight: "auto" }}>
                <svg className="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                Back
              </button>
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">Loyalty Points</span>
            </div>

            {!customer ? (
              <div className="text-center py-8 text-sm text-muted">
                Attach a customer first to view loyalty points
              </div>
            ) : loyaltyLoading ? (
              <div className="text-center py-8 text-sm text-muted">Loading...</div>
            ) : loyaltyCustomer ? (
              <>
                <div className="rounded-xl border border-card-border bg-card-hover p-4 text-center">
                  <div className="text-sm text-muted">{loyaltyCustomer.name}</div>
                  <div className="text-4xl font-bold text-accent mt-1">{loyaltyCustomer.loyalty_points.toLocaleString()}</div>
                  <div className="text-xs text-muted mt-1">Loyalty Points</div>
                  {storeSettings.loyalty_enabled && storeSettings.loyalty_redeem_points_per_dollar > 0 && (
                    <div className="text-xs text-foreground/60 mt-2">
                      {storeSettings.loyalty_redeem_points_per_dollar} pts = $1.00 off
                      {loyaltyCustomer.loyalty_points >= storeSettings.loyalty_min_redeem_points && (
                        <span className="ml-1 text-green-400">(Eligible to redeem)</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Recent activity */}
                {loyaltyCustomer.loyalty_entries.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-muted uppercase tracking-wider">Recent Activity</div>
                    {loyaltyCustomer.loyalty_entries.map((e) => (
                      <div key={e.id} className="flex items-center justify-between rounded-lg px-3 py-2 text-xs bg-card-hover">
                        <div>
                          <span className="text-foreground">{e.description || e.type}</span>
                          <span className="ml-2 text-muted">{new Date(e.created_at).toLocaleDateString()}</span>
                        </div>
                        <span className={`tabular-nums font-mono font-medium ${e.points >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {e.points >= 0 ? "+" : ""}{e.points}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-sm text-muted">Could not load loyalty data</div>
            )}
          </div>
        );

      /* ============ GIFT CARD ============ */
      case "gift_card":
        return (
          <div className="p-3 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <button onClick={() => { setActivePanel("more"); setGiftCardResult(null); setGiftCardError(null); setGiftCardCode(""); }} className="text-xs text-muted hover:text-foreground" style={{ minHeight: "auto" }}>
                <svg className="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                Back
              </button>
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">Gift Card</span>
            </div>

            <div className="rounded-xl border border-card-border bg-card p-4 space-y-3">
              <div className="text-xs font-semibold text-muted uppercase tracking-wider">Check Balance</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={giftCardCode}
                  onChange={(e) => setGiftCardCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") lookupGiftCard(giftCardCode);
                  }}
                  placeholder="Enter gift card code"
                  autoFocus
                  className="flex-1 rounded-xl border border-input-border bg-input-bg px-4 py-2.5 text-foreground placeholder:text-muted focus:border-accent focus:outline-none font-mono uppercase"
                  style={{ fontSize: 16 }}
                />
                <button
                  onClick={() => lookupGiftCard(giftCardCode)}
                  disabled={giftCardLoading || !giftCardCode.trim()}
                  className="shrink-0 rounded-xl px-4 font-medium text-white disabled:opacity-30 transition-colors"
                  style={{ height: 44, backgroundColor: "var(--accent)" }}
                >
                  {giftCardLoading ? "..." : "Look Up"}
                </button>
              </div>

              {giftCardError && (
                <div className="text-sm text-red-400">{giftCardError}</div>
              )}

              {giftCardResult && (
                <div className="rounded-xl border border-card-border bg-card-hover p-4">
                  <div className="text-xs text-muted font-mono">{giftCardResult.code}</div>
                  <div className="text-3xl font-bold text-accent tabular-nums font-mono mt-1">
                    {formatCents(giftCardResult.balance_cents)}
                  </div>
                  <div className="text-xs mt-1">
                    <span className={giftCardResult.active ? "text-green-400" : "text-red-400"}>
                      {giftCardResult.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Quick actions */}
            <div className="space-y-2">
              <button
                onClick={() => {
                  // Add a gift card as a manual item to cart
                  setActivePanel("manual");
                  setManualName("Gift Card");
                  setManualPrice("");
                }}
                className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left border border-card-border hover:bg-card-hover transition-colors"
                style={{ minHeight: 44 }}
              >
                <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                <span className="text-sm text-foreground">Sell Gift Card (add to cart)</span>
              </button>
              {cart.length > 0 && (
                <button
                  onClick={() => {
                    setShowGiftCardPayment(true);
                    setShowPaySheet(true);
                    setActivePanel(null);
                  }}
                  className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left border border-accent/30 bg-accent/5 hover:bg-accent/10 transition-colors"
                  style={{ minHeight: 44 }}
                >
                  <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
                  <span className="text-sm text-accent font-medium">Redeem as Payment</span>
                </button>
              )}
            </div>
          </div>
        );

      /* ============ FLAG ISSUE ============ */
      case "flag_issue":
        return (
          <div className="p-3 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <button onClick={() => setActivePanel("more")} className="text-xs text-muted hover:text-foreground" style={{ minHeight: "auto" }}>
                <svg className="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                Back
              </button>
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">Flag Issue</span>
            </div>

            <select
              value={flagType}
              onChange={(e) => setFlagType(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-2.5 text-foreground focus:border-accent focus:outline-none"
              style={{ fontSize: 14 }}
            >
              <option value="wrong_price">Wrong Price</option>
              <option value="wrong_stock_count">Wrong Stock Count</option>
              <option value="item_missing">Item Missing</option>
              <option value="scanner_issue">Scanner Issue</option>
              <option value="system_error">System Error</option>
              <option value="other">Other</option>
            </select>

            <textarea
              value={flagNotes}
              onChange={(e) => setFlagNotes(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Describe the issue..."
              rows={3}
              autoFocus
              className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-2.5 text-foreground placeholder:text-muted focus:border-accent focus:outline-none resize-none"
              style={{ fontSize: 14 }}
            />

            <button
              onClick={handleFlagSubmit}
              disabled={flagSubmitting || !flagNotes.trim()}
              className="w-full rounded-xl font-medium text-white disabled:opacity-30 transition-colors"
              style={{ height: 44, backgroundColor: "#d97706" }}
            >
              {flagSubmitting ? "Submitting..." : "Report Issue"}
            </button>
          </div>
        );

      /* ============ VOID LAST ============ */
      case "void_last":
        return (
          <div className="p-3 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <button onClick={() => setActivePanel("more")} className="text-xs text-muted hover:text-foreground" style={{ minHeight: "auto" }}>
                <svg className="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                Back
              </button>
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">Void Last Transaction</span>
            </div>

            {voidLoading ? (
              <div className="text-center py-8 text-sm text-muted">Loading last transaction...</div>
            ) : !voidTransaction ? (
              <div className="text-center py-8 text-sm text-muted">
                No recent transactions to void (within 30 minutes)
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-2">
                  <div className="text-sm font-medium text-foreground">
                    {voidTransaction.description || "Sale"}
                  </div>
                  <div className="text-2xl font-bold text-red-400 tabular-nums font-mono">
                    {formatCents(voidTransaction.amount_cents)}
                  </div>
                  <div className="text-xs text-muted">
                    {new Date(voidTransaction.created_at).toLocaleString()}
                  </div>
                  {(() => {
                    const meta = voidTransaction.metadata ?? {};
                    const items = (meta.items as Array<{ name?: string; quantity?: number }>) ?? [];
                    if (items.length === 0) return null;
                    return (
                      <div className="text-xs text-muted border-t border-card-border pt-2 mt-2">
                        {items.map((it, i) => (
                          <div key={i}>{it.name ?? "Item"} x{it.quantity ?? 1}</div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                <button
                  onClick={handleVoid}
                  disabled={voidProcessing}
                  className="w-full rounded-xl font-medium text-white disabled:opacity-50 transition-colors"
                  style={{ height: 48, backgroundColor: "#dc2626" }}
                >
                  {voidProcessing ? "Voiding..." : `Void this ${formatCents(voidTransaction.amount_cents)} sale`}
                </button>

                <div className="text-xs text-muted text-center">
                  This will reverse the sale and restore inventory
                </div>
              </>
            )}
          </div>
        );

      default:
        return null;
    }
  }
}
