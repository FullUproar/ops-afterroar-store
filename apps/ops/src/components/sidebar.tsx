"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useStore } from "@/lib/store-context";
import { useMode } from "@/lib/mode-context";
import { useQuickSwitch } from "@/lib/quick-switch-context";
import { type Permission, type FeatureModule } from "@/lib/permissions";
import { useCallback, useEffect, useState } from "react";

interface LiveStatus {
  register_live: boolean;
  buylist_waiting: number;
  inventory_low: number;
  devices_offline: number;
}

const LIVE_STATUS_REFRESH_MS = 60_000;

/* ------------------------------------------------------------------ */
/*  Operator Console sidebar                                          */
/*  Top-level destinations with finger-tip-grade tap targets.         */
/*  Drill-down is handled inside each page (tab strips, filters).     */
/* ------------------------------------------------------------------ */

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  permission: Permission;
  feature?: FeatureModule;
  badge?: { kind: "warn" | "err" | "live"; text: string };
}

const ICON = {
  console: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="8" height="9" />
      <rect x="13" y="3" width="8" height="5" />
      <rect x="13" y="10" width="8" height="11" />
      <rect x="3" y="14" width="8" height="7" />
    </svg>
  ),
  register: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="6" width="20" height="13" />
      <path d="M2 11h20M7 19v3M17 19v3" />
    </svg>
  ),
  inventory: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7l9-4 9 4M3 7v12l9 4 9-4V7M3 7l9 4 9-4M12 11v12" />
    </svg>
  ),
  tcg: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="11" />
      <rect x="14" y="3" width="7" height="6" />
      <rect x="14" y="13" width="7" height="8" />
      <rect x="3" y="17" width="7" height="4" />
    </svg>
  ),
  customers: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21c0-4 4-7 7-7s7 3 7 7M16 4a4 4 0 010 8M22 21c0-3-2-5.5-4-6.5" />
    </svg>
  ),
  reports: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 17l5-5 4 4 8-8M14 8h7v7" />
    </svg>
  ),
  events: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="16" />
      <path d="M3 10h18M8 5V2M16 5V2" />
    </svg>
  ),
  orders: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M3 12h18M3 18h12" />
    </svg>
  ),
  staff: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21c0-4 4-7 7-7M16 14l3 3 5-5" />
    </svg>
  ),
  intel: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 1v22M5 6c0 5 7 5 7 10s-7 5-7 10M19 6c0 5-7 5-7 10s7 5 7 10" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 8a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H8a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V8a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
};

