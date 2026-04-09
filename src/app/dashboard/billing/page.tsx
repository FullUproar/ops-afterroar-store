"use client";

import { useState } from "react";
import { useStore } from "@/lib/store-context";
import { PageHeader } from "@/components/page-header";

/* ------------------------------------------------------------------ */
/*  Subscription — plan management + add-on modules                    */
/* ------------------------------------------------------------------ */

const PLANS = [
  {
    key: "pro",
    name: "Pro",
    price: "$149",
    period: "/mo",
    features: [
      "Full POS + Register",
      "Store Intelligence",
      "TCG Engine (Scryfall, Pokemon, Yu-Gi-Oh)",
      "Events + Tournaments",
      "Advanced Reports",
      "Customer Loyalty",
      "Trade-Ins + Buylist",
      "Cafe Module",
      "Receipt Customization",
    ],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "$249",
    period: "/mo",
    features: [
      "Everything in Pro",
      "Multi-Location (up to 3)",
      "eBay + Marketplace Sync",
      "API Access",
      "Priority Support",
      "Custom Integrations",
    ],
    highlighted: true,
  },
];


export default function SubscriptionPage() {
  const { store, can } = useStore();
  const [saving, setSaving] = useState(false);

  if (!can("store.settings")) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted">Only store owners can manage the subscription.</p>
      </div>
    );
  }

  const settings = (store?.settings ?? {}) as Record<string, unknown>;
  const currentPlan = (settings.plan as string) || "pro";
  const subscriptionStatus = (settings.subscription_status as string) || "trial";
  const trialStartedAt = settings.trial_started_at as string | undefined;
  const trialDays = (settings.trial_days as number) || 30;

  // Calculate trial remaining
  let trialDaysRemaining: number | null = null;
  if (trialStartedAt) {
    const started = new Date(trialStartedAt);
    const expiresAt = new Date(started.getTime() + trialDays * 86400000);
    trialDaysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000));
  }

  const isTrialing = subscriptionStatus === "trial";

  async function switchPlan(plan: string) {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      window.location.reload();
    } finally {
      setSaving(false);
    }
  }


  return (
    <div className="flex flex-col h-full gap-4">
      <PageHeader title="Subscription" backHref="/dashboard/settings" />

      <div className="max-w-3xl space-y-6">
        {/* Trial Banner */}
        {isTrialing && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-amber-300">30-Day Trial</h2>
                <p className="text-xs text-amber-300/70 mt-1">
                  All features unlocked. Pick a plan before your trial ends to keep everything running.
                </p>
              </div>
              {trialDaysRemaining !== null && (
                <span className={`text-2xl font-bold ${trialDaysRemaining <= 7 ? "text-red-400" : "text-amber-300"}`}>
                  {trialDaysRemaining > 0 ? `${trialDaysRemaining}d` : "Expired"}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Plan Selection */}
        <div className="rounded-xl border border-card-border bg-card p-6 shadow-sm dark:shadow-none">
          <h2 className="text-sm font-semibold text-foreground">Choose Your Plan</h2>
          <p className="mt-1 text-xs text-muted">Change anytime. No long-term contracts.</p>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {PLANS.map((tier) => {
              const isCurrent = currentPlan === tier.key;
              return (
                <div
                  key={tier.key}
                  className={`rounded-xl border p-5 transition-all ${
                    isCurrent
                      ? "border-accent bg-accent/10 ring-1 ring-accent/30"
                      : tier.highlighted
                        ? "border-purple-500/30 bg-purple-500/5 hover:border-purple-500/50"
                        : "border-card-border bg-card-hover hover:border-accent/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-foreground">{tier.name}</h3>
                      <p className="text-2xl font-bold text-foreground mt-1">
                        {tier.price}<span className="text-sm font-normal text-muted">{tier.period}</span>
                      </p>
                    </div>
                    {isCurrent && (
                      <span className="rounded-full bg-accent/20 px-3 py-1 text-xs font-semibold text-accent border border-accent/30">
                        Current
                      </span>
                    )}
                  </div>

                  <ul className="mt-4 space-y-2">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-muted">
                        <span className="text-green-400 mt-0.5">✓</span> {f}
                      </li>
                    ))}
                  </ul>

                  {!isCurrent && (
                    <button
                      onClick={() => switchPlan(tier.key)}
                      disabled={saving}
                      className={`mt-4 w-full rounded-lg py-2 text-sm font-semibold transition-colors ${
                        tier.highlighted
                          ? "bg-purple-600 text-white hover:bg-purple-500"
                          : "bg-accent text-white hover:bg-accent/80"
                      } disabled:opacity-50`}
                    >
                      {saving ? "Saving..." : `Switch to ${tier.name}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Payment method placeholder */}
        <div className="rounded-xl border border-card-border bg-card p-6 shadow-sm dark:shadow-none">
          <h2 className="text-sm font-semibold text-foreground">Payment Method</h2>
          <p className="mt-2 text-sm text-muted">
            Stripe Billing integration coming soon. Your trial runs with full access until then.
          </p>
        </div>
      </div>
    </div>
  );
}
