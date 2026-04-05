"use client";

import { useStore } from "@/lib/store-context";
import { PageHeader } from "@/components/page-header";

/* ------------------------------------------------------------------ */
/*  Billing — subscription management + trial status                   */
/*  Skeleton for now — wired to Stripe Billing later.                  */
/* ------------------------------------------------------------------ */

export default function BillingPage() {
  const { store, can } = useStore();

  if (!can("store.settings")) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted">Only store owners can manage billing.</p>
      </div>
    );
  }

  const settings = (store?.settings ?? {}) as Record<string, unknown>;
  const plan = (settings.plan as string) || "trial";
  const subscriptionStatus = (settings.subscription_status as string) || "trial";
  const trialStartedAt = settings.trial_started_at as string | undefined;
  const trialDays = (settings.trial_days as number) || 14;

  // Calculate trial remaining
  let trialDaysRemaining: number | null = null;
  if (trialStartedAt) {
    const started = new Date(trialStartedAt);
    const expiresAt = new Date(started.getTime() + trialDays * 86400000);
    trialDaysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000));
  }

  const isTrialing = subscriptionStatus === "trial";

  return (
    <div className="space-y-6">
      <PageHeader title="Billing" backHref="/dashboard/settings" />

      <div className="max-w-2xl space-y-6">
        {/* Current Plan */}
        <div className="rounded-xl border border-card-border bg-card p-6 shadow-sm dark:shadow-none">
          <h2 className="text-sm font-semibold text-foreground">Current Plan</h2>
          <div className="mt-4 flex items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${
              isTrialing
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                : plan === "base"
                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                  : plan === "pro"
                    ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                    : plan === "enterprise"
                      ? "bg-accent/20 text-accent border border-accent/30"
                      : "bg-card-hover text-muted border border-card-border"
            }`}>
              {isTrialing ? "Free Trial" : plan.charAt(0).toUpperCase() + plan.slice(1)}
            </span>
            {isTrialing && trialDaysRemaining !== null && (
              <span className="text-sm text-muted">
                {trialDaysRemaining > 0
                  ? `${trialDaysRemaining} day${trialDaysRemaining !== 1 ? "s" : ""} remaining`
                  : "Trial expired"}
              </span>
            )}
          </div>

          {isTrialing && (
            <p className="mt-3 text-sm text-muted">
              All features are unlocked during your trial. When it ends, you&apos;ll keep the base POS features and can choose a plan for everything else.
            </p>
          )}
        </div>

        {/* Plans (placeholder) */}
        <div className="rounded-xl border border-card-border bg-card p-6 shadow-sm dark:shadow-none">
          <h2 className="text-sm font-semibold text-foreground">Available Plans</h2>
          <p className="mt-1 text-xs text-muted">Choose the plan that fits your store. You can change anytime.</p>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { name: "Base", price: "Coming soon", features: ["Register + POS", "Basic inventory", "Customers", "Events"] },
              { name: "Pro", price: "Coming soon", features: ["Everything in Base", "Store Intelligence", "TCG Engine", "Advanced Reports"], highlighted: true },
              { name: "Enterprise", price: "Coming soon", features: ["Everything in Pro", "Multi-location", "API access", "Priority support"] },
            ].map((tier) => (
              <div
                key={tier.name}
                className={`rounded-xl border p-5 ${
                  tier.highlighted
                    ? "border-accent/50 bg-accent/5"
                    : "border-card-border bg-card-hover"
                }`}
              >
                <h3 className="text-base font-bold text-foreground">{tier.name}</h3>
                <p className="text-sm text-muted mt-1">{tier.price}</p>
                <ul className="mt-3 space-y-1.5">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-muted">
                      <span className="text-green-400">{"\u2713"}</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="mt-4 text-xs text-muted text-center">
            Pricing will be announced soon. Your trial continues until then.
          </p>
        </div>

        {/* Add-ons (placeholder) */}
        <div className="rounded-xl border border-card-border bg-card p-6 shadow-sm dark:shadow-none">
          <h2 className="text-sm font-semibold text-foreground">Add-On Modules</h2>
          <p className="mt-1 text-xs text-muted">Add capabilities to any plan.</p>
          <div className="mt-4 space-y-2 text-sm text-muted">
            <p>{"\u{1F9E0}"} Store Intelligence — smart advisor, cash flow insights</p>
            <p>{"\u{1F0CF}"} TCG Engine — Scryfall/Pokemon search, bulk pricing</p>
            <p>{"\u{1F3E2}"} Multi-Location — warehouses, transfers</p>
            <p>{"\u2615"} Cafe Module — table ordering, kitchen display</p>
            <p>{"\u{1F6D2}"} E-Commerce — eBay listings, online store</p>
          </div>
          <p className="mt-4 text-xs text-muted italic">Add-on pricing coming soon.</p>
        </div>
      </div>
    </div>
  );
}
