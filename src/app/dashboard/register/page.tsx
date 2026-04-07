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
import { shouldPromptTip } from "@/lib/store-settings-shared";
import { useStore } from "@/lib/store-context";
import { signOut } from "next-auth/react";
import { useTrainingMode } from "@/lib/training-mode";
import { useMode } from "@/lib/mode-context";
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

import { RegisterHeader } from "@/components/register/register-header";
import { ActionBar } from "@/components/register/action-bar";
import { CartList } from "@/components/register/cart-list";
import { PaymentButtons } from "@/components/register/payment-buttons";
import { StatusBar } from "@/components/register/status-bar";
import { PanelContent } from "@/components/register/panel-content";
import { CustomerDisplay } from "@/components/register/customer-display";
import QRCode from "qrcode";

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
  /** TCG card condition badge */
  condition?: string;
  /** Product image (for cart thumbnail) */
  image_url?: string | null;
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
  receiptNumber: string;
  receiptToken: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  tenderedCents: number;
  changeCents: number;
  loyaltyPointsEarned: number;
  ledgerEntryId: string | null;
}

/** Generate a receipt number from server (atomic counter) with localStorage fallback */
async function generateReceiptNumber(): Promise<string> {
  try {
    const res = await fetch("/api/receipts/number", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      return data.receipt_number;
    }
  } catch {
    // Fall through to localStorage fallback
  }
  // Fallback for offline
  const now = new Date();
  const dateStr = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");
  const storageKey = `receipt-counter-${dateStr}`;
  let counter = 1;
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) counter = parseInt(stored, 10) + 1;
    localStorage.setItem(storageKey, String(counter));
  } catch {}
  return `R-${dateStr}-${String(counter).padStart(3, "0")}`;
}

type ActivePanel = "search" | "scan" | "customer" | "quick" | "manual" | "discount" | "more" | "price_check" | "store_credit" | "returns" | "loyalty" | "gift_card" | "no_sale" | "flag_issue" | "void_last" | "order_lookup" | "trade_eval" | null;

interface ReceiptData {
  store_name: string;
  transaction_id: string;
  receipt_number: string;
  date: string;
  date_formatted: string;
  type: string;
  items: Array<{ name: string; quantity: number; price_cents: number; total_cents: number }>;
  subtotal_cents: number;
  tax_cents: number;
  discount_cents: number;
  credit_applied_cents: number;
  gift_card_applied_cents: number;
  loyalty_discount_cents: number;
  total_cents: number;
  payment_method: string;
  amount_tendered_cents: number;
  change_cents: number;
  customer_name: string | null;
  customer_email: string | null;
  staff_name: string | null;
  description: string | null;
  receipt_footer: string;
}

/* ------------------------------------------------------------------ */
/*  Print Receipt — uses the template system                           */
/* ------------------------------------------------------------------ */

import { buildThermalReceiptHtml, buildReceiptConfig, type ReceiptData as TemplateReceiptData } from "@/lib/receipt-template";

function buildPrintReceiptHtml(receipt: LastReceipt, storeName: string, storeSettings?: Record<string, unknown>): string {
  const config = buildReceiptConfig(storeName, storeSettings ?? {});
  const data: TemplateReceiptData = {
    receipt_number: receipt.receiptNumber,
    receipt_token: receipt.receiptToken,
    date: receipt.timestamp,
    items: receipt.items.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      price_cents: i.price_cents,
      total_cents: i.price_cents * i.quantity,
    })),
    subtotal_cents: receipt.subtotalCents,
    tax_cents: receipt.taxCents,
    discount_cents: receipt.discountCents,
    credit_applied_cents: 0,
    gift_card_applied_cents: 0,
    loyalty_discount_cents: 0,
    total_cents: receipt.totalCents,
    payment_method: receipt.paymentMethod,
    amount_tendered_cents: receipt.tenderedCents,
    change_cents: receipt.changeCents,
    card_brand: receipt.cardBrand,
    card_last4: receipt.cardLast4,
    customer_name: receipt.customerName,
    loyalty_points_earned: receipt.loyaltyPointsEarned || 0,
    loyalty_balance: 0,
    staff_name: null,
  };
  return buildThermalReceiptHtml(config, data);
}

/* ------------------------------------------------------------------ */
/*  Unclaimed Points Prompt                                            */
/* ------------------------------------------------------------------ */

