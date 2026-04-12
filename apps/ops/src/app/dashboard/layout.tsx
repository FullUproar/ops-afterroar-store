"use client";

import dynamic from "next/dynamic";
import { SessionProvider } from "next-auth/react";
import { StoreProvider } from "@/lib/store-context";
import { ModeProvider } from "@/lib/mode-context";
import { TrainingModeProvider } from "@/lib/training-mode";
import { OfflineProvider } from "@/components/offline-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/toast";

// Dynamic import the entire dashboard chrome with ssr: false.
// This prevents all hydration mismatches from sidebar, banners, staff lock, etc.
// which all depend on client-only state (session, store context, localStorage).
const DashboardChrome = dynamic(() => import("@/components/dashboard-chrome"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="text-muted text-sm">Loading...</div>
    </div>
  ),
});

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <StoreProvider>
        <ModeProvider>
          <TrainingModeProvider>
          <ThemeProvider>
          <OfflineProvider>
          <ToastProvider>
            <DashboardChrome>{children}</DashboardChrome>
          </ToastProvider>
          </OfflineProvider>
          </ThemeProvider>
          </TrainingModeProvider>
        </ModeProvider>
      </StoreProvider>
    </SessionProvider>
  );
}
