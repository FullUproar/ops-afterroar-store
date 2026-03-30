"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store-context";
import { useMode } from "@/lib/mode-context";
import { NAV_ITEMS } from "@/lib/permissions";
import { signOut } from "next-auth/react";
import { useTheme } from "@/components/theme-provider";

/* ------------------------------------------------------------------ */
/*  All available nav items for favorites                              */
/* ------------------------------------------------------------------ */
const ALL_NAV_ITEMS = [
  { href: "/dashboard/register", label: "Register", icon: "\u25C8" },
  { href: "/dashboard/inventory", label: "Inventory", icon: "\u25A6" },
  { href: "/dashboard/customers", label: "Customers", icon: "\u265F" },
  { href: "/dashboard/events", label: "Events", icon: "\u2605" },
  { href: "/dashboard", label: "Dashboard", icon: "\u2302" },
  { href: "/dashboard/drawer", label: "Drawer", icon: "\u25A3" },
  { href: "/dashboard/gift-cards", label: "Gift Cards", icon: "\u25C6" },
  { href: "/dashboard/trade-ins", label: "Trade-Ins", icon: "\u21C4" },
  { href: "/dashboard/orders", label: "Orders", icon: "\u2630" },
  { href: "/dashboard/catalog", label: "Catalog", icon: "\u2295" },
  { href: "/dashboard/purchase-orders", label: "POs", icon: "\u229E" },
  { href: "/dashboard/stock-counts", label: "Stock Count", icon: "\u25A4" },
  { href: "/dashboard/staff", label: "Staff", icon: "\u229E" },
  { href: "/dashboard/timeclock", label: "Time Clock", icon: "\u25F7" },
  { href: "/dashboard/tournaments", label: "Tournaments", icon: "\u2694" },
  { href: "/dashboard/cash-flow", label: "Cash Flow", icon: "\u25CE" },
  { href: "/dashboard/reports", label: "Reports", icon: "\u25A9" },
  { href: "/dashboard/settings", label: "Settings", icon: "\u2699" },
];

const DEFAULT_FAVORITES = [
  "/dashboard/register",
  "/dashboard/inventory",
  "/dashboard/customers",
];

const STORAGE_KEY = "afterroar-nav-favorites";

function loadFavorites(): string[] {
  if (typeof window === "undefined") return DEFAULT_FAVORITES;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length === 3) {
        // Migrate old checkout favorites to register
        const migrated = parsed.map((href: string) =>
          href === "/dashboard/checkout" ? "/dashboard/register" : href
        );
        if (JSON.stringify(migrated) !== stored) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        }
        return migrated;
      }
    }
  } catch {}
  return DEFAULT_FAVORITES;
}

function saveFavorites(favs: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
}

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
      { href: "/dashboard/register", label: "Register", icon: "\u25C8", permission: "checkout" },
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
      { href: "/dashboard/issues", label: "Issues", icon: "\u2691", permission: "reports" },
      { href: "/dashboard/help", label: "Help", icon: "?", permission: "checkout" },
    ],
  },
];

type PanelState = "closed" | "opening" | "open" | "closing";

