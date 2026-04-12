"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store-context";

interface ChecklistItem {
  key: string;
  label: string;
  href: string;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  { key: "store_created", label: "Create your store", href: "/dashboard/settings" },
  { key: "first_product", label: "Add your first product", href: "/dashboard/inventory" },
  { key: "tax_rate", label: "Set up tax rate", href: "/dashboard/settings" },
  { key: "payment_connected", label: "Connect payment processing", href: "/dashboard/settings" },
  { key: "staff_added", label: "Add a staff member", href: "/dashboard/staff" },
  { key: "first_sale", label: "Complete your first sale", href: "/dashboard/register" },
];

const DISMISS_KEY = "afterroar-getting-started-dismissed";

export function GettingStarted() {
  const { store, effectiveRole } = useStore();
  const [dismissed, setDismissed] = useState(true); // start hidden until hydrated
  const [completedItems, setCompletedItems] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  // Only show for owners/managers
  const canSee = effectiveRole === "owner" || effectiveRole === "manager";

  useEffect(() => {
    if (!canSee) return;
    try {
      const stored = localStorage.getItem(DISMISS_KEY);
      if (stored === "true") { setDismissed(true); setLoading(false); return; }
      // Also check store settings
      const settings = (store?.settings ?? {}) as Record<string, unknown>;
      if (settings.getting_started_dismissed) { setDismissed(true); setLoading(false); return; }
    } catch {}
    setDismissed(false);

    // Fetch completion status
    async function checkStatus() {
      try {
        const res = await fetch("/api/onboarding/status");
        if (res.ok) {
          const data = await res.json();
          setCompletedItems(data);
        }
      } catch {}
      setLoading(false);
    }
    checkStatus();
  }, [canSee, store]);

  if (!canSee || dismissed || loading) return null;

  const completedCount = CHECKLIST_ITEMS.filter((item) => completedItems[item.key]).length;
  const allDone = completedCount === CHECKLIST_ITEMS.length;

  // If everything is done, auto-dismiss
  if (allDone) return null;

  function handleDismiss() {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "true"); } catch {}
    // Persist to server — dismiss both getting started and NUX hints
    fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ getting_started_dismissed: true, nux_dismissed: true }),
    }).catch(() => {});
  }

  return (
    <div className="rounded-xl border border-card-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-card-border">
        <span className="text-sm font-semibold text-foreground">Getting Started</span>
        <span className="text-xs text-muted tabular-nums">{completedCount}/{CHECKLIST_ITEMS.length}</span>
      </div>
      <div className="p-3 space-y-1">
        {CHECKLIST_ITEMS.map((item) => {
          const done = completedItems[item.key];
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                done
                  ? "text-muted"
                  : "text-foreground hover:bg-card-hover"
              }`}
            >
              <span className={`text-base ${done ? "text-green-400" : "text-muted"}`}>
                {done ? "\u2705" : "\u2B1C"}
              </span>
              <span className={done ? "line-through" : ""}>{item.label}</span>
            </Link>
          );
        })}
      </div>
      <div className="px-4 py-3 border-t border-card-border">
        <button
          onClick={handleDismiss}
          className="text-xs text-muted hover:text-foreground transition-colors"
        >
          Dismiss — I know what I&apos;m doing
        </button>
      </div>
    </div>
  );
}
