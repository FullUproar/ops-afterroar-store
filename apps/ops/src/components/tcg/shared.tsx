"use client";

import { formatCents } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Shared TCG Components                                              */
/*  Single source of truth for card display across all surfaces.       */
/*  Used by: register search, cart, deck builder, singles page,        */
/*  eBay listings, buylist, catalog, embed.                            */
/* ------------------------------------------------------------------ */

/* ---- Condition Badge ---- */

const CONDITION_STYLES: Record<string, string> = {
  NM: "bg-green-500/20 text-green-400 border-green-500/30",
  LP: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  MP: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  HP: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  DMG: "bg-red-500/20 text-red-400 border-red-500/30",
};

const CONDITION_STYLES_LIGHT: Record<string, { bg: string; text: string; border: string }> = {
  NM: { bg: "#dcfce7", text: "#166534", border: "#bbf7d0" },
  LP: { bg: "#dbeafe", text: "#1e40af", border: "#bfdbfe" },
  MP: { bg: "#fef3c7", text: "#92400e", border: "#fde68a" },
  HP: { bg: "#ffedd5", text: "#9a3412", border: "#fed7aa" },
  DMG: { bg: "#fee2e2", text: "#991b1b", border: "#fecaca" },
};

export function ConditionBadge({
  condition,
  size = "sm",
  theme = "dark",
}: {
  condition: string;
  size?: "xs" | "sm";
  theme?: "dark" | "light";
}) {
  if (!condition) return null;

  if (theme === "light") {
    const style = CONDITION_STYLES_LIGHT[condition] || CONDITION_STYLES_LIGHT.NM;
    return (
      <span
        style={{
          fontSize: size === "xs" ? 10 : 11,
          fontWeight: 700,
          padding: "1px 6px",
          borderRadius: 4,
          border: `1px solid ${style.border}`,
          background: style.bg,
          color: style.text,
          whiteSpace: "nowrap",
        }}
      >
        {condition}
      </span>
    );
  }

  const cls = CONDITION_STYLES[condition] || "bg-card-hover text-muted border-card-border";
  const sizeClass = size === "xs" ? "text-[10px] px-1 py-0" : "text-xs px-1.5 py-0.5";

  return (
    <span className={`${sizeClass} font-bold rounded border ${cls}`} style={{ whiteSpace: "nowrap" }}>
      {condition}
    </span>
  );
}

/* ---- Card Image ---- */

/**
 * Standard TCG card image thumbnail.
 * Aspect ratio: 2.5:3.5 (standard trading card).
 * Sizes: xs (32x45), sm (40x56), md (52x72), lg (80x112)
 */
const IMAGE_SIZES = {
  xs: { w: 32, h: 45 },
  sm: { w: 40, h: 56 },
  md: { w: 52, h: 72 },
  lg: { w: 80, h: 112 },
};

export function CardImage({
  src,
  alt = "",
  size = "md",
  game,
  className = "",
}: {
  src?: string | null;
  alt?: string;
  size?: "xs" | "sm" | "md" | "lg";
  game?: string;
  className?: string;
}) {
  const dims = IMAGE_SIZES[size];
  const gameLabel = game === "MTG" ? "MTG" : game === "Pokemon" ? "PKM" : game === "Yu-Gi-Oh" ? "YGO" : "TCG";

  return (
    <div
      className={`shrink-0 rounded-lg overflow-hidden bg-card-hover border border-card-border/50 ${className}`}
      style={{ width: dims.w, height: dims.h }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-muted" style={{ fontSize: size === "xs" ? 8 : size === "sm" ? 9 : 10 }}>
          {gameLabel}
        </div>
      )}
    </div>
  );
}

/** Light theme version for embeds / public pages */
export function CardImageLight({
  src,
  alt = "",
  width = 36,
  height = 50,
}: {
  src?: string | null;
  alt?: string;
  width?: number;
  height?: number;
}) {
  return (
    <div style={{ width, height, borderRadius: 4, overflow: "hidden", background: "#f3f4f6", border: "1px solid #e5e7eb", flexShrink: 0 }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: 9 }}>TCG</div>
      )}
    </div>
  );
}

/* ---- Price Display ---- */

export function PriceTag({
  cents,
  size = "md",
  className = "",
}: {
  cents: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClass = size === "sm" ? "text-sm" : size === "lg" ? "text-xl" : "text-base";

  return (
    <span className={`font-mono font-bold tabular-nums ${sizeClass} ${className}`}>
      {formatCents(cents)}
    </span>
  );
}

/** Light theme price for embeds */
export function PriceTagLight({
  cents,
  size = "md",
}: {
  cents: number;
  size?: "sm" | "md" | "lg";
}) {
  const fontSize = size === "sm" ? 12 : size === "lg" ? 18 : 14;
  return (
    <span style={{ fontFamily: "'Courier New', Courier, monospace", fontWeight: 700, fontSize, fontVariantNumeric: "tabular-nums" }}>
      {formatCents(cents)}
    </span>
  );
}

/* ---- Stock Badge ---- */

export function StockBadge({
  quantity,
  needed,
  size = "sm",
  theme = "dark",
}: {
  quantity: number;
  needed?: number;
  size?: "xs" | "sm";
  theme?: "dark" | "light";
}) {
  const isOut = quantity <= 0;
  const isPartial = needed !== undefined && quantity > 0 && quantity < needed;

  if (theme === "light") {
    const bg = isOut ? "#fee2e2" : isPartial ? "#fef3c7" : "#dcfce7";
    const color = isOut ? "#991b1b" : isPartial ? "#92400e" : "#166534";
    const label = isOut ? "Not Available" : isPartial ? `Partial (${quantity}/${needed})` : "In Stock";
    return (
      <span style={{ fontSize: size === "xs" ? 10 : 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: bg, color, whiteSpace: "nowrap" }}>
        {label}
      </span>
    );
  }

  if (isOut) {
    return <span className={`${size === "xs" ? "text-[10px]" : "text-xs"} font-semibold text-red-400`}>Out of stock</span>;
  }
  if (isPartial) {
    return <span className={`${size === "xs" ? "text-[10px]" : "text-xs"} text-amber-400`}>{quantity}/{needed} in stock</span>;
  }
  return <span className={`${size === "xs" ? "text-[10px]" : "text-xs"} text-muted`}>{quantity} in stock</span>;
}

/* ---- Foil Indicator ---- */

export function FoilBadge({ size = "sm" }: { size?: "xs" | "sm" }) {
  return (
    <span
      className={`${size === "xs" ? "text-[10px]" : "text-xs"} text-amber-400`}
      role="img"
      aria-label="Foil"
    >
      &#x2728;
    </span>
  );
}

/* ---- Set Info Line ---- */

export function SetInfo({
  setName,
  rarity,
  game,
  size = "sm",
}: {
  setName?: string | null;
  rarity?: string | null;
  game?: string | null;
  size?: "xs" | "sm";
}) {
  const parts = [setName, rarity].filter(Boolean);
  if (parts.length === 0) return null;

  return (
    <span className={`${size === "xs" ? "text-[10px]" : "text-xs"} text-muted truncate`} style={{ maxWidth: 180 }}>
      {parts.join(" \u00B7 ")}
    </span>
  );
}

/* ---- Re-exports for convenience ---- */

export { CONDITION_STYLES, CONDITION_STYLES_LIGHT, IMAGE_SIZES };
