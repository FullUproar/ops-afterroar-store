"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store-context";
import { useTrainingMode } from "@/lib/training-mode";

/* ------------------------------------------------------------------ */
/*  Floating Onboarding Panel                                          */
/*  Persists across navigation via localStorage + layout rendering     */
/* ------------------------------------------------------------------ */

const STEPS = [
  { key: "details", label: "Store Details" },
  { key: "products", label: "Stock Your Shelves" },
  { key: "staff", label: "Add Staff" },
  { key: "payment", label: "Connect Payments" },
  { key: "test_sale", label: "Try It Out" },
  { key: "ready", label: "You're Ready!" },
] as const;

interface OnboardingState {
  step: number;
  completedSteps: number[];
  storeName: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  taxRate: string;
  phone: string;
  demoSeeded: boolean;
  itemCount: number;
  minimized: boolean;
}

const DEFAULT_STATE: OnboardingState = {
  step: 0,
  completedSteps: [],
  storeName: "",
  street: "",
  city: "",
  state: "",
  zip: "",
  taxRate: "",
  phone: "",
  demoSeeded: false,
  itemCount: 0,
  minimized: false,
};

function getStorageKey(storeId: string) {
  return `onboarding-state-${storeId}`;
}

function loadState(storeId: string): OnboardingState | null {
  try {
    const raw = localStorage.getItem(getStorageKey(storeId));
    if (raw) return JSON.parse(raw) as OnboardingState;
  } catch {}
  return null;
}

function saveState(storeId: string, state: OnboardingState) {
  try {
    localStorage.setItem(getStorageKey(storeId), JSON.stringify(state));
  } catch {}
}

function clearState(storeId: string) {
  try {
    localStorage.removeItem(getStorageKey(storeId));
  } catch {}
}

