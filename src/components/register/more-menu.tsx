"use client";

import { useEffect, useRef, useState } from "react";
import { formatCents, parseDollars } from "@/lib/types";
import type { InventoryItem, Customer } from "@/lib/types";

type ActivePanel = "search" | "scan" | "customer" | "quick" | "manual" | "discount" | "more" | "price_check" | "store_credit" | "returns" | "loyalty" | "gift_card" | "no_sale" | "flag_issue" | "void_last" | "order_lookup" | null;

interface TransactionEntry {
  id: string;
  type: string;
  amount_cents: number;
  credit_amount_cents: number;
  description: string | null;
  customer_name: string | null;
  customer_id: string | null;
  customer_email: string | null;
  staff_name: string | null;
  payment_method: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

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

interface MoreMenuProps {
  activePanel: ActivePanel;
  setActivePanel: (panel: ActivePanel) => void;
  customer: Customer | null;
  setCustomer: (c: Customer | null) => void;
  effectiveRole: string | null;
  cart: Array<{ inventory_item_id: string | null; name: string; category: string; price_cents: number; quantity: number; max_quantity: number }>;
  storeSettings: { loyalty_enabled: boolean; loyalty_redeem_points_per_dollar: number; loyalty_min_redeem_points: number; receipt_header?: string; receipt_footer?: string };
  setToastMessage: (msg: string) => void;
  showError: (msg: string) => void;
  setManualName: (v: string) => void;
  setManualPrice: (v: string) => void;
  setShowGiftCardPayment: (v: boolean) => void;
  setShowPaySheet: (v: boolean) => void;
  /** Exposes the order lookup receipt for printing (hidden receipt div in page.tsx) */
  orderLookupReceipt: ReceiptData | null;
  setOrderLookupReceipt: (r: ReceiptData | null) => void;
}

export function MoreMenu({
  activePanel,
  setActivePanel,
  customer,
  setCustomer,
  effectiveRole,
  cart,
  storeSettings,
  setToastMessage,
  showError,
  setManualName,
  setManualPrice,
  setShowGiftCardPayment,
  setShowPaySheet,
  orderLookupReceipt,
  setOrderLookupReceipt,
}: MoreMenuProps) {
  // Scroll focused input into view when keyboard opens (Android tablet fix)
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleFocus(e: FocusEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") {
        setTimeout(() => {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 300);
      }
    }
    const el = menuRef.current;
    if (el) {
      el.addEventListener("focusin", handleFocus);
      return () => el.removeEventListener("focusin", handleFocus);
    }
  }, []);

  // ---- Gift Card Sale ----
  const [gcSellMode, setGcSellMode] = useState(false);
  const [gcSellAmount, setGcSellAmount] = useState("");

  // ---- Price Check ----
  const [priceCheckQuery, setPriceCheckQuery] = useState("");
  const [priceCheckResults, setPriceCheckResults] = useState<InventoryItem[]>([]);
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

  // ---- Store Credit ----
  const [creditCustomer, setCreditCustomer] = useState<Customer | null>(null);
  const [creditCustomerQuery, setCreditCustomerQuery] = useState("");
  const [creditCustomerResults, setCreditCustomerResults] = useState<Customer[]>([]);
  const [creditCustomerDetail, setCreditCustomerDetail] = useState<{ credit_balance_cents: number; ledger_entries: Array<{ id: string; type: string; amount_cents: number; description: string | null; created_at: string }> } | null>(null);
  const [creditIssueAmount, setCreditIssueAmount] = useState("");
  const [creditIssueReason, setCreditIssueReason] = useState("");
  const [creditIssuing, setCreditIssuing] = useState(false);
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

  // ---- Gift Card ----
  const [giftCardCode, setGiftCardCode] = useState("");
  const [giftCardResult, setGiftCardResult] = useState<{ balance_cents: number; code: string; active: boolean } | null>(null);
  const [giftCardError, setGiftCardError] = useState<string | null>(null);
  const [giftCardLoading, setGiftCardLoading] = useState(false);

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
  const [flagType, setFlagType] = useState("wrong_price");
  const [flagNotes, setFlagNotes] = useState("");
  const [flagSubmitting, setFlagSubmitting] = useState(false);

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
  const [voidTransaction, setVoidTransaction] = useState<{ id: string; amount_cents: number; created_at: string; description: string | null; metadata: Record<string, unknown> } | null>(null);
  const [voidLoading, setVoidLoading] = useState(false);
  const [voidProcessing, setVoidProcessing] = useState(false);

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

  // ---- Loyalty ----
  const [loyaltyCustomer, setLoyaltyCustomer] = useState<{ id: string; name: string; loyalty_points: number; loyalty_entries: Array<{ id: string; type: string; points: number; description: string | null; created_at: string }> } | null>(null);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);

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
        setToastMessage("Drawer opened \u2014 No Sale");
        setActivePanel(null);
      } else {
        showError("Failed to open drawer");
      }
    } catch {
      showError("Failed to open drawer");
    }
  }

  // ---- Returns ----
  const [returnSearchQuery, setReturnSearchQuery] = useState("");
  const [returnSales, setReturnSales] = useState<Array<{ id: string; created_at: string; customer_name: string; amount_cents: number; payment_method: string; items: Array<{ inventory_item_id: string; name: string; category: string | null; quantity: number; price_cents: number; max_returnable: number }> }>>([]);
  const [returnSalesLoading, setReturnSalesLoading] = useState(false);
  const [returnSelectedSale, setReturnSelectedSale] = useState<typeof returnSales[0] | null>(null);
  const [returnSelectedItems, setReturnSelectedItems] = useState<Array<{ inventory_item_id: string; name: string; price_cents: number; quantity: number; selected: boolean }>>([]);
  const [returnRefundMethod, setReturnRefundMethod] = useState<"cash" | "store_credit">("cash");
  const [returnProcessing, setReturnProcessing] = useState(false);
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

  // ---- Order Lookup ----
  const [orderLookupQuery, setOrderLookupQuery] = useState("");
  const [orderLookupResults, setOrderLookupResults] = useState<TransactionEntry[]>([]);
  const [orderLookupLoading, setOrderLookupLoading] = useState(false);
  const [orderLookupTotal, setOrderLookupTotal] = useState(0);
  const [orderLookupOffset, setOrderLookupOffset] = useState(0);
  const [orderLookupReceiptLoading, setOrderLookupReceiptLoading] = useState(false);
  const orderLookupDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  async function loadOrderLookup(query?: string, loadOffset = 0) {
    setOrderLookupLoading(true);
    setOrderLookupReceipt(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const params = new URLSearchParams({ limit: "20", offset: String(loadOffset) });
      if (query?.trim()) {
        params.set("q", query.trim());
      } else {
        params.set("date", today);
      }
      const res = await fetch(`/api/transactions?${params.toString()}`);
      const data = await res.json();
      if (loadOffset > 0) {
        setOrderLookupResults((prev) => [...prev, ...(data.transactions ?? [])]);
      } else {
        setOrderLookupResults(data.transactions ?? []);
      }
      setOrderLookupTotal(data.total ?? 0);
      setOrderLookupOffset(loadOffset + (data.transactions?.length ?? 0));
    } catch {
      if (loadOffset === 0) setOrderLookupResults([]);
    } finally {
      setOrderLookupLoading(false);
    }
  }

  async function loadOrderReceipt(transactionId: string) {
    setOrderLookupReceiptLoading(true);
    try {
      const res = await fetch(`/api/transactions/${transactionId}/receipt`);
      if (res.ok) {
        const data = await res.json();
        setOrderLookupReceipt(data);
      }
    } catch {
      // ignore
    } finally {
      setOrderLookupReceiptLoading(false);
    }
  }

  function handleOrderLookupSearch(value: string) {
    setOrderLookupQuery(value);
    if (orderLookupDebounceRef.current) clearTimeout(orderLookupDebounceRef.current);
    orderLookupDebounceRef.current = setTimeout(() => {
      loadOrderLookup(value, 0);
    }, 400);
  }

  // ---- Render ----
  const content = (() => { switch (activePanel) {
    /* ============ MORE MENU ============ */
    case "more":
      return (
        <div className="p-3 space-y-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-muted uppercase tracking-wider">More Actions</span>
            <button onClick={() => setActivePanel(null)} className="text-muted hover:text-foreground" style={{ minHeight: "auto" }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          {[
            { panel: "order_lookup" as ActivePanel, icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>, label: "Order Lookup" },
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
                  if (item.panel === "order_lookup") loadOrderLookup();
                  if (item.panel === "store_credit" && customer) {
                    setCreditCustomer(null);
                  }
                }
              }}
              className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left text-foreground hover:bg-card-hover active:bg-accent-light transition-colors"
              style={{ minHeight: 48 }}
            >
              <span className="shrink-0 text-muted">{item.icon}</span>
              <span className="text-lg font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      );

    /* ============ PRICE CHECK ============ */
    case "price_check":
      return (
        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <button onClick={() => setActivePanel("more")} className="text-sm text-muted hover:text-foreground" style={{ minHeight: "auto" }}>
              <svg className="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              Back
            </button>
            <span className="text-sm font-semibold text-muted uppercase tracking-wider">Price Check</span>
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
            style={{ height: 48, fontSize: 18 }}
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
                      <div className="text-lg font-medium text-foreground">{item.name}</div>
                      <div className="text-base text-muted mt-0.5">
                        {item.category}
                        {item.barcode && <span className="ml-2 font-mono">{item.barcode}</span>}
                      </div>
                    </div>
                    <div className="text-right ml-3">
                      <div className="text-lg font-bold text-foreground tabular-nums font-mono">{formatCents(item.price_cents)}</div>
                      {effectiveRole !== "cashier" && (
                        <div className="text-base text-muted tabular-nums font-mono">Cost: {formatCents(item.cost_cents)}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-base">
                    <span className={`font-medium ${item.quantity > 0 ? "text-green-400" : "text-red-400"}`}>
                      {item.quantity > 0 ? `${item.quantity} in stock` : "Out of stock"}
                    </span>
                    {item.sku && <span className="text-muted">SKU: {item.sku}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : priceCheckQuery.trim() ? (
            <div className="flex items-center justify-center h-20 text-muted text-lg">No products found</div>
          ) : (
            <div className="flex items-center justify-center h-20 text-muted text-lg">Search for a product to check price</div>
          )}
        </div>
      );

    /* ============ STORE CREDIT ============ */
    case "store_credit": {
      const creditTarget = customer || creditCustomer;
      return (
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <button onClick={() => { setActivePanel("more"); setCreditCustomer(null); setCreditCustomerDetail(null); }} className="text-sm text-muted hover:text-foreground" style={{ minHeight: "auto" }}>
              <svg className="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              Back
            </button>
            <span className="text-sm font-semibold text-muted uppercase tracking-wider">Store Credit</span>
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
                      <div className="text-lg font-medium text-foreground">{c.name}</div>
                      {c.email && <div className="text-base text-muted">{c.email}</div>}
                    </div>
                    <div className="text-lg font-medium text-accent tabular-nums font-mono">
                      {formatCents(c.credit_balance_cents)}
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-card-border bg-card-hover p-4">
                <div className="text-lg font-medium text-foreground">{creditTarget.name}</div>
                <div className="text-3xl font-bold text-accent tabular-nums font-mono mt-2">
                  {formatCents(creditCustomerDetail?.credit_balance_cents ?? creditTarget.credit_balance_cents)}
                </div>
                <div className="text-sm text-muted mt-1">Available Store Credit</div>
                {cart.length > 0 && (creditCustomerDetail?.credit_balance_cents ?? creditTarget.credit_balance_cents) > 0 && (
                  <div className="text-sm text-accent mt-2">Credit available as payment at checkout</div>
                )}
              </div>

              {/* Issue Credit */}
              <div className="rounded-xl border border-card-border bg-card p-4 space-y-2">
                <div className="text-sm font-semibold text-muted uppercase tracking-wider">Issue Credit</div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={creditIssueAmount}
                    onChange={(e) => setCreditIssueAmount(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder="Amount (e.g. 10.00)"
                    className="flex-1 rounded-xl border border-input-border bg-input-bg px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none font-mono"
                    style={{ fontSize: 18 }}
                  />
                </div>
                <input
                  type="text"
                  value={creditIssueReason}
                  onChange={(e) => setCreditIssueReason(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="Reason (optional)"
                  className="w-full rounded-xl border border-input-border bg-input-bg px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  style={{ fontSize: 18 }}
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
                  <div className="text-sm font-semibold text-muted uppercase tracking-wider">Recent Activity</div>
                  {creditCustomerDetail.ledger_entries.map((e) => (
                    <div key={e.id} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm bg-card-hover">
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
            <button onClick={() => { setActivePanel("more"); setReturnSelectedSale(null); setReturnSelectedItems([]); setReturnSearchQuery(""); setReturnSales([]); }} className="text-sm text-muted hover:text-foreground" style={{ minHeight: "auto" }}>
              <svg className="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              Back
            </button>
            <span className="text-sm font-semibold text-muted uppercase tracking-wider">Process Return</span>
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
              {returnSalesLoading && <div className="text-sm text-muted">Searching...</div>}
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
                        <span className="text-lg font-medium text-foreground">{sale.customer_name}</span>
                        <span className="text-lg tabular-nums font-mono text-foreground">{formatCents(sale.amount_cents)}</span>
                      </div>
                      <div className="text-sm text-muted mt-0.5">
                        {new Date(sale.created_at).toLocaleDateString()} {new Date(sale.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        <span className="ml-2">{sale.items.map(i => i.name).join(", ")}</span>
                      </div>
                      {!hasReturnable && <div className="text-sm text-red-400 mt-0.5">All items already returned</div>}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="text-base text-muted">
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
                      <div className="text-lg text-foreground truncate">{item.name}</div>
                    </div>
                    <span className="text-lg font-mono tabular-nums text-foreground">{formatCents(item.price_cents)}</span>
                  </div>
                ))}
              </div>

              {/* Refund method */}
              <div className="flex gap-1 bg-card-hover rounded-xl p-1">
                {(["cash", "store_credit"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setReturnRefundMethod(m)}
                    className={`flex-1 rounded-lg py-2 text-lg font-medium transition-colors ${returnRefundMethod === m ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
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
                    <span className="text-lg text-muted">
                      {sel.length} item{sel.length !== 1 ? "s" : ""}: {formatCents(refundTotal)}
                    </span>
                    <button
                      onClick={processInlineReturn}
                      disabled={returnProcessing || sel.length === 0}
                      className="rounded-xl px-6 py-2 text-lg font-medium text-white disabled:opacity-30 transition-colors"
                      style={{ backgroundColor: "#16a34a" }}
                    >
                      {returnProcessing ? "Processing..." : "Process Return"}
                    </button>
                  </div>
                );
              })()}

              <button
                onClick={() => { setReturnSelectedSale(null); setReturnSelectedItems([]); }}
                className="text-sm text-muted hover:text-foreground"
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
            <button onClick={() => setActivePanel("more")} className="text-sm text-muted hover:text-foreground" style={{ minHeight: "auto" }}>
              <svg className="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              Back
            </button>
            <span className="text-sm font-semibold text-muted uppercase tracking-wider">Loyalty Points</span>
          </div>

          {!customer ? (
            <div className="text-center py-8 text-lg text-muted">
              Attach a customer first to view loyalty points
            </div>
          ) : loyaltyLoading ? (
            <div className="text-center py-8 text-sm text-muted">Loading...</div>
          ) : loyaltyCustomer ? (
            <>
              <div className="rounded-xl border border-card-border bg-card-hover p-4 text-center">
                <div className="text-base text-muted">{loyaltyCustomer.name}</div>
                <div className="text-4xl font-bold text-accent mt-1">{loyaltyCustomer.loyalty_points.toLocaleString()}</div>
                <div className="text-sm text-muted mt-1">Loyalty Points</div>
                {storeSettings.loyalty_enabled && storeSettings.loyalty_redeem_points_per_dollar > 0 && (
                  <div className="text-sm text-foreground/60 mt-2">
                    {storeSettings.loyalty_redeem_points_per_dollar} pts = $1.00 off
                    {loyaltyCustomer.loyalty_points >= storeSettings.loyalty_min_redeem_points && (
                      <span className="ml-1 text-green-400">(Eligible to redeem)</span>
                    )}
                  </div>
                )}
              </div>

              {loyaltyCustomer.loyalty_entries.length > 0 && (
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-muted uppercase tracking-wider">Recent Activity</div>
                  {loyaltyCustomer.loyalty_entries.map((e) => (
                    <div key={e.id} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm bg-card-hover">
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
            <button onClick={() => { setActivePanel("more"); setGiftCardResult(null); setGiftCardError(null); setGiftCardCode(""); }} className="text-sm text-muted hover:text-foreground" style={{ minHeight: "auto" }}>
              <svg className="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              Back
            </button>
            <span className="text-sm font-semibold text-muted uppercase tracking-wider">Gift Card</span>
          </div>

          <div className="rounded-xl border border-card-border bg-card p-4 space-y-3">
            <div className="text-sm font-semibold text-muted uppercase tracking-wider">Check Balance</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={giftCardCode}
                onChange={(e) => { setGiftCardCode(e.target.value.toUpperCase()); setGiftCardError(null); }}
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
                <div className="text-sm text-muted font-mono">{giftCardResult.code}</div>
                <div className="text-3xl font-bold text-accent tabular-nums font-mono mt-1">
                  {formatCents(giftCardResult.balance_cents)}
                </div>
                <div className="text-sm mt-1">
                  <span className={giftCardResult.active ? "text-green-400" : "text-red-400"}>
                    {giftCardResult.active ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Sell Gift Card — adds to cart, created on checkout */}
          <div className="rounded-xl border border-card-border bg-card p-4 space-y-3">
            <div className="text-sm font-semibold text-muted uppercase tracking-wider">Sell Gift Card</div>
            {gcSellMode ? (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-2">
                  {[10, 25, 50, 100].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => {
                        setManualName(`Gift Card — $${amt}`);
                        setManualPrice(String(amt));
                        setActivePanel("manual");
                        setGcSellMode(false);
                        setGcSellAmount("");
                      }}
                      className="rounded-xl py-3 text-center font-semibold transition-colors border border-card-border hover:border-accent hover:bg-accent/10 text-foreground"
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-lg">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={gcSellAmount}
                      onChange={(e) => setGcSellAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter" && gcSellAmount && parseDollars(gcSellAmount) >= 100) {
                          setManualName(`Gift Card — $${gcSellAmount}`);
                          setManualPrice(gcSellAmount);
                          setActivePanel("manual");
                          setGcSellMode(false);
                          setGcSellAmount("");
                        }
                      }}
                      placeholder="Custom amount"
                      autoFocus
                      className="w-full rounded-xl border border-input-border bg-input-bg pl-8 pr-4 py-2.5 text-foreground placeholder:text-muted focus:border-accent focus:outline-none text-lg font-mono"
                    />
                  </div>
                  <button
                    onClick={() => {
                      if (gcSellAmount && parseDollars(gcSellAmount) >= 100) {
                        setManualName(`Gift Card — $${gcSellAmount}`);
                        setManualPrice(gcSellAmount);
                        setActivePanel("manual");
                        setGcSellMode(false);
                        setGcSellAmount("");
                      }
                    }}
                    disabled={!gcSellAmount || parseDollars(gcSellAmount) < 100}
                    className="shrink-0 rounded-xl px-5 font-semibold text-white disabled:opacity-30 transition-colors"
                    style={{ height: 44, backgroundColor: "#16a34a" }}
                  >
                    Add to Cart
                  </button>
                </div>
                <button
                  onClick={() => { setGcSellMode(false); setGcSellAmount(""); }}
                  className="w-full text-sm text-muted hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setGcSellMode(true)}
                className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left border border-card-border hover:bg-card-hover transition-colors"
                style={{ minHeight: 44 }}
              >
                <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                <span className="text-lg text-foreground">Sell New Gift Card</span>
              </button>
            )}
          </div>

          {/* Redeem as payment */}
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
              <span className="text-lg text-accent font-medium">Redeem as Payment</span>
            </button>
          )}
        </div>
      );

    /* ============ FLAG ISSUE ============ */
    case "flag_issue":
      return (
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <button onClick={() => setActivePanel("more")} className="text-sm text-muted hover:text-foreground" style={{ minHeight: "auto" }}>
              <svg className="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              Back
            </button>
            <span className="text-sm font-semibold text-muted uppercase tracking-wider">Flag Issue</span>
          </div>

          <select
            value={flagType}
            onChange={(e) => setFlagType(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-2.5 text-foreground focus:border-accent focus:outline-none"
            style={{ fontSize: 18 }}
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
            style={{ fontSize: 18 }}
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
            <button onClick={() => setActivePanel("more")} className="text-sm text-muted hover:text-foreground" style={{ minHeight: "auto" }}>
              <svg className="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              Back
            </button>
            <span className="text-sm font-semibold text-muted uppercase tracking-wider">Void Last Transaction</span>
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
                <div className="text-lg font-medium text-foreground">
                  {voidTransaction.description || "Sale"}
                </div>
                <div className="text-2xl font-bold text-red-400 tabular-nums font-mono">
                  {formatCents(voidTransaction.amount_cents)}
                </div>
                <div className="text-sm text-muted">
                  {new Date(voidTransaction.created_at).toLocaleString()}
                </div>
                {(() => {
                  const meta = voidTransaction.metadata ?? {};
                  const items = (meta.items as Array<{ name?: string; quantity?: number }>) ?? [];
                  if (items.length === 0) return null;
                  return (
                    <div className="text-sm text-muted border-t border-card-border pt-2 mt-2">
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

              <div className="text-sm text-muted text-center">
                This will reverse the sale and restore inventory
              </div>
            </>
          )}
        </div>
      );

    /* ============ ORDER LOOKUP ============ */
    case "order_lookup":
      return (
        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <button onClick={() => { setActivePanel("more"); setOrderLookupReceipt(null); setOrderLookupQuery(""); }} className="text-sm text-muted hover:text-foreground" style={{ minHeight: "auto" }}>
              <svg className="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              Back
            </button>
            <span className="text-sm font-semibold text-muted uppercase tracking-wider">Order Lookup</span>
            <button onClick={() => setActivePanel(null)} className="text-muted hover:text-foreground" style={{ minHeight: "auto" }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Receipt detail view */}
          {orderLookupReceipt ? (
            <div className="space-y-3">
              <button
                onClick={() => setOrderLookupReceipt(null)}
                className="text-sm text-accent hover:underline flex items-center gap-1"
                style={{ minHeight: "auto" }}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                Back to List
              </button>

              <div className="rounded-xl border border-card-border bg-card p-4 space-y-3">
                <div className="text-center space-y-1">
                  <div className="text-lg font-bold text-foreground">{orderLookupReceipt.store_name}</div>
                  <div className="text-sm text-muted">{orderLookupReceipt.date_formatted}</div>
                  <div className="text-sm text-muted font-mono">{orderLookupReceipt.receipt_number}</div>
                </div>

                {orderLookupReceipt.staff_name && (
                  <div className="text-sm text-muted">Cashier: {orderLookupReceipt.staff_name}</div>
                )}
                {orderLookupReceipt.customer_name && (
                  <div className="text-sm text-muted">Customer: {orderLookupReceipt.customer_name}</div>
                )}

                <div className="border-t border-card-border pt-2 space-y-1">
                  {orderLookupReceipt.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-foreground min-w-0 flex-1">
                        {item.name}
                        {item.quantity > 1 && <span className="text-muted ml-1">x{item.quantity}</span>}
                      </span>
                      <span className="text-foreground tabular-nums font-mono ml-2">{formatCents(item.total_cents)}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-card-border pt-2 space-y-1">
                  <div className="flex justify-between text-sm text-muted">
                    <span>Subtotal</span>
                    <span className="tabular-nums font-mono">{formatCents(orderLookupReceipt.subtotal_cents)}</span>
                  </div>
                  {orderLookupReceipt.discount_cents > 0 && (
                    <div className="flex justify-between text-sm text-amber-400">
                      <span>Discount</span>
                      <span className="tabular-nums font-mono">-{formatCents(orderLookupReceipt.discount_cents)}</span>
                    </div>
                  )}
                  {orderLookupReceipt.tax_cents > 0 && (
                    <div className="flex justify-between text-sm text-muted">
                      <span>Tax</span>
                      <span className="tabular-nums font-mono">{formatCents(orderLookupReceipt.tax_cents)}</span>
                    </div>
                  )}
                  {orderLookupReceipt.credit_applied_cents > 0 && (
                    <div className="flex justify-between text-sm text-blue-400">
                      <span>Store Credit</span>
                      <span className="tabular-nums font-mono">-{formatCents(orderLookupReceipt.credit_applied_cents)}</span>
                    </div>
                  )}
                  {orderLookupReceipt.gift_card_applied_cents > 0 && (
                    <div className="flex justify-between text-sm text-purple-400">
                      <span>Gift Card</span>
                      <span className="tabular-nums font-mono">-{formatCents(orderLookupReceipt.gift_card_applied_cents)}</span>
                    </div>
                  )}
                  {orderLookupReceipt.loyalty_discount_cents > 0 && (
                    <div className="flex justify-between text-sm text-yellow-400">
                      <span>Loyalty Discount</span>
                      <span className="tabular-nums font-mono">-{formatCents(orderLookupReceipt.loyalty_discount_cents)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold text-foreground pt-1">
                    <span>TOTAL</span>
                    <span className="tabular-nums font-mono">{formatCents(orderLookupReceipt.total_cents)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted">
                    <span>Paid</span>
                    <span className="uppercase">{orderLookupReceipt.payment_method}</span>
                  </div>
                  {orderLookupReceipt.change_cents > 0 && (
                    <div className="flex justify-between text-sm text-muted">
                      <span>Change</span>
                      <span className="tabular-nums font-mono">{formatCents(orderLookupReceipt.change_cents)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex-1 rounded-xl border border-card-border px-3 py-2.5 text-sm font-medium text-foreground hover:bg-card-hover transition-colors"
                  style={{ minHeight: 44 }}
                >
                  Print
                </button>
                {orderLookupReceipt.customer_email && (
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/receipts/email", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ ledger_entry_id: orderLookupReceipt.transaction_id }),
                        });
                        if (res.ok) {
                          setToastMessage("Receipt emailed!");
                        } else {
                          setToastMessage("Failed to email receipt");
                        }
                      } catch {
                        setToastMessage("Failed to email receipt");
                      }
                    }}
                    className="flex-1 rounded-xl border border-card-border px-3 py-2.5 text-sm font-medium text-foreground hover:bg-card-hover transition-colors"
                    style={{ minHeight: 44 }}
                  >
                    Email
                  </button>
                )}
                <button
                  onClick={() => setOrderLookupReceipt(null)}
                  className="flex-1 rounded-xl border border-card-border px-3 py-2.5 text-sm font-medium text-muted hover:text-foreground hover:bg-card-hover transition-colors"
                  style={{ minHeight: 44 }}
                >
                  Back to List
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Search input */}
              <input
                type="search"
                inputMode="search"
                value={orderLookupQuery}
                onChange={(e) => handleOrderLookupSearch(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="Search by name, amount, date..."
                autoFocus
                className="w-full rounded-xl border border-input-border bg-input-bg px-4 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                style={{ height: 48, fontSize: 18 }}
              />

              {orderLookupLoading && orderLookupResults.length === 0 ? (
                <div className="flex items-center justify-center h-24 text-muted text-sm">
                  <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Loading transactions...
                </div>
              ) : orderLookupResults.length === 0 ? (
                <div className="flex items-center justify-center h-24 text-muted text-sm">
                  {orderLookupQuery.trim() ? "No transactions found" : "No transactions today"}
                </div>
              ) : (
                <div className="space-y-1">
                  {!orderLookupQuery.trim() && (
                    <div className="text-sm text-muted font-semibold uppercase tracking-wider px-1 pt-1">
                      Today&apos;s Transactions
                    </div>
                  )}
                  {orderLookupResults.map((tx) => {
                    const meta = tx.metadata ?? {};
                    const items = (meta.items as Array<Record<string, unknown>>) ?? [];
                    const itemCount = items.reduce((sum: number, it: Record<string, unknown>) => sum + ((it.quantity as number) ?? 1), 0);
                    const time = new Date(tx.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
                    const shortName = tx.customer_name
                      ? tx.customer_name.length > 12
                        ? tx.customer_name.split(" ")[0] + (tx.customer_name.split(" ").length > 1 ? " " + tx.customer_name.split(" ").slice(-1)[0][0] + "." : "")
                        : tx.customer_name
                      : "Guest";

                    return (
                      <div
                        key={tx.id}
                        className="rounded-xl px-3 py-2.5 bg-card border border-card-border hover:bg-card-hover transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted">{time}</span>
                              <span className="text-lg font-medium text-foreground truncate">{shortName}</span>
                            </div>
                            <div className="text-sm text-muted mt-0.5">
                              <span className="capitalize">{tx.type.replace(/_/g, " ")}</span>
                              {tx.payment_method && <span> · {tx.payment_method}</span>}
                              {itemCount > 0 && <span> · {itemCount} item{itemCount !== 1 ? "s" : ""}</span>}
                            </div>
                          </div>
                          <div className="text-sm font-bold text-foreground tabular-nums font-mono ml-2">
                            {formatCents(tx.amount_cents)}
                          </div>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => loadOrderReceipt(tx.id)}
                            className="text-sm text-accent hover:underline font-medium"
                            style={{ minHeight: "auto" }}
                          >
                            View Receipt
                          </button>
                          <button
                            onClick={async () => {
                              await loadOrderReceipt(tx.id);
                              setTimeout(() => window.print(), 500);
                            }}
                            className="text-sm text-muted hover:text-foreground font-medium"
                            style={{ minHeight: "auto" }}
                          >
                            Reprint
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Load more */}
                  {orderLookupOffset < orderLookupTotal && (
                    <button
                      onClick={() => loadOrderLookup(orderLookupQuery || undefined, orderLookupOffset)}
                      disabled={orderLookupLoading}
                      className="w-full rounded-xl border border-card-border px-4 py-2.5 text-sm font-medium text-muted hover:text-foreground hover:bg-card-hover transition-colors"
                      style={{ minHeight: 40 }}
                    >
                      {orderLookupLoading ? "Loading..." : `Load Earlier (${orderLookupTotal - orderLookupOffset} more)`}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      );

    default:
      return null;
  } })();

  if (!content) return null;
  return <div ref={menuRef}>{content}</div>;
}
