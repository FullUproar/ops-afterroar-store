"use client";

import { formatCents } from "@/lib/types";
import type { InventoryItem } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Variant Picker Modal                                               */
/*  Opens when a scanned/searched item has 2+ variants in its family.  */
/*  Cashier taps the variant the customer is buying — that variant     */
/*  goes into the cart. Used for Pandemic Legacy seasons, D&D cover    */
/*  reprints, MTG art alternatives, etc.                                */
/* ------------------------------------------------------------------ */

interface VariantPickerModalProps {
  open: boolean;
  /** The item that was originally scanned/found. Could be parent or child. */
  scannedItem: InventoryItem | null;
  variants: InventoryItem[];
  parent: InventoryItem | null;
  onPick: (item: InventoryItem) => void;
  onClose: () => void;
}

export function VariantPickerModal({
  open,
  scannedItem,
  variants,
  parent,
  onPick,
  onClose,
}: VariantPickerModalProps) {
  if (!open || !scannedItem) return null;

  // Build the full family — parent first, then variants in label order.
  const family: InventoryItem[] = [];
  if (parent) family.push(parent);
  for (const v of variants) {
    if (parent && v.id === parent.id) continue;
    family.push(v);
  }

  return (
    <div
      className="fixed inset-0 z-[180] flex items-center justify-center"
      style={{ background: "rgba(7,8,12,0.85)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl mx-4"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel)",
          border: "1px solid var(--rule-hi)",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "0.85rem 1rem",
            borderBottom: "1px solid var(--rule)",
            background: "var(--panel-mute)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.62rem",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontWeight: 700,
                color: "var(--orange)",
              }}
            >
              Pick Variant
            </div>
            <div
              className="text-ink"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: "1.05rem",
                marginTop: "0.1rem",
              }}
            >
              {parent?.name ?? scannedItem.name}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink-soft hover:text-ink"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.7rem",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Esc
          </button>
        </div>

        {/* Variant tile grid */}
        <div
          style={{
            padding: "1rem",
            overflowY: "auto",
            flex: 1,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: "0.75rem",
            alignContent: "start",
          }}
        >
          {family.map((v) => {
            const isOriginal = v.id === scannedItem.id;
            const inStock = v.quantity > 0;
            const variantLabel =
              ((v as unknown as { variant_label?: string | null }).variant_label) ?? null;
            return (
              <button
                key={v.id}
                onClick={() => onPick(v)}
                disabled={!inStock}
                className="text-left transition-transform active:scale-[0.98] disabled:opacity-40"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  background: isOriginal ? "var(--orange-mute)" : "var(--panel-mute)",
                  border: isOriginal ? "2px solid var(--orange)" : "1px solid var(--rule)",
                  cursor: inStock ? "pointer" : "not-allowed",
                  minHeight: 180,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {v.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={v.image_url}
                    alt=""
                    style={{
                      width: "100%",
                      height: 100,
                      objectFit: "cover",
                      borderBottom: "1px solid var(--rule)",
                    }}
                  />
                ) : (
                  <div
                    aria-hidden
                    style={{
                      width: "100%",
                      height: 100,
                      background: "var(--slate)",
                      borderBottom: "1px solid var(--rule)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--ink-faint)",
                      fontFamily: "var(--font-display)",
                      fontWeight: 700,
                      fontSize: "1.4rem",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {(variantLabel || v.name).slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div style={{ padding: "0.65rem", flex: 1, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  {variantLabel ? (
                    <div
                      className="text-ink"
                      style={{
                        fontFamily: "var(--font-display)",
                        fontWeight: 600,
                        fontSize: "0.95rem",
                        lineHeight: 1.2,
                      }}
                    >
                      {variantLabel}
                    </div>
                  ) : (
                    <div
                      className="text-ink"
                      style={{
                        fontFamily: "var(--font-display)",
                        fontWeight: 600,
                        fontSize: "0.92rem",
                        lineHeight: 1.2,
                        // Trim parent prefix when the variant has none of its own — otherwise the
                        // tiles all read the same thing.
                      }}
                    >
                      {v.name}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-auto">
                    <span
                      className="text-orange tabular-nums"
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontWeight: 700,
                        fontSize: "1rem",
                      }}
                    >
                      {formatCents(v.price_cents)}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.62rem",
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        fontWeight: 700,
                        color: inStock ? "var(--ink-faint)" : "var(--red)",
                      }}
                    >
                      {inStock ? `${v.quantity} on hand` : "Out"}
                    </span>
                  </div>
                </div>
                {isOriginal && (
                  <span
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      padding: "2px 6px",
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.55rem",
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      fontWeight: 700,
                      color: "var(--void)",
                      background: "var(--orange)",
                    }}
                  >
                    Scanned
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
