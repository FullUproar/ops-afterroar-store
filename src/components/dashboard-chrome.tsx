"use client";

import { TrainingBanner } from "@/lib/training-mode";
import { ShortcutsHelp } from "@/components/shortcuts-help";
import { DashboardLayoutInner } from "@/components/dashboard-layout-inner";
import { StaffLockGate } from "@/components/staff-lock-gate";
import { TrialBanner } from "@/components/trial-banner";
import { OnboardingPanel, OnboardingSandboxBanner } from "@/components/onboarding-panel";

/**
 * All dashboard chrome that depends on client-only state.
 * Dynamically imported with ssr: false from the dashboard layout
 * to prevent hydration mismatches.
 */
export default function DashboardChrome({ children }: { children: React.ReactNode }) {
  return (
    <StaffLockGate>
      <TrialBanner />
      <TrainingBanner />
      <OnboardingSandboxBanner />
      <DashboardLayoutInner>
        {children}
      </DashboardLayoutInner>
      <OnboardingPanel />
      <ShortcutsHelp />
    </StaffLockGate>
  );
}
