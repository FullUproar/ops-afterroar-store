"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store-context";

/* ------------------------------------------------------------------ */
/*  Onboarding Wizard — first-time setup for new stores                */
/*  Steps: Store Details → Products → Staff → Payment → Test → Done   */
/* ------------------------------------------------------------------ */

const STEPS = [
  { key: "details", label: "Store Details" },
  { key: "products", label: "Add Products" },
  { key: "staff", label: "Add Staff" },
  { key: "payment", label: "Payment" },
  { key: "test_sale", label: "Test Sale" },
  { key: "ready", label: "You're Ready!" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { store, effectiveRole } = useStore();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Store details form
  const [storeName, setStoreName] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [phone, setPhone] = useState("");

  // Products tracking
  const [itemCount, setItemCount] = useState(0);
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [demoSeeded, setDemoSeeded] = useState(false);

  // Pre-fill from store
  useEffect(() => {
    if (store) {
      setStoreName(store.name || "");
      const settings = (store.settings ?? {}) as Record<string, unknown>;
      const addr = settings.address as Record<string, string> | undefined;
      if (addr) {
        setStreet(addr.street || "");
        setCity(addr.city || "");
        setState(addr.state || "");
        setZip(addr.zip || "");
      }
      if (settings.tax_rate_percent) setTaxRate(String(settings.tax_rate_percent));
      if (settings.store_phone) setPhone(String(settings.store_phone));
    }
  }, [store]);

  // Check product count when on products step
  useEffect(() => {
    if (step === 1) {
      fetch("/api/inventory?limit=1")
        .then((r) => r.json())
        .then((d) => setItemCount(Array.isArray(d) ? d.length : 0))
        .catch(() => {});
    }
  }, [step]);

  // Redirect if not owner
  useEffect(() => {
    if (effectiveRole && effectiveRole !== "owner") {
      router.push("/dashboard");
    }
  }, [effectiveRole, router]);

  // Check if onboarding already complete
  useEffect(() => {
    if (store) {
      const settings = (store.settings ?? {}) as Record<string, unknown>;
      if (settings.onboarding_complete) {
        router.push("/dashboard");
      }
    }
  }, [store, router]);

  async function saveStoreDetails() {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_display_name: storeName,
          tax_rate_percent: parseFloat(taxRate) || 0,
          address: { street, city, state, zip },
          receipt_header: [street, `${city}, ${state} ${zip}`].filter(Boolean).join(", "),
          store_phone: phone,
        }),
      });
      setStep(1);
    } catch {}
    setSaving(false);
  }

  async function seedDemoData() {
    setSeedingDemo(true);
    try {
      const res = await fetch("/api/store/seed-demo", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setItemCount(data.items);
        setDemoSeeded(true);
      }
    } catch {}
    setSeedingDemo(false);
  }

  async function completeOnboarding() {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboarding_complete: true }),
      });
      router.push("/dashboard");
    } catch {}
    setSaving(false);
  }

  const inputClass = "w-full rounded-xl border border-input-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-8">
      {/* Progress bar */}
      <div className="w-full max-w-lg mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted">Step {step + 1} of {STEPS.length}</span>
          <span className="text-xs text-muted">{STEPS[step].label}</span>
        </div>
        <div className="h-1.5 rounded-full bg-card-hover overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="w-full max-w-lg">
        {/* Step 1: Store Details */}
        {step === 0 && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold text-foreground">Welcome to Afterroar Store Ops</h1>
              <p className="text-sm text-muted">Let&apos;s get your store set up. This takes about 2 minutes.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Store Name</label>
                <input type="text" value={storeName} onChange={(e) => setStoreName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Your Game Store" className={inputClass} autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Street Address <span className="text-muted">(for receipts)</span></label>
                <input type="text" value={street} onChange={(e) => setStreet(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="123 Main St" className={inputClass} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">City</label>
                  <input type="text" value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => e.stopPropagation()} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">State</label>
                  <input type="text" value={state} onChange={(e) => setState(e.target.value)} onKeyDown={(e) => e.stopPropagation()} maxLength={2} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">ZIP</label>
                  <input type="text" value={zip} onChange={(e) => setZip(e.target.value)} onKeyDown={(e) => e.stopPropagation()} className={inputClass} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">Sales Tax Rate (%)</label>
                  <input type="number" step="0.01" min="0" max="30" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="8.25" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">Phone <span className="text-muted">(optional)</span></label>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="(555) 123-4567" className={inputClass} />
                </div>
              </div>
            </div>

            <button onClick={saveStoreDetails} disabled={saving || !storeName.trim()} className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white hover:opacity-90 transition-colors disabled:opacity-50">
              {saving ? "Saving..." : "Save & Continue"}
            </button>
          </div>
        )}

        {/* Step 2: Add Products */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold text-foreground">Stock Your Shelves</h1>
              <p className="text-sm text-muted">Add products to sell. Pick whichever method works for you, or load demo data to explore.</p>
            </div>

            {/* Demo data button */}
            {!demoSeeded && (
              <button
                onClick={seedDemoData}
                disabled={seedingDemo}
                className="w-full rounded-xl border-2 border-dashed border-accent/40 bg-accent/5 px-5 py-4 text-center hover:border-accent/60 hover:bg-accent/10 transition-colors disabled:opacity-50"
              >
                <div className="text-base font-semibold text-accent">{seedingDemo ? "Loading..." : "Load Demo Data"}</div>
                <div className="text-xs text-muted mt-1">17 products, 5 customers, 3 events — explore the system instantly</div>
              </button>
            )}

            {demoSeeded && (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 text-center">
                <span className="text-sm text-emerald-400 font-medium">{"\u2713"} Demo data loaded! You can explore everything now.</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              <Link href="/dashboard/inventory" className="flex items-start gap-4 rounded-xl border border-card-border bg-card p-5 hover:border-accent/50 hover:bg-card-hover transition-colors">
                <span className="text-2xl mt-0.5">{"\u{1F50D}"}</span>
                <div>
                  <div className="text-sm font-semibold text-foreground">Scan Barcodes</div>
                  <div className="text-xs text-muted mt-1">Scan with your barcode scanner or camera. Unknown barcodes are looked up automatically.</div>
                </div>
              </Link>
              <Link href="/dashboard/singles" className="flex items-start gap-4 rounded-xl border border-card-border bg-card p-5 hover:border-accent/50 hover:bg-card-hover transition-colors">
                <span className="text-2xl mt-0.5">{"\u{1F0CF}"}</span>
                <div>
                  <div className="text-sm font-semibold text-foreground">Search Card Databases</div>
                  <div className="text-xs text-muted mt-1">Search Scryfall (MTG) or Pokemon TCG to add singles with prices pre-filled.</div>
                </div>
              </Link>
              <Link href="/dashboard/import" className="flex items-start gap-4 rounded-xl border border-card-border bg-card p-5 hover:border-accent/50 hover:bg-card-hover transition-colors">
                <span className="text-2xl mt-0.5">{"\u{1F4E6}"}</span>
                <div>
                  <div className="text-sm font-semibold text-foreground">Import CSV</div>
                  <div className="text-xs text-muted mt-1">Upload a spreadsheet of your existing inventory. Great for bulk imports from another system.</div>
                </div>
              </Link>
              <Link href="/dashboard/settings" className="flex items-start gap-4 rounded-xl border border-[#7D55C7]/30 bg-[#7D55C7]/5 p-5 hover:border-[#7D55C7]/50 hover:bg-[#7D55C7]/10 transition-colors">
                <span className="text-2xl mt-0.5">{"\u{1F6D2}"}</span>
                <div>
                  <div className="text-sm font-semibold text-foreground">Import from Shopify</div>
                  <div className="text-xs text-muted mt-1">Already have a Shopify store? Connect it and we&apos;ll pull your entire product catalog automatically.</div>
                </div>
              </Link>
            </div>

            {itemCount > 0 && (
              <div className="text-center text-sm text-emerald-400 font-medium">
                {itemCount} item{itemCount !== 1 ? "s" : ""} in inventory
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep(0)} className="flex-1 rounded-xl border border-card-border px-4 py-3 text-sm font-medium text-muted hover:text-foreground transition-colors">Back</button>
              <button onClick={() => setStep(2)} className="flex-1 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white hover:opacity-90 transition-colors">
                {itemCount > 0 ? "Continue" : "I'll add products later"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Add Staff */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold text-foreground">Add Your Team</h1>
              <p className="text-sm text-muted">Invite staff members so they can use the register and clock in from their phones.</p>
            </div>

            <div className="space-y-3">
              <Link href="/dashboard/staff" className="flex items-start gap-4 rounded-xl border border-card-border bg-card p-5 hover:border-accent/50 hover:bg-card-hover transition-colors">
                <span className="text-2xl mt-0.5">{"\u{1F465}"}</span>
                <div>
                  <div className="text-sm font-semibold text-foreground">Invite Staff</div>
                  <div className="text-xs text-muted mt-1">Add managers and cashiers. Set PINs for mobile clock-in and register access.</div>
                </div>
              </Link>
            </div>

            <div className="rounded-xl border border-card-border bg-card p-4 space-y-2">
              <div className="text-xs font-medium text-muted uppercase tracking-wider">Roles</div>
              <div className="space-y-1.5 text-sm text-foreground">
                <div><strong>Owner</strong> — Full access. That&apos;s you.</div>
                <div><strong>Manager</strong> — Inventory, events, trade-ins, reports. No settings.</div>
                <div><strong>Cashier</strong> — Register only. Can check in event players.</div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 rounded-xl border border-card-border px-4 py-3 text-sm font-medium text-muted hover:text-foreground transition-colors">Back</button>
              <button onClick={() => setStep(3)} className="flex-1 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white hover:opacity-90 transition-colors">
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Payment */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold text-foreground">Payment Processing</h1>
              <p className="text-sm text-muted">Connect Stripe to accept card payments. You can always do this later.</p>
            </div>

            <div className="space-y-3">
              <Link href="/dashboard/settings" className="flex items-start gap-4 rounded-xl border border-accent/30 bg-accent/5 p-5 hover:bg-accent/10 transition-colors">
                <span className="text-2xl mt-0.5">{"\u{1F4B3}"}</span>
                <div>
                  <div className="text-sm font-semibold text-foreground">Connect Stripe</div>
                  <div className="text-xs text-muted mt-1">Accept credit and debit cards. Takes 5 minutes. Your money goes straight to your bank.</div>
                </div>
              </Link>

              <div className="rounded-xl border border-card-border bg-card p-5">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{"\u{1F4B5}"}</span>
                  <div>
                    <div className="text-sm font-semibold text-foreground">Without Stripe</div>
                    <div className="text-xs text-muted mt-1">Cash works immediately. Card payments will be simulated (logged but not charged) until you connect Stripe.</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="flex-1 rounded-xl border border-card-border px-4 py-3 text-sm font-medium text-muted hover:text-foreground transition-colors">Back</button>
              <button onClick={() => setStep(4)} className="flex-1 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white hover:opacity-90 transition-colors">Continue</button>
            </div>
          </div>
        )}

        {/* Step 5: Test Sale */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold text-foreground">Make a Test Sale</h1>
              <p className="text-sm text-muted">Try your first transaction. Training mode is on — nothing is real yet.</p>
            </div>

            <div className="rounded-xl border border-yellow-500/30 bg-yellow-950/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-amber-400 text-sm font-semibold">{"\u26A0"} Training Mode</span>
              </div>
              <p className="text-xs text-muted">
                All transactions are marked as training data and excluded from reports. Turn it off in Settings when you&apos;re ready for real sales.
              </p>
            </div>

            <div className="rounded-xl border border-card-border bg-card p-5 space-y-3">
              <div className="space-y-3">
                {[
                  "Open the Register",
                  "Search or scan an item to add it to the cart",
                  "Tap PAY at the bottom",
                  "Choose Cash and enter an amount",
                  "Complete the sale!",
                ].map((text, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="shrink-0 w-7 h-7 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold">{i + 1}</span>
                    <span className="text-sm text-foreground pt-0.5">{text}</span>
                  </div>
                ))}
              </div>
              <Link href="/dashboard/register" className="block w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white text-center hover:bg-emerald-700 transition-colors">
                Open Register
              </Link>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(3)} className="flex-1 rounded-xl border border-card-border px-4 py-3 text-sm font-medium text-muted hover:text-foreground transition-colors">Back</button>
              <button onClick={() => setStep(5)} className="flex-1 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white hover:opacity-90 transition-colors">
                {itemCount > 0 ? "I did it!" : "Skip for now"}
              </button>
            </div>
          </div>
        )}

        {/* Step 6: Done! */}
        {step === 5 && (
          <div className="space-y-6">
            <div className="text-center space-y-3">
              <div className="text-6xl">{"\u{1F389}"}</div>
              <h1 className="text-2xl font-bold text-foreground">You&apos;re all set!</h1>
              <p className="text-sm text-muted max-w-sm mx-auto">
                Your store is ready. Here are some things you might want to do next.
              </p>
            </div>

            <div className="rounded-xl border border-card-border bg-card p-4 space-y-2">
              <div className="text-xs font-medium text-muted uppercase tracking-wider">What&apos;s configured</div>
              <div className="space-y-1.5 text-sm">
                {storeName && <div className="flex items-center gap-2 text-foreground"><span className="text-green-400">{"\u2713"}</span> Store: {storeName}</div>}
                {parseFloat(taxRate) > 0 && <div className="flex items-center gap-2 text-foreground"><span className="text-green-400">{"\u2713"}</span> Tax rate: {taxRate}%</div>}
                {itemCount > 0 && <div className="flex items-center gap-2 text-foreground"><span className="text-green-400">{"\u2713"}</span> {itemCount} products in inventory</div>}
              </div>
            </div>

            <div className="rounded-xl border border-card-border bg-card p-4 space-y-2">
              <div className="text-xs font-medium text-muted uppercase tracking-wider">Next steps</div>
              <div className="space-y-1.5 text-sm text-muted">
                <div>{"\u2192"} <Link href="/dashboard/settings" className="text-accent hover:underline">Connect Stripe</Link> to accept real card payments</div>
                <div>{"\u2192"} <Link href="/dashboard/staff" className="text-accent hover:underline">Set PINs</Link> for staff mobile access</div>
                <div>{"\u2192"} <Link href="/dashboard/events" className="text-accent hover:underline">Schedule events</Link> to bring players in</div>
                <div>{"\u2192"} <Link href="/dashboard/settings" className="text-accent hover:underline">Turn off Training Mode</Link> when you&apos;re ready for real sales</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button onClick={completeOnboarding} disabled={saving} className="rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white hover:opacity-90 transition-colors disabled:opacity-50">
                Go to Dashboard
              </button>
              <Link
                href="/dashboard/register"
                onClick={() => {
                  fetch("/api/settings", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ onboarding_complete: true }),
                  }).catch(() => {});
                }}
                className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white text-center hover:bg-emerald-700 transition-colors"
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
