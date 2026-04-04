"use client";

import { useEffect, useRef } from "react";
import { formatCents } from "@/lib/types";
import type { InventoryItem, Customer } from "@/lib/types";
import { MoreMenu } from "./more-menu";

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

interface PanelContentProps {
  activePanel: ActivePanel;
  setActivePanel: (panel: ActivePanel) => void;
  // Search
  searchRef: React.RefObject<HTMLInputElement | null>;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchResults: InventoryItem[];
  setSearchResults: (r: InventoryItem[]) => void;
  setScannerErrorText: (t: string | null) => void;
  focusSearch: () => void;
  isTouchDevice: boolean;
  addToCart: (item: InventoryItem) => void;
  // Customer
  customer: Customer | null;
  setCustomer: (c: Customer | null) => void;
  customerQuery: string;
  setCustomerQuery: (q: string) => void;
  customerResults: Customer[];
  recentCustomers: Array<{ id: string; name: string; email: string | null; source: "checkin" | "purchase"; timestamp: string }>;
  // Quick
  favorites: InventoryItem[];
  // Manual
  manualName: string;
  setManualName: (v: string) => void;
  manualPrice: string;
  setManualPrice: (v: string) => void;
  manualQty: string;
  setManualQty: (v: string) => void;
  addManualItem: () => void;
  // Discount
  discountScope: "item" | "cart";
  setDiscountScope: (s: "item" | "cart") => void;
  discountType: "percent" | "dollar";
  setDiscountType: (t: "percent" | "dollar") => void;
  discountValue: string;
  setDiscountValue: (v: string) => void;
  discountReason: string;
  setDiscountReason: (r: string) => void;
  discountCents: number;
  cartLength: number;
  applyDiscount: () => void;
  discountError: string | null;
  // More menu passthrough
  effectiveRole: string | null;
  cart: Array<{ inventory_item_id: string | null; name: string; category: string; price_cents: number; quantity: number; max_quantity: number }>;
  storeSettings: { loyalty_enabled: boolean; loyalty_redeem_points_per_dollar: number; loyalty_min_redeem_points: number; receipt_header?: string; receipt_footer?: string };
  setToastMessage: (msg: string) => void;
  showError: (msg: string) => void;
  setShowGiftCardPayment: (v: boolean) => void;
  setShowPaySheet: (v: boolean) => void;
  orderLookupReceipt: ReceiptData | null;
  setOrderLookupReceipt: (r: ReceiptData | null) => void;
}

