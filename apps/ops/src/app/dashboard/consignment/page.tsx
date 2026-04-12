"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/page-header";
import { formatCents, parseDollars } from "@/lib/types";

interface ConsignmentItem {
  id: string;
  asking_price_cents: number;
  commission_percent: number;
  status: string;
  listed_at: string;
  sold_at: string | null;
  payout_cents: number | null;
  notes: string | null;
  consignor: { id: string; name: string };
  inventory_item: { id: string; name: string; price_cents: number } | null;
}

export default function ConsignmentPage() {
  const [items, setItems] = useState<ConsignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"active" | "sold" | "all">("active");
  const [showIntake, setShowIntake] = useState(false);

  // Intake form
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedConsignor, setSelectedConsignor] = useState<{ id: string; name: string } | null>(null);
  const [itemName, setItemName] = useState("");
  const [askingPrice, setAskingPrice] = useState("");
  const [commission, setCommission] = useState("15");
  const [intakeNotes, setIntakeNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadItems = useCallback(async () => {
    try {
      const res = await fetch("/api/consignment");
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  // Customer search
  useEffect(() => {
    if (customerQuery.length < 2) { setCustomerResults([]); return; }
    const ctrl = new AbortController();
    fetch(`/api/customers?q=${encodeURIComponent(customerQuery)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => setCustomerResults(d))
      .catch(() => {});
    return () => ctrl.abort();
  }, [customerQuery]);

  async function handleIntake() {
    if (!selectedConsignor || !itemName || !askingPrice) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/consignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "intake",
          consignor_id: selectedConsignor.id,
          name: itemName.trim(),
          asking_price_cents: parseDollars(askingPrice),
          commission_percent: parseFloat(commission) || 15,
          notes: intakeNotes.trim() || null,
        }),
      });
      if (res.ok) {
        setShowIntake(false);
        setSelectedConsignor(null);
        setItemName("");
        setAskingPrice("");
        setCommission("15");
        setIntakeNotes("");
        setCustomerQuery("");
        loadItems();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function markSold(id: string) {
    await fetch("/api/consignment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_sold", consignment_id: id }),
    });
    loadItems();
  }

  async function returnItem(id: string) {
    await fetch("/api/consignment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "return", consignment_id: id }),
    });
    loadItems();
  }

  const filtered = filter === "all" ? items : items.filter((i) => i.status === filter);
  const totalValue = filtered.filter((i) => i.status === "active").reduce((s, i) => s + i.asking_price_cents, 0);
  const totalCommission = filtered.filter((i) => i.status === "sold").reduce((s, i) => s + (i.asking_price_cents * Number(i.commission_percent) / 100), 0);

  return (
    <div className="flex flex-col h-full gap-4">
      <PageHeader
        title="Consignment"
        action={
          <button onClick={() => setShowIntake(true)} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium">
            Intake Item
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-card-border bg-card p-4">
          <p className="text-xs text-muted">Active Items</p>
          <p className="text-xl font-bold text-foreground">{items.filter((i) => i.status === "active").length}</p>
        </div>
        <div className="rounded-xl border border-card-border bg-card p-4">
          <p className="text-xs text-muted">Showcase Value</p>
          <p className="text-xl font-bold text-foreground">{formatCents(totalValue)}</p>
        </div>
        <div className="rounded-xl border border-card-border bg-card p-4">
          <p className="text-xs text-muted">Commission Earned</p>
          <p className="text-xl font-bold text-accent">{formatCents(Math.round(totalCommission))}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-1 rounded-xl bg-card-hover p-1 w-fit">
        {(["active", "sold", "all"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${filter === f ? "bg-card text-foreground shadow-sm" : "text-muted"}`} style={{ minHeight: "auto" }}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Intake form */}
      {showIntake && (
        <div className="rounded-xl border border-card-border bg-card p-5 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Intake Consignment Item</h2>
          {!selectedConsignor ? (
            <div>
              <label className="block text-xs text-muted mb-1">Consignor (customer)</label>
              <input type="text" value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder="Search customers..." className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none" autoFocus />
              {customerResults.length > 0 && (
                <div className="mt-1 rounded-lg border border-card-border bg-card max-h-40 overflow-y-auto scroll-visible">
                  {customerResults.map((c) => (
                    <button key={c.id} onClick={() => { setSelectedConsignor(c); setCustomerQuery(""); }} className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-card-hover">{c.name}</button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">Consignor: <strong>{selectedConsignor.name}</strong></span>
                <button onClick={() => setSelectedConsignor(null)} className="text-xs text-muted hover:text-foreground" style={{ minHeight: "auto" }}>Change</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted mb-1">Item Name</label>
                  <input type="text" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Card or product name" className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Asking Price</label>
                  <input type="text" inputMode="decimal" value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)} placeholder="$0.00" className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Commission %</label>
                  <input type="number" min={0} max={100} value={commission} onChange={(e) => setCommission(e.target.value)} className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Notes</label>
                  <input type="text" value={intakeNotes} onChange={(e) => setIntakeNotes(e.target.value)} placeholder="Optional" className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleIntake} disabled={submitting || !itemName || !askingPrice} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-40">
                  {submitting ? "Adding..." : "Add to Showcase"}
                </button>
                <button onClick={() => setShowIntake(false)} className="px-4 py-2 border border-card-border text-muted rounded-lg text-sm">Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Item list */}
      {loading ? (
        <p className="text-muted text-center py-8">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-card-border bg-card p-8 text-center">
          <p className="text-muted">No consignment items{filter !== "all" ? ` with status "${filter}"` : ""}.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-card-border scroll-visible">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border bg-card text-muted text-left">
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Consignor</th>
                <th className="px-4 py-3 font-medium text-right">Price</th>
                <th className="px-4 py-3 font-medium text-center">Commission</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Listed</th>
                <th className="px-4 py-3 font-medium text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {filtered.map((item) => (
                <tr key={item.id} className="bg-background hover:bg-card-hover transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{item.inventory_item?.name || "—"}</td>
                  <td className="px-4 py-3 text-muted">{item.consignor.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatCents(item.asking_price_cents)}</td>
                  <td className="px-4 py-3 text-center text-muted">{Number(item.commission_percent)}%</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      item.status === "active" ? "bg-green-900/50 text-green-400" :
                      item.status === "sold" ? "bg-blue-900/50 text-blue-400" :
                      "bg-card-hover text-muted"
                    }`}>{item.status}</span>
                  </td>
                  <td className="px-4 py-3 text-muted">{new Date(item.listed_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-center">
                    {item.status === "active" && (
                      <div className="flex gap-1 justify-center">
                        <button onClick={() => markSold(item.id)} className="px-2 py-1 bg-blue-900/30 text-blue-400 rounded text-xs font-medium hover:bg-blue-900/50" style={{ minHeight: "auto" }}>Sold</button>
                        <button onClick={() => returnItem(item.id)} className="px-2 py-1 bg-card-hover text-muted rounded text-xs font-medium hover:text-foreground" style={{ minHeight: "auto" }}>Return</button>
                      </div>
                    )}
                    {item.status === "sold" && item.payout_cents != null && (
                      <span className="text-xs text-green-400">Paid {formatCents(item.payout_cents)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
