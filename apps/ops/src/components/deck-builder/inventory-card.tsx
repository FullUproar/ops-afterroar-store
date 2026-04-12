"use client";

import { formatCents } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Inventory Match Card — shows a card's availability in-store         */
/*  The hero of the deck builder: big image, clear stock status,        */
/*  substitute suggestions, network availability.                       */
/* ------------------------------------------------------------------ */

interface InventoryMatch {
  name: string;
  needed: number;
  in_stock: number;
  price_cents: number;
  inventory_item_id: string | null;
  image_url: string | null;
  status: "available" | "partial" | "unavailable";
  substitute?: {
    name: string;
    price_cents: number;
    inventory_item_id: string;
    image_url: string | null;
    reason: string;
  };
  network?: Array<{
    store_name: string;
    store_slug: string;
    city: string | null;
    state: string | null;
    quantity: number;
  }>;
}

const STATUS_STYLES = {
  available: {
    border: "border-green-500/30",
    bg: "bg-green-500/5",
    badge: "bg-green-500/20 text-green-400 border-green-500/30",
    label: "In Stock",
    icon: "\u2713",
  },
  partial: {
    border: "border-amber-500/30",
    bg: "bg-amber-500/5",
    badge: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    label: "Partial",
    icon: "\u26A0",
  },
  unavailable: {
    border: "border-red-500/20",
    bg: "bg-card",
    badge: "bg-red-500/20 text-red-400 border-red-500/30",
    label: "Unavailable",
    icon: "\u2717",
  },
};

export function InventoryCard({
  match,
  onAddToCart,
  onAddSubstitute,
}: {
  match: InventoryMatch;
  onAddToCart: () => void;
  onAddSubstitute?: () => void;
}) {
  const style = STATUS_STYLES[match.status];

  return (
    <div className={`rounded-xl border ${style.border} ${style.bg} overflow-hidden transition-all hover:shadow-md`}>
      <div className="flex gap-3 p-3">
        {/* Card image — bigger, hero element */}
        <div className="shrink-0 w-16 h-[88px] rounded-lg overflow-hidden bg-card-hover border border-card-border/50">
          {match.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={match.image_url}
              alt={match.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted text-xs">
              TCG
            </div>
          )}
        </div>

        {/* Card details */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground leading-tight truncate">
                {match.name}
              </h3>
              {/* Status badge */}
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${style.badge}`}>
                {style.icon} {style.label}
              </span>
            </div>

            <div className="flex items-center gap-3 mt-1 text-xs text-muted">
              <span>Need <span className="text-foreground font-medium">{match.needed}</span></span>
              <span className="text-card-border">|</span>
              <span>
                Have{" "}
                <span className={match.in_stock >= match.needed ? "text-green-400 font-medium" : match.in_stock > 0 ? "text-amber-400 font-medium" : "text-red-400 font-medium"}>
                  {match.in_stock}
                </span>
              </span>
              {match.price_cents > 0 && (
                <>
                  <span className="text-card-border">|</span>
                  <span className="font-mono font-semibold text-foreground">{formatCents(match.price_cents)}</span>
                </>
              )}
            </div>
          </div>

          {/* Action button */}
          {match.status !== "unavailable" && match.inventory_item_id && (
            <button
              onClick={onAddToCart}
              className="mt-2 self-start rounded-lg bg-green-600/20 border border-green-600/30 px-3 py-1 text-xs font-semibold text-green-400 hover:bg-green-600/30 active:scale-95 transition-all"
            >
              + Add to Cart
            </button>
          )}
        </div>
      </div>

      {/* Substitute suggestion */}
      {match.substitute && (match.status === "unavailable" || match.status === "partial") && (
        <div className="border-t border-amber-500/20 bg-amber-500/5 px-3 py-2 flex items-center gap-2">
          <span className="text-amber-400 text-xs shrink-0">&#x21B3; Try instead:</span>
          {match.substitute.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={match.substitute.image_url} alt="" className="w-6 h-8 rounded object-cover shrink-0" />
          )}
          <span className="text-sm font-medium text-foreground truncate">{match.substitute.name}</span>
          <span className="text-xs text-muted hidden sm:inline shrink-0">{match.substitute.reason}</span>
          <span className="text-xs font-mono text-foreground shrink-0">{formatCents(match.substitute.price_cents)}</span>
          {onAddSubstitute && (
            <button
              onClick={onAddSubstitute}
              className="shrink-0 rounded bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-400 hover:bg-amber-500/30 transition-colors"
            >
              + Sub
            </button>
          )}
        </div>
      )}

      {/* Network availability */}
      {match.network && match.network.length > 0 && (
        <div className="border-t border-purple-500/20 bg-purple-500/5 px-3 py-2 flex items-center gap-2 text-xs">
          <span className="text-purple-400 shrink-0">Available nearby:</span>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {match.network.map((ns, i) => (
              <span key={i} className="text-foreground/80">
                <span className="font-medium">{ns.store_name}</span>
                {ns.city && <span className="text-muted"> ({ns.city}{ns.state ? `, ${ns.state}` : ""})</span>}
                <span className="text-purple-400 ml-1">x{ns.quantity}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