export function PanelContent(props: PanelContentProps) {
  const {
    activePanel, setActivePanel, searchRef, searchQuery, setSearchQuery,
    searchResults, setSearchResults, setScannerErrorText, focusSearch,
    isTouchDevice, addToCart, customer, setCustomer, customerQuery,
    setCustomerQuery, customerResults, recentCustomers, favorites, manualName, setManualName,
    manualPrice, setManualPrice, manualQty, setManualQty, addManualItem,
    discountScope, setDiscountScope, discountType, setDiscountType,
    discountValue, setDiscountValue, discountReason, setDiscountReason,
    discountCents, cartLength, applyDiscount, discountError,
    effectiveRole, cart, storeSettings, setToastMessage, showError,
    setShowGiftCardPayment, setShowPaySheet, orderLookupReceipt, setOrderLookupReceipt,
  } = props;

  // Scroll focused input into view when keyboard opens (Android tablet fix)
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleFocus(e: FocusEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") {
        setTimeout(() => {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 300);
      }
    }
    const el = panelRef.current;
    if (el) {
      el.addEventListener("focusin", handleFocus);
      return () => el.removeEventListener("focusin", handleFocus);
    }
  }, []);

  const content = (() => { switch (activePanel) {
    case "search":
      return (
        <div className="p-3 space-y-2">
          <div className="relative">
            <input ref={searchRef} type="search" inputMode="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Search products or scan barcode..." className="w-full rounded-xl border border-input-border bg-input-bg pl-4 pr-10 text-foreground placeholder:text-muted focus:border-accent focus:outline-none" style={{ height: 48, fontSize: 18 }} autoComplete="off" autoFocus={!isTouchDevice} />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(""); setSearchResults([]); setScannerErrorText(null); focusSearch(); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground text-xl leading-none" style={{ minHeight: "auto" }}>{"\u00D7"}</button>
            )}
          </div>
          {searchResults.length > 0 ? (
            <div className="space-y-1.5">
              {searchResults.slice(0, 20).map((item) => {
                const attrs = (item.attributes || {}) as Record<string, unknown>;
                const isTCG = item.category === "tcg_single";
                const condition = (attrs.condition as string) || "";
                const setName = (attrs.set_name as string) || "";
                const game = (attrs.game as string) || "";
                const foil = !!(attrs.foil);
                const rarity = (attrs.rarity as string) || "";
                const outOfStock = item.quantity <= 0;

                const conditionColors: Record<string, string> = {
                  NM: "bg-green-500/20 text-green-400 border-green-500/30",
                  LP: "bg-blue-500/20 text-blue-400 border-blue-500/30",
                  MP: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
                  HP: "bg-orange-500/20 text-orange-400 border-orange-500/30",
                  DMG: "bg-red-500/20 text-red-400 border-red-500/30",
                };

                if (isTCG) {
                  // TCG card — image-forward layout
                  return (
                    <button
                      key={item.id}
                      onClick={() => !outOfStock && addToCart(item)}
                      disabled={outOfStock}
                      className={`w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors border ${
                        outOfStock
                          ? "bg-card/50 border-card-border/50 opacity-60 cursor-not-allowed"
                          : "bg-card hover:bg-card-hover active:bg-accent-light border-card-border"
                      }`}
                      style={{ minHeight: 72 }}
                    >
                      {/* Card image */}
                      <div className="shrink-0 w-[52px] h-[72px] rounded-lg overflow-hidden bg-card-hover border border-card-border/50">
                        {item.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.image_url}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted text-xs">
                            {game === "MTG" ? "MTG" : game === "Pokemon" ? "PKM" : game === "Yu-Gi-Oh" ? "YGO" : "TCG"}
                          </div>
                        )}
                      </div>

                      {/* Card info */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="text-base font-semibold text-foreground leading-tight truncate">
                          {item.name}
                          {foil && <span className="ml-1.5 text-xs text-amber-400">&#x2728;</span>}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {condition && (
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${conditionColors[condition] || "bg-card-hover text-muted border-card-border"}`}>
                              {condition}
                            </span>
                          )}
                          {setName && <span className="text-xs text-muted truncate max-w-[120px]">{setName}</span>}
                          {rarity && <span className="text-xs text-muted">{"\u00B7"} {rarity}</span>}
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          {outOfStock ? (
                            <span className="text-red-400 font-semibold">Out of stock</span>
                          ) : (
                            <span className="text-muted">{item.quantity} in stock</span>
                          )}
                        </div>
                      </div>

                      {/* Price */}
                      <div className="shrink-0 text-right">
                        <div className="text-lg font-bold text-foreground tabular-nums font-mono">{formatCents(item.price_cents)}</div>
                      </div>
                    </button>
                  );
                }

                // Non-TCG item — clean simple row
                return (
                  <button
                    key={item.id}
                    onClick={() => !outOfStock && addToCart(item)}
                    disabled={outOfStock}
                    className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors border ${
                      outOfStock
                        ? "bg-card/50 border-card-border/50 opacity-60 cursor-not-allowed"
                        : "bg-card hover:bg-card-hover active:bg-accent-light border-card-border"
                    }`}
                    style={{ minHeight: 52 }}
                  >
                    {item.image_url && (
                      <div className="shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-card-hover">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-lg font-medium text-foreground truncate">{item.name}</div>
                      <div className="text-sm text-muted">
                        {item.category.replace(/_/g, " ")}
                        {" \u00B7 "}
                        {outOfStock ? <span className="text-red-400">out of stock</span> : `${item.quantity} in stock`}
                      </div>
                    </div>
                    <div className="text-lg font-bold text-foreground ml-3 tabular-nums font-mono">{formatCents(item.price_cents)}</div>
                  </button>
                );
              })}
            </div>
          ) : searchQuery.trim() ? (
            <div className="flex items-center justify-center h-24 text-muted text-lg">No products found</div>
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
                  <div className="text-lg font-medium text-foreground">{customer.name}</div>
                  {customer.email && <div className="text-base text-muted">{customer.email}</div>}
                </div>
                {customer.credit_balance_cents > 0 && (
                  <div className="text-lg font-medium text-accent tabular-nums font-mono">{formatCents(customer.credit_balance_cents)} credit</div>
                )}
              </div>
              <button onClick={() => { setCustomer(null); setActivePanel(null); }} className="w-full rounded-xl border border-red-500/30 px-4 py-2.5 text-lg font-medium text-red-400 hover:bg-red-500/10 transition-colors" style={{ minHeight: 44 }}>Detach Customer</button>
            </div>
          ) : (
            <>
              <input type="search" inputMode="search" value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Search by name, email, or phone..." autoFocus className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-3 text-foreground placeholder:text-muted focus:border-accent focus:outline-none" style={{ fontSize: 18, minHeight: 48 }} />
              {/* Recent check-ins + purchasers */}
              {!customerQuery && recentCustomers.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs text-muted uppercase tracking-wider px-1">Recent</div>
                  {recentCustomers.slice(0, 5).map((rc) => (
                    <button key={rc.id} onClick={() => {
                      fetch(`/api/customers?q=${encodeURIComponent(rc.name)}`).then(r => r.json()).then(data => {
                        const match = data.find((c: Customer) => c.id === rc.id);
                        if (match) { setCustomer(match); setActivePanel(null); }
                      }).catch(() => {});
                    }} className="w-full flex items-center justify-between rounded-xl px-4 py-2.5 text-left bg-card-hover hover:bg-accent-light transition-colors" style={{ minHeight: 44 }}>
                      <div className="flex items-center gap-2">
                        {rc.source === "checkin" && <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse shrink-0" />}
                        <div>
                          <div className="text-base font-medium text-foreground">{rc.name}</div>
                          <div className="text-xs text-muted">{rc.source === "checkin" ? "Just checked in" : "Recent purchase"}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {customerResults.map((c) => (
                  <button key={c.id} onClick={() => { setCustomer(c); setActivePanel(null); (document.activeElement as HTMLElement)?.blur(); }} className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-left bg-card-hover hover:bg-accent-light active:bg-accent-light transition-colors" style={{ minHeight: 52 }}>
                    <div>
                      <div className="text-lg font-medium text-foreground">{c.name}</div>
                      {c.email && <div className="text-base text-muted">{c.email}</div>}
                    </div>
                    {c.credit_balance_cents > 0 && <div className="text-base font-medium text-accent tabular-nums">{formatCents(c.credit_balance_cents)}</div>}
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
                <button key={item.id} onClick={() => addToCart(item)} className="flex flex-col items-center justify-center rounded-xl border border-card-border bg-card hover:bg-card-hover active:bg-accent-light px-3 py-4 transition-colors text-center" style={{ minHeight: 80 }}>
                  <div className="text-base font-medium text-foreground leading-tight truncate w-full">{item.name}</div>
                  <div className="text-lg font-bold text-accent mt-1 tabular-nums font-mono">{formatCents(item.price_cents)}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-24 text-muted text-lg">No favorites configured</div>
          )}
        </div>
      );

    case "manual":
      return (
        <div className="p-3 space-y-3">
          <div className="text-sm font-semibold text-muted uppercase tracking-wider">Manual Item</div>
          <input type="text" value={manualName} onChange={(e) => setManualName(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && manualName.trim() && manualPrice) addManualItem(); }} placeholder="Item name" autoFocus className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-2.5 text-foreground placeholder:text-muted focus:border-accent focus:outline-none" style={{ fontSize: 18 }} />
          <div className="flex gap-2">
            <input type="text" inputMode="decimal" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && manualName.trim() && manualPrice) addManualItem(); }} placeholder="Price (e.g. 5.99)" className="flex-1 rounded-xl border border-input-border bg-input-bg px-4 py-2.5 text-foreground placeholder:text-muted focus:border-accent focus:outline-none font-mono" style={{ fontSize: 18 }} />
            <input type="number" inputMode="numeric" value={manualQty} onChange={(e) => setManualQty(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && manualName.trim() && manualPrice) addManualItem(); }} placeholder="Qty" className="w-20 rounded-xl border border-input-border bg-input-bg px-3 py-2.5 text-center text-foreground placeholder:text-muted focus:border-accent focus:outline-none" style={{ fontSize: 18 }} />
          </div>
          <button onClick={addManualItem} disabled={!manualName.trim() || !manualPrice} className="w-full rounded-xl text-lg font-medium text-white disabled:opacity-30 transition-colors" style={{ height: 48, backgroundColor: "#16a34a" }}>Add to Cart</button>
        </div>
      );

    case "discount":
      return (
        <div className="p-3 space-y-3">
          <div className="text-sm font-semibold text-muted uppercase tracking-wider">Apply Discount</div>
          <div className="flex gap-1 bg-card-hover rounded-xl p-1">
            <button onClick={() => setDiscountScope("item")} className={`flex-1 rounded-lg py-2 text-lg font-medium transition-colors ${discountScope === "item" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"}`} style={{ minHeight: "auto" }}>Last Item</button>
            <button onClick={() => setDiscountScope("cart")} className={`flex-1 rounded-lg py-2 text-lg font-medium transition-colors ${discountScope === "cart" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"}`} style={{ minHeight: "auto" }}>Whole Cart</button>
          </div>
          <div className="flex gap-1 bg-card-hover rounded-xl p-1">
            <button onClick={() => setDiscountType("percent")} className={`flex-1 rounded-lg py-2 text-lg font-medium transition-colors ${discountType === "percent" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"}`} style={{ minHeight: "auto" }}>% Off</button>
            <button onClick={() => setDiscountType("dollar")} className={`flex-1 rounded-lg py-2 text-lg font-medium transition-colors ${discountType === "dollar" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"}`} style={{ minHeight: "auto" }}>$ Off</button>
          </div>
          <input type="text" inputMode="decimal" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && discountValue && cartLength) applyDiscount(); }} placeholder={discountType === "percent" ? "e.g. 10" : "e.g. 5.00"} autoFocus className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-2.5 text-foreground placeholder:text-muted focus:border-accent focus:outline-none font-mono text-center" style={{ fontSize: 20 }} />
          <input type="text" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && discountValue && cartLength) applyDiscount(); }} placeholder="Reason (optional)" className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-2.5 text-foreground placeholder:text-muted focus:border-accent focus:outline-none" style={{ fontSize: 18 }} />
          {discountError && <div className="text-sm text-red-400 bg-red-950/30 border border-red-500/20 rounded-lg px-3 py-2">{discountError}</div>}
          {discountCents > 0 && <div className="text-base text-amber-400">Current total discount: -{formatCents(discountCents)}</div>}
          <button onClick={applyDiscount} disabled={!discountValue || !cartLength} className="w-full rounded-xl text-lg font-medium text-white disabled:opacity-30 transition-colors" style={{ height: 48, backgroundColor: "#d97706" }}>Apply Discount</button>
        </div>
      );

    case "more":
    case "price_check":
    case "store_credit":
    case "returns":
    case "loyalty":
    case "gift_card":
    case "no_sale":
    case "flag_issue":
    case "void_last":
    case "order_lookup":
      return (
        <MoreMenu
          activePanel={activePanel}
          setActivePanel={setActivePanel}
          customer={customer}
          setCustomer={setCustomer}
          effectiveRole={effectiveRole}
          cart={cart}
          storeSettings={storeSettings}
          setToastMessage={setToastMessage}
          showError={showError}
          setManualName={setManualName}
          setManualPrice={setManualPrice}
          setShowGiftCardPayment={setShowGiftCardPayment}
          setShowPaySheet={setShowPaySheet}
          orderLookupReceipt={orderLookupReceipt}
          setOrderLookupReceipt={setOrderLookupReceipt}
        />
      );

    default:
      return null;
  } })();

  if (!content) return null;
  return <div ref={panelRef}>{content}</div>;
}
