"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useStore } from "@/lib/store-context";
import { useMode } from "@/lib/mode-context";
import { NAV_ITEMS, type NavItem } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";

// Sidebar nav group definitions
interface NavGroup {
  label: string;
  hrefs: string[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "POS",
    hrefs: [
      "/dashboard",
      "/dashboard/register",
      "/dashboard/cafe",
      "/dashboard/drawer",
      "/dashboard/orders",
      "/dashboard/fulfillment",
    ],
  },
  {
    label: "Inventory",
    hrefs: [
      "/dashboard/inventory",
      "/dashboard/singles",
      "/dashboard/deck-builder",
      "/dashboard/game-library",
      "/dashboard/consignment",
      "/dashboard/promotions",
      "/dashboard/preorders",
      // "/dashboard/purchase-orders", // Hidden until ready
      "/dashboard/stock-counts",
      "/dashboard/locations",
      "/dashboard/transfers",
    ],
  },
  {
    label: "Customers",
    hrefs: ["/dashboard/customers", "/dashboard/customers/insights", "/dashboard/gift-cards"],
  },
  {
    label: "Events",
    hrefs: ["/dashboard/events"],
  },
  {
    label: "Trade & Returns",
    hrefs: ["/dashboard/trade-ins", "/dashboard/returns"],
  },
  {
    label: "Intelligence",
    hrefs: ["/dashboard/cash-flow", "/dashboard/reports/sales", "/dashboard/reports/margins", "/dashboard/reports/inventory-health", "/dashboard/reports", "/dashboard/reports/staff", "/dashboard/reports/channels"],
  },
  {
    label: "Afterroar Network",
    hrefs: ["/dashboard/network"],
  },
  {
    label: "Admin",
    hrefs: [
      "/dashboard/staff",
      "/dashboard/timeclock",
      "/dashboard/issues",
      "/dashboard/ops-log",
      "/dashboard/help",
    ],
  },
  {
    label: "Settings",
    hrefs: [
      "/dashboard/settings/store",
      "/dashboard/settings/payments",
      "/dashboard/settings/staff",
      "/dashboard/settings/integrations",
      "/dashboard/settings/intelligence",
      "/dashboard/settings/operations",
      "/dashboard/settings/test-mode",
      "/dashboard/billing",
      "/dashboard/import",
    ],
  },
];

const STORAGE_KEY = "sidebar-expanded";

function getStoredExpanded(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function storeExpanded(state: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function Sidebar() {
  const pathname = usePathname();
  const { store, staff, effectiveRole, isTestMode, can, hasModule, activeStaff, endShift } = useStore();
  const { mode, setMode } = useMode();

  // Build visible items per group — filter by permission, feature module, and hidden items
  const rawHidden = (store?.settings as Record<string, unknown>)?.hidden_nav_items;
  const hiddenItems = Array.isArray(rawHidden) ? rawHidden as string[] : [];
  const visibleNav = NAV_ITEMS.filter(
    (item) => can(item.permission) && (!item.feature || hasModule(item.feature)) && !hiddenItems.includes(item.href)
  );

  // Map href -> NavItem for quick lookup
  const itemByHref = new Map<string, NavItem>();
  for (const item of visibleNav) {
    itemByHref.set(item.href, item);
  }

  // Determine which group the current pathname belongs to
  const isActive = useCallback(
    (href: string) => {
      if (href === "/dashboard") return pathname === "/dashboard";
      // Exact match OR pathname continues with / (prevents /reports matching /reports/sales)
      return pathname === href || pathname.startsWith(href + "/");
    },
    [pathname]
  );

  const activeGroup = NAV_GROUPS.find((g) =>
    g.hrefs.some((href) => isActive(href))
  );

  // Expanded state: true = expanded. Active group is always expanded.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setExpanded(getStoredExpanded());
    setHydrated(true);
  }, []);

  function toggleGroup(label: string) {
    setExpanded((prev) => {
      const currentlyOpen = label in prev
        ? !!prev[label]
        : activeGroup?.label === label;

      if (currentlyOpen) {
        // Closing this group
        const next = { ...prev, [label]: false };
        storeExpanded(next);
        return next;
      }

      // Opening this group — close all others (accordion behavior)
      const next: Record<string, boolean> = {};
      for (const g of visibleGroups) {
        next[g.label] = g.label === label;
      }
      storeExpanded(next);
      return next;
    });
  }

  function isGroupExpanded(group: NavGroup): boolean {
    // Explicit state takes priority
    if (group.label in expanded) {
      return !!expanded[group.label];
    }
    // Default: active group is open, others are closed
    return activeGroup?.label === group.label;
  }

  function handleSignOut() {
    signOut({ callbackUrl: "/login" });
  }

  // Hide sidebar in register mode
  if (mode === "register") return null;

  // Filter groups to only those with visible items
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.hrefs
      .map((href) => itemByHref.get(href))
      .filter((item): item is NavItem => !!item),
  })).filter((g) => g.items.length > 0);

  // Catch any visible items not in any group (safety net)
  const groupedHrefs = new Set(NAV_GROUPS.flatMap((g) => g.hrefs));
  const ungroupedItems = visibleNav.filter((item) => !groupedHrefs.has(item.href));

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

      <nav className="flex-1 overflow-y-auto px-2 py-2 scroll-visible">
        {visibleGroups.map((group) => {
          const expanded = hydrated ? isGroupExpanded(group) : (activeGroup?.label === group.label);
          return (
            <div key={group.label} className="mb-1">
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                className="flex w-full items-center justify-between px-2 lg:px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted hover:text-foreground transition-colors"
              >
                <span className="hidden lg:inline">{group.label}</span>
                <span className="lg:hidden text-center w-full text-[10px]">···</span>
                <span className="text-[10px] hidden lg:inline">{expanded ? "\u25BE" : "\u25B8"}</span>
              </button>
              {expanded && (
                <div>
                  {group.items.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={item.label}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2 lg:pl-6 lg:pr-3 py-2 text-sm transition-colors justify-center lg:justify-start",
                          active
                            ? "bg-card-hover text-foreground font-medium lg:border-l-2 lg:border-accent"
                            : "text-muted hover:bg-card-hover hover:text-foreground lg:border-l-2 lg:border-transparent"
                        )}
                      >
                        <span className="w-5 text-center opacity-60" style={{ fontFamily: 'inherit' }}>{item.icon}</span>
                        <span className="hidden lg:inline">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {ungroupedItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-card-hover text-foreground font-medium border-l-2 border-accent"
                  : "text-muted hover:bg-card-hover hover:text-foreground border-l-2 border-transparent"
              )}
            >
              <span className="w-5 text-center opacity-60" style={{ fontFamily: 'inherit' }}>{item.icon}</span>
              {item.label}
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
