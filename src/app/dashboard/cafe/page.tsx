"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/page-header";
import { formatCents, parseDollars } from "@/lib/types";

interface TabItem {
  id: string;
  name: string;
  price_cents: number;
  quantity: number;
  modifiers: string | null;
  notes: string | null;
  status: string;
}

interface Tab {
  id: string;
  table_label: string | null;
  status: string;
  subtotal_cents: number;
  customer: { name: string } | null;
  opened_at: string;
  items: TabItem[];
  table_fee_type: string | null;
  table_fee_cents: number;
  table_fee_waived: boolean;
  age_verified: boolean;
}

interface QuickMenuItem {
  name: string;
  price: number;
  ageRestricted?: boolean;
}

const MENU_ITEMS: QuickMenuItem[] = [
  { name: "Drip Coffee", price: 300 },
  { name: "Latte", price: 550 },
  { name: "Iced Americano", price: 450 },
  { name: "Monster Energy", price: 350 },
  { name: "Bottled Water", price: 200 },
  { name: "Pizza Slice", price: 350 },
  { name: "Soft Pretzel", price: 400 },
  { name: "Chips & Salsa", price: 300 },
  { name: "Draft Beer", price: 600, ageRestricted: true },
  { name: "Canned Beer", price: 500, ageRestricted: true },
  { name: "Wine (Glass)", price: 800, ageRestricted: true },
  { name: "Hard Seltzer", price: 550, ageRestricted: true },
];