export function MobileNav() {
  const pathname = usePathname();
  const { can, staff, effectiveRole, isTestMode } = useStore();
  const { mode, toggleMode } = useMode();
  const { resolvedTheme, setTheme } = useTheme();
  const [panelState, setPanelState] = useState<PanelState>("closed");
  const moreOpen = panelState === "open" || panelState === "opening";
  const [favorites, setFavorites] = useState<string[]>(DEFAULT_FAVORITES);
  const [replacingFav, setReplacingFav] = useState<string | null>(null); // href of item to add

  useEffect(() => {
    setFavorites(loadFavorites());
  }, []);

  function openMore() {
    setPanelState("opening");
    // Allow opening animation to play
    requestAnimationFrame(() => {
      setPanelState("open");
    });
  }

  function closeMore() {
    setPanelState("closing");
    setReplacingFav(null);
    setTimeout(() => setPanelState("closed"), 200);
  }

  function setMoreOpen(open: boolean) {
    if (open) openMore();
    else closeMore();
  }

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  function getNavItem(href: string) {
    return ALL_NAV_ITEMS.find((n) => n.href === href) || { href, label: href.split("/").pop() || "", icon: "\u25CF" };
  }

  const isFavorite = useCallback(
    (href: string) => favorites.includes(href),
    [favorites]
  );

  function handleToggleFavorite(href: string) {
    if (isFavorite(href)) {
      // Remove from favorites, replace with a default that isn't already there
      const replacement = DEFAULT_FAVORITES.find((d) => !favorites.includes(d) || d === href);
      const newFavs = favorites.map((f) => (f === href ? (replacement !== href ? replacement! : "/dashboard") : f));
      setFavorites(newFavs);
      saveFavorites(newFavs);
    } else {
      // Show "Replace which?" prompt
      setReplacingFav(href);
    }
  }

  function handleReplace(oldHref: string) {
    if (!replacingFav) return;
    const newFavs = favorites.map((f) => (f === oldHref ? replacingFav : f));
    setFavorites(newFavs);
    saveFavorites(newFavs);
    setReplacingFav(null);
  }

  const favTabs = favorites.map(getNavItem);

  // In register mode, RegisterNav handles navigation
  if (mode === "register") return null;

  return (
    <>
      {/* Fixed bottom tab bar — 4 items: 3 favorites + More */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-card-border bg-card/95 backdrop-blur-sm pb-safe lg:hidden"
        style={{ height: "calc(64px + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-stretch h-16">
          {favTabs.map((tab) => {
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                {active && (
                  <span className="absolute top-0 left-3 right-3 h-0.5 rounded-b bg-accent" />
                )}
                <span className="text-lg leading-none">{tab.icon}</span>
                <span className="text-[10px] font-medium">{tab.label}</span>
              </Link>
            );
          })}

          {/* More button — only opens on deliberate tap, not scroll/drag */}
          <button
            onPointerUp={(e) => {
              // Only respond to deliberate taps (not drags)
              if (e.pointerType === "touch" || e.pointerType === "mouse") {
                openMore();
              }
            }}
            className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${
              moreOpen ? "text-accent" : "text-muted"
            }`}
            style={{ touchAction: "manipulation" }}
          >
            {moreOpen && (
              <span className="absolute top-0 left-3 right-3 h-0.5 rounded-b bg-accent" />
            )}
            <span className="text-lg leading-none">&middot;&middot;&middot;</span>
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

      {/* "More" full-screen sheet */}
      {panelState !== "closed" && (
        <div
          className={`fixed inset-0 z-50 flex flex-col bg-background lg:hidden transition-opacity duration-200 ${
            panelState === "closing" ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
          style={{ touchAction: panelState === "open" ? "auto" : "none" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-card-border px-4 py-3">
            <h2 className="text-lg font-semibold text-foreground">Menu</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                className="flex h-10 w-10 items-center justify-center rounded-full text-lg text-muted hover:text-foreground active:bg-card-hover transition-colors"
                aria-label="Toggle theme"
              >
                {resolvedTheme === 'dark' ? '\u2600' : '\u263E'}
              </button>
              <button
                onClick={() => closeMore()}
                className="flex h-10 w-10 items-center justify-center rounded-full text-xl text-muted hover:text-foreground active:bg-card-hover transition-colors"
              >
                &times;
              </button>
            </div>
          </div>

          {/* Replace which? prompt */}
          {replacingFav && (
            <div className="border-b border-card-border bg-accent-light px-4 py-3">
              <p className="text-sm font-medium text-foreground mb-2">
                Replace which favorite?
              </p>
              <div className="flex gap-2">
                {favorites.map((fhref) => {
                  const item = getNavItem(fhref);
                  return (
                    <button
                      key={fhref}
                      onClick={() => handleReplace(fhref)}
                      className="flex flex-col items-center gap-1 rounded-xl border border-card-border bg-card px-4 py-2.5 text-foreground active:bg-card-hover transition-colors"
                    >
                      <span className="text-lg">{item.icon}</span>
                      <span className="text-[11px] font-medium">{item.label}</span>
                    </button>
                  );
                })}
                <button
                  onClick={() => setReplacingFav(null)}
                  className="flex items-center rounded-xl border border-card-border px-3 py-2.5 text-xs text-muted active:bg-card-hover"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Scrollable groups */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
            {MORE_GROUPS.map((group) => {
              const visibleItems = group.items.filter((item) =>
                can(item.permission as Parameters<typeof can>[0])
              );
              if (visibleItems.length === 0) return null;

              return (
                <div key={group.label}>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                    {group.label}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {visibleItems.map((item) => {
                      const active = isActive(item.href);
                      const isFav = isFavorite(item.href);
                      return (
                        <div key={item.href} className="relative">
                          <Link
                            href={item.href}
                            onClick={() => { setMoreOpen(false); setReplacingFav(null); }}
                            className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 min-h-16 transition-colors ${
                              active
                                ? "bg-accent-light text-accent"
                                : "text-muted hover:text-foreground active:bg-card-hover"
                            }`}
                          >
                            <span className="text-xl leading-none">{item.icon}</span>
                            <span className="text-[11px] font-medium text-center leading-tight">
                              {item.label}
                            </span>
                          </Link>
                          {/* Favorite star */}
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleToggleFavorite(item.href);
                            }}
                            className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full text-xs"
                            aria-label={isFav ? "Remove from favorites" : "Set as favorite"}
                          >
                            <span className={isFav ? "text-accent" : "text-muted/50"}>
                              {isFav ? "\u2605" : "\u2606"}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Switch mode */}
          <div className="border-t border-card-border px-4 py-3">
            <button
              onClick={() => {
                toggleMode();
                closeMore();
              }}
              className="w-full rounded-xl border border-card-border bg-card-hover px-4 py-3 text-sm font-medium text-foreground hover:bg-accent-light transition-colors"
              style={{ minHeight: 44 }}
            >
              Switch to Register Mode
            </button>
          </div>

          {/* Footer with staff info + sign out */}
          <div className="border-t border-card-border px-4 py-3 pb-safe">
            {staff && (
              <p className="truncate text-xs text-muted">
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
              className="mt-2 min-h-11 text-sm text-muted hover:text-foreground"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </>
  );
}