export function OnboardingPanel() {
  const { store, effectiveRole } = useStore();
  const { setTraining } = useTrainingMode();
  const pathname = usePathname();

  const [state, setState] = useState<OnboardingState>(DEFAULT_STATE);
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [completing, setCompleting] = useState(false);

  const storeId = store?.id ?? "";
  const isRegisterPage = pathname === "/dashboard/register";

  // Initialize from localStorage or pre-fill from store
  useEffect(() => {
    if (!store) return;

    const saved = loadState(store.id);
    if (saved) {
      setState(saved);
      setInitialized(true);
      return;
    }

    // Pre-fill from store data
    const settings = (store.settings ?? {}) as Record<string, unknown>;
    const addr = settings.address as Record<string, string> | undefined;
    const newState: OnboardingState = {
      ...DEFAULT_STATE,
      storeName: store.name || "",
      street: addr?.street || "",
      city: addr?.city || "",
      state: addr?.state || "",
      zip: addr?.zip || "",
      taxRate: settings.tax_rate_percent ? String(settings.tax_rate_percent) : "",
      phone: settings.store_phone ? String(settings.store_phone) : "",
    };
    setState(newState);
    setInitialized(true);
  }, [store]);

  // Enable training mode during onboarding
  useEffect(() => {
    if (initialized) {
      setTraining(true);
    }
  }, [initialized, setTraining]);

  // Persist state on every change
  useEffect(() => {
    if (!storeId || !initialized) return;
    saveState(storeId, state);
  }, [state, storeId, initialized]);

  // Fetch accurate item count when on products step
  useEffect(() => {
    if (state.step === 1 && storeId) {
      fetch("/api/onboarding/status")
        .then((r) => r.json())
        .then((d) => {
          if (d.first_product !== undefined) {
            // Get actual count from inventory
            fetch("/api/inventory?limit=0&count_only=true")
              .then((r) => r.json())
              .then((inv) => {
                const count = typeof inv.total === "number" ? inv.total : 0;
                if (count !== state.itemCount) {
                  setState((s) => ({ ...s, itemCount: count }));
                }
              })
              .catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, [state.step, storeId]);

  const update = useCallback((partial: Partial<OnboardingState>) => {
    setState((s) => ({ ...s, ...partial }));
  }, []);

  const goToStep = useCallback((step: number) => {
    setState((s) => {
      const completed = s.completedSteps.includes(s.step)
        ? s.completedSteps
        : [...s.completedSteps, s.step];
      return { ...s, step, completedSteps: completed };
    });
  }, []);

  async function saveStoreDetails() {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_display_name: state.storeName,
          tax_rate_percent: parseFloat(state.taxRate) || 0,
          address: { street: state.street, city: state.city, state: state.state, zip: state.zip },
          receipt_header: [state.street, `${state.city}, ${state.state} ${state.zip}`].filter(Boolean).join(", "),
          store_phone: state.phone,
        }),
      });
      goToStep(1);
    } catch {}
    setSaving(false);
  }

  async function seedDemoData() {
    setSeedingDemo(true);
    try {
      const res = await fetch("/api/store/seed-demo", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        update({ itemCount: data.items, demoSeeded: true });
      }
    } catch {}
    setSeedingDemo(false);
  }

  async function completeOnboarding() {
    setCompleting(true);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboarding_complete: true }),
      });
      if (storeId) clearState(storeId);
      // Reload to let the layout re-evaluate onboarding status
      window.location.href = "/dashboard";
    } catch {}
    setCompleting(false);
  }

  // Don't render if: not owner, no store, or already complete
  if (!store || !initialized) return null;
  if (effectiveRole !== "owner") return null;
  const settings = (store.settings ?? {}) as Record<string, unknown>;
  if (settings.onboarding_complete) return null;

  // On register page, show only a minimal pill
  if (isRegisterPage) {
    return (
      <button
        onClick={() => update({ minimized: false })}
        className="fixed bottom-4 right-4 z-[60] rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white shadow-lg hover:opacity-90 transition-opacity"
      >
        Setup: Step {state.step + 1}/{STEPS.length}
      </button>
    );
  }

  // Minimized pill
  if (state.minimized) {
    return (
      <button
        onClick={() => update({ minimized: false })}
        className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:opacity-90 transition-opacity"
      >
        <span className="w-2 h-2 rounded-full bg-white/60 animate-pulse" />
        Setup: Step {state.step + 1}/{STEPS.length} — {STEPS[state.step].label}
      </button>
    );
  }

  const inputClass = "w-full rounded-xl border border-input-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none";

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-[420px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-6rem)] flex flex-col rounded-2xl border border-card-border bg-background shadow-2xl overflow-hidden md:bottom-4 md:right-4">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-card-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-accent font-bold text-sm">Store Setup</span>
          <span className="text-xs text-muted tabular-nums">Step {state.step + 1}/{STEPS.length}</span>
        </div>
        <button
          onClick={() => update({ minimized: true })}
          className="text-muted hover:text-foreground text-lg leading-none transition-colors"
          title="Minimize"
        >
          {"\u2015"}
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-5 pt-3 shrink-0">
        <div className="h-1.5 rounded-full bg-card-hover overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${((state.step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Content — scrollable */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Step 1: Store Details */}
        {state.step === 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Store Details</h2>
              <p className="text-xs text-muted mt-1">This doesn&apos;t have to be perfect — you can change everything in Settings.</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Store Name</label>
                <input type="text" value={state.storeName} onChange={(e) => update({ storeName: e.target.value })} onKeyDown={(e) => e.stopPropagation()} placeholder="Your Game Store" className={inputClass} autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Street Address <span className="text-muted">(for receipts)</span></label>
                <input type="text" value={state.street} onChange={(e) => update({ street: e.target.value })} onKeyDown={(e) => e.stopPropagation()} placeholder="123 Main St" className={inputClass} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">City</label>
                  <input type="text" value={state.city} onChange={(e) => update({ city: e.target.value })} onKeyDown={(e) => e.stopPropagation()} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">State</label>
                  <input type="text" value={state.state} onChange={(e) => update({ state: e.target.value })} onKeyDown={(e) => e.stopPropagation()} maxLength={2} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">ZIP</label>
                  <input type="text" value={state.zip} onChange={(e) => update({ zip: e.target.value })} onKeyDown={(e) => e.stopPropagation()} className={inputClass} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Sales Tax Rate (%)</label>
                  <input type="number" step="0.01" min="0" max="30" value={state.taxRate} onChange={(e) => update({ taxRate: e.target.value })} onKeyDown={(e) => e.stopPropagation()} placeholder="8.25" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Phone <span className="text-muted">(opt.)</span></label>
                  <input type="tel" value={state.phone} onChange={(e) => update({ phone: e.target.value })} onKeyDown={(e) => e.stopPropagation()} placeholder="(555) 123-4567" className={inputClass} />
                </div>
              </div>
            </div>

            <button onClick={saveStoreDetails} disabled={saving || !state.storeName.trim()} className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-colors disabled:opacity-50">
              {saving ? "Saving..." : "Save & Continue"}
            </button>
          </div>
        )}

        {/* Step 2: Stock Your Shelves */}
        {state.step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Stock Your Shelves</h2>
              <p className="text-xs text-muted mt-1">Everything you add here is yours to keep or delete.</p>
            </div>

            {/* Demo data button */}
            {!state.demoSeeded ? (
              <button
                onClick={seedDemoData}
                disabled={seedingDemo}
                className="w-full rounded-xl border-2 border-dashed border-accent/40 bg-accent/5 px-4 py-3 text-center hover:border-accent/60 hover:bg-accent/10 transition-colors disabled:opacity-50"
              >
                <div className="text-sm font-semibold text-accent">{seedingDemo ? "Loading..." : "Load Demo Data"}</div>
                <div className="text-xs text-muted mt-1">17 products, 5 customers, 3 events — explore freely</div>
              </button>
            ) : (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-2.5 text-center">
                <span className="text-sm text-emerald-400 font-medium">{"\u2713"} Demo data loaded! Explore the system freely — you can clear these anytime.</span>
              </div>
            )}

            <div className="space-y-2">
              <Link href="/dashboard/inventory" className="flex items-start gap-3 rounded-xl border border-card-border bg-card p-3.5 hover:border-accent/50 hover:bg-card-hover transition-colors">
                <span className="text-xl mt-0.5">{"\u{1F50D}"}</span>
                <div>
                  <div className="text-sm font-semibold text-foreground">Scan Barcodes</div>
                  <div className="text-xs text-muted">USB scanner, camera, or manual entry</div>
                </div>
              </Link>
              <Link href="/dashboard/singles" className="flex items-start gap-3 rounded-xl border border-card-border bg-card p-3.5 hover:border-accent/50 hover:bg-card-hover transition-colors">
                <span className="text-xl mt-0.5">{"\u{1F0CF}"}</span>
                <div>
                  <div className="text-sm font-semibold text-foreground">Search Card Databases</div>
                  <div className="text-xs text-muted">MTG, Pokemon, Yu-Gi-Oh with prices</div>
                </div>
              </Link>
              <Link href="/dashboard/import" className="flex items-start gap-3 rounded-xl border border-card-border bg-card p-3.5 hover:border-accent/50 hover:bg-card-hover transition-colors">
                <span className="text-xl mt-0.5">{"\u{1F4E6}"}</span>
                <div>
                  <div className="text-sm font-semibold text-foreground">Import CSV or Shopify</div>
                  <div className="text-xs text-muted">Bulk import from spreadsheets or other systems</div>
                </div>
              </Link>
            </div>

            {state.itemCount > 0 && (
              <div className="text-center text-sm text-emerald-400 font-medium">
                {state.itemCount} item{state.itemCount !== 1 ? "s" : ""} in inventory
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => goToStep(0)} className="flex-1 rounded-xl border border-card-border px-3 py-2.5 text-sm font-medium text-muted hover:text-foreground transition-colors">Back</button>
              <button onClick={() => goToStep(2)} className="flex-1 rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-colors">
                {state.itemCount > 0 || state.demoSeeded ? "Continue" : "I'll add products later"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Add Staff */}
        {state.step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Add Your Team</h2>
              <p className="text-xs text-muted mt-1">Invite staff so they can use the register and clock in.</p>
            </div>

            <Link href="/dashboard/staff" className="flex items-start gap-3 rounded-xl border border-card-border bg-card p-3.5 hover:border-accent/50 hover:bg-card-hover transition-colors">
              <span className="text-xl mt-0.5">{"\u{1F465}"}</span>
              <div>
                <div className="text-sm font-semibold text-foreground">Invite Staff</div>
                <div className="text-xs text-muted">Add managers and cashiers. Set PINs for mobile access.</div>
              </div>
            </Link>

            <div className="rounded-xl border border-card-border bg-card p-3.5 space-y-1.5">
              <div className="text-xs font-medium text-muted uppercase tracking-wider">Roles</div>
              <div className="space-y-1 text-xs text-foreground">
                <div><strong>Owner</strong> — Full access. That&apos;s you.</div>
                <div><strong>Manager</strong> — Inventory, events, reports.</div>
                <div><strong>Cashier</strong> — Register only.</div>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => goToStep(1)} className="flex-1 rounded-xl border border-card-border px-3 py-2.5 text-sm font-medium text-muted hover:text-foreground transition-colors">Back</button>
              <button onClick={() => goToStep(3)} className="flex-1 rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-colors">
                Continue — just me for now
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Connect Payments */}
        {state.step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Payment Processing</h2>
              <p className="text-xs text-muted mt-1">Connect Stripe to accept card payments. Cash works immediately.</p>
            </div>

            <Link href="/dashboard/settings" className="flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/5 p-3.5 hover:bg-accent/10 transition-colors">
              <span className="text-xl mt-0.5">{"\u{1F4B3}"}</span>
              <div>
                <div className="text-sm font-semibold text-foreground">Connect Stripe</div>
                <div className="text-xs text-muted">Accept credit and debit cards. Takes 5 minutes.</div>
              </div>
            </Link>

            <div className="rounded-xl border border-card-border bg-card p-3.5">
              <div className="flex items-center gap-3">
                <span className="text-xl">{"\u{1F4B5}"}</span>
                <div>
                  <div className="text-sm font-semibold text-foreground">Without Stripe</div>
                  <div className="text-xs text-muted">Cash works now. Card payments are simulated until you connect.</div>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => goToStep(2)} className="flex-1 rounded-xl border border-card-border px-3 py-2.5 text-sm font-medium text-muted hover:text-foreground transition-colors">Back</button>
              <button onClick={() => goToStep(4)} className="flex-1 rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-colors">
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Try It Out */}
        {state.step === 4 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Try It Out</h2>
              <p className="text-xs text-muted mt-1">Training mode is on — nothing is real yet.</p>
            </div>

            <div className="rounded-xl border border-yellow-500/30 bg-yellow-950/10 p-3">
              <span className="text-xs font-semibold text-amber-400">{"\u26A0"} Training Mode Active</span>
              <p className="text-xs text-muted mt-1">All transactions are marked as training data and excluded from reports.</p>
            </div>

            {/* Guided walkthrough */}
            <div className="rounded-xl border border-card-border bg-card p-4 space-y-3">
              <div className="text-xs font-medium text-muted uppercase tracking-wider">Quick walkthrough</div>
              {[
                "Open the Register (button below or sidebar)",
                "Search or scan a product to add it",
                "Tap PAY at the bottom of the screen",
                "Choose Cash and enter any amount",
                "Complete the sale — that's it!",
              ].map((text, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold">{i + 1}</span>
                  <span className="text-xs text-foreground pt-0.5">{text}</span>
                </div>
              ))}
            </div>

            {(state.demoSeeded || state.itemCount > 0) && (
              <div className="rounded-xl bg-accent/5 border border-accent/20 p-3">
                <div className="text-xs text-muted">
                  {state.demoSeeded
                    ? "Your demo items are ready in the register. Search for \"Catan\" or \"Magic\" to find them."
                    : `You have ${state.itemCount} items ready to sell.`}
                </div>
              </div>
            )}

            <Link
              href="/dashboard/register"
              className="block w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white text-center hover:bg-emerald-700 transition-colors"
            >
              Open Register
            </Link>

            <div className="flex gap-2">
              <button onClick={() => goToStep(3)} className="flex-1 rounded-xl border border-card-border px-3 py-2.5 text-sm font-medium text-muted hover:text-foreground transition-colors">Back</button>
              <button onClick={() => goToStep(5)} className="flex-1 rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-colors">
                I did it!
              </button>
            </div>
          </div>
        )}

        {/* Step 6: You're Ready! */}
        {state.step === 5 && (
          <div className="space-y-4">
            <div className="text-center space-y-2">
              <div className="text-4xl">{"\u{1F389}"}</div>
              <h2 className="text-lg font-bold text-foreground">You&apos;re all set!</h2>
              <p className="text-xs text-muted">Your store is live. Here&apos;s what to explore next:</p>
            </div>

            <div className="rounded-xl border border-card-border bg-card p-3.5 space-y-1.5">
              <div className="text-xs font-medium text-muted uppercase tracking-wider">Configured</div>
              <div className="space-y-1 text-xs">
                {state.storeName && <div className="flex items-center gap-2 text-foreground"><span className="text-green-400">{"\u2713"}</span> Store: {state.storeName}</div>}
                {parseFloat(state.taxRate) > 0 && <div className="flex items-center gap-2 text-foreground"><span className="text-green-400">{"\u2713"}</span> Tax rate: {state.taxRate}%</div>}
                {state.itemCount > 0 && <div className="flex items-center gap-2 text-foreground"><span className="text-green-400">{"\u2713"}</span> {state.itemCount} products</div>}
              </div>
            </div>

            <div className="rounded-xl border border-card-border bg-card p-3.5 space-y-1.5">
              <div className="text-xs font-medium text-muted uppercase tracking-wider">Next steps</div>
              <div className="space-y-1 text-xs text-muted">
                <div>{"\u2192"} <Link href="/dashboard/settings" className="text-accent hover:underline">Connect Stripe</Link> for real card payments</div>
                <div>{"\u2192"} <Link href="/dashboard/staff" className="text-accent hover:underline">Set PINs</Link> for staff mobile access</div>
                <div>{"\u2192"} <Link href="/dashboard/events" className="text-accent hover:underline">Schedule events</Link> to bring players in</div>
                <div>{"\u2192"} <Link href="/dashboard/settings" className="text-accent hover:underline">Turn off Training Mode</Link> when ready for real sales</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={completeOnboarding} disabled={completing} className="rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-colors disabled:opacity-50">
                {completing ? "Finishing..." : "Complete Setup"}
              </button>
              <Link
                href="/dashboard/register"
                onClick={() => {
                  completeOnboarding();
                }}
                className="rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white text-center hover:bg-emerald-700 transition-colors"
              >
                Open Register
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sandbox Banner — shows when onboarding is in progress              */
/* ------------------------------------------------------------------ */

export function OnboardingSandboxBanner() {
  const { store, effectiveRole } = useStore();

  if (!store || effectiveRole !== "owner") return null;
  const settings = (store.settings ?? {}) as Record<string, unknown>;
  if (settings.onboarding_complete) return null;

  return (
    <div className="w-full bg-accent/10 border-b border-accent/20 px-4 py-1.5 text-center">
      <span className="text-xs font-semibold text-accent tracking-wide">
        Sandbox Mode — Explore freely, nothing is permanent yet
      </span>
    </div>
  );
}