export default function CafePage() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [kdsItems, setKdsItems] = useState<Array<TabItem & { tab: { table_label: string | null; customer: { name: string } | null } }>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<"tabs" | "kds">("tabs");
  const [activeTab, setActiveTab] = useState<Tab | null>(null);

  // Age verification
  const [ageVerifyPending, setAgeVerifyPending] = useState<{ tabId: string; item: QuickMenuItem } | null>(null);

  // New tab form
  const [showNewTab, setShowNewTab] = useState(false);
  const [newTabTable, setNewTabTable] = useState("");

  // Live timer
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000); // Update every 30s
    return () => clearInterval(interval);
  }, []);

  const loadTabs = useCallback(async () => {
    try {
      setLoadError(null);
      const res = await fetch("/api/cafe?status=open");
      if (!res.ok) {
        setLoadError("Failed to load tabs. Try again.");
        return;
      }
      setTabs(await res.json());
    } catch {
      setLoadError("Failed to load tabs. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadKDS = useCallback(async () => {
    try {
      const res = await fetch("/api/cafe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "kds" }),
      });
      if (res.ok) setKdsItems(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    loadTabs();
    loadKDS();
    const interval = setInterval(() => { if (view === "kds") loadKDS(); }, 15000);
    return () => clearInterval(interval);
  }, [loadTabs, loadKDS, view]);

  const [tabError, setTabError] = useState<string | null>(null);

  async function openTab() {
    setTabError(null);
    try {
      const res = await fetch("/api/cafe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "open_tab", table_label: newTabTable || null }),
      });
      if (res.ok) {
        const tab = await res.json();
        setShowNewTab(false);
        setNewTabTable("");
        loadTabs();
        setActiveTab({ ...tab, items: [] });
      } else {
        const err = await res.json().catch(() => ({ error: "Failed to open tab" }));
        setTabError(err.error || "Failed to open tab");
      }
    } catch {
      setTabError("Network error — couldn't open tab");
    }
  }

  function handleAddItem(tabId: string, item: QuickMenuItem) {
    // Age-restricted items require verification on the tab first
    if (item.ageRestricted) {
      const tab = tabs.find((t) => t.id === tabId) || activeTab;
      if (tab && !tab.age_verified) {
        setAgeVerifyPending({ tabId, item });
        return;
      }
    }
    addItemToTab(tabId, item.name, item.price);
  }

  async function confirmAgeVerification() {
    if (!ageVerifyPending) return;
    const { tabId, item } = ageVerifyPending;
    // Mark tab as age verified
    await fetch("/api/cafe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "age_verify", tab_id: tabId }),
    });
    // Update local state
    setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, age_verified: true } : t));
    if (activeTab?.id === tabId) setActiveTab((prev) => prev ? { ...prev, age_verified: true } : prev);
    setAgeVerifyPending(null);
    // Now add the item
    await addItemToTab(tabId, item.name, item.price);
  }

  async function addItemToTab(tabId: string, name: string, priceCents: number) {
    setAddItemError(null);
    try {
      const addRes = await fetch("/api/cafe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_item", tab_id: tabId, name, price_cents: priceCents }),
      });
      if (!addRes.ok) {
        const body = await addRes.json().catch(() => ({ error: "Failed to add item" }));
        setAddItemError(body.error || "Failed to add item to tab");
        return;
      }
      // Refresh tab
      const res = await fetch("/api/cafe?status=open");
      if (res.ok) {
        const allTabs: Tab[] = await res.json();
        setTabs(allTabs);
        setActiveTab(allTabs.find((t) => t.id === tabId) || null);
      }
      loadKDS();
    } catch {
      setAddItemError("Network error — could not add item to tab");
    }
  }

  async function markServed(itemId: string) {
    await fetch("/api/cafe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_item_status", item_id: itemId, status: "served" }),
    });
    loadKDS();
  }

  const [addItemError, setAddItemError] = useState<string | null>(null);
  const [showClosePayment, setShowClosePayment] = useState<string | null>(null); // tab_id
  const [closing, setClosing] = useState(false);

  async function closeTab(tabId: string, paymentMethod: string) {
    setClosing(true);
    try {
      const res = await fetch("/api/cafe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close_tab", tab_id: tabId, payment_method: paymentMethod }),
      });
      if (res.ok) {
        setActiveTab(null);
        setShowClosePayment(null);
        loadTabs();
      }
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <PageHeader
        title="Cafe"
        action={
          <div className="flex gap-2">
            <div className="flex rounded-lg border border-card-border overflow-hidden">
              <button onClick={() => setView("tabs")} className={`px-3 py-2 text-xs font-medium transition-colors ${view === "tabs" ? "bg-card-hover text-foreground" : "text-muted"}`} style={{ minHeight: "auto" }}>Tabs</button>
              <button onClick={() => { setView("kds"); loadKDS(); }} className={`px-3 py-2 text-xs font-medium transition-colors ${view === "kds" ? "bg-card-hover text-foreground" : "text-muted"}`} style={{ minHeight: "auto" }}>Kitchen</button>
            </div>
            <button onClick={() => setShowNewTab(true)} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium">Open Tab</button>
          </div>
        }
      />

      {/* New tab modal */}
      {showNewTab && (
        <div className="rounded-xl border border-card-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Open New Tab</h3>
          <input
            type="text"
            value={newTabTable}
            onChange={(e) => setNewTabTable(e.target.value)}
            placeholder="Table label (optional)"
            className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />
          {tabError && <p className="text-xs text-red-400">{tabError}</p>}
          <div className="flex gap-2">
            <button onClick={openTab} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium">Open</button>
            <button onClick={() => { setShowNewTab(false); setTabError(null); }} className="px-4 py-2 border border-card-border text-muted rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      )}

      {loadError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
          <p className="text-sm text-red-400">{loadError}</p>
          <button
            onClick={() => { setLoadError(null); loadTabs(); }}
            className="mt-2 text-xs text-red-300 underline hover:text-red-200"
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-muted text-center py-8">Loading...</p>
      ) : view === "kds" ? (
        /* ---- KDS VIEW ---- */
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">Pending Orders</h2>
          {kdsItems.length === 0 ? (
            <div className="rounded-xl border border-card-border bg-card p-8 text-center">
              <p className="text-muted">No pending items</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {kdsItems.map((item) => (
                <div key={item.id} className={`rounded-xl border p-4 ${item.status === "in_progress" ? "border-amber-500/30 bg-amber-900/10" : "border-card-border bg-card"}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-foreground">{item.name}{item.quantity > 1 ? ` x${item.quantity}` : ""}</p>
                      <p className="text-xs text-muted">{item.tab?.table_label || "No table"}{item.tab?.customer ? ` — ${item.tab.customer.name}` : ""}</p>
                      {item.notes && <p className="text-xs text-amber-400 mt-1">{item.notes}</p>}
                    </div>
                    <button
                      onClick={() => markServed(item.id)}
                      className="px-3 py-1.5 bg-green-700 text-white rounded text-xs font-medium shrink-0"
                      style={{ minHeight: "auto" }}
                    >
                      Served
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ---- TABS VIEW ---- */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tab list */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">Open Tabs ({tabs.length})</h2>
            {tabs.length === 0 ? (
              <p className="text-sm text-muted py-4">No open tabs</p>
            ) : (
              tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab)}
                  className={`w-full text-left rounded-xl border p-3 transition-colors ${activeTab?.id === tab.id ? "border-accent bg-accent/5" : "border-card-border bg-card hover:border-accent/30"}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-foreground">{tab.table_label || "Walk-up"}</span>
                      {tab.age_verified && <span className="ml-1.5 rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-bold text-amber-400">21+</span>}
                      {tab.customer && <span className="text-xs text-muted ml-2">{tab.customer.name}</span>}
                    </div>
                    <span className="text-sm font-semibold text-accent tabular-nums">{formatCents(tab.subtotal_cents)}</span>
                  </div>
                  {(() => {
                    const elapsed = Math.floor((now - new Date(tab.opened_at).getTime()) / 60000);
                    const hrs = Math.floor(elapsed / 60);
                    const mins = elapsed % 60;
                    const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
                    return (
                      <p className="text-[10px] text-muted mt-1">
                        {tab.items.length} item{tab.items.length !== 1 ? "s" : ""} {"\u00B7"} {timeStr}
                        {tab.table_fee_type === "hourly" && tab.table_fee_cents > 0 && (
                          <span className="text-amber-400 ml-1">
                            {"\u00B7"} {formatCents(Math.round((tab.table_fee_cents / 60) * elapsed))} accrued
                          </span>
                        )}
                      </p>
                    );
                  })()}
                </button>
              ))
            )}
          </div>

          {/* Active tab detail + menu */}
          <div className="lg:col-span-2 space-y-4">
            {activeTab ? (
              <>
                {/* Tab items */}
                <div className="rounded-xl border border-card-border bg-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground">{activeTab.table_label || "Walk-up"} — Items</h3>
                    <span className="text-lg font-bold text-accent tabular-nums">{formatCents(activeTab.subtotal_cents)}</span>
                  </div>
                  {activeTab.items.length === 0 ? (
                    <p className="text-sm text-muted py-2">No items yet — tap menu items below to add</p>
                  ) : (
                    <div className="space-y-1">
                      {activeTab.items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between py-1.5 text-sm">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${item.status === "served" ? "bg-green-400" : item.status === "in_progress" ? "bg-amber-400" : "bg-blue-400"}`} />
                            <span className="text-foreground">{item.name}{item.quantity > 1 ? ` x${item.quantity}` : ""}</span>
                          </div>
                          <span className="text-muted tabular-nums">{formatCents(item.price_cents * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {showClosePayment === activeTab.id ? (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs text-muted text-center">Payment method</p>
                      <div className="grid grid-cols-3 gap-2">
                        {["cash", "card", "store_credit"].map((method) => (
                          <button
                            key={method}
                            onClick={() => closeTab(activeTab.id, method)}
                            disabled={closing}
                            className="rounded-lg border border-card-border bg-card-hover py-2.5 text-sm font-medium text-foreground hover:border-accent/50 disabled:opacity-50 transition-colors capitalize"
                          >
                            {method === "store_credit" ? "Credit" : method}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => setShowClosePayment(null)}
                        className="w-full text-xs text-muted hover:text-foreground transition-colors py-1"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowClosePayment(activeTab.id)}
                      className="mt-4 w-full rounded-lg bg-green-700 py-2.5 text-sm font-semibold text-white hover:bg-green-600 transition-colors"
                    >
                      Close Tab — {formatCents(activeTab.subtotal_cents)}
                    </button>
                  )}
                </div>

                {addItemError && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-center">
                    <p className="text-sm text-red-400">{addItemError}</p>
                    <button
                      onClick={() => setAddItemError(null)}
                      className="mt-1 text-xs text-red-300 underline hover:text-red-200"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Quick menu */}
                <div className="rounded-xl border border-card-border bg-card p-4">
                  <h3 className="text-sm font-semibold text-muted mb-3">Quick Add</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {MENU_ITEMS.map((item) => (
                      <button
                        key={item.name}
                        onClick={() => handleAddItem(activeTab.id, item)}
                        className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                          item.ageRestricted
                            ? "border-amber-500/20 bg-amber-950/10 hover:border-amber-500/40"
                            : "border-card-border bg-card-hover hover:border-accent/30"
                        }`}
                      >
                        <span className="text-sm font-medium text-foreground block">
                          {item.name}
                          {item.ageRestricted && <span className="ml-1.5 text-amber-400 text-[10px]">21+</span>}
                        </span>
                        <span className="text-xs text-muted">{formatCents(item.price)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-card-border bg-card p-8 text-center">
                <p className="text-muted">Select a tab or open a new one</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Age Verification Modal */}
      {ageVerifyPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-bg">
          <div className="w-full max-w-sm rounded-xl border border-amber-500/30 bg-card p-6 shadow-lg mx-4">
            <div className="text-center space-y-4">
              <span className="text-4xl block">🪪</span>
              <h3 className="text-lg font-bold text-foreground">Age Verification Required</h3>
              <p className="text-sm text-muted">
                <strong className="text-foreground">{ageVerifyPending.item.name}</strong> requires age verification.
                Confirm the customer is 21 or older before serving alcohol.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setAgeVerifyPending(null)}
                  className="flex-1 rounded-lg border border-card-border py-2.5 text-sm font-medium text-muted hover:bg-card-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmAgeVerification}
                  className="flex-1 rounded-lg bg-amber-600 py-2.5 text-sm font-bold text-white hover:bg-amber-500 transition-colors"
                >
                  ID Verified — 21+
                </button>
              </div>
              <p className="text-[10px] text-muted/60">
                This marks the tab as age-verified. All future alcohol items on this tab will be allowed.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
