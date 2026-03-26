"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useStore } from "@/lib/store-context";
import { NAV_ITEMS } from "@/lib/permissions";
import { signOut } from "next-auth/react";

/* ------------------------------------------------------------------ */
/*  Bottom tab bar — 5 tabs max                                        */
/* ------------------------------------------------------------------ */
const PRIMARY_TABS = [
  { href: "/dashboard/checkout", label: "Register", icon: "\u25C8" },
  { href: "/dashboard/inventory", label: "Inventory", icon: "\u25A6" },
  { href: "/dashboard/customers", label: "Customers", icon: "\u265F" },
  { href: "/dashboard/events", label: "Events", icon: "\u2605" },
];

/* ------------------------------------------------------------------ */
/*  "More" sheet groups                                                */
/* ------------------------------------------------------------------ */
interface NavGroup {
  label: string;
  items: { href: string; label: string; icon: string; permission: string }[];
}

const MORE_GROUPS: NavGroup[] = [
  {
    label: "Sales",
    items: [
      { href: "/dashboard/checkout", label: "Checkout", icon: "\u25C8", permission: "checkout" },
      { href: "/dashboard/drawer", label: "Drawer", icon: "\u25A3", permission: "checkout" },
      { href: "/dashboard/gift-cards", label: "Gift Cards", icon: "\u25C6", permission: "customers.edit" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/dashboard/inventory", label: "Inventory", icon: "\u25A6", permission: "inventory.view" },
      { href: "/dashboard/catalog", label: "Catalog", icon: "\u2295", permission: "inventory.adjust" },
      { href: "/dashboard/purchase-orders", label: "Purchase Orders", icon: "\u229E", permission: "inventory.adjust" },
      { href: "/dashboard/stock-counts", label: "Stock Count", icon: "\u25A4", permission: "inventory.adjust" },
      { href: "/dashboard/inventory/labels", label: "Labels", icon: "\u2630", permission: "inventory.view" },
      { href: "/dashboard/game-library", label: "Game Library", icon: "\u265C", permission: "inventory.view" },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/dashboard/customers", label: "Customers", icon: "\u265F", permission: "customers.view" },
      { href: "/dashboard/staff", label: "Staff", icon: "\u229E", permission: "staff.manage" },
      { href: "/dashboard/timeclock", label: "Time Clock", icon: "\u25F7", permission: "checkout" },
    ],
  },
  {
    label: "Events",
    items: [
      { href: "/dashboard/events", label: "Events", icon: "\u2605", permission: "events.checkin" },
      { href: "/dashboard/tournaments", label: "Tournaments", icon: "\u2694", permission: "events.manage" },
    ],
  },
  {
    label: "Reports",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "\u2302", permission: "checkout" },
      { href: "/dashboard/cash-flow", label: "Cash Flow", icon: "\u25CE", permission: "cash_flow" },
      { href: "/dashboard/reports", label: "Reports", icon: "\u25A9", permission: "reports" },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/dashboard/settings", label: "Settings", icon: "\u2699", permission: "store.settings" },
      { href: "/dashboard/locations", label: "Locations", icon: "\u22A1", permission: "store.settings" },
      { href: "/dashboard/transfers", label: "Transfers", icon: "\u21C6", permission: "inventory.adjust" },
      { href: "/dashboard/promotions", label: "Promotions", icon: "\u2726", permission: "inventory.adjust" },
      { href: "/dashboard/import", label: "Import", icon: "\u2913", permission: "import" },
    ],
  },
];

export function MobileNav() {
  const pathname = usePathname();
  const { can, staff, effectiveRole, isTestMode } = useStore();
  const [moreOpen, setMoreOpen] = useState(false);

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* Fixed bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-sm pb-safe md:hidden">
        <div className="flex items-stretch">
          {PRIMARY_TABS.map((tab) => {
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-h-14 transition-colors ${
                  active ? "text-blue-400" : "text-zinc-500"
                }`}
              >
                <span className="text-lg leading-none">{tab.icon}</span>
                <span className="text-[10px] font-medium">{tab.label}</span>
              </Link>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-h-14 transition-colors ${
              moreOpen ? "text-blue-400" : "text-zinc-500"
            }`}
          >
            <span className="text-lg leading-none">&middot;&middot;&middot;</span>
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

      {/* "More" full-screen sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950 md:hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <h2 className="text-lg font-bold text-white">Menu</h2>
            <button
              onClick={() => setMoreOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-xl text-zinc-400 hover:text-white active:bg-zinc-800"
            >
              &times;
            </button>
          </div>

          {/* Scrollable groups */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
            {MORE_GROUPS.map((group) => {
              const visibleItems = group.items.filter((item) =>
                can(item.permission as Parameters<typeof can>[0])
              );
              if (visibleItems.length === 0) return null;

              return (
                <div key={group.label}>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    {group.label}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {visibleItems.map((item) => {
                      const active = isActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMoreOpen(false)}
                          className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 min-h-16 transition-colors ${
                            active
                              ? "bg-zinc-800 text-white"
                              : "text-zinc-400 active:bg-zinc-800/60"
                          }`}
                        >
                          <span className="text-xl leading-none">{item.icon}</span>
                          <span className="text-[11px] font-medium text-center leading-tight">
                            {item.label}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer with staff info + sign out */}
          <div className="border-t border-zinc-800 px-4 py-3 pb-safe">
            {staff && (
              <p className="truncate text-xs text-zinc-400">
                {staff.name} &middot;{" "}
                <span className={isTestMode ? "text-purple-400" : ""}>
                  {effectiveRole}
                </span>
                {isTestMode && (
                  <span className="ml-1 text-purple-500">(test)</span>
                )}
              </p>
            )}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="mt-2 min-h-11 text-sm text-zinc-500 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </>
  );
}
