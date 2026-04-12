"use client";

import { formatCents } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Deck Summary — sticky bottom panel with stock status + total        */
/*  Shows: progress bar, in-stock/missing counts, estimated total,      */
/*  "Add All to Cart" CTA.                                              */
/* ------------------------------------------------------------------ */

interface DeckSummaryProps {
  totalCards: number;
  inStockCards: number;
  needToOrder: number;
  estimatedTotal: number;
  onAddAllToCart: () => void;
  loading?: boolean;
}

export function DeckSummary({
  totalCards,
  inStockCards,
  needToOrder,
  estimatedTotal,
  onAddAllToCart,
  loading,
}: DeckSummaryProps) {
  if (totalCards === 0) return null;

  const stockPercent = totalCards > 0 ? Math.round((inStockCards / totalCards) * 100) : 0;
  const barColor =
    stockPercent >= 80 ? "bg-green-500" :
    stockPercent >= 50 ? "bg-amber-500" :
    "bg-red-500";

  return (
    <div className="sticky bottom-0 z-10 rounded-xl border border-card-border bg-card/95 backdrop-blur-sm p-4 shadow-xl space-y-3">
      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">Stock availability</span>
          <span className="font-bold text-foreground">{stockPercent}%</span>
        </div>
        <div className="h-2 rounded-full bg-card-hover overflow-hidden">
          <div
            className={`h-full rounded-full ${barColor} transition-all duration-500`}
            style={{ width: `${stockPercent}%` }}
          />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-lg font-bold text-foreground tabular-nums">{totalCards}</div>
          <div className="text-[10px] text-muted uppercase tracking-wider">Cards needed</div>
        </div>
        <div>
          <div className="text-lg font-bold text-green-400 tabular-nums">{inStockCards}</div>
          <div className="text-[10px] text-muted uppercase tracking-wider">In stock</div>
        </div>
        <div>
          <div className="text-lg font-bold tabular-nums text-foreground font-mono">
            {formatCents(estimatedTotal)}
          </div>
          <div className="text-[10px] text-muted uppercase tracking-wider">Est. total</div>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={onAddAllToCart}
        disabled={inStockCards === 0 || loading}
        className="w-full rounded-xl bg-accent py-3 text-sm font-bold text-white hover:opacity-90 active:scale-[0.98] disabled:opacity-40 transition-all shadow-lg shadow-accent/20"
      >
        {loading
          ? "Adding..."
          : `Add ${inStockCards} Available Cards to Cart`}
      </button>

      {needToOrder > 0 && (
        <p className="text-center text-xs text-muted">
          {needToOrder} card{needToOrder !== 1 ? "s" : ""} unavailable — check substitutes or nearby stores above
        </p>
      )}
    </div>
  );
}
