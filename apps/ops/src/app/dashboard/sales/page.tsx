"use client";

/**
 * /dashboard/sales — line-by-line sales transaction log.
 *
 * The companion to the aggregated /dashboard/reports/sales page. This is
 * the row-per-transaction view owners need for end-of-day reconciliation,
 * "did this sale go through?" lookups, and tax-time exports.
 *
 * Backed by /api/transactions which queries pos_ledger_entries with
 * type IN (sale, refund, void, ...) — the same source of truth the
 * register's offline sync writes to.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCents } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { SubNav } from "@/components/ui/sub-nav";
import { ORDERS_TABS } from "@/lib/nav-groups";
import { EmptyState } from "@/components/shared/ui";

interface SaleItem {
  inventoryItemId?: string;
  inventory_item_id?: string;
  name: string;
  qty?: number;
  quantity?: number;
  priceCents?: number;
  price_cents?: number;
}

interface Transaction {
  id: string;
  type: string;
  amount_cents: number;
  description: string | null;
  customer_name: string | null;
  customer_id: string | null;
  staff_name: string | null;
  payment_method: string | null;
  source: "register" | "online";
  item_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface StaffOption {
  id: string;
  name: string;
}

type Preset = "today" | "yesterday" | "week" | "month" | "custom";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "Last 7d" },
  { value: "month", label: "Last 30d" },
  { value: "custom", label: "Custom" },
];

function presetRange(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  switch (preset) {
    case "today":
      return { from: fmt(today), to: fmt(today) };
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { from: fmt(y), to: fmt(y) };
    }
    case "week": {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { from: fmt(start), to: fmt(today) };
    }
    case "month": {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { from: fmt(start), to: fmt(today) };
    }
    default:
      return { from: fmt(today), to: fmt(today) };
  }
}

const PAGE_SIZE = 50;

export default function SalesPage() {
  const [preset, setPreset] = useState<Preset>("today");
  const [from, setFrom] = useState(() => presetRange("today").from);
  const [to, setTo] = useState(() => presetRange("today").to);
  const [staffId, setStaffId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [source, setSource] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refundTarget, setRefundTarget] = useState<Transaction | null>(null);
  const [receiptTarget, setReceiptTarget] = useState<Transaction | null>(null);

  // When preset changes, recompute range (custom = freeform)
  useEffect(() => {
    if (preset !== "custom") {
      const r = presetRange(preset);
      setFrom(r.from);
      setTo(r.to);
      setPage(0);
    }
  }, [preset]);

  // Reset to page 0 when other filters change
  useEffect(() => {
    setPage(0);
  }, [staffId, paymentMethod, source, search, from, to]);

  // Load staff options once
  useEffect(() => {
    fetch("/api/staff")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Array<{ id: string; name: string }>) => {
        setStaffOptions(rows.map((s) => ({ id: s.id, name: s.name })));
      })
      .catch(() => setStaffOptions([]));
  }, []);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (staffId) params.set("staff_id", staffId);
      if (paymentMethod) params.set("payment_method", paymentMethod);
      if (source) params.set("source", source);
      if (search.trim()) params.set("q", search.trim());
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));
      const res = await fetch(`/api/transactions?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data: { transactions: Transaction[]; total: number } = await res.json();
      setTransactions(data.transactions);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [from, to, staffId, paymentMethod, source, search, page]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  const totals = useMemo(() => {
    let count = 0;
    let gross = 0;
    let refunded = 0;
    for (const t of transactions) {
      count++;
      if (t.type === "sale" || t.type === "event_fee" || t.type === "gift_card_sale") {
        gross += t.amount_cents;
      } else if (t.type === "refund" || t.type === "void") {
        refunded += t.amount_cents;
      }
    }
    return { count, gross, refunded, net: gross - refunded };
  }, [transactions]);

  function exportCsv() {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (staffId) params.set("staff_id", staffId);
    if (paymentMethod) params.set("payment_method", paymentMethod);
    if (source) params.set("source", source);
    if (search.trim()) params.set("q", search.trim());
    params.set("format", "csv");
    params.set("limit", "5000");
    window.location.href = `/api/transactions?${params.toString()}`;
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col h-full gap-4">
      <SubNav items={ORDERS_TABS} />
      <PageHeader
        title="Sales"
        crumb="Console · Sales"
        desc="Every transaction recorded against the store ledger — register, online, refunds, voids."
        action={
          <button
            type="button"
            onClick={exportCsv}
            disabled={total === 0}
            className="inline-flex items-center font-display uppercase transition-colors disabled:opacity-40"
            style={{
              fontSize: "0.85rem",
              letterSpacing: "0.06em",
              fontWeight: 700,
              padding: "0 1rem",
              minHeight: 48,
              color: "var(--ink)",
              background: "transparent",
              border: "1px solid var(--rule)",
            }}
          >
            Export CSV
          </button>
        }
      />

      {/* Filter bar */}
      <div className="ar-zone">
        <div className="ar-zone-head">
          <span>Filter</span>
          <span>{loading ? "Loading…" : `${total} transaction${total === 1 ? "" : "s"}`}</span>
        </div>
        <div className="p-4 flex flex-col gap-3">
          {/* Preset row */}
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPreset(p.value)}
                className="font-mono uppercase transition-colors"
                style={{
                  fontSize: "0.7rem",
                  letterSpacing: "0.12em",
                  fontWeight: 700,
                  padding: "0.5rem 0.875rem",
                  color: preset === p.value ? "var(--void)" : "var(--ink-soft)",
                  background: preset === p.value ? "var(--orange)" : "transparent",
                  border: `1px solid ${preset === p.value ? "var(--orange)" : "var(--rule)"}`,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Date range (always visible; editable when preset=custom) */}
          <div className="flex flex-wrap gap-3 items-end">
            <FilterField label="From">
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setPreset("custom");
                  setFrom(e.target.value);
                }}
                className="bg-input-bg text-foreground border border-input-border px-2 py-1.5 text-sm rounded"
              />
            </FilterField>
            <FilterField label="To">
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setPreset("custom");
                  setTo(e.target.value);
                }}
                className="bg-input-bg text-foreground border border-input-border px-2 py-1.5 text-sm rounded"
              />
            </FilterField>
            <FilterField label="Staff">
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="bg-input-bg text-foreground border border-input-border px-2 py-1.5 text-sm rounded"
              >
                <option value="">All</option>
                {staffOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Payment">
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="bg-input-bg text-foreground border border-input-border px-2 py-1.5 text-sm rounded"
              >
                <option value="">All</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="store_credit">Store credit</option>
                <option value="gift_card">Gift card</option>
              </select>
            </FilterField>
            <FilterField label="Source">
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="bg-input-bg text-foreground border border-input-border px-2 py-1.5 text-sm rounded"
              >
                <option value="">All</option>
                <option value="register">Register</option>
                <option value="online">Online</option>
              </select>
            </FilterField>
            <FilterField label="Search">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Customer, description, $amount"
                className="bg-input-bg text-foreground border border-input-border px-2 py-1.5 text-sm rounded w-56"
              />
            </FilterField>
          </div>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Transactions" value={String(totals.count)} />
        <Stat label="Gross" value={formatCents(totals.gross)} />
        <Stat label="Refunds" value={`-${formatCents(totals.refunded)}`} />
        <Stat label="Net" value={formatCents(totals.net)} accent />
      </div>

      {/* Error */}
      {error && (
        <div
          className="p-3"
          style={{
            border: "1px solid var(--red)",
            background: "var(--red-mute)",
            color: "var(--red)",
            fontSize: "0.85rem",
          }}
        >
          {error}
        </div>
      )}

      {/* Table */}
      <div className="ar-zone">
        <div className="ar-zone-head">
          <span>Transactions</span>
          <span>{loading ? "—" : `Page ${page + 1} of ${totalPages}`}</span>
        </div>
        {loading && transactions.length === 0 ? (
          <div className="p-8 text-center font-mono text-ink-soft" style={{ fontSize: "0.74rem", letterSpacing: "0.06em" }}>
            Loading transactions…
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon="•"
              title="No transactions"
              description="No sales recorded for this filter. Try a wider date range, or run a sale on the register."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-soft" style={{ fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  <th className="px-4 py-2 font-medium">Time</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Source</th>
                  <th className="px-4 py-2 font-medium">Staff</th>
                  <th className="px-4 py-2 font-medium">Customer</th>
                  <th className="px-4 py-2 font-medium text-right">Items</th>
                  <th className="px-4 py-2 font-medium">Payment</th>
                  <th className="px-4 py-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => {
                  const isExpanded = expandedId === t.id;
                  const isRefund = t.type === "refund" || t.type === "void";
                  const rawItems = Array.isArray(t.metadata.items) ? (t.metadata.items as SaleItem[]) : [];
                  const items = rawItems.map((it) => ({
                    inventory_item_id: it.inventory_item_id ?? it.inventoryItemId ?? "",
                    name: it.name,
                    quantity: it.quantity ?? it.qty ?? 0,
                    price_cents: it.price_cents ?? it.priceCents ?? 0,
                  }));
                  return (
                    <>
                      <tr
                        key={t.id}
                        onClick={() => setExpandedId(isExpanded ? null : t.id)}
                        className="border-t border-rule hover:bg-input-bg cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                          {formatTime(t.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <TypeBadge type={t.type} />
                        </td>
                        <td className="px-4 py-3">
                          <span style={{ fontSize: "0.75rem", color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                            {t.source}
                          </span>
                        </td>
                        <td className="px-4 py-3">{t.staff_name ?? "—"}</td>
                        <td className="px-4 py-3">{t.customer_name ?? "Guest"}</td>
                        <td className="px-4 py-3 text-right font-mono">{t.item_count || "—"}</td>
                        <td className="px-4 py-3">
                          <span style={{ fontSize: "0.75rem", color: "var(--ink-soft)", textTransform: "capitalize" }}>
                            {(t.payment_method ?? "—").replace(/_/g, " ")}
                          </span>
                        </td>
                        <td
                          className="px-4 py-3 text-right font-mono font-semibold whitespace-nowrap"
                          style={{ color: isRefund ? "var(--red)" : "var(--orange)" }}
                        >
                          {isRefund ? "-" : ""}
                          {formatCents(t.amount_cents)}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${t.id}-detail`} className="border-t border-rule">
                          <td colSpan={8} className="p-4 bg-input-bg">
                            {t.description && (
                              <div className="mb-2 text-ink-soft" style={{ fontSize: "0.78rem" }}>
                                {t.description}
                              </div>
                            )}
                            {items.length > 0 ? (
                              <div className="flex flex-col gap-1">
                                <div className="font-mono uppercase text-ink-faint mb-1" style={{ fontSize: "0.66rem", letterSpacing: "0.12em" }}>
                                  Line items
                                </div>
                                {items.map((it, idx) => (
                                  <div key={idx} className="flex items-center justify-between gap-3 py-1 border-b border-rule last:border-b-0">
                                    <div className="flex items-baseline gap-2">
                                      <span className="font-mono text-ink-soft" style={{ fontSize: "0.78rem" }}>×{it.quantity}</span>
                                      <span>{it.name}</span>
                                    </div>
                                    <div className="text-right">
                                      <span className="font-mono text-ink-soft" style={{ fontSize: "0.78rem" }}>{formatCents(it.price_cents)} ea</span>
                                      <span className="font-mono ml-3 font-semibold">{formatCents(it.quantity * it.price_cents)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-ink-faint text-sm italic">No line item detail recorded.</div>
                            )}
                            {typeof t.metadata.eventId === "string" && (
                              <div className="mt-3 font-mono text-ink-faint" style={{ fontSize: "0.66rem", letterSpacing: "0.06em" }}>
                                Event ID: {t.metadata.eventId} · Device: {String(t.metadata.deviceId ?? "—")}
                              </div>
                            )}
                            {t.type === "sale" && items.length > 0 && (
                              <div className="mt-3 flex gap-2 flex-wrap">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setReceiptTarget(t);
                                  }}
                                  className="font-mono uppercase transition-colors"
                                  style={{
                                    fontSize: "0.7rem",
                                    letterSpacing: "0.1em",
                                    fontWeight: 700,
                                    padding: "0.5rem 0.875rem",
                                    color: "var(--ink)",
                                    background: "transparent",
                                    border: "1px solid var(--rule)",
                                  }}
                                >
                                  Email receipt
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRefundTarget(t);
                                  }}
                                  className="font-mono uppercase transition-colors"
                                  style={{
                                    fontSize: "0.7rem",
                                    letterSpacing: "0.1em",
                                    fontWeight: 700,
                                    padding: "0.5rem 0.875rem",
                                    color: "var(--red)",
                                    background: "transparent",
                                    border: "1px solid var(--red)",
                                  }}
                                >
                                  Refund this sale
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 px-1">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="font-mono uppercase disabled:opacity-30"
            style={{
              fontSize: "0.74rem",
              letterSpacing: "0.1em",
              padding: "0.5rem 1rem",
              border: "1px solid var(--rule)",
              color: "var(--ink-soft)",
            }}
          >
            ← Prev
          </button>
          <span className="text-ink-soft text-sm">
            Page {page + 1} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="font-mono uppercase disabled:opacity-30"
            style={{
              fontSize: "0.74rem",
              letterSpacing: "0.1em",
              padding: "0.5rem 1rem",
              border: "1px solid var(--rule)",
              color: "var(--ink-soft)",
            }}
          >
            Next →
          </button>
        </div>
      )}

      {refundTarget && (
        <RefundModal
          sale={refundTarget}
          onClose={() => setRefundTarget(null)}
          onSuccess={() => {
            setRefundTarget(null);
            void loadTransactions();
          }}
        />
      )}

      {receiptTarget && (
        <EmailReceiptModal sale={receiptTarget} onClose={() => setReceiptTarget(null)} />
      )}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono uppercase text-ink-faint" style={{ fontSize: "0.62rem", letterSpacing: "0.16em" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className="p-4"
      style={{
        border: "1px solid var(--rule)",
        background: "var(--panel)",
      }}
    >
      <div className="font-mono uppercase text-ink-faint mb-1" style={{ fontSize: "0.66rem", letterSpacing: "0.16em" }}>
        {label}
      </div>
      <div
        className="font-display"
        style={{
          fontSize: "1.5rem",
          fontWeight: 800,
          color: accent ? "var(--orange)" : "var(--ink)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    sale: { label: "Sale", bg: "rgba(255,130,0,0.15)", fg: "var(--orange)" },
    refund: { label: "Refund", bg: "rgba(239,68,68,0.15)", fg: "var(--red)" },
    void: { label: "Void", bg: "rgba(239,68,68,0.15)", fg: "var(--red)" },
    trade_in: { label: "Trade-in", bg: "rgba(16,185,129,0.15)", fg: "var(--teal)" },
    event_fee: { label: "Event", bg: "rgba(251,219,101,0.15)", fg: "var(--cream)" },
    gift_card_sale: { label: "Gift card", bg: "rgba(251,219,101,0.15)", fg: "var(--cream)" },
  };
  const m = map[type] ?? { label: type, bg: "transparent", fg: "var(--ink-soft)" };
  return (
    <span
      className="font-mono uppercase"
      style={{
        fontSize: "0.68rem",
        letterSpacing: "0.08em",
        fontWeight: 700,
        padding: "0.18rem 0.5rem",
        background: m.bg,
        color: m.fg,
        borderRadius: "999px",
      }}
    >
      {m.label}
    </span>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return t;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${t}`;
}

/* ------------------------------------------------------------------ */
/*  Email-receipt modal                                                */
/* ------------------------------------------------------------------ */

function EmailReceiptModal({
  sale,
  onClose,
}: {
  sale: Transaction;
  onClose: () => void;
}) {
  // Pre-fill with the customer's email if we have one stored. (Backed-into
  // metadata in the future; for now we just leave it blank if absent.)
  const initialEmail = (sale.metadata.customer_email as string | undefined) ?? "";
  const [email, setEmail] = useState(initialEmail);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!email.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales/${encodeURIComponent(sale.id)}/email-receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Send failed (${res.status})`);
      }
      setDone(true);
      setTimeout(onClose, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel)",
          border: "1px solid var(--rule)",
          maxWidth: "440px",
          width: "100%",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem",
            borderBottom: "1px solid var(--rule)",
          }}
        >
          <h2 className="font-display" style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--cream)" }}>
            Email receipt
          </h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink" style={{ fontSize: "1.4rem" }}>
            ×
          </button>
        </header>
        <div style={{ padding: "1rem" }}>
          <div className="font-mono uppercase text-ink-faint mb-2" style={{ fontSize: "0.66rem", letterSpacing: "0.12em" }}>
            Send to
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="customer@example.com"
            autoFocus
            className="bg-input-bg text-foreground border border-input-border px-2 py-2 text-sm w-full rounded"
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
          />
          {done ? (
            <div
              className="mt-3 p-2"
              style={{
                border: "1px solid var(--teal)",
                background: "rgba(16,185,129,0.15)",
                color: "var(--teal)",
                fontSize: "0.85rem",
              }}
            >
              ✓ Sent to {email}
            </div>
          ) : null}
          {error && (
            <div
              className="mt-3 p-2"
              style={{ border: "1px solid var(--red)", background: "var(--red-mute)", color: "var(--red)", fontSize: "0.85rem" }}
            >
              {error}
            </div>
          )}
        </div>
        <footer
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.5rem",
            padding: "1rem",
            borderTop: "1px solid var(--rule)",
            background: "var(--panel-hi)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="font-mono uppercase"
            style={{
              fontSize: "0.74rem",
              letterSpacing: "0.1em",
              padding: "0.55rem 1rem",
              color: "var(--ink-soft)",
              border: "1px solid var(--rule)",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={send}
            disabled={!email.trim() || submitting || done}
            className="font-mono uppercase disabled:opacity-30"
            style={{
              fontSize: "0.74rem",
              letterSpacing: "0.1em",
              fontWeight: 700,
              padding: "0.55rem 1.25rem",
              color: "var(--void)",
              background: "var(--orange)",
              border: "1px solid var(--orange)",
            }}
          >
            {submitting ? "Sending…" : done ? "Sent" : "Send"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Refund modal                                                       */
/* ------------------------------------------------------------------ */

interface RefundLineState {
  inventory_item_id: string;
  name: string;
  quantity_available: number;
  price_cents: number;
  refund_qty: number;
  restock: boolean;
}

const REFUND_REASONS = [
  "Customer request",
  "Defective",
  "Wrong item",
  "Damaged in store",
  "Manager comp",
  "Other",
];

function RefundModal({
  sale,
  onClose,
  onSuccess,
}: {
  sale: Transaction;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const wasCardSale =
    (sale.metadata.paymentMethod ?? sale.metadata.payment_method) === "card";

  const [lines, setLines] = useState<RefundLineState[]>(() => {
    const raw = Array.isArray(sale.metadata.items) ? (sale.metadata.items as SaleItem[]) : [];
    return raw.map((it) => ({
      inventory_item_id: (it.inventory_item_id ?? it.inventoryItemId ?? "") as string,
      name: it.name,
      quantity_available: (it.quantity ?? it.qty ?? 0) as number,
      price_cents: (it.price_cents ?? it.priceCents ?? 0) as number,
      refund_qty: (it.quantity ?? it.qty ?? 0) as number,
      restock: true,
    }));
  });
  const [refundMethod, setRefundMethod] = useState<"cash" | "store_credit" | "card">(
    wasCardSale ? "card" : "cash",
  );
  const [reason, setReason] = useState(REFUND_REASONS[0]);
  const [reasonNotes, setReasonNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotalRefund = lines.reduce((s, l) => s + l.refund_qty * l.price_cents, 0);
  const canSubmit = subtotalRefund > 0 && !submitting;

  function adjustQty(idx: number, delta: number) {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const next = Math.max(0, Math.min(l.quantity_available, l.refund_qty + delta));
        return { ...l, refund_qty: next };
      }),
    );
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const clientTxId = `refund-${sale.id}-${Date.now()}`;
      const items = lines
        .filter((l) => l.refund_qty > 0)
        .map((l) => ({
          inventory_item_id: l.inventory_item_id,
          quantity: l.refund_qty,
          restock: l.restock,
        }));
      const res = await fetch(`/api/sales/${encodeURIComponent(sale.id)}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          refund_method: refundMethod,
          reason,
          reason_notes: reasonNotes.trim() || null,
          client_tx_id: clientTxId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Refund failed (${res.status})`);
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refund failed");
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel)",
          border: "1px solid var(--rule)",
          maxWidth: "640px",
          width: "100%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem",
            borderBottom: "1px solid var(--rule)",
          }}
        >
          <div>
            <h2 className="font-display" style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--cream)" }}>
              Refund sale
            </h2>
            <div className="font-mono text-ink-soft mt-1" style={{ fontSize: "0.7rem", letterSpacing: "0.06em" }}>
              {formatCents(sale.amount_cents)} · {sale.staff_name ?? "—"} · {sale.customer_name ?? "Guest"}
            </div>
          </div>
          <button onClick={onClose} className="text-ink-soft hover:text-ink" style={{ fontSize: "1.5rem" }}>
            ×
          </button>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>
          {/* Line items with qty pickers */}
          <div className="font-mono uppercase text-ink-faint mb-2" style={{ fontSize: "0.66rem", letterSpacing: "0.12em" }}>
            Items to refund
          </div>
          <div className="flex flex-col gap-2">
            {lines.map((l, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 p-3"
                style={{
                  border: "1px solid var(--rule)",
                  background: l.refund_qty > 0 ? "rgba(255,130,0,0.05)" : "transparent",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-ink" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {l.name}
                  </div>
                  <div className="text-ink-soft text-xs mt-1">
                    Sold: {l.quantity_available} × {formatCents(l.price_cents)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => adjustQty(idx, -1)}
                    disabled={l.refund_qty <= 0}
                    className="font-mono disabled:opacity-30"
                    style={{
                      width: "2rem",
                      height: "2rem",
                      border: "1px solid var(--rule)",
                      color: "var(--ink)",
                      fontSize: "1rem",
                    }}
                  >
                    −
                  </button>
                  <span className="font-mono w-6 text-center" style={{ color: "var(--cream)", fontWeight: 800 }}>
                    {l.refund_qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => adjustQty(idx, +1)}
                    disabled={l.refund_qty >= l.quantity_available}
                    className="font-mono disabled:opacity-30"
                    style={{
                      width: "2rem",
                      height: "2rem",
                      border: "1px solid var(--rule)",
                      color: "var(--ink)",
                      fontSize: "1rem",
                    }}
                  >
                    +
                  </button>
                </div>
                <div className="font-mono w-20 text-right" style={{ color: "var(--orange)", fontWeight: 700 }}>
                  -{formatCents(l.refund_qty * l.price_cents)}
                </div>
                <label className="flex items-center gap-1 text-xs text-ink-soft" style={{ whiteSpace: "nowrap" }}>
                  <input
                    type="checkbox"
                    checked={l.restock}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, restock: e.target.checked } : x)),
                      )
                    }
                  />
                  Restock
                </label>
              </div>
            ))}
          </div>

          {/* Method + reason */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            <div>
              <div className="font-mono uppercase text-ink-faint mb-2" style={{ fontSize: "0.66rem", letterSpacing: "0.12em" }}>
                Refund as
              </div>
              <div className="flex gap-1 flex-wrap">
                {(
                  [
                    { v: "cash", label: "Cash" },
                    { v: "store_credit", label: "Store credit" },
                    { v: "card", label: wasCardSale ? "Original card" : "Card (n/a)" },
                  ] as Array<{ v: typeof refundMethod; label: string }>
                ).map((m) => {
                  const disabled = m.v === "card" && !wasCardSale;
                  return (
                    <button
                      key={m.v}
                      type="button"
                      onClick={() => !disabled && setRefundMethod(m.v)}
                      disabled={disabled}
                      className="font-mono uppercase disabled:opacity-30"
                      style={{
                        fontSize: "0.7rem",
                        letterSpacing: "0.1em",
                        fontWeight: 700,
                        padding: "0.45rem 0.75rem",
                        color: refundMethod === m.v ? "var(--void)" : "var(--ink-soft)",
                        background: refundMethod === m.v ? "var(--orange)" : "transparent",
                        border: `1px solid ${refundMethod === m.v ? "var(--orange)" : "var(--rule)"}`,
                      }}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="font-mono uppercase text-ink-faint mb-2" style={{ fontSize: "0.66rem", letterSpacing: "0.12em" }}>
                Reason
              </div>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="bg-input-bg text-foreground border border-input-border px-2 py-1.5 text-sm w-full rounded"
              >
                {REFUND_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>

          <textarea
            value={reasonNotes}
            onChange={(e) => setReasonNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={2}
            className="bg-input-bg text-foreground border border-input-border px-2 py-1.5 text-sm w-full mt-3 rounded"
          />

          {error && (
            <div
              className="mt-3 p-2"
              style={{ border: "1px solid var(--red)", background: "var(--red-mute)", color: "var(--red)", fontSize: "0.85rem" }}
            >
              {error}
            </div>
          )}
        </div>

        <footer
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem",
            borderTop: "1px solid var(--rule)",
            background: "var(--panel-hi)",
          }}
        >
          <div>
            <div className="font-mono uppercase text-ink-faint" style={{ fontSize: "0.66rem", letterSpacing: "0.12em" }}>
              Refund total
            </div>
            <div className="font-display" style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--orange)" }}>
              {formatCents(subtotalRefund)}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="font-mono uppercase"
              style={{
                fontSize: "0.74rem",
                letterSpacing: "0.1em",
                padding: "0.65rem 1rem",
                color: "var(--ink-soft)",
                border: "1px solid var(--rule)",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="font-mono uppercase disabled:opacity-30"
              style={{
                fontSize: "0.74rem",
                letterSpacing: "0.1em",
                fontWeight: 700,
                padding: "0.65rem 1.25rem",
                color: "var(--void)",
                background: "var(--orange)",
                border: "1px solid var(--orange)",
              }}
            >
              {submitting ? "Refunding…" : `Refund ${formatCents(subtotalRefund)}`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
