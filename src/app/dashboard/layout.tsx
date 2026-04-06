"use client";

import { SessionProvider } from "next-auth/react";
import { StoreProvider } from "@/lib/store-context";
import { ModeProvider } from "@/lib/mode-context";
import { TrainingModeProvider, TrainingBanner } from "@/lib/training-mode";
import { OfflineProvider } from "@/components/offline-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { ShortcutsHelp } from "@/components/shortcuts-help";
import { ToastProvider } from "@/components/toast";
import { DashboardLayoutInner } from "@/components/dashboard-layout-inner";
import { StaffLockGate } from "@/components/staff-lock-gate";
import { TrialBanner } from "@/components/trial-banner";
import { OnboardingPanel, OnboardingSandboxBanner } from "@/components/onboarding-panel";

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
            <StaffLockGate>
              <TrialBanner />
              <OnboardingSandboxBanner />
              <TrainingBanner />
              <DashboardLayoutInner>
                {children}
              </DashboardLayoutInner>
              <OnboardingPanel />
              <ShortcutsHelp />
            </StaffLockGate>
          </ToastProvider>
          </OfflineProvider>
          </ThemeProvider>
          </TrainingModeProvider>
        </ModeProvider>
      </StoreProvider>
    </SessionProvider>
  );
}