function UnclaimedPointsPrompt({ totalCents, ledgerEntryId, onClaimed }: {
  totalCents: number;
  ledgerEntryId: string;
  onClaimed: (customerName: string, points: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: string; name: string; email: string | null }>>([]);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estimated points
  const estimatedPoints = Math.floor(totalCents / 100);

  // Search customers
  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const ctrl = new AbortController();
    fetch(`/api/customers?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => setResults(d.slice(0, 5)))
      .catch(() => {});
    return () => ctrl.abort();
  }, [query]);

  async function claimForCustomer(customerId: string) {
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch("/api/loyalty/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ledger_entry_id: ledgerEntryId, customer_id: customerId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to claim points");
        setClaiming(false);
        return;
      }
      onClaimed(data.customer_name, data.points_awarded);
    } catch {
      setError("Connection error");
    } finally {
      setClaiming(false);
    }
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="mt-2 rounded-xl border border-purple-500/30 bg-purple-900/20 px-4 py-2.5 text-sm text-purple-300 hover:bg-purple-900/30 transition-colors"
      >
        {"\u2728"} {estimatedPoints} points unclaimed — attach customer to earn
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-purple-500/30 bg-purple-900/20 p-4 space-y-3 text-left w-full max-w-sm mx-auto">
      <p className="text-sm text-purple-300 font-medium">{estimatedPoints} points available</p>
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setError(null); }}
        onKeyDown={(e) => e.stopPropagation()}
        placeholder="Search by name, email, or phone..."
        autoFocus
        className="w-full rounded-lg border border-purple-500/30 bg-purple-950/50 px-3 py-2 text-sm text-foreground placeholder:text-purple-400/50 focus:border-purple-400 focus:outline-none"
      />
      {results.length > 0 && (
        <div className="space-y-1">
          {results.map((c) => (
            <button
              key={c.id}
              onClick={() => claimForCustomer(c.id)}
              disabled={claiming}
              className="w-full text-left rounded-lg px-3 py-2 text-sm text-foreground hover:bg-purple-900/30 transition-colors disabled:opacity-50"
            >
              {c.name}
              {c.email && <span className="text-xs text-muted ml-2">{c.email}</span>}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        onClick={() => setExpanded(false)}
        className="text-xs text-muted hover:text-foreground transition-colors"
        style={{ minHeight: "auto" }}
      >
        Skip
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Email Receipt Button                                               */
/* ------------------------------------------------------------------ */

function ReceiptEmailButton({ receiptToken, customerEmail }: { receiptToken: string; customerEmail?: string | null }) {
  const [showInput, setShowInput] = useState(false);
  const [email, setEmail] = useState(customerEmail || "");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function sendEmail() {
    if (!email.trim() || !email.includes("@")) return;
    setSending(true);
    try {
      const res = await fetch("/api/receipts/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), receipt_token: receiptToken }),
      });
      if (res.ok) {
        setSent(true);
        setTimeout(() => { setSent(false); setShowInput(false); }, 2000);
      }
    } catch {
      // fail silently
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <span className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 text-sm font-medium text-green-400" style={{ height: 44 }}>
        {"\u2713"} Sent
      </span>
    );
  }

  if (!showInput) {
    return (
      <button
        onClick={() => setShowInput(true)}
        className="flex items-center gap-2 rounded-xl border border-card-border bg-card-hover px-4 text-sm font-medium text-foreground active:scale-[0.98] transition-transform"
        style={{ height: 44, touchAction: "manipulation" }}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
        Email
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") sendEmail(); }}
        placeholder="email@example.com"
        autoFocus
        className="rounded-xl border border-input-border bg-input-bg px-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        style={{ height: 44, width: 200 }}
      />
      <button
        onClick={sendEmail}
        disabled={sending || !email.includes("@")}
        className="rounded-xl bg-accent px-3 text-sm font-medium text-white disabled:opacity-40"
        style={{ height: 44 }}
      >
        {sending ? "..." : "Send"}
      </button>
      <button
        onClick={() => setShowInput(false)}
        className="text-muted hover:text-foreground text-lg px-1"
        style={{ minHeight: "auto" }}
      >
        {"\u00D7"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Register Page — full-screen receipt-tape-first POS terminal        */
/* ------------------------------------------------------------------ */
export default function RegisterPage() {
  const router = useRouter();
  const storeName = useStoreName();
  const storeSettings = useStoreSettings();
  const { staff, effectiveRole, store: storeCtx } = useStore();
  const { isTraining } = useTrainingMode();
  const { setMode } = useMode();

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
  const [recentCustomers, setRecentCustomers] = useState<Array<{ id: string; name: string; email: string | null; source: "checkin" | "purchase"; timestamp: string }>>([]);

  // Load recent customers (check-ins + recent purchasers)
  useEffect(() => {
    fetch("/api/customers/recent")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setRecentCustomers(data))
      .catch(() => {});
    // Refresh every 2 minutes
    const interval = setInterval(() => {
      fetch("/api/customers/recent")
        .then((r) => r.ok ? r.json() : [])
        .then((data) => setRecentCustomers(data))
        .catch(() => {});
    }, 120000);
    return () => clearInterval(interval);
  }, []);

  // Manual item
  const [manualName, setManualName] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualQty, setManualQty] = useState("1");

  // Discount panel
  const [discountScope, setDiscountScope] = useState<"item" | "cart">("item");
  const [discountType, setDiscountType] = useState<"percent" | "dollar">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [discountError, setDiscountError] = useState<string | null>(null);

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
  const [showChangeDue, setShowChangeDue] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  // Tip prompt
  const [showTipPrompt, setShowTipPrompt] = useState(false);
  const [pendingTipCents, setPendingTipCents] = useState(0);
  const [pendingPaymentMethod, setPendingPaymentMethod] = useState<PaymentMethod | null>(null);

  // Quantity edit
  const [editingQtyIndex, setEditingQtyIndex] = useState<number | null>(null);
  const [editQtyValue, setEditQtyValue] = useState("");

  // Success screen
  const [showSuccess, setShowSuccess] = useState(false);

  // Last receipt
  const [lastReceipt, setLastReceipt] = useState<LastReceipt | null>(null);
  const [showLastReceipt, setShowLastReceipt] = useState(false);

  // Item added confirmation
  const [itemAddedMessage, setItemAddedMessage] = useState<string | null>(null);
  const itemAddedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Error banner
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const errorBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [noticeBanner, setNoticeBanner] = useState<string | null>(null);
  const noticeBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [zeroStockItem, setZeroStockItem] = useState<InventoryItem | null>(null);
  const [hasZeroStockOverride, setHasZeroStockOverride] = useState(false);
  const [lastCardBrand, setLastCardBrand] = useState<string | null>(null);
  const [lastCardLast4, setLastCardLast4] = useState<string | null>(null);

  // Active event detection for halo revenue tagging
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [activeEventName, setActiveEventName] = useState<string | null>(null);
  useEffect(() => {
    async function checkActiveEvent() {
      try {
        const res = await fetch("/api/events/active");
        if (res.ok) {
          const data = await res.json();
          if (data.event) {
            setActiveEventId(data.event.id);
            setActiveEventName(data.event.name);
          }
        }
      } catch {}
    }
    checkActiveEvent();
    // Re-check every 30 minutes
    const interval = setInterval(checkActiveEvent, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Receipt QR code
  const [receiptQrUrl, setReceiptQrUrl] = useState<string | null>(null);
  const [showCustomerDisplay, setShowCustomerDisplay] = useState(false);

  // Order lookup receipt (shared with MoreMenu for printing)
  const [orderLookupReceipt, setOrderLookupReceipt] = useState<ReceiptData | null>(null);

  // Gift card payment in checkout flow
  const [showGiftCardPayment, setShowGiftCardPayment] = useState(false);
  const [giftCardPayCode, setGiftCardPayCode] = useState("");
  const [giftCardPayLoading, setGiftCardPayLoading] = useState(false);
  const [giftCardPayError, setGiftCardPayError] = useState<string | null>(null);

  // Refs for scanner access to payment state (avoids re-creating scanner callback)
  const showPaySheetRef = useRef(showPaySheet);
  showPaySheetRef.current = showPaySheet;
  const showGiftCardPaymentRef = useRef(showGiftCardPayment);
  showGiftCardPaymentRef.current = showGiftCardPayment;

  // Auto-close payment sheet when cart becomes empty
  useEffect(() => {
    if (cart.length === 0 && showPaySheet) {
      setShowPaySheet(false);
      setShowCashInput(false);
      setShowCreditConfirm(false);
      setShowGiftCardPayment(false);
    }
  }, [cart.length, showPaySheet]);

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

  // Fullscreen
  const [isFullscreen, setIsFullscreen] = useState(false);
  const lastLogoTap = useRef<number>(0);

  // Refs
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const customerDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cartEndRef = useRef<HTMLDivElement>(null);
  const searchCache = useRef<Map<string, InventoryItem[]>>(new Map());

  // Only auto-focus inputs on desktop
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
  // Scanner stays enabled during showPaySheet so gift card barcodes can be scanned at checkout
  const scannerEnabled = !learnBarcode && activePanel !== "scan" && activePanel !== "customer" && activePanel !== "more" && activePanel !== "price_check" && activePanel !== "store_credit" && activePanel !== "returns" && activePanel !== "gift_card" && activePanel !== "flag_issue" && activePanel !== "order_lookup";

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

      // Check if this is a gift card barcode (16 chars from ABCDEFGHJKLMNPQRSTUVWXYZ23456789, with or without dashes)
      const gcChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const strippedGc = barcode.replace(/-/g, "").toUpperCase();
      if (strippedGc.length === 16 && [...strippedGc].every((ch) => gcChars.includes(ch))) {
        // Format as XXXX-XXXX-XXXX-XXXX
        const formatted = [strippedGc.slice(0, 4), strippedGc.slice(4, 8), strippedGc.slice(8, 12), strippedGc.slice(12, 16)].join("-");
        // If pay sheet is showing, open gift card input with code pre-filled
        // If not, open pay sheet first then gift card input
        if (!showPaySheetRef.current) setShowPaySheet(true);
        setShowCashInput(false);
        setShowGiftCardPayment(true);
        setGiftCardPayCode(formatted);
        setGiftCardPayError(null);
        return;
      }

      // If pay sheet is showing and this is NOT a gift card, ignore non-gift-card scans
      if (showPaySheetRef.current) return;

      // Check if this is an Afterroar Passport QR/barcode (CUID format)
      if (barcode.startsWith("c") && barcode.length >= 20 && /^[a-z0-9]+$/.test(barcode)) {
        try {
          // First: check local DB for existing customer with this afterroar_user_id
          const custRes = await fetch(`/api/customers?q=${encodeURIComponent(barcode)}`);
          if (custRes.ok) {
            const custData = await custRes.json();
            if (custData.length > 0) {
              setCustomer(custData[0]);
              showItemAdded(`${custData[0].name} attached`);
              return;
            }
          }
          // Not found locally — look up on HQ Passport API and auto-create
          const passportRes = await fetch(`/api/passport/lookup?afterroar_user_id=${encodeURIComponent(barcode)}`);
          if (passportRes.ok) {
            const passport = await passportRes.json();
            if (passport.customer) {
              setCustomer(passport.customer);
              showItemAdded(`${passport.customer.name} attached`);
              return;
            }
          }
        } catch {}
      }

      let found: InventoryItem | null = null;
      let zeroStockMatch: InventoryItem | null = null;
      try {
        const localResults = await searchInventoryLocal(barcode).catch(() => []);
        const match = localResults.find((r) => r.barcode === barcode);
        if (match) {
          const asItem = { ...match, low_stock_threshold: 5, image_url: null, external_id: null, catalog_product_id: null, shared_to_catalog: false, created_at: "", updated_at: "" } as InventoryItem;
          if (match.quantity > 0) found = asItem;
          else zeroStockMatch = asItem;
        }
      } catch {}

      if (!found && !zeroStockMatch) {
        try {
          const res = await fetch(`/api/inventory/search?q=${encodeURIComponent(barcode)}`);
          const data: InventoryItem[] = await res.json();
          if (Array.isArray(data)) {
            const match = data.find((d) => d.barcode === barcode);
            if (match) {
              if (match.quantity > 0) found = match;
              else zeroStockMatch = match;
            }
          }
        } catch {}
      }

      if (found) {
        addToCart(found);
      } else if (zeroStockMatch) {
        // Item exists but system says 0 stock — offer override
        const item = zeroStockMatch;
        setZeroStockItem(item);
      } else {
        playBeep(400, 0.15, 0.06);
        setScannerFlash("error");
        if (scannerFlashTimerRef.current) clearTimeout(scannerFlashTimerRef.current);
        scannerFlashTimerRef.current = setTimeout(() => setScannerFlash("none"), 1000);
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
      const errorMsg = error.type === "partial_scan" ? `Partial scan: ${error.rawInput}` : error.type === "garbled" ? `Garbled input: ${error.rawInput}` : `Scanner error: ${error.message}`;
      setScannerErrorText(errorMsg);
      if (scannerErrorTimerRef.current) clearTimeout(scannerErrorTimerRef.current);
      scannerErrorTimerRef.current = setTimeout(() => setScannerErrorText(null), 5000);
      if (error.rawInput && error.type !== "garbled") {
        setSearchQuery(error.rawInput);
        setActivePanel("search");
      }
    }, []),
    enabled: scannerEnabled,
  });

  // Pause/resume scanner when overlays open/close
  useEffect(() => {
    if (activePanel === "scan" || activePanel === "customer" || activePanel === "more" || activePanel === "price_check" || activePanel === "store_credit" || activePanel === "returns" || activePanel === "gift_card" || activePanel === "flag_issue") {
      pauseScanner();
    } else {
      resumeScanner();
    }
  }, [activePanel, pauseScanner, resumeScanner]);

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

    // ---- Deck Builder cart pickup ----
    try {
      const deckBuilderRaw = localStorage.getItem("deck-builder-cart");
      if (deckBuilderRaw) {
        const deckItems = JSON.parse(deckBuilderRaw) as Array<{
          inventory_item_id: string | null;
          name: string;
          price_cents: number;
          quantity: number;
          image_url: string | null;
        }>;
        if (deckItems.length > 0) {
          setCart((prev) => {
            const merged = [...prev];
            for (const di of deckItems) {
              const existingIdx = merged.findIndex(
                (c) => c.inventory_item_id && c.inventory_item_id === di.inventory_item_id,
              );
              if (existingIdx >= 0) {
                merged[existingIdx] = {
                  ...merged[existingIdx],
                  quantity: merged[existingIdx].quantity + di.quantity,
                };
              } else {
                merged.push({
                  inventory_item_id: di.inventory_item_id,
                  name: di.name,
                  category: "tcg_single",
                  price_cents: di.price_cents,
                  quantity: di.quantity,
                  max_quantity: di.quantity + 10,
                  image_url: di.image_url,
                });
              }
            }
            return merged;
          });
        }
        localStorage.removeItem("deck-builder-cart");
      }
    } catch {
      // ignore malformed deck-builder cart
    }
  }, []);

  // ---- Cart persistence: auto-save on change ----
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (cart.length === 0 && !customer && discounts.length === 0) {
        clearPersistedCart();
      } else {
        persistCart({ id: cartIdRef.current, items: cart, customer, discounts, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      }
    }, 100);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [cart, customer, discounts]);

  // ---- Toast auto-dismiss ----
  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 2000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // ---- Derived values ----
  const subtotal = cart.reduce((s, i) => s + i.price_cents * i.quantity, 0);
  const cartItemCount = cart.reduce((s, i) => s + i.quantity, 0);
  const taxRate = storeSettings.tax_rate_percent;
  // Tax is "ready" once store settings have loaded (even if rate is 0 = no tax)
  const taxReady = !!storeCtx; // Settings loaded — rate might be 0 (no tax) and that's fine

  const discountCents = discounts.reduce((sum, d) => {
    if (d.scope === "cart") {
      if (d.type === "percent") return sum + Math.round(subtotal * d.value / 100);
      return sum + d.value;
    }
    if (d.itemIndex != null && d.itemIndex < cart.length) {
      const item = cart[d.itemIndex];
      const lineTotal = item.price_cents * item.quantity;
      if (d.type === "percent") return sum + Math.round(lineTotal * d.value / 100);
      return sum + d.value;
    }
    return sum;
  }, 0);

  const discountedSubtotal = Math.max(0, subtotal - discountCents);
  // Exclude gift cards from tax (stored value — taxed at redemption)
  const taxableSubtotal = discountedSubtotal - cart.filter((c) => c.category === "gift_card").reduce((s, c) => s + c.price_cents * c.quantity, 0);
  const taxCents = storeSettings.tax_included_in_price ? 0 : Math.round(Math.max(0, taxableSubtotal) * taxRate / 100);
  const total = discountedSubtotal + taxCents;
  const creditAvailable = customer?.credit_balance_cents ?? 0;
  const creditToApply = showCreditConfirm ? Math.min(creditAvailable, total) : 0;
  const amountDue = total - creditToApply;
  const tendered = tenderedInput ? parseDollars(tenderedInput) : 0;
  const change = paymentMethod === "cash" ? Math.max(0, tendered - amountDue) : 0;

  // ---- Load favorites on mount ----
  useEffect(() => {
    fetch("/api/inventory/favorites?limit=8")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (Array.isArray(data)) setFavorites(data); })
      .catch(() => {});
  }, []);

  // ---- Listen for register-scan event from nav ----
  useEffect(() => {
    function handleScanEvent() { setActivePanel("scan"); }
    window.addEventListener("register-scan", handleScanEvent);
    return () => window.removeEventListener("register-scan", handleScanEvent);
  }, []);

  // ---- Fullscreen change listener ----
  useEffect(() => {
    function handleFsChange() { setIsFullscreen(!!document.fullscreenElement); }
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // ---- Inventory search ----
  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) { setSearchResults([]); return; }
      const trimmed = q.trim();
      const cached = searchCache.current.get(trimmed.toLowerCase());
      if (cached) {
        const exactBarcode = cached.find((d) => d.barcode && d.barcode === trimmed && d.quantity > 0);
        if (exactBarcode) { addToCart(exactBarcode); setSearchQuery(""); setSearchResults([]); setActivePanel(null); return; }
        setSearchResults(cached.filter((d) => d.quantity > 0));
      }
      // Try offline cache first (non-blocking — if IDB fails, fall through to API)
      try {
        const localResults = await searchInventoryLocal(trimmed).catch(() => []);
        if (localResults.length > 0) {
          const asInventory = localResults.map((r) => ({ ...r, low_stock_threshold: 5, image_url: null, external_id: null, catalog_product_id: null, shared_to_catalog: false, created_at: "", updated_at: "" })) as InventoryItem[];
          const exactBarcode = asInventory.find((d) => d.barcode && d.barcode === trimmed && d.quantity > 0);
          if (exactBarcode) { addToCart(exactBarcode); setSearchQuery(""); setSearchResults([]); setActivePanel(null); return; }
          const filtered = asInventory.filter((d) => d.quantity > 0);
          searchCache.current.set(trimmed.toLowerCase(), filtered);
          setSearchResults(filtered);
        }
      } catch {
        // IDB completely broken — skip to API
      }
      try {
        const res = await fetch(`/api/inventory/search?q=${encodeURIComponent(trimmed)}`);
        const data: InventoryItem[] = await res.json();
        if (Array.isArray(data)) {
          const exactBarcode = data.find((d) => d.barcode && d.barcode === trimmed && d.quantity > 0);
          if (exactBarcode) { addToCart(exactBarcode); setSearchQuery(""); setSearchResults([]); setActivePanel(null); return; }
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
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery, doSearch, activePanel]);

  // ---- Customer search ----
  const doCustomerSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setCustomerResults([]); return; }
    try {
      const localResults = await searchCustomersLocal(q.trim());
      if (localResults.length > 0) {
        setCustomerResults(localResults.map((c) => ({ ...c, store_id: "", notes: null, afterroar_id: null, loyalty_points: 0, created_at: "", updated_at: "" })) as Customer[]);
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
    customerDebounceRef.current = setTimeout(() => doCustomerSearch(customerQuery), 200);
    return () => { if (customerDebounceRef.current) clearTimeout(customerDebounceRef.current); };
  }, [customerQuery, activePanel, doCustomerSearch]);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showSuccess) { setShowSuccess(false); setCustomer(null); setCreatedGiftCards(null); }
        else if (showChangeDue !== null) { setShowChangeDue(null); setCustomer(null); }
        else if (showPaySheet) { setShowPaySheet(false); setShowCashInput(false); setShowCreditConfirm(false); }
        else if (showLastReceipt) { setShowLastReceipt(false); }
        else if (activePanel) { setActivePanel(null); }
      }
      if (e.key === "F2") { e.preventDefault(); setActivePanel("search"); setTimeout(() => focusSearch(), 50); }
      if (e.key === "Enter" && !searchQuery.trim() && cart.length > 0 && !showPaySheet && !activePanel && taxReady) { e.preventDefault(); setShowPaySheet(true); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [searchQuery, cart, showPaySheet, activePanel, showLastReceipt, showSuccess, showChangeDue]);

  // ---- Cart helpers ----
  function showItemAdded(name: string) {
    setItemAddedMessage(name);
    if (itemAddedTimerRef.current) clearTimeout(itemAddedTimerRef.current);
    itemAddedTimerRef.current = setTimeout(() => setItemAddedMessage(null), 1500);
  }

  function showError(message: string) {
    // Expected business conditions → amber notice (not scary)
    if (/insufficient.*quantit/i.test(message) || /not enough.*stock/i.test(message) || /insufficient.*credit/i.test(message)) {
      setNoticeBanner(message);
      if (noticeBannerTimerRef.current) clearTimeout(noticeBannerTimerRef.current);
      noticeBannerTimerRef.current = setTimeout(() => setNoticeBanner(null), 6000);
      return;
    }
    // True errors → red banner
    let friendly = message;
    if (/payment.*fail/i.test(message)) friendly = "Card payment failed. Try again or use a different method.";
    else if (/network|fetch|connect/i.test(message)) friendly = "Connection lost. Transaction saved offline.";
    setErrorBanner(friendly);
    if (errorBannerTimerRef.current) clearTimeout(errorBannerTimerRef.current);
    errorBannerTimerRef.current = setTimeout(() => setErrorBanner(null), 8000);
  }

  function addToCart(item: InventoryItem) {
    showItemAdded(item.name);
    setCart((prev) => {
      const existingIdx = prev.findIndex((c) => c.inventory_item_id === item.id);
      if (existingIdx >= 0) {
        const existing = prev[existingIdx];
        const newQty = existing.quantity + 1;
        if (newQty > item.quantity && item.quantity > 0) {
          // Warn but allow — set override flag
          setNoticeBanner(`${item.name}: adding more than in stock (${item.quantity} available)`);
          if (noticeBannerTimerRef.current) clearTimeout(noticeBannerTimerRef.current);
          noticeBannerTimerRef.current = setTimeout(() => setNoticeBanner(null), 5000);
          setHasZeroStockOverride(true);
        }
        const updated = [...prev];
        updated[existingIdx] = { ...existing, quantity: newQty };
        setLastAddedIndex(existingIdx);
        return updated;
      }
      const attrs = (item.attributes || {}) as Record<string, unknown>;
      const newItem: CartItem = {
        inventory_item_id: item.id, name: item.name, category: item.category,
        price_cents: item.price_cents, quantity: 1, max_quantity: item.quantity,
        condition: (attrs.condition as string) || undefined,
        image_url: item.image_url,
      };
      setLastAddedIndex(prev.length);
      return [...prev, newItem];
    });
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setLastAddedIndex(null), 500);
    setTimeout(() => cartEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    setSearchQuery(""); setSearchResults([]);
    if (activePanel === "search" || activePanel === "quick") setActivePanel(null);
    (document.activeElement as HTMLElement)?.blur();
  }

  function addManualItem() {
    const name = manualName.trim();
    const priceCents = parseDollars(manualPrice);
    const qty = parseInt(manualQty, 10) || 1;
    if (!name || priceCents <= 0) return;
    showItemAdded(name);
    const isGiftCard = name.toLowerCase().startsWith("gift card");
    setCart((prev) => { setLastAddedIndex(prev.length); return [...prev, { inventory_item_id: null, name, category: isGiftCard ? "gift_card" : "other", price_cents: priceCents, quantity: qty, max_quantity: 999 }]; });
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setLastAddedIndex(null), 500);
    setTimeout(() => cartEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    setManualName(""); setManualPrice(""); setManualQty("1"); setActivePanel(null);
    (document.activeElement as HTMLElement)?.blur();
  }

  function removeItem(index: number) {
    setDiscounts((prev) => prev.filter((d) => !(d.scope === "item" && d.itemIndex === index)).map((d) => {
      if (d.scope === "item" && d.itemIndex != null && d.itemIndex > index) return { ...d, itemIndex: d.itemIndex - 1 };
      return d;
    }));
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  // Over-stock warning state
  const [overStockPending, setOverStockPending] = useState<{ index: number; qty: number; max: number } | null>(null);

  function commitQtyEdit(index: number, directValue?: number) {
    const newQty = directValue ?? parseInt(editQtyValue, 10);
    if (!newQty || newQty <= 0) { removeItem(index); } else {
      const item = cart[index];
      if (item && newQty > item.max_quantity && item.max_quantity > 0) {
        // Show over-stock warning
        setOverStockPending({ index, qty: newQty, max: item.max_quantity });
      } else {
        setCart((prev) => prev.map((c, i) => i === index ? { ...c, quantity: newQty } : c));
      }
    }
    if (directValue === undefined) {
      setEditingQtyIndex(null);
    }
    setEditQtyValue("");
    (document.activeElement as HTMLElement)?.blur();
  }

  function confirmOverStock() {
    if (!overStockPending) return;
    setCart((prev) => prev.map((c, i) => i === overStockPending.index ? { ...c, quantity: overStockPending.qty } : c));
    setHasZeroStockOverride(true);
    setOverStockPending(null);
  }

  // ---- Discount helpers ----
  function applyDiscount() {
    const val = parseFloat(discountValue);
    if (!val || isNaN(val)) { setDiscountError("Enter a valid number"); return; }
    if (val <= 0) { setDiscountError("Must be greater than zero"); return; }
    if (discountType === "percent" && val > 100) { setDiscountError("Can't exceed 100%"); return; }
    if (discountType === "dollar" && parseDollars(discountValue) > subtotal) { setDiscountError("Can't exceed the subtotal"); return; }
    setDiscountError(null);
    const newDiscount: CartDiscount = { id: `d_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, scope: discountScope, type: discountType, value: discountType === "dollar" ? parseDollars(discountValue) : val, reason: discountReason.trim() };
    if (discountScope === "item" && cart.length > 0) newDiscount.itemIndex = cart.length - 1;
    setDiscounts((prev) => [...prev, newDiscount]);
    setDiscountValue(""); setDiscountReason(""); setDiscountError(null); setActivePanel(null);
    (document.activeElement as HTMLElement)?.blur();
  }

  function removeDiscount(id: string) { setDiscounts((prev) => prev.filter((d) => d.id !== id)); }

  // ---- Barcode scan handler (camera scanner) ----
  function handleBarcodeScan(code: string) {
    setActivePanel(null); setSearchQuery(code); setActivePanel("search"); playBeep();
  }

  // ---- Complete sale ----
  // State for terminal card payment
  const [waitingForTerminal, setWaitingForTerminal] = useState(false);
  const [terminalPiId, setTerminalPiId] = useState<string | null>(null);
  const terminalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Called after tip prompt (or directly if no tip)
  async function proceedWithSale(method: PaymentMethod, tipCents: number = 0) {
    setPendingTipCents(tipCents);
    await _handleCompleteSale(method, tipCents);
  }

  async function handleCompleteSale(method: PaymentMethod) {
    if (cart.length === 0 || processing) return;
    if (method === "cash" && tendered < amountDue && amountDue > 0) return;

    // Check if we should prompt for tips
    const cartCategories = cart.map((c) => c.category).filter(Boolean);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wantTip = shouldPromptTip(storeSettings as any, {
      categories: cartCategories,
      source: "register",
    });

    if (wantTip && method !== "card") {
      // For non-card payments, show our own tip prompt UI
      setPendingPaymentMethod(method);
      setShowTipPrompt(true);
      return;
    }

    // For card payments, tip is handled on the terminal reader itself
    await _handleCompleteSale(method, 0);
  }

  async function _handleCompleteSale(method: PaymentMethod, tipOverride: number = 0) {
    if (cart.length === 0 || processing) return;
    if (method === "cash" && tendered < amountDue && amountDue > 0) return;

    // PRE-FLIGHT: Check stock BEFORE any payment is taken
    if (!hasZeroStockOverride) {
      try {
        const stockCheckItems = cart.filter(c => c.inventory_item_id);
        if (stockCheckItems.length > 0) {
          const res = await fetch("/api/inventory/check-stock", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: stockCheckItems.map(c => ({ inventory_item_id: c.inventory_item_id, quantity: c.quantity })) }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.issues && data.issues.length > 0) {
              // Show warning — don't block, but warn before payment
              const issueMsg = data.issues.map((i: { name: string; available: number; requested: number }) =>
                `${i.name}: ${i.available} in stock, ${i.requested} in cart`
              ).join("\n");
              setNoticeBanner(`Stock warning:\n${issueMsg}`);
              if (noticeBannerTimerRef.current) clearTimeout(noticeBannerTimerRef.current);
              noticeBannerTimerRef.current = setTimeout(() => setNoticeBanner(null), 8000);
              // Set override so we don't check again + checkout API won't reject
              setHasZeroStockOverride(true);
              return; // Let them review, they can tap Pay again
            }
          }
        }
      } catch {
        // Stock check failed — proceed anyway (don't block sale)
      }
    }

    // For card payments: route through Stripe Terminal reader
    if (method === "card" && !isTraining) {
      setProcessing(true);

      // Tipping on terminal: always enable when tips_mode isn't "never"
      const enableTipping = storeSettings.tips_mode !== "never";

      try {
        // Send to terminal reader
        const collectRes = await fetch("/api/stripe/terminal/collect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount_cents: amountDue,
            description: `Sale: ${cart.map(c => c.name).join(", ")}`.substring(0, 200),
            enable_tipping: enableTipping,
          }),
        });
        const collectData = await collectRes.json();

        if (!collectRes.ok) {
          showError(collectData.error || "Failed to send to card reader");
          setProcessing(false);
          return;
        }

        // Show "Waiting for card..." screen and poll
        setTerminalPiId(collectData.payment_intent_id);
        setWaitingForTerminal(true);

        // Poll every 2 seconds for payment status
        terminalPollRef.current = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/stripe/terminal/collect?payment_intent_id=${collectData.payment_intent_id}`);
            const statusData = await statusRes.json();

            if (statusData.status === "succeeded") {
              // Payment collected! Now record the sale
              clearInterval(terminalPollRef.current!);
              terminalPollRef.current = null;
              setWaitingForTerminal(false);
              setTerminalPiId(null);
              // Capture card details for receipt
              setLastCardBrand(statusData.card_brand || null);
              setLastCardLast4(statusData.card_last4 || null);
              // Capture tip from terminal (Stripe reader collected it on-screen)
              const terminalTipCents = statusData.tip_cents || 0;
              await finalizeSale(method, collectData.payment_intent_id, terminalTipCents);
            } else if (statusData.status === "failed" || statusData.status === "cancelled") {
              clearInterval(terminalPollRef.current!);
              terminalPollRef.current = null;
              setWaitingForTerminal(false);
              setTerminalPiId(null);
              setProcessing(false);
              showError(statusData.error || "Card payment failed or was cancelled");
            }
            // status === "waiting" — keep polling
          } catch {
            // Network error during poll — keep trying
          }
        }, 2000);

        return; // Don't proceed — poll callback will handle completion
      } catch {
        showError("Failed to connect to card reader");
        setProcessing(false);
        return;
      }
    }

    // Non-terminal payments (cash, credit, gift card, external, training card)
    setProcessing(true);
    await finalizeSale(method, undefined, tipOverride);
  }

  async function cancelTerminalPayment() {
    if (terminalPollRef.current) {
      clearInterval(terminalPollRef.current);
      terminalPollRef.current = null;
    }
    if (terminalPiId) {
      await fetch(`/api/stripe/terminal/collect?payment_intent_id=${terminalPiId}`, { method: "DELETE" }).catch(() => {});
    }
    setWaitingForTerminal(false);
    setTerminalPiId(null);
    setProcessing(false);
  }

  async function finalizeSale(method: PaymentMethod, stripePaymentIntentId?: string, tipCents: number = 0) {
    const clientTxId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
      items: cart.map((c) => ({ inventory_item_id: c.inventory_item_id, quantity: c.quantity, price_cents: c.price_cents, ...(c.category === "gift_card" ? { category: "gift_card" } : {}) })),
      customer_id: customer?.id ?? null,
      payment_method: method,
      amount_tendered_cents: method === "cash" ? tendered : amountDue,
      credit_applied_cents: creditToApply,
      event_id: activeEventId,
      client_tx_id: clientTxId,
      ...(taxCents > 0 ? { tax_cents: taxCents } : {}),
      discount_cents: discountCents,
      ...(tipCents > 0 ? { tip_cents: tipCents } : {}),
      ...(stripePaymentIntentId ? { stripe_payment_intent_id: stripePaymentIntentId } : {}),
      ...(isTraining ? { training: true } : {}),
      ...(hasZeroStockOverride ? { allow_negative_stock: true } : {}),
      // Gift card amounts for cards being sold in this transaction
      ...(() => {
        const gcAmounts = cart.filter((c) => c.category === "gift_card").map((c) => c.price_cents * c.quantity);
        return gcAmounts.length > 0 ? { gift_card_amounts: gcAmounts } : {};
      })(),
    };
    try {
      const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { const data = await res.json(); showError(data.error || "Checkout failed"); setProcessing(false); return; }
      const checkoutData = await res.json();
      saleComplete(method, checkoutData.receipt_token ?? null, checkoutData.loyalty_points_earned ?? 0, checkoutData.ledger_entry_id ?? null, checkoutData.gift_cards_created ?? null);
    } catch {
      try {
        await enqueueTx({ clientTxId, type: "checkout", createdAt: new Date().toISOString(), status: "pending", retryCount: 0, lastError: null, payload, receipt: {} as Record<string, unknown> });
        for (const item of cart) { if (item.inventory_item_id) await decrementLocalInventory(item.inventory_item_id, item.quantity); }
        if (creditToApply > 0 && customer) await updateLocalCustomerCredit(customer.id, -creditToApply);
        saleComplete(method, null);
      } catch { showError("Failed to save transaction. Please try again."); }
    } finally { setProcessing(false); }
  }

  const [createdGiftCards, setCreatedGiftCards] = useState<Array<{ code: string; balance_cents: number }> | null>(null);

  async function saleComplete(method: PaymentMethod, receiptToken: string | null = null, loyaltyPointsEarned: number = 0, ledgerEntryId: string | null = null, giftCards: Array<{ code: string; balance_cents: number }> | null = null) {
    if (giftCards && giftCards.length > 0) setCreatedGiftCards(giftCards);
    const cashChange = method === "cash" ? Math.max(0, tendered - total) : 0;
    const receiptCustomer = customer;
    const receiptNumber = await generateReceiptNumber();
    setLastReceipt({ items: [...cart], discounts: [...discounts], subtotalCents: subtotal, discountCents, taxCents, totalCents: total, paymentMethod: method, customerName: receiptCustomer?.name ?? null, timestamp: new Date().toISOString(), receiptNumber, receiptToken, cardBrand: lastCardBrand, cardLast4: lastCardLast4, tenderedCents: method === "cash" ? tendered : total, changeCents: cashChange, loyaltyPointsEarned, ledgerEntryId });
    (document.activeElement as HTMLElement)?.blur();
    setCart([]); setDiscounts([]); setShowPaySheet(false); setShowCashInput(false); setShowCreditConfirm(false); setShowGiftCardPayment(false); setGiftCardPayCode(""); setGiftCardPayError(null); setTenderedInput(""); setPaymentMethod("cash"); setActivePanel(null); setHasZeroStockOverride(false); setLastCardBrand(null); setLastCardLast4(null); setShowTipPrompt(false); setPendingTipCents(0); setPendingPaymentMethod(null);
    clearPersistedCart(); cartIdRef.current = createEmptyCart().id;
    // Generate QR code for receipt
    if (receiptToken) {
      const receiptUrl = `${window.location.origin}/r/${receiptToken}`;
      QRCode.toDataURL(receiptUrl, { width: 240, margin: 1, color: { dark: "#000000", light: "#ffffff" } })
        .then((url: string) => setReceiptQrUrl(url))
        .catch(() => setReceiptQrUrl(null));
    } else {
      setReceiptQrUrl(null);
    }
    if (method === "cash" && cashChange > 0) { setShowChangeDue(cashChange); } else { setShowSuccess(true); }
  }

  // ---- Park / Recall helpers ----
  function handleParkCart(label?: string) {
    if (cart.length === 0) return;
    parkCart({ id: cartIdRef.current, items: cart, customer, discounts, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, label);
    setCart([]); setDiscounts([]); setCustomer(null); clearPersistedCart(); cartIdRef.current = createEmptyCart().id;
    setParkedCount(getParkedCartCount()); setShowParkInput(false); setParkLabel(""); setToastMessage("Cart parked");
  }

  function handleRecallCart(parkedCart: ParkedCart) {
    if (cart.length > 0) { setParkConflictCart(parkedCart); return; }
    doRecall(parkedCart.parkId);
  }

  function doRecall(parkId: string) {
    const recalled = recallParkedCart(parkId);
    if (!recalled) return;
    cartIdRef.current = recalled.id;
    setCart(recalled.items as CartItem[]); setCustomer(recalled.customer); setDiscounts(recalled.discounts as CartDiscount[]);
    setParkedCount(getParkedCartCount()); setShowRecallSheet(false); setParkConflictCart(null); setToastMessage("Cart recalled");
  }

  function handleDeleteParked(parkId: string) { deleteParkedCart(parkId); setParkedCarts(listParkedCarts()); setParkedCount(getParkedCartCount()); }
  function openRecallSheet() { setParkedCarts(listParkedCarts()); setShowRecallSheet(true); }

  // ---- Gift Card Payment in checkout flow ----
  async function handleGiftCardPayment() {
    if (!giftCardPayCode.trim() || cart.length === 0) return;
    setGiftCardPayLoading(true); setGiftCardPayError(null);
    try {
      const lookupRes = await fetch(`/api/gift-cards/${encodeURIComponent(giftCardPayCode.trim().toUpperCase())}`);
      if (!lookupRes.ok) { const data = await lookupRes.json().catch(() => ({})); setGiftCardPayError(data.error || "Gift card not found"); setGiftCardPayLoading(false); return; }
      const card = await lookupRes.json();
      if (!card.active) { setGiftCardPayError("Gift card is inactive"); setGiftCardPayLoading(false); return; }
      if (card.balance_cents <= 0) { setGiftCardPayError("Gift card has no balance"); setGiftCardPayLoading(false); return; }
      const amountToCharge = Math.min(card.balance_cents, amountDue);
      const payload = { items: cart.map((c) => ({ inventory_item_id: c.inventory_item_id, quantity: c.quantity, price_cents: c.price_cents })), customer_id: customer?.id ?? null, payment_method: "gift_card" as PaymentMethod, amount_tendered_cents: amountToCharge, credit_applied_cents: creditToApply, event_id: null, ...(taxCents > 0 ? { tax_cents: taxCents } : {}), discount_cents: discountCents, gift_card_code: giftCardPayCode.trim().toUpperCase(), gift_card_amount_cents: amountToCharge };
      const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setGiftCardPayError(data.error || "Payment failed"); setGiftCardPayLoading(false); return; }
      const gcData = await res.json();
      setShowGiftCardPayment(false); setGiftCardPayCode(""); saleComplete("gift_card" as PaymentMethod, gcData.receipt_token ?? null);
    } catch { setGiftCardPayError("Payment failed"); } finally { setGiftCardPayLoading(false); }
  }

  // ---- Fullscreen toggle ----
  function handleLogoTap() {
    const now = Date.now();
    if (now - lastLogoTap.current < 400) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else document.documentElement.requestFullscreen().catch(() => {});
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
  const roleLabel = effectiveRole ? effectiveRole.charAt(0).toUpperCase() + effectiveRole.slice(1) : "";

  const panelProps = {
    activePanel, setActivePanel, searchRef, searchQuery, setSearchQuery,
    searchResults, setSearchResults, setScannerErrorText, focusSearch,
    isTouchDevice, addToCart, customer, setCustomer, customerQuery,
    setCustomerQuery, customerResults, recentCustomers, favorites, manualName, setManualName,
    manualPrice, setManualPrice, manualQty, setManualQty, addManualItem,
    discountScope, setDiscountScope, discountType, setDiscountType,
    discountValue, setDiscountValue, discountReason, setDiscountReason,
    discountCents, cartLength: cart.length, applyDiscount, discountError,
    effectiveRole, cart, storeSettings, setToastMessage, showError,
    setShowGiftCardPayment, setShowPaySheet, orderLookupReceipt, setOrderLookupReceipt,
  };

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden select-none">
      {/* ====== SUCCESS SCREEN ====== */}
      {showSuccess && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-card">
          <div className="text-center space-y-4">
            <div className="text-7xl text-green-400">{"\u2713"}</div>
            <div className="text-2xl font-bold text-foreground">Sale Complete</div>
            {lastReceipt && <div className="text-4xl font-mono font-bold text-foreground tabular-nums">{formatCents(lastReceipt.totalCents)}</div>}
            {lastReceipt && <div className="text-muted text-base font-mono">Receipt #{lastReceipt.receiptNumber}</div>}
            {lastReceipt && lastReceipt.loyaltyPointsEarned > 0 && (
              <div className="text-purple-400 text-sm font-medium">+{lastReceipt.loyaltyPointsEarned} loyalty points earned</div>
            )}
            {/* Gift card codes created in this sale */}
            {createdGiftCards && createdGiftCards.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="text-sm text-muted uppercase tracking-wide">Gift Card{createdGiftCards.length > 1 ? "s" : ""} Created</div>
                {createdGiftCards.map((gc) => (
                  <div key={gc.code} className="rounded-xl border-2 border-green-500/30 bg-green-500/5 p-3 space-y-1">
                    <div className="text-xl font-mono font-bold tracking-wider select-all">{gc.code}</div>
                    <div className="text-green-400 font-semibold">{formatCents(gc.balance_cents)}</div>
                  </div>
                ))}
                <button
                  onClick={() => {
                    const text = createdGiftCards.map((gc) => `${gc.code} — ${formatCents(gc.balance_cents)}`).join("\n");
                    navigator.clipboard.writeText(text).catch(() => {});
                  }}
                  className="text-sm text-accent hover:text-foreground transition-colors"
                >
                  Copy code{createdGiftCards.length > 1 ? "s" : ""}
                </button>
              </div>
            )}
            {/* Unclaimed points prompt — no customer attached */}
            {lastReceipt && !lastReceipt.customerName && lastReceipt.ledgerEntryId && storeSettings.loyalty_enabled && (
              <UnclaimedPointsPrompt
                totalCents={lastReceipt.totalCents}
                ledgerEntryId={lastReceipt.ledgerEntryId}
                onClaimed={(name, points) => {
                  setLastReceipt((prev) => prev ? { ...prev, customerName: name, loyaltyPointsEarned: points } : prev);
                }}
              />
            )}
            {/* QR Code for receipt */}
            {receiptQrUrl && (
              <div className="pt-4 space-y-2">
                <div className="inline-block rounded-xl p-3" style={{ background: "#ffffff" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={receiptQrUrl} alt="Receipt QR" width={200} height={200} style={{ imageRendering: "pixelated" }} />
                </div>
                <div className="text-muted text-base">Scan for your receipt</div>
              </div>
            )}
          </div>

          {/* Receipt delivery options */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => {
                if (!lastReceipt) return;
                const w = window.open("", "_blank", "width=380,height=600");
                if (!w) return;
                w.document.write(buildPrintReceiptHtml(lastReceipt, storeName, storeSettings as unknown as Record<string, unknown>));
                w.document.close();
                w.focus();
                w.print();
              }}
              className="flex items-center gap-2 rounded-xl border border-card-border bg-card-hover px-4 text-sm font-medium text-foreground active:scale-[0.98] transition-transform"
              style={{ height: 44, touchAction: "manipulation" }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              Print
            </button>
            {lastReceipt?.receiptToken && (
              <ReceiptEmailButton receiptToken={lastReceipt.receiptToken} customerEmail={customer?.email} />
            )}
            {receiptQrUrl && lastReceipt && (
              <button onClick={() => setShowCustomerDisplay(true)} className="flex items-center gap-2 rounded-xl border border-card-border bg-card-hover px-4 text-sm font-medium text-foreground active:scale-[0.98] transition-transform" style={{ height: 44, touchAction: "manipulation" }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                Show QR
              </button>
            )}
          </div>

          <div className="mt-6">
            <button onClick={() => { setShowSuccess(false); setCustomer(null); setReceiptQrUrl(null); setCreatedGiftCards(null); }} className="rounded-xl font-bold text-white active:scale-[0.98] transition-transform select-none px-12" style={{ height: 56, fontSize: 18, backgroundColor: "#16a34a", touchAction: "manipulation" }}>Next Customer</button>
          </div>
        </div>
      )}

      {/* ====== CUSTOMER-FACING DISPLAY ====== */}
      {showCustomerDisplay && receiptQrUrl && lastReceipt && (
        <CustomerDisplay
          qrDataUrl={receiptQrUrl}
          totalCents={lastReceipt.totalCents}
          storeName={storeName}
          onDismiss={() => setShowCustomerDisplay(false)}
        />
      )}

      {/* ====== WAITING FOR TERMINAL ====== */}
      {waitingForTerminal && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-card">
          <div className="text-center space-y-6">
            <div className="text-6xl animate-pulse">💳</div>
            <div className="text-2xl font-bold text-foreground">Waiting for card...</div>
            <div className="text-lg font-mono font-bold text-accent tabular-nums">{formatCents(amountDue)}</div>
            <div className="text-base text-muted">Customer should tap, insert, or swipe on the reader</div>
          </div>
          <div className="mt-12 flex gap-3">
            {process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test") && (
              <button
                onClick={async () => {
                  // Simulate a successful terminal payment in test mode
                  if (terminalPollRef.current) { clearInterval(terminalPollRef.current); terminalPollRef.current = null; }
                  // Cancel the reader's pending action so it stops waiting
                  await fetch("/api/stripe/terminal/reset", { method: "POST" }).catch(() => {});
                  setWaitingForTerminal(false);
                  setTerminalPiId(null);
                  // Finalize without a PI — simulated payment
                  await finalizeSale("card");
                }}
                className="rounded-xl font-medium text-white bg-green-600 px-8 active:scale-[0.98] transition-transform"
                style={{ height: 48, touchAction: "manipulation" }}
              >
                Simulate Success
              </button>
            )}
            <button
              onClick={cancelTerminalPayment}
              className="rounded-xl font-medium text-muted border border-card-border bg-card-hover px-8 active:scale-[0.98] transition-transform"
              style={{ height: 48, touchAction: "manipulation" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ====== TOAST ====== */}
      {toastMessage && <div className="absolute top-16 left-1/2 -translate-x-1/2 z-60 bg-card border border-card-border rounded-xl px-4 py-2 shadow-lg text-base text-foreground pointer-events-none animate-slide-down">{toastMessage}</div>}

      {/* ====== ZERO STOCK PROMPT — item exists but qty is 0 ====== */}
      {zeroStockItem && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-amber-500/40 bg-amber-950 p-5 shadow-2xl space-y-3">
            <p className="text-base font-semibold text-amber-200">
              {zeroStockItem.name}
            </p>
            <p className="text-sm text-amber-200/80">
              System shows 0 in stock, but you scanned it. Sell it anyway?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { addToCart(zeroStockItem); setZeroStockItem(null); setHasZeroStockOverride(true); }}
                className="flex-1 rounded-xl bg-amber-600 py-3 text-sm font-semibold text-white active:bg-amber-700 transition-colors"
              >
                Add Anyway
              </button>
              <button
                onClick={() => setZeroStockItem(null)}
                className="flex-1 rounded-xl border border-amber-500/30 bg-transparent py-3 text-sm font-medium text-amber-300 active:bg-amber-900 transition-colors"
              >
                Skip
              </button>
            </div>
            <p className="text-[11px] text-amber-200/50">
              Inventory count will go negative. Adjust stock later.
            </p>
          </div>
        </div>
      )}

      {/* ====== OVER-STOCK WARNING ====== */}
      {overStockPending && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-amber-500/40 bg-amber-950 p-5 shadow-2xl space-y-3">
            <p className="text-base font-semibold text-amber-200">
              {cart[overStockPending.index]?.name}
            </p>
            <p className="text-sm text-amber-200/80">
              System shows {overStockPending.max} in stock. Sell {overStockPending.qty} anyway?
            </p>
            <div className="flex gap-3">
              <button
                onClick={confirmOverStock}
                className="flex-1 rounded-xl bg-amber-600 py-3 text-sm font-semibold text-white active:bg-amber-700 transition-colors"
              >
                Sell {overStockPending.qty}
              </button>
              <button
                onClick={() => setOverStockPending(null)}
                className="flex-1 rounded-xl border border-amber-500/30 bg-transparent py-3 text-sm font-medium text-amber-300 active:bg-amber-900 transition-colors"
              >
                Cancel
              </button>
            </div>
            <p className="text-[11px] text-amber-200/50">
              Inventory will go negative. Reconcile stock later.
            </p>
          </div>
        </div>
      )}

      {/* ====== NOTICE BANNER (expected conditions: out of stock, insufficient credit) ====== */}
      {noticeBanner && (
        <div className="absolute top-14 left-4 right-4 z-[65] flex items-center gap-3 rounded-xl bg-amber-950 border border-amber-500/40 px-4 py-3 shadow-lg animate-slide-down">
          <span className="text-xl shrink-0">{"\u26A0\uFE0F"}</span>
          <span className="flex-1 text-sm font-medium text-amber-200">{noticeBanner}</span>
          <button onClick={() => { setNoticeBanner(null); if (noticeBannerTimerRef.current) clearTimeout(noticeBannerTimerRef.current); }} className="shrink-0 text-amber-400 hover:text-amber-200 text-lg leading-none" style={{ minHeight: "auto" }}>{"\u00D7"}</button>
        </div>
      )}

      {/* ====== ERROR BANNER (true errors: network, crashes) ====== */}
      {errorBanner && (
        <div className="absolute top-14 left-4 right-4 z-[65] flex items-center gap-3 rounded-xl bg-red-950 border border-red-500/40 px-4 py-3 shadow-lg animate-slide-down">
          <span className="flex-1 text-sm font-medium text-red-200">{errorBanner}</span>
          <button onClick={() => { setErrorBanner(null); if (errorBannerTimerRef.current) clearTimeout(errorBannerTimerRef.current); }} className="shrink-0 text-red-400 hover:text-red-200 text-lg leading-none" style={{ minHeight: "auto" }}>{"\u00D7"}</button>
        </div>
      )}

      {/* ====== ITEM ADDED CONFIRMATION ====== */}
      {itemAddedMessage && (
        <div className="absolute top-12 left-0 right-0 z-[55] flex items-center justify-center pointer-events-none">
          <div className="px-4 py-1.5 text-base font-medium text-green-400 animate-fade-out">{"\u2713"} {itemAddedMessage} added</div>
        </div>
      )}

      {/* ====== HEADER ====== */}
      <RegisterHeader
        storeName={storeName}
        staffName={staffName}
        roleLabel={roleLabel}
        isFullscreen={isFullscreen}
        scannerFlash={scannerFlash}
        scannerStatus={scannerStatus}
        lastScanCode={lastScan?.code ?? null}
        cartLength={cart.length}
        totalCents={total}
        onLogoTap={handleLogoTap}
        onExitClick={() => setShowExitConfirm(true)}
      />

      {/* ====== ACTION BAR ====== */}
      <ActionBar
        activePanel={activePanel}
        togglePanel={togglePanel}
        focusSearch={focusSearch}
        customer={customer}
        discountsLength={discounts.length}
        hasCart={hasCart}
        total={total}
        parkedCount={parkedCount}
        hasLastReceipt={!!lastReceipt}
        onPark={() => setShowParkInput(true)}
        onRecall={openRecallSheet}
        onShowLastReceipt={() => setShowLastReceipt(true)}
      />

      {/* ====== SCANNER ERROR BAR ====== */}
      {scannerErrorText && <div className="shrink-0 px-4 py-1.5 bg-red-500/10 border-b border-red-500/20 text-red-400 text-base">{scannerErrorText}</div>}

      {/* ====== MAIN CONTENT AREA ====== */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Receipt tape */}
        {!activePanel ? (
          <CartList cart={cart} discounts={discounts} subtotal={subtotal} lastAddedIndex={lastAddedIndex} editingQtyIndex={editingQtyIndex} editQtyValue={editQtyValue} onSetEditingQtyIndex={setEditingQtyIndex} onSetEditQtyValue={setEditQtyValue} onCommitQtyEdit={commitQtyEdit} onRemoveItem={removeItem} onRemoveDiscount={removeDiscount} cartEndRef={cartEndRef} />
        ) : (
          <CartList cart={cart} discounts={discounts} subtotal={subtotal} lastAddedIndex={lastAddedIndex} editingQtyIndex={editingQtyIndex} editQtyValue={editQtyValue} onSetEditingQtyIndex={setEditingQtyIndex} onSetEditQtyValue={setEditQtyValue} onCommitQtyEdit={commitQtyEdit} onRemoveItem={removeItem} onRemoveDiscount={removeDiscount} cartEndRef={cartEndRef} />
        )}

        {/* Right panel (desktop): active panel content */}
        {activePanel && activePanel !== "scan" && (
          <div className="hidden lg:block lg:w-[40%] xl:w-[38%] border-l border-card-border bg-card overflow-y-auto">
            <PanelContent {...panelProps} />
          </div>
        )}
      </div>

      {/* ====== PANEL OVERLAY (mobile) ====== */}
      {activePanel && activePanel !== "scan" && (
        <div className="lg:hidden absolute left-0 right-0 z-30 bg-card border-b border-card-border shadow-lg animate-slide-down" style={{ top: scannerErrorText ? "calc(6.5rem + 26px)" : "6.5rem", maxHeight: "50vh", overflowY: "auto" }}>
          <PanelContent {...panelProps} />
        </div>
      )}

      {/* ====== SUMMARY BAR + PAY BUTTON ====== */}
      <div className="shrink-0 border-t border-card-border bg-card">
        {hasCart && (
          <div className="px-4 py-2 space-y-0.5">
            <div className="flex justify-between text-base text-muted"><span>Subtotal</span><span className="tabular-nums font-mono text-lg">{formatCents(subtotal)}</span></div>
            {taxCents > 0 && <div className="flex justify-between text-base text-muted"><span>Tax ({taxRate}%)</span><span className="tabular-nums font-mono text-lg">{formatCents(taxCents)}</span></div>}
            {cart.length > 0 && !taxReady && <div className="flex justify-between text-base text-amber-400"><span>Tax</span><span className="text-sm animate-pulse">calculating...</span></div>}
            {discountCents > 0 && <div className="flex justify-between text-base text-amber-400"><span>Discount</span><span className="tabular-nums font-mono text-lg">-{formatCents(discountCents)}</span></div>}
            <div className="flex justify-between text-lg font-bold text-foreground pt-1 border-t border-card-border/50"><span>TOTAL</span><span className="tabular-nums font-mono">{formatCents(total)}</span></div>
          </div>
        )}

        <PaymentButtons
          hasCart={hasCart}
          total={total}
          showPaySheet={showPaySheet}
          showCashInput={showCashInput}
          showGiftCardPayment={showGiftCardPayment}
          processing={processing}
          customer={customer}
          creditAvailable={creditAvailable}
          giftCardPayCode={giftCardPayCode}
          giftCardPayLoading={giftCardPayLoading}
          giftCardPayError={giftCardPayError}
          onSetShowPaySheet={setShowPaySheet}
          onSetShowCashInput={setShowCashInput}
          onSetShowCreditConfirm={setShowCreditConfirm}
          onSetShowGiftCardPayment={setShowGiftCardPayment}
          onSetGiftCardPayCode={setGiftCardPayCode}
          onSetGiftCardPayError={setGiftCardPayError}
          onCompleteSale={handleCompleteSale}
          onGiftCardPayment={handleGiftCardPayment}
          taxReady={taxReady}
        />
      </div>

      {/* ====== ACTIVE EVENT INDICATOR ====== */}
      {activeEventName && (
        <div className="shrink-0 flex items-center justify-center gap-2 h-7 bg-purple-900/30 border-t border-purple-500/20 text-xs text-purple-300">
          <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
          Sales tagged to: <strong>{activeEventName}</strong>
        </div>
      )}

      {/* ====== STATUS BAR ====== */}
      <StatusBar
        customer={customer}
        parkedCount={parkedCount}
        activeEventName={activeEventName}
      />

      {/* ====== CASH KEYPAD ====== */}
      {showCashInput && (
        <div className="fixed inset-0 z-50 flex flex-col bg-card">
          <div className="flex items-center justify-between px-4 py-2 border-b border-card-border">
            <span className="text-lg font-bold text-foreground tabular-nums font-mono">Due: {formatCents(amountDue)}</span>
            <button onClick={() => { if (!processing) setShowCashInput(false); }} className="text-muted hover:text-foreground text-sm px-3 py-1" style={{ minHeight: "auto" }}>Back</button>
          </div>
          <div className="flex-1 min-h-0">
            <NumericKeypad value={tenderedInput} onChange={setTenderedInput} onSubmit={() => handleCompleteSale("cash")} submitLabel={processing ? "Processing..." : amountDue > 0 && tendered < amountDue ? "Insufficient" : `Done \u2014 Change ${formatCents(change)}`} submitDisabled={processing || (amountDue > 0 && tendered < amountDue)} totalCents={amountDue} changeCents={change} showChange={true} processing={processing} />
          </div>
        </div>
      )}

      {/* ====== TIP PROMPT ====== */}
      {showTipPrompt && pendingPaymentMethod && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-card/95 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 space-y-6">
            <div className="text-center">
              <div className="text-muted text-sm uppercase tracking-wide">Add a Tip?</div>
              <div className="text-3xl font-mono font-bold mt-1">{formatCents(amountDue)}</div>
            </div>
            {/* Preset buttons */}
            <div className="grid grid-cols-3 gap-3">
              {(storeSettings.tips_presets || [15, 20, 25]).map((pct: number) => {
                const tipAmt = Math.round(subtotal * pct / 100);
                return (
                  <button
                    key={pct}
                    onClick={() => {
                      setShowTipPrompt(false);
                      proceedWithSale(pendingPaymentMethod, tipAmt);
                    }}
                    className="py-4 rounded-xl bg-card-hover border border-card-border text-center hover:border-accent transition-colors"
                  >
                    <div className="text-2xl font-bold">{pct}%</div>
                    <div className="text-muted text-sm">{formatCents(tipAmt)}</div>
                  </button>
                );
              })}
            </div>
            {/* Custom tip */}
            {storeSettings.tips_allow_custom !== false && (
              <button
                onClick={() => {
                  const input = prompt("Enter tip amount ($):");
                  if (input) {
                    const cents = Math.round(parseFloat(input) * 100);
                    if (cents > 0 && !isNaN(cents)) {
                      setShowTipPrompt(false);
                      proceedWithSale(pendingPaymentMethod, cents);
                    }
                  }
                }}
                className="w-full py-3 rounded-xl border border-card-border text-muted hover:text-foreground hover:border-accent transition-colors text-sm"
              >
                Custom Amount
              </button>
            )}
            {/* Keep the change — only for cash when there IS change */}
            {pendingPaymentMethod === "cash" && tendered > amountDue && (
              <button
                onClick={() => {
                  const changeTip = tendered - amountDue;
                  setShowTipPrompt(false);
                  proceedWithSale(pendingPaymentMethod, changeTip);
                }}
                className="w-full py-3 rounded-xl bg-green-600/10 border border-green-600/30 text-green-600 hover:bg-green-600/20 transition-colors font-medium"
              >
                Keep the Change &mdash; {formatCents(tendered - amountDue)}
              </button>
            )}
            {/* No tip */}
            <button
              onClick={() => {
                setShowTipPrompt(false);
                proceedWithSale(pendingPaymentMethod, 0);
              }}
              className="w-full py-3 rounded-xl text-muted hover:text-foreground transition-colors text-sm"
            >
              No Tip
            </button>
          </div>
        </div>
      )}

      {/* ====== CHANGE DUE SCREEN ====== */}
      {showChangeDue !== null && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-card">
          <div className="text-center space-y-4">
            <div className="text-muted text-lg">Change Due</div>
            <div className="text-7xl font-mono font-bold text-green-400 tabular-nums">${(showChangeDue / 100).toFixed(2)}</div>
            {lastReceipt && <div className="text-muted text-base font-mono">Receipt #{lastReceipt.receiptNumber}</div>}
            {/* QR Code for receipt */}
            {receiptQrUrl && (
              <div className="pt-2 space-y-2">
                <div className="inline-block rounded-xl p-3" style={{ background: "#ffffff" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={receiptQrUrl} alt="Receipt QR" width={180} height={180} style={{ imageRendering: "pixelated" }} />
                </div>
                <div className="text-muted text-base">Scan for your receipt</div>
              </div>
            )}
          </div>
          {/* Receipt delivery options */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => {
                if (!lastReceipt) return;
                const w = window.open("", "_blank", "width=380,height=600");
                if (!w) return;
                w.document.write(buildPrintReceiptHtml(lastReceipt, storeName, storeSettings as unknown as Record<string, unknown>));
                w.document.close();
                w.focus();
                w.print();
              }}
              className="flex items-center gap-2 rounded-xl border border-card-border bg-card-hover px-4 text-sm font-medium text-foreground active:scale-[0.98] transition-transform"
              style={{ height: 44, touchAction: "manipulation" }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              Print
            </button>
            {lastReceipt?.receiptToken && (
              <ReceiptEmailButton receiptToken={lastReceipt.receiptToken} customerEmail={customer?.email} />
            )}
            {receiptQrUrl && lastReceipt && (
              <button onClick={() => setShowCustomerDisplay(true)} className="flex items-center gap-2 rounded-xl border border-card-border bg-card-hover px-4 text-sm font-medium text-foreground active:scale-[0.98] transition-transform" style={{ height: 44, touchAction: "manipulation" }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                Show QR
              </button>
            )}
          </div>

          <div className="mt-4">
            <button onClick={() => { setShowChangeDue(null); setCustomer(null); setReceiptQrUrl(null); }} className="rounded-xl font-bold text-white active:scale-[0.98] transition-transform select-none px-12" style={{ height: 56, fontSize: 18, backgroundColor: "#16a34a", touchAction: "manipulation" }}>Done</button>
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
                <button onClick={() => setShowLastReceipt(false)} className="text-muted hover:text-foreground" style={{ minHeight: "auto" }}>{"\u00D7"}</button>
              </div>
              <div className="text-sm text-muted">{lastReceipt.receiptNumber} &middot; {new Date(lastReceipt.timestamp).toLocaleString()}{lastReceipt.customerName && ` \u2014 ${lastReceipt.customerName}`}</div>
              <div className="border-t border-card-border pt-2 space-y-1">
                {lastReceipt.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-foreground truncate pr-2">{item.name} <span className="text-muted">x{item.quantity}</span></span>
                    <span className="tabular-nums font-mono text-foreground shrink-0">{formatCents(item.price_cents * item.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-card-border pt-2 space-y-0.5 text-sm">
                <div className="flex justify-between text-muted"><span>Subtotal</span><span className="tabular-nums font-mono">{formatCents(lastReceipt.subtotalCents)}</span></div>
                {lastReceipt.discountCents > 0 && <div className="flex justify-between text-amber-400"><span>Discount</span><span className="tabular-nums font-mono">-{formatCents(lastReceipt.discountCents)}</span></div>}
                {lastReceipt.taxCents > 0 && <div className="flex justify-between text-muted"><span>Tax</span><span className="tabular-nums font-mono">{formatCents(lastReceipt.taxCents)}</span></div>}
                <div className="flex justify-between text-sm font-bold text-foreground pt-1"><span>TOTAL</span><span className="tabular-nums font-mono">{formatCents(lastReceipt.totalCents)}</span></div>
                <div className="text-muted pt-1">Paid: {lastReceipt.paymentMethod}</div>
              </div>
              <button onClick={() => window.print()} className="w-full rounded-xl border border-card-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-card-hover transition-colors" style={{ minHeight: 44 }}>Print Receipt</button>
            </div>
          </div>
        </div>
      )}

      {/* ====== PRINTABLE RECEIPT (hidden on screen) ====== */}
      {lastReceipt && (
        <div className="print-receipt hidden">
          <div className="receipt-store-name">{storeName}</div>
          {storeSettings.receipt_header && <div className="receipt-header">{storeSettings.receipt_header}</div>}
          <div className="receipt-date">{new Date(lastReceipt.timestamp).toLocaleDateString()} {new Date(lastReceipt.timestamp).toLocaleTimeString()}</div>
          <div className="receipt-date">Receipt #{lastReceipt.receiptNumber}</div>
          {lastReceipt.customerName && <div className="receipt-customer">Customer: {lastReceipt.customerName}</div>}
          <div className="receipt-divider">{"--------------------------------"}</div>
          {lastReceipt.items.map((item, i) => (<div key={i} className="receipt-line"><span className="receipt-item-name">{item.name}</span><span className="receipt-item-detail">{item.quantity > 1 ? `  x${item.quantity}` : ""}{"  "}{formatCents(item.price_cents * item.quantity)}</span></div>))}
          <div className="receipt-divider">{"--------------------------------"}</div>
          <div className="receipt-line"><span>Subtotal</span><span>{formatCents(lastReceipt.subtotalCents)}</span></div>
          {lastReceipt.discountCents > 0 && <div className="receipt-line"><span>Discount</span><span>-{formatCents(lastReceipt.discountCents)}</span></div>}
          {lastReceipt.taxCents > 0 && <div className="receipt-line"><span>Tax ({taxRate}%)</span><span>{formatCents(lastReceipt.taxCents)}</span></div>}
          <div className="receipt-divider">{"================================"}</div>
          <div className="receipt-line receipt-total"><span>TOTAL</span><span>{formatCents(lastReceipt.totalCents)}</span></div>
          <div className="receipt-line"><span>Paid</span><span>{lastReceipt.paymentMethod.toUpperCase()}</span></div>
          <div className="receipt-divider">{"--------------------------------"}</div>
          <div className="receipt-footer">{storeSettings.receipt_footer || "Thank you for shopping with us!"}</div>
          <div className="receipt-barcode">{"||||| |||| ||||| |||| |||||"}</div>
        </div>
      )}

      {/* ====== PRINTABLE RECEIPT FOR ORDER LOOKUP ====== */}
      {orderLookupReceipt && (
        <div className="print-receipt hidden">
          <div className="receipt-store-name">{orderLookupReceipt.store_name}</div>
          {storeSettings.receipt_header && <div className="receipt-header">{storeSettings.receipt_header}</div>}
          <div className="receipt-date">{orderLookupReceipt.date_formatted}</div>
          <div className="receipt-date">{orderLookupReceipt.receipt_number}</div>
          {orderLookupReceipt.staff_name && <div className="receipt-customer">Cashier: {orderLookupReceipt.staff_name}</div>}
          {orderLookupReceipt.customer_name && <div className="receipt-customer">Customer: {orderLookupReceipt.customer_name}</div>}
          <div className="receipt-divider">{"--------------------------------"}</div>
          {orderLookupReceipt.items.map((item, i) => (<div key={i} className="receipt-line"><span className="receipt-item-name">{item.name}</span><span className="receipt-item-detail">{item.quantity > 1 ? `  x${item.quantity}` : ""}{"  "}{formatCents(item.total_cents)}</span></div>))}
          <div className="receipt-divider">{"--------------------------------"}</div>
          <div className="receipt-line"><span>Subtotal</span><span>{formatCents(orderLookupReceipt.subtotal_cents)}</span></div>
          {orderLookupReceipt.discount_cents > 0 && <div className="receipt-line"><span>Discount</span><span>-{formatCents(orderLookupReceipt.discount_cents)}</span></div>}
          {orderLookupReceipt.tax_cents > 0 && <div className="receipt-line"><span>Tax</span><span>{formatCents(orderLookupReceipt.tax_cents)}</span></div>}
          {orderLookupReceipt.credit_applied_cents > 0 && <div className="receipt-line"><span>Store Credit</span><span>-{formatCents(orderLookupReceipt.credit_applied_cents)}</span></div>}
          {orderLookupReceipt.gift_card_applied_cents > 0 && <div className="receipt-line"><span>Gift Card</span><span>-{formatCents(orderLookupReceipt.gift_card_applied_cents)}</span></div>}
          {orderLookupReceipt.loyalty_discount_cents > 0 && <div className="receipt-line"><span>Loyalty</span><span>-{formatCents(orderLookupReceipt.loyalty_discount_cents)}</span></div>}
          <div className="receipt-divider">{"================================"}</div>
          <div className="receipt-line receipt-total"><span>TOTAL</span><span>{formatCents(orderLookupReceipt.total_cents)}</span></div>
          <div className="receipt-line"><span>Paid</span><span>{orderLookupReceipt.payment_method.toUpperCase()}</span></div>
          {orderLookupReceipt.change_cents > 0 && <div className="receipt-line"><span>Change</span><span>{formatCents(orderLookupReceipt.change_cents)}</span></div>}
          <div className="receipt-divider">{"--------------------------------"}</div>
          <div className="receipt-footer">{orderLookupReceipt.receipt_footer}</div>
          <div className="receipt-footer">*** REPRINT ***</div>
        </div>
      )}

      {/* ====== PARK INPUT MODAL ====== */}
      {showParkInput && (
        <div className="absolute inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setShowParkInput(false); setParkLabel(""); }} />
          <div className="relative bg-card rounded-2xl border border-card-border w-full max-w-sm mx-4">
            <div className="p-5 space-y-4">
              <div className="text-base font-bold text-foreground">Park Cart</div>
              <p className="text-sm text-muted">Save this cart ({cartItemCount} item{cartItemCount !== 1 ? "s" : ""}, {formatCents(total)}) and start a new transaction.</p>
              <input type="text" value={parkLabel} onChange={(e) => setParkLabel(e.target.value)} placeholder={`Cart #${getParkedCartCount() + 1}`} autoFocus onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") handleParkCart(parkLabel || undefined); }} className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-2.5 text-foreground placeholder:text-muted focus:border-accent focus:outline-none" style={{ fontSize: 16 }} />
              <div className="flex gap-2">
                <button onClick={() => { setShowParkInput(false); setParkLabel(""); }} className="flex-1 rounded-xl border border-card-border px-4 py-2.5 text-sm font-medium text-muted hover:text-foreground hover:bg-card-hover transition-colors" style={{ minHeight: 44 }}>Cancel</button>
                <button onClick={() => handleParkCart(parkLabel || undefined)} className="flex-1 rounded-xl font-medium text-white transition-colors" style={{ height: 44, backgroundColor: "var(--accent)", minHeight: 44 }}>Park</button>
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
              {cartItemCount > 0 && (
                <p className="text-sm text-muted">You have {cartItemCount} item{cartItemCount !== 1 ? "s" : ""} ({formatCents(total)}) in your cart.</p>
              )}
              <div className="flex flex-col gap-2">
                {cartItemCount > 0 && (
                  <>
                    <button onClick={() => { handleParkCart(); setShowExitConfirm(false); setMode("dashboard"); router.push("/dashboard"); }} className="w-full rounded-xl font-medium text-white transition-colors" style={{ height: 44, backgroundColor: "var(--accent)", minHeight: 44 }}>Park Cart & Exit</button>
                    <button onClick={() => { setCart([]); setDiscounts([]); setCustomer(null); clearPersistedCart(); cartIdRef.current = createEmptyCart().id; setShowExitConfirm(false); setHasZeroStockOverride(false); setMode("dashboard"); router.push("/dashboard"); }} className="w-full rounded-xl border border-card-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-card-hover transition-colors" style={{ minHeight: 44 }}>Clear Cart & Exit</button>
                  </>
                )}
                {cartItemCount === 0 && (
                  <button onClick={() => { setMode("dashboard"); setShowExitConfirm(false); router.push("/dashboard"); }} className="w-full rounded-xl font-medium text-white transition-colors" style={{ height: 44, backgroundColor: "var(--accent)", minHeight: 44 }}>Go to Dashboard</button>
                )}
                <button onClick={() => { signOut({ callbackUrl: "/login" }); }} className="w-full rounded-xl border border-red-500/30 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors" style={{ minHeight: 44 }}>Sign Out</button>
                <button onClick={() => setShowExitConfirm(false)} className="w-full rounded-xl border border-card-border px-4 py-2.5 text-sm font-medium text-muted hover:text-foreground hover:bg-card-hover transition-colors" style={{ minHeight: 44 }}>Cancel</button>
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
                <button onClick={() => { setShowRecallSheet(false); setParkConflictCart(null); }} className="text-muted hover:text-foreground" style={{ minHeight: "auto" }}>{"\u00D7"}</button>
              </div>
              {parkConflictCart && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                  <p className="text-sm text-foreground">You have items in your current cart. What would you like to do?</p>
                  <div className="flex gap-2">
                    <button onClick={() => { handleParkCart(); setTimeout(() => doRecall(parkConflictCart.parkId), 50); }} className="flex-1 rounded-xl border border-card-border px-3 py-2 text-sm font-medium text-foreground hover:bg-card-hover transition-colors" style={{ minHeight: 40 }}>Park current first</button>
                    <button onClick={() => doRecall(parkConflictCart.parkId)} className="flex-1 rounded-xl border border-red-500/30 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors" style={{ minHeight: 40 }}>Replace</button>
                  </div>
                </div>
              )}
              {parkedCarts.length === 0 ? (
                <div className="flex items-center justify-center h-24 text-muted text-sm">No parked carts</div>
              ) : (
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {parkedCarts.map((pc) => {
                    const ago = getTimeAgo(pc.parkedAt);
                    return (
                      <div key={pc.parkId} className="flex items-center gap-2">
                        <button onClick={() => handleRecallCart(pc)} className="flex-1 flex items-center justify-between rounded-xl px-4 py-3 text-left bg-card-hover hover:bg-accent-light active:bg-accent-light transition-colors border border-card-border" style={{ minHeight: 52 }}>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-foreground truncate">{pc.label}</div>
                            <div className="text-sm text-muted">{pc.itemCount} item{pc.itemCount !== 1 ? "s" : ""}{" \u00B7 "}{formatCents(pc.totalCents)}{" \u00B7 "}{ago}{pc.customer && ` \u00B7 ${pc.customer.name}`}</div>
                          </div>
                          <svg className="w-4 h-4 text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                        </button>
                        <button onClick={() => handleDeleteParked(pc.parkId)} className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Delete" style={{ minHeight: "auto" }}>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
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
      {activePanel === "scan" && <BarcodeScanner onScan={(code) => handleBarcodeScan(code)} onClose={() => setActivePanel(null)} title="Scan Barcode" />}

      {/* ====== BARCODE LEARN MODAL ====== */}
      {learnBarcode && (
        <BarcodeLearnModal barcode={learnBarcode} onClose={() => setLearnBarcode(null)} onItemCreated={(item, addToCartFlag) => { if (addToCartFlag) addToCart(item); showItemAdded(`${item.name} added to inventory`); }} onBarcodeAssigned={(item) => { showItemAdded(`Barcode assigned to ${item.name}`); }} />
      )}
    </div>
  );
}
