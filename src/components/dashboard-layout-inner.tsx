"use client";

import { usePathname } from "next/navigation";
import { useMode } from "@/lib/mode-context";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { RegisterNav } from "@/components/register-nav";
import { NetworkStatusBar } from "@/components/network-status-bar";
import { NotificationCenter } from "@/components/notification-center";

export function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const { mode } = useMode();
  const pathname = usePathname();

  // Register page is full-screen — no sidebar, no nav, no top bar
  const isRegisterPage = pathname === "/dashboard/register";

  if (isRegisterPage) {
    return <>{children}</>;
  }

  if (mode === "register") {
    return (
      <div className="flex h-screen bg-background overflow-x-hidden max-w-[100vw]">
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-20">
          <div className="flex items-center gap-2 p-2 pb-0">
            <div className="flex-1 min-w-0">
              <NetworkStatusBar />
            </div>
          </div>
          {children}
        </main>
        <RegisterNav />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background overflow-x-hidden max-w-[100vw]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden pb-20 lg:pb-0">
        <div className="flex items-center gap-2 p-4 md:p-5 lg:p-6 pb-0">
          <div className="flex-1 min-w-0">
            <NetworkStatusBar />
          </div>
          <NotificationCenter />
        </div>
        <div className="p-4 md:p-5 lg:p-6">{children}</div>
      </main>
      <MobileNav />
    </div>
  );
}