export function Sidebar() {
  const pathname = usePathname();
  const { store, staff, effectiveRole, isTestMode, can, hasModule, activeStaff, endShift } = useStore();
  const { mode } = useMode();
  const { open: openQuickSwitch } = useQuickSwitch();

  const rawHidden = (store?.settings as Record<string, unknown>)?.hidden_nav_items;
  const hiddenItems = Array.isArray(rawHidden) ? (rawHidden as string[]) : [];

  const [live, setLive] = useState<LiveStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function fetchStatus() {
      try {
        const res = await fetch("/api/dashboard/live-status");
        if (!res.ok || cancelled) return;
        const data: LiveStatus = await res.json();
        if (!cancelled) setLive(data);
      } catch { /* offline / error — keep last known */ }
    }
    fetchStatus();
    const id = setInterval(fetchStatus, LIVE_STATUS_REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const items: NavItem[] = [
    { href: "/dashboard", label: "Console", icon: ICON.console, permission: "checkout" },
    {
      href: "/dashboard/inventory",
      label: "Inventory",
      icon: ICON.inventory,
      permission: "inventory.view",
      badge: live && live.inventory_low > 0 ? { kind: "warn", text: `${live.inventory_low} low` } : undefined,
    },
    {
      href: "/dashboard/catalog",
      label: "TCG",
      icon: ICON.tcg,
      permission: "inventory.view",
      badge: live && live.buylist_waiting > 0 ? { kind: "warn", text: `${live.buylist_waiting} buylist` } : undefined,
    },
    { href: "/dashboard/customers", label: "Customers", icon: ICON.customers, permission: "customers.view" },
    { href: "/dashboard/reports", label: "Reports", icon: ICON.reports, permission: "reports" },
    { href: "/dashboard/events", label: "Events", icon: ICON.events, permission: "events.checkin" },
    { href: "/dashboard/orders", label: "Orders", icon: ICON.orders, permission: "checkout" },
    { href: "/dashboard/cash-flow", label: "Intelligence", icon: ICON.intel, permission: "cash_flow" },
    { href: "/dashboard/staff", label: "Staff", icon: ICON.staff, permission: "staff.manage" },
    { href: "/dashboard/devices", label: "Devices", icon: ICON.staff, permission: "staff.manage" },
    { href: "/dashboard/settings", label: "Settings", icon: ICON.settings, permission: "store.settings" },
  ];

  const registerLive = !!live?.register_live;

  const isActive = useCallback(
    (href: string) => {
      if (href === "/dashboard") return pathname === "/dashboard";
      if (href === "/dashboard/catalog") {
        return ["/dashboard/catalog", "/dashboard/deck-builder", "/dashboard/buylist"].some(
          (p) => pathname === p || pathname.startsWith(p + "/"),
        );
      }
      if (href === "/dashboard/inventory") {
        return ["/dashboard/inventory", "/dashboard/trade-ins", "/dashboard/consignment", "/dashboard/purchase-orders", "/dashboard/stock-counts"].some(
          (p) => pathname === p || pathname.startsWith(p + "/"),
        );
      }
      if (href === "/dashboard/orders") {
        return (
          pathname === "/dashboard/orders" ||
          pathname.startsWith("/dashboard/orders/") ||
          pathname.startsWith("/dashboard/fulfillment") ||
          pathname === "/dashboard/sales" ||
          pathname.startsWith("/dashboard/sales/") ||
          pathname === "/dashboard/returns" ||
          pathname.startsWith("/dashboard/returns/")
        );
      }
      if (href === "/dashboard/events") {
        return (
          pathname === "/dashboard/events" ||
          pathname.startsWith("/dashboard/events/") ||
          pathname === "/dashboard/tournaments" ||
          pathname.startsWith("/dashboard/tournaments/")
        );
      }
      if (href === "/dashboard/settings") {
        return pathname === "/dashboard/settings" || pathname.startsWith("/dashboard/settings/") || pathname.startsWith("/dashboard/help");
      }
      return pathname === href || pathname.startsWith(href + "/");
    },
    [pathname],
  );

  function handleSignOut() {
    signOut({ callbackUrl: "/login" });
  }

  // Hide sidebar in register mode
  if (mode === "register") return null;

  const initials = (staff?.name || activeStaff?.name || "?")
    .split(" ")
    .map((s) => s[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

  return (
    <aside className="hidden lg:flex h-full w-60 flex-col border-r border-rule bg-panel-mute">
      {/* Brand masthead */}
      <div className="border-b border-rule px-4 py-3">
        <div className="ar-mast">
          <span className="ar-lozenge" />
          <div className="ar-stack">
            <div className="ar-platform">Afterroar</div>
            <div className="ar-app">
              <span>Store Ops</span>
              {store?.name ? (
                <>
                  <span className="ar-div" />
                  <span className="ar-store">{store.name}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Pinned: Open Register */}
      <div className="px-3 pt-3 pb-1">
        <Link
          href="/dashboard/register"
          className="flex items-center justify-center gap-2 px-3 py-3 bg-orange text-void hover:bg-yellow transition-colors relative"
          style={{ minHeight: 48, fontFamily: "var(--font-display)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", fontSize: "0.92rem" }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <rect x="2" y="6" width="20" height="13" />
            <path d="M2 11h20" />
          </svg>
          Open Register
          {registerLive ? (
            <span
              className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center"
              aria-label="Live session active"
              style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--void)", boxShadow: "0 0 0 2px var(--orange), 0 0 10px var(--void)" }}
            />
          ) : null}
        </Link>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 px-0 py-2 overflow-y-auto">
        {items
          .filter((item) => can(item.permission) && (!item.feature || hasModule(item.feature)) && !hiddenItems.includes(item.href))
          .map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className="grid items-center gap-3 px-4 transition-colors text-ink-soft hover:bg-panel hover:text-ink"
                style={{
                  gridTemplateColumns: "24px 1fr auto",
                  paddingTop: "0.95rem",
                  paddingBottom: "0.95rem",
                  borderLeft: active ? "3px solid var(--orange)" : "3px solid transparent",
                  background: active ? "var(--orange-mute)" : undefined,
                  color: active ? "var(--orange)" : undefined,
                  fontFamily: "var(--font-body)",
                  fontSize: "0.95rem",
                  fontWeight: active ? 600 : 500,
                  minHeight: 56,
                }}
              >
                <span className="flex items-center justify-center w-6 h-6">
                  <span className="w-5 h-5 block">{item.icon}</span>
                </span>
                <span>{item.label}</span>
                {item.badge ? (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.6rem",
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      fontWeight: 700,
                      padding: "2px 6px",
                      border: `1px solid ${
                        item.badge.kind === "warn" ? "rgba(251,219,101,.3)" : item.badge.kind === "err" ? "rgba(214,90,90,.3)" : "var(--orange)"
                      }`,
                      color:
                        item.badge.kind === "warn" ? "var(--yellow)" : item.badge.kind === "err" ? "var(--red)" : "var(--orange)",
                      background:
                        item.badge.kind === "warn" ? "var(--yellow-mute)" : item.badge.kind === "err" ? "var(--red-mute)" : "var(--orange-mute)",
                    }}
                  >
                    {item.badge.text}
                  </span>
                ) : null}
              </Link>
            );
          })}
      </nav>

      {/* You footer */}
      <div className="border-t border-rule px-4 py-3">
        <button
          onClick={openQuickSwitch}
          className="flex items-center gap-3 w-full text-left transition-colors hover:bg-panel"
          title="Switch operator"
          style={{ padding: "0.25rem", margin: "-0.25rem" }}
        >
          <div
            className="flex items-center justify-center bg-slate border border-rule-hi shrink-0"
            style={{
              width: 36,
              height: 36,
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: "0.95rem",
              color: "var(--ink)",
            }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            {(activeStaff?.name || staff?.name) && (
              <div className="truncate" style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: "0.9rem", color: "var(--ink)", lineHeight: 1 }}>
                {activeStaff?.name || staff?.name}
              </div>
            )}
            <div className="flex items-center gap-1 mt-1" style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600 }}>
              <span style={{ color: isTestMode ? "#a78bfa" : "var(--ink-faint)" }}>
                {effectiveRole}{isTestMode ? " (test)" : ""}
              </span>
            </div>
          </div>
          <span
            aria-hidden
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.6rem",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              fontWeight: 700,
              color: "var(--orange)",
              padding: "2px 6px",
              border: "1px solid var(--orange)",
              background: "var(--orange-mute)",
            }}
          >
            Switch
          </span>
        </button>
        <div className="mt-3 flex items-center gap-3" style={{ fontFamily: "var(--font-mono)", fontSize: "0.62rem", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600 }}>
          {activeStaff && (
            <button
              onClick={endShift}
              className="text-yellow hover:opacity-80 transition-opacity"
              title="End shift and lock screen"
            >
              End Shift
            </button>
          )}
          <button
            onClick={handleSignOut}
            className="text-ink-soft hover:text-ink transition-colors"
            title="Sign out"
          >
            Sign Out
          </button>
        </div>
      </div>
    </aside>
  );
}
