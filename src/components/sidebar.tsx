"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useStore } from "@/lib/store-context";
import { NAV_ITEMS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();
  const { store, staff, effectiveRole, isTestMode, can } = useStore();

  function handleSignOut() {
    signOut({ callbackUrl: "/login" });
  }

  const visibleNav = NAV_ITEMS.filter((item) => can(item.permission));

  return (
    <aside className="hidden md:flex h-screen w-56 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 px-4 py-4">
        <h1 className="text-lg font-bold text-white">Afterroar</h1>
        {store && (
          <p className="truncate text-xs text-zinc-500">{store.name}</p>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-2 py-3">
        {visibleNav.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
              )}
            >
              <span className="w-5 text-center">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-zinc-800 px-4 py-3">
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
          onClick={handleSignOut}
          className="mt-2 text-xs text-zinc-500 hover:text-white"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
