"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "@/lib/store-context";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: "⌂" },
  { href: "/dashboard/inventory", label: "Inventory", icon: "▦" },
  { href: "/dashboard/trade-ins", label: "Trade-Ins", icon: "⇄" },
  { href: "/dashboard/customers", label: "Customers", icon: "♟" },
  { href: "/dashboard/events", label: "Events", icon: "★" },
  { href: "/dashboard/reports", label: "Reports", icon: "◩" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { store, staff } = useStore();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 px-4 py-4">
        <h1 className="text-lg font-bold text-white">Afterroar</h1>
        {store && (
          <p className="truncate text-xs text-zinc-500">{store.name}</p>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-2 py-3">
        {nav.map((item) => {
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
            {staff.name} &middot; {staff.role}
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
