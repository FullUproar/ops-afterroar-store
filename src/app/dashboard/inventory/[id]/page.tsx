"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { useStore } from "@/lib/store-context";
import {
  InventoryItem,
  ItemCategory,
  formatCents,
  parseDollars,
} from "@/lib/types";
import { StatusBadge } from "@/components/mobile-card";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/shared/ui";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CATEGORIES: { value: ItemCategory; label: string }[] = [
  { value: "tcg_single", label: "TCG Single" },
  { value: "sealed", label: "Sealed" },
  { value: "board_game", label: "Board Game" },
  { value: "miniature", label: "Miniature" },
  { value: "accessory", label: "Accessory" },
  { value: "food_drink", label: "Food & Drink" },
  { value: "other", label: "Other" },
];

const ADJUSTMENT_REASONS = [
  "Received shipment",
  "Damaged/defective",
  "Physical count correction",
  "Theft/shrinkage",
  "Returned to supplier",
  "Other",
];

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SaleEntry {
  id: string;
  type: string;
  amount_cents: number;
  description: string | null;
  customer_name: string | null;
  staff_name: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface EditForm {
  name: string;
  category: ItemCategory;
  price: string;
  cost: string;
  barcode: string;
}

interface AdjustState {
  type: "add" | "remove";
  amount: string;
  reason: string;
  notes: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const getCategoryLabel = (cat: string) =>
  CATEGORIES.find((c) => c.value === cat)?.label ?? cat;

const getStockColor = (qty: number) => {
  if (qty === 0) return "text-red-500";
  if (qty <= 3) return "text-orange-400";
  return "text-green-500";
};

const getStockBg = (qty: number) => {
  if (qty === 0) return "bg-red-500/10 border-red-500/30";
  if (qty <= 3) return "bg-orange-500/10 border-orange-500/30";
  return "bg-green-500/10 border-green-500/30";
};

function formatMargin(priceCents: number, costCents: number): string {
  if (priceCents === 0) return "--";
  const margin = ((priceCents - costCents) / priceCents) * 100;
  return `${margin.toFixed(1)}%`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function InventoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useStore();

  const [item, setItem] = useState<InventoryItem | null>(null);
  const [sales, setSales] = useState<SaleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    name: "",
    category: "other",
    price: "",
    cost: "",
    barcode: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Adjust stock state
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjust, setAdjust] = useState<AdjustState>({
    type: "add",
    amount: "",
    reason: "",
    notes: "",
  });
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // Lendable toggle
  const [togglingLendable, setTogglingLendable] = useState(false);

  /* ---- Load item ---- */
  const loadItem = useCallback(async () => {
    try {
      const res = await fetch(`/api/inventory/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Item not found" }));
        setError(body.error || "Failed to load item");
        return;
      }
      const data = await res.json();
      setItem(data.item);
      setSales(data.sales ?? []);
      // Pre-fill edit form
      setEditForm({
        name: data.item.name || "",
        category: data.item.category || "other",
        price: (data.item.price_cents / 100).toFixed(2),
        cost: (data.item.cost_cents / 100).toFixed(2),
        barcode: data.item.barcode || "",
      });
    } catch {
      setError("Failed to load item");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadItem();
  }, [loadItem]);

  /* ---- Edit handlers ---- */
  async function handleSaveEdit() {
    if (!item) return;
    if (!editForm.name.trim()) {
      setSaveError("Name is required");
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const res = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          name: editForm.name.trim(),
          category: editForm.category,
          price_cents: parseDollars(editForm.price),
          cost_cents: parseDollars(editForm.cost),
          barcode: editForm.barcode.trim() || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Failed to save" }));
        throw new Error(body.error || "Failed to save");
      }

      const updated = await res.json();
      setItem(updated);
      setEditing(false);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  /* ---- Stock adjustment ---- */
  async function handleAdjustSubmit() {
    if (!item) return;

    const amount = parseInt(adjust.amount, 10);
    if (!amount || amount <= 0) {
      setAdjustError("Enter a valid amount greater than 0");
      return;
    }
    if (!adjust.reason) {
      setAdjustError("Please select a reason");
      return;
    }

    const adjustment = adjust.type === "add" ? amount : -amount;

    setAdjustSubmitting(true);
    setAdjustError(null);

    try {
      const res = await fetch("/api/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: item.id,
          adjustment,
          reason: adjust.reason,
          notes: adjust.notes.trim() || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Failed to adjust" }));
        throw new Error(body.error || "Failed to adjust stock");
      }

      const updated = await res.json();
      setItem(updated);
      setShowAdjust(false);
      setAdjust({ type: "add", amount: "", reason: "", notes: "" });
    } catch (err: unknown) {
      setAdjustError(err instanceof Error ? err.message : "Failed to adjust");
    } finally {
      setAdjustSubmitting(false);
    }
  }

  /* ---- Lendable toggle ---- */
  async function handleToggleLendable() {
    if (!item) return;
    setTogglingLendable(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, lendable: !item.lendable }),
      });
      if (res.ok) {
        const updated = await res.json();
        setItem(updated);
      }
    } catch {
      // Silently fail
    } finally {
      setTogglingLendable(false);
    }
  }

  /* ---- Delete item ---- */
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!item) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      if (res.ok) {
        window.location.href = "/dashboard/inventory";
      }
    } finally {
      setDeleting(false);
    }
  }

  /* ---- Render ---- */
  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Item Details" backHref="/dashboard/inventory" />
        <div className="text-center text-muted py-12">Loading item...</div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="space-y-6">
        <PageHeader title="Item Details" backHref="/dashboard/inventory" />
        <EmptyState
          icon="&#x26A0;"
          title={error || "Item not found"}
          description="This item may have been deleted or you don't have access."
          action={{ label: "Back to Inventory", href: "/dashboard/inventory" }}
        />
      </div>
    );
  }

  const attrs = (item.attributes ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={item.name}
        backHref="/dashboard/inventory"
        action={
          can("inventory.adjust") && !editing ? (
            <button
              onClick={() => setEditing(true)}
              className="rounded-xl border border-card-border px-4 py-2 text-sm font-medium text-muted hover:bg-card-hover transition-colors"
            >
              Edit Item
            </button>
          ) : undefined
        }
      />

      {/* ============================================================ */}
      {/*  Section 1: Item Header                                       */}
      {/* ============================================================ */}
      <div className="rounded-xl border border-card-border bg-card p-6 shadow-sm dark:shadow-none">
        {editing ? (
          /* ---- Edit Form ---- */
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Edit Item</h2>

            {saveError && <p className="text-sm text-red-400">{saveError}</p>}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                  className="w-full rounded-xl border border-input-border bg-input-bg px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  Category
                </label>
                <select
                  value={editForm.category}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      category: e.target.value as ItemCategory,
                    })
                  }
                  className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-foreground focus:border-indigo-500 focus:outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  Price ($)
                </label>
                <input
                  type="text"
                  value={editForm.price}
                  onChange={(e) =>
                    setEditForm({ ...editForm, price: e.target.value })
                  }
                  className="w-full rounded-xl border border-input-border bg-input-bg px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  Cost ($)
                </label>
                <input
                  type="text"
                  value={editForm.cost}
                  onChange={(e) =>
                    setEditForm({ ...editForm, cost: e.target.value })
                  }
                  className="w-full rounded-xl border border-input-border bg-input-bg px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  Barcode
                </label>
                <input
                  type="text"
                  value={editForm.barcode}
                  onChange={(e) =>
                    setEditForm({ ...editForm, barcode: e.target.value })
                  }
                  className="w-full rounded-xl border border-input-border bg-input-bg px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  placeholder="Scan or type barcode"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setEditing(false);
                  setSaveError(null);
                  // Reset form to current item values
                  setEditForm({
                    name: item.name,
                    category: item.category,
                    price: (item.price_cents / 100).toFixed(2),
                    cost: (item.cost_cents / 100).toFixed(2),
                    barcode: item.barcode || "",
                  });
                }}
                className="rounded-xl border border-card-border px-4 py-2 text-sm text-muted hover:bg-card-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        ) : (
          /* ---- Display Header ---- */
          <div className="flex flex-col sm:flex-row gap-5">
            {/* Image placeholder */}
            <div className="shrink-0">
              {item.image_url ? (
                <Image
                  src={item.image_url}
                  alt={item.name}
                  width={128}
                  height={128}
                  className="w-24 h-24 sm:w-32 sm:h-32 rounded-xl object-cover border border-card-border"
                  unoptimized
                />
              ) : (
                <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-xl bg-zinc-800 border border-card-border flex items-center justify-center">
                  <svg
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="text-zinc-500"
                  >
                    <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
              )}
            </div>

            {/* Item info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-3 flex-wrap">
                <h2 className="text-xl font-bold text-foreground leading-tight">
                  {item.name}
                </h2>
                <StatusBadge
                  variant={item.active ? "success" : "info"}
                >
                  {item.active ? "Active" : "Inactive"}
                </StatusBadge>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                <span className="inline-block rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-muted">
                  {getCategoryLabel(item.category)}
                </span>
                {Boolean(attrs.foil) && (
                  <StatusBadge variant="pending">Foil</StatusBadge>
                )}
                {item.lendable && (
                  <StatusBadge variant="success">Lendable</StatusBadge>
                )}
                {item.shared_to_catalog && (
                  <StatusBadge variant="info">Shared to Catalog</StatusBadge>
                )}
              </div>

              {item.barcode && (
                <p className="mt-2 text-sm text-muted">
                  <span className="font-medium text-foreground/70">Barcode:</span>{" "}
                  <span className="font-mono">{item.barcode}</span>
                </p>
              )}

              {item.sku && (
                <p className="mt-1 text-sm text-muted">
                  <span className="font-medium text-foreground/70">SKU:</span>{" "}
                  <span className="font-mono">{item.sku}</span>
                </p>
              )}

              <p className="mt-1 text-xs text-muted">
                Added {formatDate(item.created_at)}
                {item.updated_at !== item.created_at &&
                  ` · Updated ${formatDate(item.updated_at)}`}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/*  Section 2: Stock & Pricing                                   */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Quantity card */}
        <div
          className={`rounded-xl border p-5 text-center shadow-sm dark:shadow-none ${getStockBg(
            item.quantity
          )}`}
        >
          <p className="text-sm font-medium text-muted mb-1">In Stock</p>
          <p className={`text-4xl font-bold tabular-nums ${getStockColor(item.quantity)}`}>
            {item.quantity}
          </p>
          {item.low_stock_threshold > 0 && (
            <p className="text-xs text-muted mt-1">
              Low stock alert at {item.low_stock_threshold}
            </p>
          )}
          {can("inventory.adjust") && (
            <button
              onClick={() => setShowAdjust(true)}
              className="mt-3 rounded-xl bg-accent/20 border border-accent/40 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition-colors"
            >
              Adjust Stock
            </button>
          )}
        </div>

        {/* Price card */}
        <div className="rounded-xl border border-card-border bg-card p-5 shadow-sm dark:shadow-none">
          <p className="text-sm font-medium text-muted mb-1">Price</p>
          <p className="text-2xl font-bold text-foreground tabular-nums">
            {formatCents(item.price_cents)}
          </p>
        </div>

        {/* Cost + Margin card */}
        <div className="rounded-xl border border-card-border bg-card p-5 shadow-sm dark:shadow-none">
          <p className="text-sm font-medium text-muted mb-1">Cost / Margin</p>
          <div className="flex items-baseline gap-3">
            <p className="text-2xl font-bold text-foreground tabular-nums">
              {formatCents(item.cost_cents)}
            </p>
            <span
              className={`text-sm font-semibold ${
                item.price_cents > item.cost_cents
                  ? "text-green-400"
                  : item.price_cents === item.cost_cents
                  ? "text-muted"
                  : "text-red-400"
              }`}
            >
              {formatMargin(item.price_cents, item.cost_cents)} margin
            </span>
          </div>
        </div>
      </div>

      {/* Lendable toggle for board games */}
      {item.category === "board_game" && can("inventory.adjust") && (
        <div className="rounded-xl border border-card-border bg-card p-4 shadow-sm dark:shadow-none flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">
              Game Library Lending
            </p>
            <p className="text-xs text-muted mt-0.5">
              Allow this game to be checked out by customers for in-store play
            </p>
          </div>
          <button
            onClick={handleToggleLendable}
            disabled={togglingLendable}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              item.lendable ? "bg-green-600" : "bg-zinc-600"
            } ${togglingLendable ? "opacity-50" : "cursor-pointer"}`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition duration-200 ease-in-out ${
                item.lendable ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/*  Section 3: Sales History                                     */}
      {/* ============================================================ */}
      <div className="rounded-xl border border-card-border bg-card shadow-sm dark:shadow-none">
        <div className="px-6 py-4 border-b border-card-border">
          <h3 className="text-base font-semibold text-foreground">
            Recent Sales
          </h3>
        </div>

        {sales.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <p className="text-muted text-sm">No sales recorded yet</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-card-border">
              {sales.map((sale) => (
                <div key={sale.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground font-medium">
                      {formatCents(Math.abs(sale.amount_cents))}
                    </span>
                    <StatusBadge
                      variant={sale.type === "sale" ? "success" : "pending"}
                    >
                      {sale.type}
                    </StatusBadge>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted">
                    <span>{sale.customer_name || "Walk-in"}</span>
                    <span>{formatDateTime(sale.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-muted">
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Type</th>
                    <th className="px-6 py-3 font-medium text-right">Amount</th>
                    <th className="px-6 py-3 font-medium">Customer</th>
                    <th className="px-6 py-3 font-medium">Staff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {sales.map((sale) => (
                    <tr
                      key={sale.id}
                      className="bg-background hover:bg-card/50 transition-colors"
                    >
                      <td className="px-6 py-3 text-muted whitespace-nowrap">
                        {formatDateTime(sale.created_at)}
                      </td>
                      <td className="px-6 py-3">
                        <StatusBadge
                          variant={sale.type === "sale" ? "success" : "pending"}
                        >
                          {sale.type}
                        </StatusBadge>
                      </td>
                      <td className="px-6 py-3 text-right text-foreground font-medium tabular-nums">
                        {formatCents(Math.abs(sale.amount_cents))}
                      </td>
                      <td className="px-6 py-3 text-muted">
                        {sale.customer_name || "Walk-in"}
                      </td>
                      <td className="px-6 py-3 text-muted">
                        {sale.staff_name || "--"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ============================================================ */}
      {/*  Section 4: Item Attributes                                   */}
      {/* ============================================================ */}
      {Object.keys(attrs).length > 0 && (
        <div className="rounded-xl border border-card-border bg-card shadow-sm dark:shadow-none">
          <div className="px-6 py-4 border-b border-card-border">
            <h3 className="text-base font-semibold text-foreground">
              Attributes
            </h3>
          </div>
          <div className="px-6 py-4">
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
              {Object.entries(attrs).map(([key, value]) => {
                // Skip null/undefined values
                if (value === null || value === undefined) return null;

                const displayKey = key
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (c) => c.toUpperCase());

                let displayValue: string;
                if (typeof value === "boolean") {
                  displayValue = value ? "Yes" : "No";
                } else if (typeof value === "object") {
                  displayValue = JSON.stringify(value);
                } else {
                  displayValue = String(value);
                }

                return (
                  <div key={key}>
                    <dt className="text-xs font-medium text-muted">
                      {displayKey}
                    </dt>
                    <dd className="text-sm text-foreground mt-0.5">
                      {displayValue}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/*  Stock Adjustment Modal                                       */}
      {/* ============================================================ */}
      {showAdjust && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-bg"
          onClick={() => {
            setShowAdjust(false);
            setAdjustError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setShowAdjust(false);
              setAdjustError(null);
            }
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
                      target.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      }),
                    300
                  );
                }
              };
              el.addEventListener("focusin", handler);
              return () => el.removeEventListener("focusin", handler);
            }}
            className="w-full max-w-md rounded-xl border border-card-border bg-card p-6 shadow-2xl mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-semibold text-foreground">
                Adjust Stock
              </h2>
              <button
                onClick={() => {
                  setShowAdjust(false);
                  setAdjustError(null);
                }}
                className="flex items-center justify-center h-8 w-8 rounded-full text-muted hover:text-foreground active:bg-card-hover transition-colors text-lg"
              >
                &times;
              </button>
            </div>
            <p className="text-sm text-muted mb-4">{item.name}</p>

            {/* Current quantity */}
            <div className="mb-4 rounded-md bg-background border border-card-border px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-muted">Current Quantity</span>
              <span className="text-lg font-bold text-foreground">
                {item.quantity}
              </span>
            </div>

            {adjustError && (
              <p className="mb-3 text-sm text-red-400">{adjustError}</p>
            )}

            {/* Add / Remove toggle */}
            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => setAdjust({ ...adjust, type: "add" })}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  adjust.type === "add"
                    ? "bg-emerald-600 text-foreground"
                    : "bg-zinc-800 text-muted hover:bg-zinc-700"
                }`}
              >
                Add
              </button>
              <button
                onClick={() => setAdjust({ ...adjust, type: "remove" })}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  adjust.type === "remove"
                    ? "bg-red-600 text-foreground"
                    : "bg-zinc-800 text-muted hover:bg-zinc-700"
                }`}
              >
                Remove
              </button>
            </div>

            {/* Amount */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-muted mb-1">
                Amount
              </label>
              <input
                type="number"
                min={1}
                value={adjust.amount}
                onChange={(e) =>
                  setAdjust({ ...adjust, amount: e.target.value })
                }
                className="w-full rounded-xl border border-input-border bg-input-bg px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                placeholder="Enter quantity"
                autoFocus
              />
            </div>

            {/* Reason */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-muted mb-1">
                Reason *
              </label>
              <select
                value={adjust.reason}
                onChange={(e) =>
                  setAdjust({ ...adjust, reason: e.target.value })
                }
                className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-foreground focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Select a reason...</option>
                {ADJUSTMENT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-muted mb-1">
                Notes (optional)
              </label>
              <textarea
                value={adjust.notes}
                onChange={(e) =>
                  setAdjust({ ...adjust, notes: e.target.value })
                }
                rows={2}
                className="w-full rounded-xl border border-input-border bg-input-bg px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none resize-none"
                placeholder="Additional details..."
              />
            </div>

            {/* Preview */}
            {adjust.amount && parseInt(adjust.amount, 10) > 0 && (
              <div className="mb-4 rounded-md bg-background border border-card-border px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-muted">New Quantity</span>
                <span className="text-lg font-bold text-foreground">
                  {adjust.type === "add"
                    ? item.quantity + parseInt(adjust.amount, 10)
                    : Math.max(0, item.quantity - parseInt(adjust.amount, 10))}
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowAdjust(false);
                  setAdjustError(null);
                }}
                className="flex-1 rounded-xl border border-card-border px-4 py-2 text-sm text-muted hover:bg-card-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdjustSubmit}
                disabled={adjustSubmitting}
                className={`flex-1 rounded-md px-4 py-2 text-sm font-medium text-foreground transition-colors ${
                  adjust.type === "add"
                    ? "bg-emerald-600 hover:bg-emerald-500"
                    : "bg-red-600 hover:bg-red-500"
                } disabled:opacity-50`}
              >
                {adjustSubmitting ? "Adjusting..." : "Confirm Adjustment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Item */}
      {can("inventory.adjust") && (
        <div className="rounded-xl border border-red-500/10 bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-foreground">Delete Item</h3>
              <p className="text-xs text-muted mt-0.5">Permanently remove this item. For mistakes only.</p>
            </div>
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 transition-colors"
              >
                Delete
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 text-xs text-muted hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-3 py-1.5 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-500 disabled:opacity-50 transition-colors"
                >
                  {deleting ? "Deleting..." : "Confirm Delete"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
