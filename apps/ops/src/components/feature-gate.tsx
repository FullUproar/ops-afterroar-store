"use client";

import { useStore } from "@/lib/store-context";
import { type FeatureModule, ALL_FEATURE_MODULES } from "@/lib/permissions";

/* ------------------------------------------------------------------ */
/*  Feature Gate — wraps premium features with an upgrade prompt       */
/*  <FeatureGate module="intelligence">                                */
/*    <StoreAdvisor />                                                 */
/*  </FeatureGate>                                                     */
/* ------------------------------------------------------------------ */

interface FeatureGateProps {
  module: FeatureModule;
  children: React.ReactNode;
  /** If true, renders nothing instead of upgrade prompt */
  hideIfLocked?: boolean;
}

export function FeatureGate({ module, children, hideIfLocked }: FeatureGateProps) {
  const { hasModule } = useStore();

  if (hasModule(module)) {
    return <>{children}</>;
  }

  if (hideIfLocked) return null;

  const meta = ALL_FEATURE_MODULES.find((m) => m.key === module);

  return (
    <div className="rounded-xl border border-card-border bg-card/50 p-6 text-center">
      <div className="text-3xl mb-3">{meta?.icon ?? "\u{1F512}"}</div>
      <h3 className="text-base font-semibold text-foreground mb-1">
        {meta?.label ?? "Premium Feature"}
      </h3>
      <p className="text-sm text-muted mb-4 max-w-md mx-auto">
        {meta?.description ?? "This feature requires a plan upgrade."}
      </p>
      <a
        href="/dashboard/settings"
        className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
      >
        View Plans
      </a>
    </div>
  );
}

/**
 * Hook to check feature availability inline without wrapping.
 * const locked = useFeatureLocked("intelligence");
 * if (locked) return <UpgradeBanner />;
 */
export function useFeatureLocked(module: FeatureModule): boolean {
  const { hasModule } = useStore();
  return !hasModule(module);
}
