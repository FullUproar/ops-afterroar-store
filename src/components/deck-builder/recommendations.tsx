"use client";

import { formatCents } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Recommendations — upsell cards, accessories, upgrades               */
/*  Horizontal scroll carousel with visual type indicators.             */
/* ------------------------------------------------------------------ */

interface Recommendation {
  type: string;
  name: string;
  reason: string;
  price_cents: number;
  inventory_item_id: string;
  image_url: string | null;
  category?: string;
}

const TYPE_CONFIG: Record<string, { emoji: string; color: string; label: string }> = {
  accessory: { emoji: "\uD83D\uDEE1\uFE0F", color: "text-blue-400", label: "Protect your deck" },
  upgrade: { emoji: "\u2728", color: "text-amber-400", label: "Premium upgrade" },
  sideboard: { emoji: "\u2660\uFE0F", color: "text-indigo-400", label: "Sideboard" },
  also_bought: { emoji: "\uD83D\uDD25", color: "text-orange-400", label: "Popular pick" },
};

export function Recommendations({
  items,
  onAdd,
}: {
  items: Recommendation[];
  onAdd: (item: Recommendation) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
        You might also need
      </h3>

      {/* Horizontal scroll on mobile, grid on desktop */}
      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:overflow-visible scroll-visible">
        {items.map((rec, i) => {
          const config = TYPE_CONFIG[rec.type] || TYPE_CONFIG.also_bought;

          return (
            <div
              key={`${rec.inventory_item_id}-${i}`}
              className="snap-start shrink-0 w-48 sm:w-auto rounded-xl border border-card-border bg-card p-3 flex flex-col gap-2 hover:border-accent/30 transition-colors"
            >
              {/* Image or type icon */}
              <div className="w-full h-24 rounded-lg overflow-hidden bg-card-hover flex items-center justify-center">
                {rec.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={rec.image_url}
                    alt={rec.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="text-3xl">{config.emoji}</span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground leading-tight line-clamp-2">
                  {rec.name}
                </div>
                <div className={`text-[10px] font-semibold mt-0.5 ${config.color}`}>
                  {rec.reason}
                </div>
              </div>

              {/* Price + Add */}
              <div className="flex items-center justify-between mt-auto pt-1">
                <span className="text-sm font-mono font-bold text-foreground tabular-nums">
                  {formatCents(rec.price_cents)}
                </span>
                <button
                  onClick={() => onAdd(rec)}
                  className="rounded-lg bg-accent/10 border border-accent/30 px-3 py-1 text-xs font-semibold text-accent hover:bg-accent/20 active:scale-95 transition-all"
                >
                  + Add
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
