"use client";

import { formatCents } from "@/lib/types";
import type { Customer } from "@/lib/types";

type ActivePanel = "search" | "scan" | "customer" | "quick" | "manual" | "discount" | "more" | "price_check" | "store_credit" | "returns" | "loyalty" | "gift_card" | "no_sale" | "flag_issue" | "void_last" | "order_lookup" | "trade_eval" | null;

interface ActionBarProps {
  activePanel: ActivePanel;
  togglePanel: (panel: ActivePanel) => void;
  focusSearch: () => void;
  customer: Customer | null;
  discountsLength: number;
  hasCart: boolean;
  total: number;
  parkedCount: number;
  hasLastReceipt: boolean;
  onPark: () => void;
  onRecall: () => void;
  onShowLastReceipt: () => void;
}

export function ActionBar({
  activePanel,
  togglePanel,
  focusSearch,
  customer,
  discountsLength,
  hasCart,
  total,
  parkedCount,
  hasLastReceipt,
  onPark,
  onRecall,
  onShowLastReceipt,
}: ActionBarProps) {
  return (
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
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
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
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
          </svg>
        </button>

        {/* Customer */}
        <button
          onClick={() => togglePanel("customer")}
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
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
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
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
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
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
          </svg>
        </button>

        {/* Discount */}
        <button
          onClick={() => togglePanel("discount")}
          className={`flex flex-col items-center justify-center w-12 lg:w-14 h-12 rounded-xl transition-colors ${
            activePanel === "discount"
              ? "bg-accent text-white"
              : discountsLength > 0
                ? "bg-amber-500/20 text-amber-400"
                : "text-muted hover:text-foreground hover:bg-card-hover"
          }`}
          title="Discount"
        >
          <span className="text-2xl font-bold">%</span>
        </button>

        {/* More */}
        <button
          onClick={() => togglePanel("more")}
          className={`flex flex-col items-center justify-center w-12 lg:w-14 h-12 rounded-xl transition-colors ${
            activePanel === "more" || ["price_check", "store_credit", "returns", "loyalty", "gift_card", "flag_issue", "void_last", "order_lookup"].includes(activePanel ?? "")
              ? "bg-accent text-white"
              : "text-muted hover:text-foreground hover:bg-card-hover"
          }`}
          title="More actions"
        >
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
          </svg>
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side: park/recall, last receipt, total */}
      <div className="flex items-center gap-1 shrink-0">
        {hasCart && (
          <button onClick={onPark} className="flex items-center gap-1 px-2 h-10 rounded-lg text-muted hover:text-foreground hover:bg-card-hover text-xs transition-colors" style={{ minHeight: "auto" }} title="Park cart">
            {"\u23F8"} Park
          </button>
        )}
        {parkedCount > 0 && (
          <button onClick={onRecall} className="flex items-center gap-1 px-2 h-10 rounded-lg text-muted hover:text-foreground hover:bg-card-hover text-xs transition-colors" style={{ minHeight: "auto" }} title="Recall parked cart">
            {"\u25B6"}
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-accent text-white text-[10px] font-bold">{parkedCount}</span>
          </button>
        )}
        {hasLastReceipt && (
          <button onClick={onShowLastReceipt} className="px-2 h-10 rounded-lg text-muted hover:text-foreground hover:bg-card-hover text-xs transition-colors" style={{ minHeight: "auto" }} title="Last receipt">
            {"\u{1F4C4}"}
          </button>
        )}
        <div className="text-right pl-2 pr-1">
          <div className="text-lg font-bold text-foreground tabular-nums">
            {hasCart ? formatCents(total) : "$0.00"}
          </div>
        </div>
      </div>
    </div>
  );
}
