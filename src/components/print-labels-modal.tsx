"use client";

import { useState, useEffect } from "react";
import { InventoryItem, formatCents } from "@/lib/types";

interface LabelItem {
  item: InventoryItem;
  quantity: number;
}

interface PrintLabelsModalProps {
  onClose: () => void;
  /** Pre-selected items from the inventory page (optional) */
  preselected?: InventoryItem[];
}

export function PrintLabelsModal({ onClose, preselected }: PrintLabelsModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<InventoryItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Map<string, LabelItem>>(() => {
    const map = new Map<string, LabelItem>();
    if (preselected) {
      for (const item of preselected) {
        map.set(item.id, { item, quantity: 1 });
      }
    }
    return map;
  });
  const [labelSize, setLabelSize] = useState<"small" | "medium">("small");
  const [includePrice, setIncludePrice] = useState(true);
  const [includeBarcode, setIncludeBarcode] = useState(true);
  const [printing, setPrinting] = useState(false);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/inventory/search?q=${encodeURIComponent(searchQuery.trim())}`
        );
        if (res.ok) {
          setSearchResults(await res.json());
        }
      } catch {
        // ignore
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  function toggleItem(item: InventoryItem) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.set(item.id, { item, quantity: 1 });
      }
      return next;
    });
  }

  function updateQuantity(id: string, qty: number) {
    setSelected((prev) => {
      const next = new Map(prev);
      const entry = next.get(id);
      if (entry) {
        next.set(id, { ...entry, quantity: Math.max(1, qty) });
      }
      return next;
    });
  }

  async function handlePrint() {
    if (selected.size === 0) return;
    setPrinting(true);
    try {
      const payload = {
        items: Array.from(selected.values()).map((s) => ({
          item_id: s.item.id,
          quantity: s.quantity,
        })),
        label_size: labelSize,
        include_price: includePrice,
        include_barcode: includeBarcode,
      };

      const res = await fetch("/api/inventory/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const html = await res.text();
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          printWindow.document.write(html);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => printWindow.print(), 500);
        }
      }
    } finally {
      setPrinting(false);
    }
  }

  const totalLabels = Array.from(selected.values()).reduce(
    (s, i) => s + i.quantity,
    0
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-bg"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        ref={(el: HTMLDivElement | null) => {
          if (!el) return;
          const handler = (e: FocusEvent) => {
            const target = e.target as HTMLElement;
            if (
              target.tagName === "INPUT" ||
              target.tagName === "TEXTAREA" ||
              target.tagName === "SELECT"
            ) {
              setTimeout(
                () =>
                  target.scrollIntoView({ behavior: "smooth", block: "center" }),
                300
              );
            }
          };
          el.addEventListener("focusin", handler);
          return () => el.removeEventListener("focusin", handler);
        }}
        className="w-full max-w-lg rounded-xl border border-card-border bg-card p-6 shadow-2xl mx-4 max-h-[90vh] overflow-y-auto scroll-visible"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Print Labels</h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center h-8 w-8 rounded-full text-muted hover:text-foreground active:bg-card-hover transition-colors text-lg"
          >
            &times;
          </button>
        </div>

        {/* Settings row */}
        <div className="flex flex-wrap gap-4 items-center mb-4">
          <div>
            <label className="block text-xs text-muted mb-1">Label Size</label>
            <select
              value={labelSize}
              onChange={(e) =>
                setLabelSize(e.target.value as "small" | "medium")
              }
              className="bg-card-hover border border-input-border rounded px-3 py-1.5 text-foreground text-sm"
            >
              <option value="small">Small (1.5&quot; x 1&quot;)</option>
              <option value="medium">Medium (2&quot; x 1&quot;)</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground/70 cursor-pointer">
            <input
              type="checkbox"
              checked={includePrice}
              onChange={(e) => setIncludePrice(e.target.checked)}
              className="rounded border-input-border bg-card-hover text-indigo-600"
            />
            Price
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground/70 cursor-pointer">
            <input
              type="checkbox"
              checked={includeBarcode}
              onChange={(e) => setIncludeBarcode(e.target.checked)}
              className="rounded border-input-border bg-card-hover text-indigo-600"
            />
            Barcode
          </label>
        </div>

        {/* Selected items */}
        {selected.size > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              Selected ({selected.size} items, {totalLabels} labels)
            </h3>
            <div className="space-y-1.5 max-h-40 overflow-y-auto scroll-visible">
              {Array.from(selected.values()).map(({ item, quantity }) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between bg-card-hover rounded px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      onClick={() => toggleItem(item)}
                      className="text-red-500 hover:text-red-400 text-xs flex-shrink-0"
                    >
                      X
                    </button>
                    <span className="text-foreground truncate">
                      {item.name}
                    </span>
                    <span className="text-muted text-xs flex-shrink-0">
                      {formatCents(item.price_cents)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                    <label className="text-xs text-muted">Qty:</label>
                    <input
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={(e) =>
                        updateQuantity(item.id, parseInt(e.target.value) || 1)
                      }
                      className="w-14 bg-card border border-input-border rounded px-2 py-1 text-foreground text-sm text-center"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search to add items */}
        <div className="mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items to label..."
            className="w-full rounded-xl border border-card-border bg-card px-4 py-2 text-sm text-foreground placeholder:text-muted focus:border-blue-500 focus:outline-none"
            autoFocus
          />
        </div>

        {/* Search results */}
        {searchQuery.trim() && (
          <div className="mb-4 max-h-48 overflow-y-auto rounded-lg border border-card-border scroll-visible">
            {searching ? (
              <p className="text-xs text-muted p-3">Searching...</p>
            ) : searchResults.length === 0 ? (
              <p className="text-xs text-muted p-3">No items found.</p>
            ) : (
              <div className="divide-y divide-card-border">
                {searchResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleItem(item)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors text-left ${
                      selected.has(item.id)
                        ? "bg-indigo-900/20 text-foreground"
                        : "hover:bg-card-hover text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggleItem(item)}
                        className="rounded border-input-border bg-card-hover text-indigo-600 flex-shrink-0"
                      />
                      <span className="truncate">{item.name}</span>
                    </div>
                    <span className="text-muted text-xs flex-shrink-0 ml-2">
                      {formatCents(item.price_cents)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Print button */}
        <button
          onClick={handlePrint}
          disabled={printing || selected.size === 0}
          className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
        >
          {printing
            ? "Preparing..."
            : selected.size === 0
              ? "Select items to print"
              : `Print ${totalLabels} Label${totalLabels !== 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}
