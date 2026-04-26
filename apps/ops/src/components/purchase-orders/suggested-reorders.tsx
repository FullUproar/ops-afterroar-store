"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCents } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Suggested Reorders                                                 */
/*  Reads /api/purchase-orders/suggest, groups by preferred supplier, */
/*  and lets the operator one-tap "Create Draft PO" for any group.    */
/*  Lines are pre-checked; uncheck to skip; edit suggested qty inline.*/
/* ------------------------------------------------------------------ */

interface SuggestionLine {
  inventory_item_id: string;
  name: string;
  sku: string | null;
  vendor_sku: string | null;
  case_pack: number | null;
  quantity_on_hand: number;
  reorder_point: number;
  suggested_qty: number;
  last_cost_cents: number;
  line_cost_cents: number;
}

interface SuggestionGroup {
  supplier:
    | { id: string | null; name: string; account_number: string | null }
    | null;
  lines: SuggestionLine[];
  total_units: number;
  total_cost_cents: number;
}

interface SuggestedReordersProps {
  /** Bumped by parent to force a refetch (e.g. after a draft PO is created). */
  refreshKey?: number;
  /** Called after a PO is created so the parent can refresh its list. */
  onPOCreated?: (poId: string) => void;
}

export function SuggestedReorders({ refreshKey = 0, onPOCreated }: SuggestedReordersProps) {
  const [groups, setGroups] = useState<SuggestionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Per-line state: checked + qty override. Keyed by `groupKey:itemId`.
  const [overrides, setOverrides] = useState<Record<string, { checked: boolean; qty: number }>>({});
  const [creating, setCreating] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/purchase-orders/suggest");
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups || []);
        // Default: every line checked, qty = suggested
        const next: Record<string, { checked: boolean; qty: number }> = {};
        for (const g of data.groups || []) {
          const groupKey = g.supplier?.id ?? "__unassigned__";
          for (const line of g.lines) {
            next[`${groupKey}:${line.inventory_item_id}`] = {
              checked: true,
              qty: line.suggested_qty,
            };
          }
        }
        setOverrides(next);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  function setLine(groupKey: string, itemId: string, patch: Partial<{ checked: boolean; qty: number }>) {
    const k = `${groupKey}:${itemId}`;
    setOverrides((prev) => ({
      ...prev,
      [k]: { ...prev[k], ...patch },
    }));
  }

  async function createDraftPO(group: SuggestionGroup) {
    const groupKey = group.supplier?.id ?? "__unassigned__";
    if (!group.supplier) {
      // Without a supplier we can't auto-create — operator needs to use New PO
      // and pick one. Surface a hint instead.
      alert(
        "These items have no preferred distributor set. Open the item and add a vendor link, or create the PO manually.",
      );
      return;
    }
    const lines = group.lines
      .map((line) => {
        const o = overrides[`${groupKey}:${line.inventory_item_id}`];
        if (!o?.checked) return null;
        return {
          inventory_item_id: line.inventory_item_id,
          name: line.name,
          sku: line.vendor_sku ?? line.sku ?? null,
          quantity_ordered: o.qty,
          cost_cents: line.last_cost_cents,
        };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);

    if (lines.length === 0) {
      alert("No lines selected.");
      return;
    }

    setCreating(groupKey);
    try {
      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_id: group.supplier.id,
          supplier_name: group.supplier.name,
          notes: `Auto-suggested from reorder points · ${new Date().toLocaleDateString()}`,
          items: lines,
        }),
      });
      if (res.ok) {
        const po = await res.json();
        onPOCreated?.(po.id);
        load();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Could not create PO");
      }
    } catch {
      alert("Connection error");
    } finally {
      setCreating(null);
    }
  }

  if (loading) {
    return (
      <div
        className="border border-rule p-4"
        style={{ background: "var(--panel-mute)", color: "var(--ink-faint)", fontSize: "0.85rem" }}
      >
        Checking reorder points…
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div
        className="border border-rule p-4"
        style={{
          background: "var(--panel-mute)",
          color: "var(--ink-faint)",
          fontFamily: "var(--font-mono)",
          fontSize: "0.78rem",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        Nothing to reorder right now — all stocked items above reorder point
      </div>
    );
  }

  const totalGroups = groups.length;
  const totalCost = groups.reduce((s, g) => s + g.total_cost_cents, 0);

  return (
    <div className="border border-rule">
      <header
        className="flex items-center justify-between px-4 py-3 cursor-pointer"
        style={{ background: "var(--panel-mute)", borderBottom: collapsed ? "none" : "1px solid var(--rule)" }}
        onClick={() => setCollapsed((v) => !v)}
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
            Suggested Reorders
          </div>
          <div className="text-ink mt-0.5" style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1rem" }}>
            {totalGroups} distributor group{totalGroups === 1 ? "" : "s"} · {formatCents(totalCost)} estimated
          </div>
        </div>
        <span
          aria-hidden
          style={{
            color: "var(--orange)",
            fontFamily: "var(--font-mono)",
            fontSize: "0.85rem",
            transition: "transform 0.15s",
            transform: collapsed ? "rotate(-90deg)" : "rotate(0)",
          }}
        >
          ▼
        </span>
      </header>

      {!collapsed && (
        <div>
          {groups.map((group) => {
            const groupKey = group.supplier?.id ?? "__unassigned__";
            const isExpanded = expanded === groupKey;
            const selectedLines = group.lines.filter((line) => overrides[`${groupKey}:${line.inventory_item_id}`]?.checked);
            const selectedCost = selectedLines.reduce((sum, line) => {
              const o = overrides[`${groupKey}:${line.inventory_item_id}`];
              return sum + line.last_cost_cents * (o?.qty ?? line.suggested_qty);
            }, 0);

            return (
              <div key={groupKey} style={{ borderBottom: "1px solid var(--rule)" }}>
                <div
                  className="flex items-center justify-between px-4 py-3 hover:bg-panel-mute cursor-pointer"
                  onClick={() => setExpanded((v) => (v === groupKey ? null : groupKey))}
                >
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      style={{
                        color: "var(--ink-faint)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.7rem",
                        transition: "transform 0.15s",
                        transform: isExpanded ? "rotate(90deg)" : "rotate(0)",
                      }}
                    >
                      ▶
                    </span>
                    <div>
                      <div
                        className="text-ink"
                        style={{
                          fontFamily: "var(--font-display)",
                          fontWeight: 600,
                          fontSize: "0.95rem",
                        }}
                      >
                        {group.supplier?.name ?? "No preferred distributor set"}
                      </div>
                      <div
                        className="text-ink-faint mt-0.5"
                        style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", letterSpacing: "0.06em" }}
                      >
                        {selectedLines.length} of {group.lines.length} line{group.lines.length === 1 ? "" : "s"}
                        {group.supplier?.account_number ? ` · acct ${group.supplier.account_number}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-orange tabular-nums" style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                        {formatCents(selectedCost)}
                      </div>
                      <div className="text-ink-faint" style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", letterSpacing: "0.08em" }}>
                        est. cost
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        createDraftPO(group);
                      }}
                      disabled={creating === groupKey || selectedLines.length === 0 || !group.supplier}
                      className="bg-orange text-void disabled:opacity-30"
                      style={{
                        padding: "0.5rem 0.85rem",
                        fontFamily: "var(--font-display)",
                        fontWeight: 700,
                        fontSize: "0.78rem",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}
                    >
                      {creating === groupKey ? "Creating…" : "Create Draft PO"}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ background: "var(--panel)" }}>
                    {group.lines.map((line, idx) => {
                      const k = `${groupKey}:${line.inventory_item_id}`;
                      const o = overrides[k] ?? { checked: true, qty: line.suggested_qty };
                      return (
                        <div
                          key={line.inventory_item_id}
                          className="px-4 py-2 grid items-center gap-2"
                          style={{
                            gridTemplateColumns: "auto 1fr 90px 80px 80px",
                            borderBottom: idx < group.lines.length - 1 ? "1px solid var(--rule-faint)" : "none",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={o.checked}
                            onChange={(e) => setLine(groupKey, line.inventory_item_id, { checked: e.target.checked })}
                          />
                          <div className="min-w-0">
                            <div className="text-ink truncate" style={{ fontWeight: 500, fontSize: "0.9rem" }}>
                              {line.name}
                            </div>
                            <div className="text-ink-faint" style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono)" }}>
                              {line.quantity_on_hand} on hand · reorder at {line.reorder_point}
                              {line.vendor_sku && ` · sku ${line.vendor_sku}`}
                              {line.case_pack && ` · case ${line.case_pack}`}
                            </div>
                          </div>
                          <div className="text-ink-faint tabular-nums" style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", textAlign: "right" }}>
                            {formatCents(line.last_cost_cents)}
                          </div>
                          <input
                            type="number"
                            min={1}
                            value={o.qty}
                            onChange={(e) => setLine(groupKey, line.inventory_item_id, { qty: Math.max(1, parseInt(e.target.value || "0", 10)) })}
                            className="border border-rule-hi bg-panel-mute text-ink px-2 tabular-nums"
                            style={{ height: 28, fontSize: "0.85rem", fontFamily: "var(--font-mono)" }}
                          />
                          <div className="text-ink tabular-nums" style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", textAlign: "right" }}>
                            {formatCents(line.last_cost_cents * o.qty)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
