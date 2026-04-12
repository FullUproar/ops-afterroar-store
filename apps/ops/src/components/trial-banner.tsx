"use client";

import Link from "next/link";
import { useStore } from "@/lib/store-context";

/* ------------------------------------------------------------------ */
/*  Trial Banner — subtle reminder of trial status                     */
/*  Shows only for owners, only during trial.                          */
/* ------------------------------------------------------------------ */

export function TrialBanner() {
  const { store, effectiveRole } = useStore();

  if (effectiveRole !== "owner") return null;

  const settings = (store?.settings ?? {}) as Record<string, unknown>;
  const subscriptionStatus = (settings.subscription_status as string) || "";
  const trialStartedAt = settings.trial_started_at as string | undefined;
  const trialDays = (settings.trial_days as number) || 14;

  if (subscriptionStatus !== "trial" || !trialStartedAt) return null;

  const started = new Date(trialStartedAt);
  const expiresAt = new Date(started.getTime() + trialDays * 86400000);
  const daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000));

  // Don't show if > 10 days remaining (not urgent yet)
  if (daysRemaining > 10) return null;

  return (
    <div className="bg-amber-950/50 border-b border-amber-500/20 px-4 py-2 text-center">
      <span className="text-xs text-amber-300">
        {daysRemaining > 0 ? (
          <>
            {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} left in your free trial.{" "}
            <Link href="/dashboard/billing" className="font-medium text-amber-200 hover:underline">
              View plans
            </Link>
          </>
        ) : (
          <>
            Your trial has ended.{" "}
            <Link href="/dashboard/billing" className="font-medium text-amber-200 hover:underline">
              Choose a plan
            </Link>
            {" "}to keep premium features.
          </>
        )}
      </span>
    </div>
  );
}
