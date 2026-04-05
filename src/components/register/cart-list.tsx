"use client";

import { useRef, useState } from "react";
import { formatCents } from "@/lib/types";
import { CardImage, ConditionBadge } from "@/components/tcg/shared";

interface CartItem {
  inventory_item_id: string | null;
  name: string;
  category: string;
  price_cents: number;
  quantity: number;
  max_quantity: number;
  condition?: string;
  image_url?: string | null;
}

interface CartDiscount {
  id: string;
  scope: "item" | "cart";
  itemIndex?: number;
  type: "percent" | "dollar";
  value: number;
  reason: string;
}

interface CartListProps {
  cart: CartItem[];
  discounts: CartDiscount[];
  subtotal: number;
  lastAddedIndex: number | null;
  editingQtyIndex: number | null;
  editQtyValue: string;
  onSetEditingQtyIndex: (index: number | null) => void;
  onSetEditQtyValue: (value: string) => void;
  onCommitQtyEdit: (index: number, directValue?: number) => void;
  onRemoveItem: (index: number) => void;
  onRemoveDiscount: (id: string) => void;
  cartEndRef: React.RefObject<HTMLDivElement | null>;
}

export function CartList({
  cart,
  discounts,
  subtotal,
  lastAddedIndex,
  editingQtyIndex,
  editQtyValue,
  onSetEditingQtyIndex,
  onSetEditQtyValue,
  onCommitQtyEdit,
  onRemoveItem,
  onRemoveDiscount,
  cartEndRef,
}: CartListProps) {
  const [swipingIndex, setSwipingIndex] = useState<number | null>(null);

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
    <div
      className="flex-1 overflow-y-auto"
      style={{ scrollBehavior: "smooth" }}
      onClick={() => (document.activeElement as HTMLElement)?.blur()}
    >
      {cart.length === 0 ? (
        <div className="flex items-center justify-center h-full text-muted text-lg">
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
                  {/* Card thumbnail for TCG */}
                  {item.category === "tcg_single" && item.image_url && (
                    <CardImage src={item.image_url} size="xs" className="mr-1" />
                  )}
                  {/* Item name */}
                  <div className="flex-1 min-w-0 pr-3">
                    <span className="text-lg font-medium text-foreground truncate block">
                      {item.name}
                      {item.condition && (
                        <span className="ml-1.5 inline-flex align-middle"><ConditionBadge condition={item.condition} size="xs" /></span>
                      )}
                      {!item.inventory_item_id && !item.condition && (
                        <span className="text-sm text-muted ml-1">(manual)</span>
                      )}
                    </span>
                  </div>

                  {/* Quantity — tap once = +/- stepper, tap number again = keypad */}
                  {editingQtyIndex === index ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          const newQty = Math.max(1, item.quantity - 1);
                          onSetEditQtyValue(String(newQty));
                          onCommitQtyEdit(index, newQty);
                        }}
                        className="shrink-0 w-9 h-9 rounded-lg bg-card-hover text-foreground text-xl font-bold flex items-center justify-center active:scale-90 transition-transform"
                        style={{ touchAction: "manipulation" }}
                      >
                        −
                      </button>
                      <button
                        onClick={() => {
                          // Second tap on number — switch to keypad mode
                          onSetEditQtyValue(String(item.quantity));
                          onSetEditingQtyIndex(-1000 - index); // Signal keypad mode with negative offset
                        }}
                        className="shrink-0 w-10 rounded-lg border border-accent bg-accent/10 text-accent text-lg font-bold tabular-nums flex items-center justify-center"
                        style={{ height: 36, touchAction: "manipulation" }}
                      >
                        {item.quantity}
                      </button>
                      <button
                        onClick={() => {
                          const newQty = item.quantity + 1;
                          onSetEditQtyValue(String(newQty));
                          onCommitQtyEdit(index, newQty);
                        }}
                        className="shrink-0 w-9 h-9 rounded-lg bg-card-hover text-foreground text-xl font-bold flex items-center justify-center active:scale-90 transition-transform"
                        style={{ touchAction: "manipulation" }}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        onSetEditingQtyIndex(index);
                        onSetEditQtyValue(String(item.quantity));
                      }}
                      className="shrink-0 rounded-lg bg-card-hover px-3 py-1.5 text-lg font-medium text-foreground tabular-nums active:scale-95 transition-transform"
                      style={{ minHeight: 36 }}
                    >
                      x{item.quantity}
                    </button>
                  )}

                  {/* Line total */}
                  <div className="shrink-0 w-20 text-right text-lg font-medium text-foreground tabular-nums font-mono">
                    {formatCents(lineTotal)}
                  </div>

                  {/* Delete -- always visible, compact */}
                  <button
                    onClick={() => onRemoveItem(index)}
                    className="shrink-0 ml-1 flex items-center justify-center w-10 h-10 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 active:scale-95 transition-transform"
                    title="Remove item"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>

                  {/* Swipe delete (mobile fallback) */}
                  {isSwiping && (
                    <button
                      onClick={() => onRemoveItem(index)}
                      className="absolute right-0 top-0 bottom-0 w-16 bg-red-500 text-white flex items-center justify-center text-sm font-medium"
                    >
                      Delete
                    </button>
                  )}
                </div>

                {/* Item-level discounts */}
                {getItemDiscounts(index).map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center px-4 py-1 text-base"
                  >
                    <span className="flex-1 text-amber-400 italic">
                      {"\u2500"} Discount ({d.type === "percent" ? `${d.value}%` : formatCents(d.value)})
                      {d.reason && ` \u2014 ${d.reason}`}
                    </span>
                    <span className="tabular-nums font-mono text-amber-400">
                      -{formatCents(itemDisc)}
                    </span>
                    <button
                      onClick={() => onRemoveDiscount(d.id)}
                      className="ml-2 text-muted hover:text-red-400 text-base"
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
                className="flex items-center px-4 py-1.5 text-base border-t border-card-border/50"
              >
                <span className="flex-1 text-amber-400 italic">
                  {"\u2500"} Cart Discount ({d.type === "percent" ? `${d.value}%` : formatCents(d.value)})
                  {d.reason && ` \u2014 ${d.reason}`}
                </span>
                <span className="tabular-nums font-mono text-amber-400">
                  -{formatCents(discAmt)}
                </span>
                <button
                  onClick={() => onRemoveDiscount(d.id)}
                  className="ml-2 text-muted hover:text-red-400 text-base"
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
  );
}
