"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useStore } from "@/lib/store-context";
import { useMode } from "@/lib/mode-context";
import { signOut } from "next-auth/react";
import { useTheme } from "@/components/theme-provider";
import { NAV_ITEMS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const REGISTER_TABS = [
  { href: "/dashboard/register", label: "Cart", icon: "\u25C8" },
  { href: "/dashboard/register?scan=1", label: "Scan", icon: "\uD83D\uDCF7", action: "scan" },
  { href: "/dashboard/customers", label: "Customers", icon: "\u265F" },
  { href: "/dashboard/timeclock", label: "Clock", icon: "\u25F7" },
];

type PanelState = "closed" | "opening" | "open" | "closing";

export function RegisterNav() {
  const pathname = usePathname();
  const { can, staff, effectiveRole, isTestMode } = useStore();
  const { toggleMode } = useMode();
  const { resolvedTheme, setTheme } = useTheme();
  const [panelState, setPanelState] = useState<PanelState>("closed");
  const moreOpen = panelState === "open" || panelState === "opening";

  function openMore() {
    setPanelState("opening");
    requestAnimationFrame(() => {
      setPanelState("open");
    });
  }

  function closeMore() {
    setPanelState("closing");
    setTimeout(() => setPanelState("closed"), 200);
  }

  function isActive(href: string) {
    if (href === "/dashboard/register?scan=1") return false;
    if (href === "/dashboard/register") return pathname === "/dashboard/register";
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  const visibleNav = NAV_ITEMS.filter((item) => can(item.permission));

  return (
    <>
      {/* Fixed bottom nav — register mode: taller, bigger icons */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-card-border bg-card/95 backdrop-blur-sm pb-safe"
        style={{ height: "calc(72px + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-stretch h-[72px]">
          {REGISTER_TABS.map((tab) => {
            const active = isActive(tab.href);
            // Scan tab dispatches a custom event instead of navigating
            if (tab.action === "scan") {
              return (
                <button
                  key={tab.label}
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("register-scan"));
                  }}
                  className="relative flex flex-1 flex-col items-center justify-center gap-1 text-muted active:text-foreground"
                  style={{ touchAction: "manipulation", minHeight: 56 }}
                >
                  <span className="text-2xl leading-none">{tab.icon}</span>
                  <span className="text-[11px] font-medium">{tab.label}</span>
                </button>
              );
            }

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors",
                  active ? "text-accent" : "text-muted"
                )}
                style={{ minHeight: 56 }}
              >
                {active && (
                  <span className="absolute top-0 left-3 right-3 h-0.5 rounded-b bg-accent" />
                )}
                <span className="text-2xl leading-none">{tab.icon}</span>
                <span className="text-[11px] font-medium">{tab.label}</span>
              </Link>
            );
          })}

          {/* More button */}
          <button
            onPointerUp={(e) => {
              if (e.pointerType === "touch" || e.pointerType === "mouse") {
                openMore();
              }
            }}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors",
              moreOpen ? "text-accent" : "text-muted"
            )}
            style={{ touchAction: "manipulation", minHeight: 56 }}
          >
            {moreOpen && (
              <span className="absolute top-0 left-3 right-3 h-0.5 rounded-b bg-accent" />
            )}
            <span className="text-2xl leading-none">&middot;&middot;&middot;</span>
            <span className="text-[11px] font-medium">More</span>
          </button>
        </div>
      </nav>

      {/* More sheet */}
      {panelState !== "closed" && (
        <div
          className={cn(
            "fixed inset-0 z-50 flex flex-col bg-background transition-opacity duration-200",
            panelState === "closing" ? "opacity-0 pointer-events-none" : "opacity-100"
          )}
          style={{ touchAction: panelState === "open" ? "auto" : "none" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-card-border px-4 py-3">
            <h2 className="text-lg font-semibold text-foreground">Menu</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                className="flex h-10 w-10 items-center justify-center rounded-full text-lg text-muted hover:text-foreground active:bg-card-hover transition-colors"
                aria-label="Toggle theme"
              >
                {resolvedTheme === "dark" ? "\u2600" : "\u263E"}
              </button>
              <button
                onClick={() => closeMore()}
                className="flex h-10 w-10 items-center justify-center rounded-full text-xl text-muted hover:text-foreground active:bg-card-hover transition-colors"
              >
                &times;
              </button>
            </div>
          </div>

          {/* Switch to Dashboard button */}
          <div className="border-b border-card-border px-4 py-3">
            <button
              onClick={() => {
                toggleMode();
                closeMore();
              }}
              className="w-full rounded-xl border border-card-border bg-card-hover px-4 py-3 text-sm font-medium text-foreground hover:bg-accent-light transition-colors"
              style={{ minHeight: 56 }}
            >
              Switch to Dashboard Mode
            </button>
          </div>

          {/* Quick links */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scroll-visible">
            <div className="grid grid-cols-3 gap-2">
              {visibleNav.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => closeMore()}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 min-h-16 transition-colors",
                      active
                        ? "bg-accent-light text-accent"
                        : "text-muted hover:text-foreground active:bg-card-hover"
                    )}
                    style={{ minHeight: 56 }}
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

          {/* Footer */}
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
