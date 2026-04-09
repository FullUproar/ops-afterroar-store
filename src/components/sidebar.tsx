"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useStore } from "@/lib/store-context";
import { useMode } from "@/lib/mode-context";
import { NAV_ITEMS, type NavItem, type Permission, type FeatureModule } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  Flat sidebar — top-level destinations only.                         */
/*  All depth is handled by drill-down within each page.                */
/* ------------------------------------------------------------------ */
const SIDEBAR_ITEMS: { href: string; label: string; icon: string; permission: Permission; feature?: FeatureModule }[] = [
  { href: "/dashboard", label: "Dashboard", icon: "⌂", permission: "checkout" },
  { href: "/dashboard/inventory", label: "Inventory", icon: "▦", permission: "inventory.view" },
  { href: "/dashboard/customers", label: "Customers", icon: "♟", permission: "customers.view" },
  { href: "/dashboard/trade-ins", label: "Trade-Ins", icon: "⇄", permission: "trade_ins" },
  { href: "/dashboard/events", label: "Events", icon: "★", permission: "events.checkin" },
  { href: "/dashboard/cash-flow", label: "Intelligence", icon: "◉", permission: "cash_flow" },
  { href: "/dashboard/orders", label: "Orders", icon: "⊟", permission: "checkout" },
  { href: "/dashboard/staff", label: "Staff", icon: "⊞", permission: "staff.manage" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙", permission: "store.settings" },
  { href: "/dashboard/help", label: "Help", icon: "?", permission: "checkout" },
];

/* (accordion state removed — sidebar is now flat) */

export function Sidebar() {
  const pathname = usePathname();
  const { store, staff, effectiveRole, isTestMode, can, hasModule, activeStaff, endShift } = useStore();
  const { mode, setMode } = useMode();

  // Build visible items per group — filter by permission, feature module, and hidden items
  const rawHidden = (store?.settings as Record<string, unknown>)?.hidden_nav_items;
  const hiddenItems = Array.isArray(rawHidden) ? rawHidden as string[] : [];

  const isActive = useCallback(
    (href: string) => {
      if (href === "/dashboard") return pathname === "/dashboard";
      return pathname === href || pathname.startsWith(href + "/");
    },
    [pathname]
  );

  function handleSignOut() {
    signOut({ callbackUrl: "/login" });
  }

  // Hide sidebar in register mode
  if (mode === "register") return null;

  return (
    <aside className="hidden lg:flex h-full w-56 flex-col border-r border-card-border bg-card transition-all duration-200">
      <div className="border-b border-card-border px-2 lg:px-4 py-4 flex items-center justify-center lg:justify-start">
        <img src="/logo-ring-favicon.png" alt="Afterroar" className="h-7 w-7 lg:hidden" />
        <div className="hidden lg:block">
          <h1 className="text-sm font-bold text-foreground leading-tight line-clamp-2">{store?.name || 'Store Ops'}</h1>
          <p className="text-[10px] text-muted/50">Afterroar Ops</p>
        </div>
      </div>

      {/* Pinned shortcut: Register */}
      <div className="px-2 pt-3 pb-1">
        <Link
          href="/dashboard/register"
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
        >
          <span className="text-base">◈</span>
          <span className="hidden lg:inline">Open Register</span>
        </Link>
      </div>

      <nav className="flex-1 px-2 py-2 space-y-0.5">
        {SIDEBAR_ITEMS
          .filter((item) => can(item.permission) && (!item.feature || hasModule(item.feature)) && !hiddenItems.includes(item.href))
          .map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors justify-center lg:justify-start",
                  active
                    ? "bg-card-hover text-foreground font-medium"
                    : "text-muted hover:bg-card-hover hover:text-foreground"
                )}
              >
                <span className="w-5 text-center opacity-60 shrink-0" style={{ fontFamily: 'inherit' }}>{item.icon}</span>
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            );
          })}
      </nav>

      <div className="border-t border-card-border px-2 lg:px-4 py-3">
        {(activeStaff || staff) && (
          <p className="truncate text-xs text-muted hidden lg:block">
            {activeStaff?.name || staff?.name} &middot;{" "}
            <span className={isTestMode ? "text-purple-400" : ""}>
              {effectiveRole}
            </span>
            {isTestMode && (
              <span className="ml-1 text-purple-500">(test)</span>
            )}
          </p>
        )}
        {activeStaff && (
          <button
            onClick={endShift}
            className="mt-2 w-full text-xs text-amber-400 hover:text-amber-300 transition-colors flex items-center justify-center lg:justify-start gap-1"
            title="End shift and lock screen"
          >
            <span>{"\u{1F319}"}</span>
            <span className="hidden lg:inline">End Shift</span>
          </button>
        )}
        <button
          onClick={handleSignOut}
          className="mt-2 text-xs text-muted hover:text-foreground transition-colors flex items-center justify-center lg:justify-start"
          title="Sign out"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
