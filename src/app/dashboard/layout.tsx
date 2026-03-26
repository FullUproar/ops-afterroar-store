"use client";

import { SessionProvider } from "next-auth/react";
import { StoreProvider } from "@/lib/store-context";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { TestPanel } from "@/components/test-panel";
import { NetworkStatusBar } from "@/components/network-status-bar";
import { OfflineProvider } from "@/components/offline-provider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <StoreProvider>
        <OfflineProvider>
          <div className="flex h-screen bg-zinc-950">
            <Sidebar />
            <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
              <div className="p-4 md:p-6 pb-0">
                <NetworkStatusBar />
              </div>
              <div className="p-4 md:p-6">{children}</div>
            </main>
            <MobileNav />
          </div>
          <TestPanel />
        </OfflineProvider>
      </StoreProvider>
    </SessionProvider>
  );
}
