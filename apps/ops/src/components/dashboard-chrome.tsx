"use client";

import { TrainingBanner } from "@/lib/training-mode";
import { ShortcutsHelp } from "@/components/shortcuts-help";
import { DashboardLayoutInner } from "@/components/dashboard-layout-inner";
import { StaffLockGate } from "@/components/staff-lock-gate";
import { TrialBanner } from "@/components/trial-banner";
import { OnboardingPanel, OnboardingSandboxBanner } from "@/components/onboarding-panel";
import { useStore } from "@/lib/store-context";

/**
 * All dashboard chrome that depends on client-only state.
 * Dynamically imported with ssr: false from the dashboard layout
 * to prevent hydration mismatches.
 */
export default function DashboardChrome({ children }: { children: React.ReactNode }) {
  const { error } = useStore();

  return (
    <StaffLockGate>
      <div className="flex flex-col h-screen overflow-hidden">
        {error && (
          <div className="shrink-0 w-full bg-red-500/15 border-b border-red-500/30 px-4 py-2 text-center">
            <span className="text-xs font-medium text-red-400">{error}</span>
            <button
              onClick={() => window.location.reload()}
              className="ml-3 text-xs text-red-300 underline hover:text-red-200"
            >
              Retry
            </button>
          </div>
        )}
        <TrialBanner />
        <TrainingBanner />
        <OnboardingSandboxBanner />
        <div className="flex-1 min-h-0">
          <DashboardLayoutInner>
            {children}
          </DashboardLayoutInner>
        </div>
      </div>
      <OnboardingPanel />
      <ShortcutsHelp />
    </StaffLockGate>
  );
}
