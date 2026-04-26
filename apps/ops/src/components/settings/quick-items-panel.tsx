"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Quick Items Panel ("hot buttons")                                  */
/*  Lets the owner curate the tap-to-add tiles on the register screen. */
/*  Each tile can either link to an inventory item (live price + qty   */
/*  decrement) or stand alone as a free-form item with a fixed price   */
/*  (handy for cafe drinks or open-counter items not in inventory).    */
/* ------------------------------------------------------------------ */

export interface QuickItem {
  id: string;
  label: string;
  inventory_id?: string;
  price_cents?: number;
  color?: string;
}

interface InventoryHit {
  id: string;
  name: string;
  price_cents: number;
  quantity: number;
  category: string;
  sku: string | null;
  barcode: string | null;
}

interface QuickItemsPanelProps {
  value: QuickItem[];
  onChange: (next: QuickItem[]) => void;
  saving: boolean;
}

const PALETTE: { value: string; label: string }[] = [
  { value: "#ef4444", label: "Red" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#fbbf24", label: "Yellow" },
  { value: "#10b981", label: "Emerald" },
  { value: "#14b8a6", label: "Teal" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#ec4899", label: "Pink" },
  { value: "#64748b", label: "Slate" },
];

const MAX_ITEMS = 12; // register layout fits 8-12 cleanly across viewports

function newId(): string {
  return `qi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function dollarsToCents(text: string): number {
  const n = parseFloat(text.replace(/[^0-9.]/g, ""));
  if (isNaN(n) || n < 0) return 0;
  return Math.round(n * 100);
}

interface InventoryPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (hit: InventoryHit) => void;
}

function InventoryPicker({ open, onClose, onPick }: InventoryPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InventoryHit[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      const q = query.trim();
      if (q.length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/inventory/search?q=${encodeURIComponent(q)}&in_stock=true`);
        if (res.ok) {
          const data: InventoryHit[] = await res.json();
          setResults(data.slice(0, 25));
        } else {
          setResults([]);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-start justify-center pt-20"
      style={{ background: "rgba(7,8,12,0.8)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel)",
          border: "1px solid var(--rule-hi)",
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "0.75rem 1rem",
            borderBottom: "1px solid var(--rule)",
            background: "var(--panel-mute)",
            fontFamily: "var(--font-mono)",
            fontSize: "0.65rem",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontWeight: 700,
            color: "var(--orange)",
          }}
        >
          Pick Inventory Item
        </div>
        <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--rule)" }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, SKU, or barcode"
            className="w-full border border-rule-hi bg-panel-mute text-ink px-3"
            style={{ height: 44, fontSize: "0.95rem" }}
          />
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading && <div className="px-4 py-3 text-ink-faint text-sm">Searching…</div>}
          {!loading && query.trim().length >= 2 && results.length === 0 && (
            <div className="px-4 py-6 text-ink-faint text-sm text-center">No matches</div>
          )}
          {results.map((hit, idx) => (
            <button
              key={hit.id}
              onClick={() => onPick(hit)}
              className="w-full text-left px-4 py-3 hover:bg-panel-mute transition-colors flex items-center justify-between gap-3"
              style={{
                borderBottom: idx < results.length - 1 ? "1px solid var(--rule-faint)" : "none",
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="text-ink truncate" style={{ fontSize: "0.95rem", fontWeight: 500 }}>
                  {hit.name}
                </div>
                <div className="text-ink-faint truncate" style={{ fontSize: "0.78rem" }}>
                  {hit.category} · {hit.quantity} in stock
                </div>
              </div>
              <div className="text-orange tabular-nums" style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                {dollars(hit.price_cents)}
              </div>
            </button>
          ))}
        </div>
        <div style={{ padding: "0.5rem 1rem", borderTop: "1px solid var(--rule)" }}>
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
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function QuickItemsPanel({ value, onChange, saving }: QuickItemsPanelProps) {
  const items = value || [];
  const [pickerForId, setPickerForId] = useState<string | null>(null);
  // We need to read display info for linked inventory items so the row shows
  // a meaningful name even if the panel is reopened with no fresh fetch.
  // Cache the last seen hit per row in local state.
  const [linkedSnapshot, setLinkedSnapshot] = useState<Record<string, { name: string; price_cents: number }>>({});

  // Fetch initial snapshots for already-linked items on mount
  useEffect(() => {
    let cancelled = false;
    const ids = items.map((i) => i.inventory_id).filter(Boolean) as string[];
    if (ids.length === 0) return;
    (async () => {
      try {
        // Batch via search isn't available; fetch each via /api/inventory/[id]
        const fetched: Record<string, { name: string; price_cents: number }> = {};
        await Promise.all(
          ids.map(async (id) => {
            try {
              const res = await fetch(`/api/inventory/${id}`);
              if (res.ok) {
                const item = await res.json();
                fetched[id] = { name: item.name, price_cents: item.price_cents };
              }
            } catch {}
          }),
        );
        if (!cancelled) setLinkedSnapshot((prev) => ({ ...prev, ...fetched }));
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addItem = useCallback(() => {
    if (items.length >= MAX_ITEMS) return;
    const next: QuickItem[] = [
      ...items,
      { id: newId(), label: "", color: PALETTE[items.length % PALETTE.length].value, price_cents: 0 },
    ];
    onChange(next);
  }, [items, onChange]);

  const removeItem = useCallback(
    (id: string) => {
      onChange(items.filter((i) => i.id !== id));
    },
    [items, onChange],
  );

  const updateItem = useCallback(
    (id: string, patch: Partial<QuickItem>) => {
      onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    },
    [items, onChange],
  );

  const moveItem = useCallback(
    (id: string, dir: "up" | "down") => {
      const idx = items.findIndex((i) => i.id === id);
      if (idx === -1) return;
      const swapWith = dir === "up" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= items.length) return;
      const copy = [...items];
      [copy[idx], copy[swapWith]] = [copy[swapWith], copy[idx]];
      onChange(copy);
    },
    [items, onChange],
  );

  return (
    <div className="px-5 py-5 space-y-4">
      <p className="text-ink-soft" style={{ fontSize: "0.88rem", lineHeight: 1.5, marginTop: "-0.5rem" }}>
        Quick buttons sit on top of the register and add an item to the cart in one tap. Link to a real inventory item (price + stock stay live) or use a free-form label with a fixed price for things like coffee or a flat counter charge. If no quick buttons are configured, the register auto-fills with your top sellers from the last 7 days.
      </p>

      {items.length > 0 ? (
        <div className="border border-rule">
          {items.map((item, idx) => {
            const linked = item.inventory_id ? linkedSnapshot[item.inventory_id] : null;
            return (
              <div
                key={item.id}
                className="px-4 py-3 space-y-2"
                style={{
                  borderBottom: idx < items.length - 1 ? "1px solid var(--rule-faint)" : "none",
                  background: idx % 2 === 0 ? "transparent" : "var(--panel-mute)",
                }}
              >
                <div className="flex items-center gap-3">
                  {/* Color */}
                  <div className="relative" style={{ flexShrink: 0 }}>
                    <select
                      value={item.color ?? PALETTE[0].value}
                      onChange={(e) => updateItem(item.id, { color: e.target.value })}
                      aria-label="Tile color"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      style={{ width: 28, height: 28 }}
                    >
                      {PALETTE.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <span
                      aria-hidden
                      style={{
                        display: "inline-block",
                        width: 28,
                        height: 28,
                        background: item.color ?? PALETTE[0].value,
                        border: "1px solid var(--rule-hi)",
                      }}
                    />
                  </div>

                  {/* Label */}
                  <input
                    type="text"
                    value={item.label}
                    onChange={(e) => updateItem(item.id, { label: e.target.value })}
                    placeholder="Tile label (e.g. Latte, Booster Pack)"
                    className="flex-1 bg-transparent border-0 text-ink focus:outline-none border-b border-rule-faint focus:border-orange transition-colors"
                    style={{ fontSize: "0.95rem", fontWeight: 500, padding: "0.25rem 0" }}
                  />

                  {/* Reorder + delete */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => moveItem(item.id, "up")}
                      disabled={idx === 0}
                      aria-label="Move up"
                      className="text-ink-faint hover:text-ink disabled:opacity-30 px-2"
                      style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveItem(item.id, "down")}
                      disabled={idx === items.length - 1}
                      aria-label="Move down"
                      className="text-ink-faint hover:text-ink disabled:opacity-30 px-2"
                      style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => removeItem(item.id)}
                      aria-label="Delete"
                      className="text-red hover:opacity-80 px-2"
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.7rem",
                        letterSpacing: "0.16em",
                        textTransform: "uppercase",
                        fontWeight: 600,
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Inventory link / price */}
                <div className="flex items-center gap-3 pl-10" style={{ minHeight: 32 }}>
                  {item.inventory_id ? (
                    <>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.62rem",
                          letterSpacing: "0.16em",
                          textTransform: "uppercase",
                          fontWeight: 700,
                          color: "var(--teal)",
                          padding: "2px 6px",
                          border: "1px solid var(--teal)",
                          background: "var(--teal-mute)",
                        }}
                      >
                        Linked
                      </span>
                      <span className="text-ink-soft truncate" style={{ fontSize: "0.85rem", flex: 1 }}>
                        {linked?.name ?? item.inventory_id} {linked ? `· ${dollars(linked.price_cents)}` : ""}
                      </span>
                      <button
                        onClick={() =>
                          updateItem(item.id, { inventory_id: undefined })
                        }
                        className="text-ink-faint hover:text-ink"
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.7rem",
                          letterSpacing: "0.16em",
                          textTransform: "uppercase",
                          fontWeight: 600,
                        }}
                      >
                        Unlink
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setPickerForId(item.id)}
                        className="text-orange hover:opacity-80"
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.7rem",
                          letterSpacing: "0.16em",
                          textTransform: "uppercase",
                          fontWeight: 600,
                        }}
                      >
                        Link to inventory →
                      </button>
                      <span className="text-ink-faint" style={{ fontSize: "0.78rem" }}>
                        or set a fixed price:
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.price_cents ? (item.price_cents / 100).toFixed(2) : ""}
                        onChange={(e) =>
                          updateItem(item.id, { price_cents: dollarsToCents(e.target.value) })
                        }
                        placeholder="0.00"
                        className="border border-rule-hi bg-panel-mute text-ink px-2 tabular-nums"
                        style={{ width: 80, height: 30, fontSize: "0.85rem", fontFamily: "var(--font-mono)" }}
                      />
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className="border border-dashed border-rule px-4 py-6 text-center text-ink-faint"
          style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem", letterSpacing: "0.12em" }}
        >
          NO QUICK BUTTONS — REGISTER WILL AUTO-FILL FROM TOP SELLERS
        </div>
      )}

      {/* Add new */}
      <button
        onClick={addItem}
        disabled={items.length >= MAX_ITEMS}
        className="w-full bg-orange-mute text-orange border border-orange disabled:opacity-30 transition-opacity"
        style={{
          height: 44,
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: "0.85rem",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        + Add Quick Button {items.length >= MAX_ITEMS ? `(max ${MAX_ITEMS})` : ""}
      </button>

      {saving && (
        <div
          className="text-ink-faint"
          style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", letterSpacing: "0.16em", textTransform: "uppercase" }}
        >
          Saving…
        </div>
      )}

      <InventoryPicker
        open={!!pickerForId}
        onClose={() => setPickerForId(null)}
        onPick={(hit) => {
          if (pickerForId) {
            updateItem(pickerForId, {
              inventory_id: hit.id,
              label: items.find((i) => i.id === pickerForId)?.label || hit.name,
              price_cents: hit.price_cents,
            });
            setLinkedSnapshot((prev) => ({
              ...prev,
              [hit.id]: { name: hit.name, price_cents: hit.price_cents },
            }));
          }
          setPickerForId(null);
        }}
      />
    </div>
  );
}
