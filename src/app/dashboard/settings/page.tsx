'use client';

import { useState, useCallback, useEffect } from 'react';
import { useStore } from '@/lib/store-context';
import { type Role } from '@/lib/permissions';
import {
  useStoreSettings,
  SETTINGS_SECTIONS,
  SETTINGS_DEFAULTS,
  type StoreSettings,
} from '@/lib/store-settings';
import { useTheme } from '@/components/theme-provider';
import { useTrainingMode } from '@/lib/training-mode';
import { PageHeader } from '@/components/page-header';
import { HelpTooltip } from '@/components/help-tooltip';
import { PermissionsEditor } from '@/components/permissions-editor';
import { LocationPicker } from '@/components/location-picker';
import Link from 'next/link';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface VenueResult {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
}

interface StripeConnectStatus {
  connected: boolean;
  account_id: string | null;
  details_submitted: boolean | null;
  charges_enabled: boolean | null;
  payouts_enabled: boolean | null;
  business_profile?: { name?: string } | null;
  note?: string;
}

/* ------------------------------------------------------------------ */
/*  Tab definitions — which SETTINGS_SECTIONS keys go where            */
/* ------------------------------------------------------------------ */

type TabKey = 'store' | 'payments' | 'staff' | 'integrations' | 'intelligence' | 'operations';

const TABS: { key: TabKey; label: string; icon: string; description: string }[] = [
  { key: 'store', label: 'Store', icon: '🏪', description: 'Your store identity, tax, checkout, and receipt settings' },
  { key: 'payments', label: 'Payments', icon: '💳', description: 'Stripe, card reader, and payment method configuration' },
  { key: 'staff', label: 'Staff', icon: '👥', description: 'Roles, permissions, training mode, and mobile access' },
  { key: 'integrations', label: 'Integrations', icon: '🔗', description: 'Afterroar Network and external connections' },
  { key: 'intelligence', label: 'Intelligence', icon: '🧠', description: 'Store advisor, cash flow thresholds, and monthly fixed costs' },
  { key: 'operations', label: 'Operations', icon: '⚙', description: 'Cafe, loyalty, promotions, and appearance' },
];

const TAB_SECTIONS: Record<TabKey, string[]> = {
  store: ['identity', 'tax', 'checkout', 'inventory', 'returns', 'trade_ins'],
  payments: ['payments'],
  staff: ['staff_lock', 'mobile_register'], // timeclock rendered manually for GPS button
  integrations: [],
  intelligence: ['intelligence', 'intelligence_costs', 'intelligence_thresholds'],
  operations: ['cafe', 'loyalty', 'promo_guardrails'],
};

/* ------------------------------------------------------------------ */
/*  Main Settings Page                                                 */
/* ------------------------------------------------------------------ */

export default function SettingsPage() {
  const { can, store, isGodAdmin, isTestMode, effectiveRole, setTestRole } = useStore();
  const { theme, setTheme } = useTheme();
  const { isTraining, setTraining } = useTrainingMode();
  const currentSettings = useStoreSettings();
  const [settings, setSettings] = useState<StoreSettings>(currentSettings);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('store');

  // Auto-select tab based on URL params (e.g., returning from Stripe onboarding)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('stripe')) setActiveTab('payments');
    else if (params.get('tab')) setActiveTab((params.get('tab') as TabKey) || 'store');
  }, []);

  // Afterroar integration state
  const [venueSearch, setVenueSearch] = useState('');
  const [venueResults, setVenueResults] = useState<VenueResult[]>([]);
  const [searchingVenues, setSearchingVenues] = useState(false);
  const [manualVenueId, setManualVenueId] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);

  // Stripe Connect state
  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatus | null>(null);
  const [stripeLoading, setStripeLoading] = useState(true);
  const [stripeConnecting, setStripeConnecting] = useState(false);

  // Sync when store context loads
  useEffect(() => {
    setSettings(currentSettings);
  }, [currentSettings]);

  // Venue search effect
  useEffect(() => {
    if (!venueSearch || venueSearch.length < 2) {
      setVenueResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setSearchingVenues(true);
      try {
        const res = await fetch(`/api/afterroar/venues?q=${encodeURIComponent(venueSearch)}`);
        if (res.ok) setVenueResults(await res.json());
      } finally {
        setSearchingVenues(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [venueSearch]);

  // Fetch Stripe Connect status
  useEffect(() => {
    async function fetchStripeStatus() {
      try {
        const res = await fetch('/api/stripe/connect');
        if (res.ok) {
          setStripeStatus(await res.json());
        }
      } catch {
        // Stripe not configured — that's fine
      } finally {
        setStripeLoading(false);
      }
    }
    fetchStripeStatus();
  }, []);

  async function startStripeOnboarding() {
    setStripeConnecting(true);
    setError('');
    try {
      const res = await fetch('/api/stripe/connect', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.onboarding_url) window.location.href = data.onboarding_url;
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to start Stripe onboarding');
      }
    } catch {
      setError('Failed to connect to Stripe');
    } finally {
      setStripeConnecting(false);
    }
  }

  async function connectVenue(venueId: string) {
    setConnecting(true);
    setError('');
    try {
      const res = await fetch('/api/afterroar/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to connect');
      }
    } catch {
      setError('Failed to connect to Afterroar');
    } finally {
      setConnecting(false);
    }
  }

  async function disconnectVenue() {
    setDisconnecting(true);
    setError('');
    try {
      const res = await fetch('/api/afterroar/connect', { method: 'DELETE' });
      if (res.ok) window.location.reload();
      else setError('Failed to disconnect');
    } catch {
      setError('Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  }

  // Auto-save a single field
  const saveField = useCallback(
    async (key: string, value: unknown) => {
      setSaving(key);
      setError('');
      try {
        const res = await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [key]: value }),
        });
        if (!res.ok) throw new Error('Failed to save');
        setSaved(key);
        setTimeout(() => setSaved(null), 1500);
      } catch {
        setError(`Failed to save ${key}`);
      } finally {
        setSaving(null);
      }
    },
    []
  );

  // Reset a section to defaults
  async function resetSection(sectionKey: string) {
    const section = SETTINGS_SECTIONS.find((s) => s.key === sectionKey);
    if (!section) return;

    const resetValues: Partial<StoreSettings> = {};
    for (const field of section.fields) {
      const defaultVal = SETTINGS_DEFAULTS[field.key as keyof StoreSettings];
      (resetValues as Record<string, unknown>)[field.key] = defaultVal;
      (setSettings as (fn: (prev: StoreSettings) => StoreSettings) => void)((prev) => ({
        ...prev,
        [field.key]: defaultVal,
      }));
    }

    setSaving(sectionKey);
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resetValues),
      });
      setSaved(sectionKey);
      setTimeout(() => setSaved(null), 1500);
    } catch {
      setError('Failed to reset section');
    } finally {
      setSaving(null);
    }
  }

  function updateLocal(key: string, value: unknown) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  if (!can('store.settings')) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-zinc-500">You don&apos;t have permission to view settings.</p>
      </div>
    );
  }

  // Afterroar connection state from store
  const storeSettings = (store?.settings ?? {}) as Record<string, unknown>;
  const venueId = storeSettings.venueId as string | undefined;
  const connectedVenueName = storeSettings.venueName as string | undefined;

  // Get sections for the active tab
  const tabSectionKeys = TAB_SECTIONS[activeTab] || [];
  const tabSections = SETTINGS_SECTIONS.filter((s) => tabSectionKeys.includes(s.key));

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" backHref="/dashboard" />
      <p className="text-sm text-muted -mt-2">
        {store?.name} &middot; Changes save automatically
      </p>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* ── Tab Bar ── */}
      <div className="border-b border-card-border overflow-x-auto">
        <nav className="flex gap-0 min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-accent text-foreground'
                  : 'border-transparent text-muted hover:text-foreground hover:border-card-border'
              }`}
            >
              <span className="text-base">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Tab Description ── */}
      <p className="text-xs text-muted">
        {TABS.find((t) => t.key === activeTab)?.description}
      </p>

      {/* ── Tab Content ── */}
      <div className="max-w-2xl space-y-4 pb-8">

        {/* ════════════════ STORE TAB ════════════════ */}
        {activeTab === 'store' && (
          <>
            {tabSections.map((section) => (
              <SettingsSection
                key={section.key}
                section={section}
                settings={settings}
                saving={saving}
                saved={saved}
                updateLocal={updateLocal}
                saveField={saveField}
                resetSection={resetSection}
              />
            ))}
          </>
        )}

        {/* ════════════════ PAYMENTS TAB ════════════════ */}
        {activeTab === 'payments' && (
          <>
            {/* Stripe Connect */}
            <div className="rounded-xl border border-card-border bg-card p-6 shadow-sm dark:shadow-none">
              <h2 className="text-sm font-semibold text-foreground">Stripe Connect</h2>
              <p className="mt-0.5 text-xs text-muted">
                Accept card payments via Stripe. Stripe handles processing &mdash; we add nothing on top.
              </p>

              <div className="mt-4 space-y-4">
                {stripeLoading ? (
                  <p className="text-sm text-muted">Checking Stripe status...</p>
                ) : stripeStatus?.connected ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${stripeStatus.charges_enabled ? 'bg-green-500' : 'bg-amber-500'}`} />
                      <span className={`text-sm font-medium ${stripeStatus.charges_enabled ? 'text-green-400' : 'text-amber-400'}`}>
                        {stripeStatus.charges_enabled ? 'Connected' : 'Pending Setup'}
                      </span>
                      {stripeStatus.business_profile?.name && (
                        <span className="text-sm text-foreground">&mdash; {stripeStatus.business_profile.name}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted space-y-1">
                      <p>Account: {stripeStatus.account_id}</p>
                      <p>Charges: {stripeStatus.charges_enabled ? 'Enabled' : 'Not yet enabled'}</p>
                      <p>Payouts: {stripeStatus.payouts_enabled ? 'Enabled' : 'Not yet enabled'}</p>
                      {stripeStatus.details_submitted === false && (
                        <p className="text-amber-400">Complete your Stripe onboarding to start accepting payments.</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {stripeStatus.details_submitted === false && (
                        <button
                          onClick={startStripeOnboarding}
                          disabled={stripeConnecting}
                          className="px-3 py-1.5 bg-accent hover:opacity-90 disabled:opacity-50 text-white rounded text-xs font-medium"
                        >
                          {stripeConnecting ? 'Loading...' : 'Complete Onboarding'}
                        </button>
                      )}
                      <a
                        href="https://dashboard.stripe.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-card-hover hover:bg-zinc-600 text-foreground rounded text-xs font-medium inline-flex items-center gap-1"
                      >
                        Stripe Dashboard
                        <span className="text-muted">&nearr;</span>
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-zinc-500" />
                      <span className="text-sm text-muted">No Stripe account connected</span>
                    </div>
                    <p className="text-xs text-muted">
                      Connect your own Stripe account to receive payments directly. Takes about 5 minutes.
                      Stripe charges their standard processing rate &mdash; we don&apos;t add any markup.
                    </p>
                    <button
                      onClick={startStripeOnboarding}
                      disabled={stripeConnecting}
                      className="px-4 py-2 bg-accent hover:opacity-90 disabled:opacity-50 text-white rounded-xl text-sm font-medium"
                    >
                      {stripeConnecting ? 'Connecting...' : 'Connect Stripe'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Terminal Reader */}
            <TerminalReaderSection />

            {/* Payment Methods (dynamic section) */}
            {tabSections.map((section) => (
              <SettingsSection
                key={section.key}
                section={section}
                settings={settings}
                saving={saving}
                saved={saved}
                updateLocal={updateLocal}
                saveField={saveField}
                resetSection={resetSection}
              />
            ))}
          </>
        )}

        {/* ════════════════ STAFF TAB ════════════════ */}
        {activeTab === 'staff' && (
          <>
            {/* Role Permissions */}
            <div className="rounded-xl border border-card-border bg-card p-6 shadow-sm dark:shadow-none">
              <h2 className="text-sm font-semibold text-foreground">Role Permissions</h2>
              <p className="mt-0.5 text-xs text-muted mb-4">
                Customize what each role can access. Owner always has full access. Changes apply immediately.
              </p>
              <PermissionsEditor />
            </div>

            {/* Training Mode */}
            {(effectiveRole === 'owner' || isGodAdmin) && (
              <div className={`rounded-xl border p-6 shadow-sm dark:shadow-none ${isTraining ? 'border-yellow-500/30 bg-yellow-950/10' : 'border-card-border bg-card'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Training Mode</h2>
                    <p className="mt-0.5 text-xs text-muted">
                      New employees can practice without affecting real data. Transactions are tagged and excluded from reports.
                    </p>
                  </div>
                  <button
                    onClick={() => setTraining(!isTraining)}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${isTraining ? 'bg-yellow-500' : 'bg-card-hover border border-card-border'}`}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${isTraining ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`} />
                  </button>
                </div>
                {isTraining && (
                  <p className="mt-3 text-xs text-yellow-400">
                    Training mode is ON. All transactions will be marked as training data and excluded from reports.
                  </p>
                )}
              </div>
            )}

            {/* Employee Phone Links */}
            {store?.slug && (
              <div className="rounded-xl border border-card-border bg-card p-6 shadow-sm dark:shadow-none">
                <h2 className="text-sm font-semibold text-foreground">Employee Phone Access</h2>
                <p className="mt-0.5 text-xs text-muted">
                  Share these links with your team. They work on any phone &mdash; no app download needed. Employees use their PIN to clock in and sell.
                </p>
                <div className="mt-4 space-y-3">
                  <PhoneLinkRow
                    label="Clock In/Out"
                    sublabel="PIN-based, GPS tagging, PWA installable"
                    path={`/clock/${store.slug}`}
                    savedKey="clock_url"
                    saved={saved}
                    setSaved={setSaved}
                  />
                  <PhoneLinkRow
                    label="Mobile Register"
                    sublabel="Access-code paired, sell from any phone"
                    path={`/mobile/${store.slug}`}
                    savedKey="mobile_url"
                    saved={saved}
                    setSaved={setSaved}
                  />
                </div>
              </div>
            )}

            {/* Dynamic staff sections: staff_lock, mobile_register, timeclock */}
            {tabSections.map((section) => (
              <SettingsSection
                key={section.key}
                section={section}
                settings={settings}
                saving={saving}
                saved={saved}
                updateLocal={updateLocal}
                saveField={saveField}
                resetSection={resetSection}
              />
            ))}

            {/* Time Clock & Geofence — custom section with GPS button */}
            <GeofenceSection
              settings={settings}
              saving={saving}
              saved={saved}
              updateLocal={updateLocal}
              saveField={saveField}
            />

            {/* Staff management link */}
            <div className="rounded-xl border border-dashed border-card-border bg-card-hover p-4 text-center">
              <p className="text-sm text-muted">
                Manage individual staff members, PINs, and roles on the{' '}
                <Link href="/dashboard/staff" className="text-accent hover:underline">Staff page</Link>.
              </p>
            </div>
          </>
        )}

        {/* ════════════════ INTEGRATIONS TAB ════════════════ */}
        {activeTab === 'integrations' && (
          <>
            {/* Afterroar Network */}
            <div className="rounded-xl border border-card-border bg-card p-6 shadow-sm dark:shadow-none">
              <h2 className="text-sm font-semibold text-foreground">Afterroar Network</h2>
              <p className="mt-0.5 text-xs text-muted">
                Connect to the Afterroar Network to sync events, enable QR check-ins, link player identities, and participate in cross-store leaderboards.
              </p>

              <div className="mt-4">
                {venueId ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      <span className="text-sm text-green-400 font-medium">Connected</span>
                      <span className="text-sm text-foreground">to {connectedVenueName || 'Afterroar Network'}</span>
                    </div>
                    <div className="text-xs text-muted space-y-1">
                      <p>Events you create as &quot;Afterroar Events&quot; will appear on your store page.</p>
                      <p>Player RSVPs are visible in the check-in list.</p>
                      <p>Loyalty points sync to the Afterroar wallet for linked customers.</p>
                    </div>
                    <button
                      onClick={disconnectVenue}
                      disabled={disconnecting}
                      className="px-3 py-1.5 bg-card-hover hover:bg-zinc-600 disabled:opacity-50 text-foreground rounded text-xs font-medium"
                    >
                      {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted">
                      Is your store listed on the Afterroar Network? Connect it to enable event sync, QR check-ins, and player identity linking.
                    </p>
                    <p className="text-[11px] text-muted/70">
                      The Afterroar Network connects game stores and players. Customers earn loyalty points that work across participating stores. Events get online RSVPs and your store appears in the store finder.
                    </p>
                    <div className="relative">
                      <label className="mb-1 block text-xs text-muted">Search by store name</label>
                      <input
                        type="text"
                        placeholder="Search stores..."
                        value={venueSearch}
                        onChange={(e) => setVenueSearch(e.target.value)}
                        className="w-full rounded-xl border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                      />
                      {searchingVenues && <p className="mt-1 text-xs text-muted">Searching...</p>}
                      {venueResults.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                          {venueResults.map((v) => (
                            <button
                              key={v.id}
                              onClick={() => connectVenue(v.id)}
                              disabled={connecting}
                              className="w-full text-left px-3 py-2 hover:bg-card-hover text-sm text-foreground flex justify-between items-center"
                            >
                              <span>{v.name}</span>
                              <span className="text-muted text-xs">
                                {[v.city, v.state].filter(Boolean).join(', ')}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <button
                        onClick={() => setShowManualInput(!showManualInput)}
                        className="text-xs text-muted hover:text-foreground transition-colors"
                      >
                        {showManualInput ? 'Hide manual input' : 'Or enter Store ID manually'}
                      </button>
                      {showManualInput && (
                        <div className="mt-2 flex gap-2">
                          <input
                            type="text"
                            placeholder="Store ID"
                            value={manualVenueId}
                            onChange={(e) => setManualVenueId(e.target.value)}
                            className="flex-1 rounded-xl border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                          />
                          <button
                            onClick={() => manualVenueId && connectVenue(manualVenueId)}
                            disabled={connecting || !manualVenueId}
                            className="px-4 py-2 bg-accent hover:bg-indigo-700 disabled:opacity-50 text-foreground rounded-xl text-sm font-medium"
                          >
                            {connecting ? 'Connecting...' : 'Connect'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Marketplace Sync hint */}
            <div className="rounded-xl border border-dashed border-card-border bg-card-hover p-4 text-center">
              <p className="text-sm text-muted">
                eBay and marketplace integrations are managed on the{' '}
                <Link href="/dashboard/singles/ebay" className="text-accent hover:underline">eBay Listings page</Link>.
              </p>
            </div>

            {/* Subscription hint */}
            <div className="rounded-xl border border-dashed border-card-border bg-card-hover p-4 text-center">
              <p className="text-sm text-muted">
                Plan, add-ons, and billing are managed on the{' '}
                <Link href="/dashboard/billing" className="text-accent hover:underline">Subscription page</Link>.
              </p>
            </div>
          </>
        )}

        {/* ════════════════ INTELLIGENCE TAB ════════════════ */}
        {activeTab === 'intelligence' && (
          <>
            {tabSections.map((section) => (
              <SettingsSection
                key={section.key}
                section={section}
                settings={settings}
                saving={saving}
                saved={saved}
                updateLocal={updateLocal}
                saveField={saveField}
                resetSection={resetSection}
              />
            ))}
          </>
        )}

        {/* ════════════════ OPERATIONS TAB ════════════════ */}
        {activeTab === 'operations' && (
          <>
            {tabSections.map((section) => (
              <SettingsSection
                key={section.key}
                section={section}
                settings={settings}
                saving={saving}
                saved={saved}
                updateLocal={updateLocal}
                saveField={saveField}
                resetSection={resetSection}
              />
            ))}

            {/* Appearance */}
            <div className="rounded-xl border border-card-border bg-card p-6 shadow-sm dark:shadow-none">
              <h2 className="text-sm font-semibold text-foreground">Appearance</h2>
              <p className="mt-0.5 text-xs text-muted">
                Choose your preferred color theme. Applies to this device only.
              </p>
              <div className="mt-4 flex gap-2">
                {([
                  { value: 'light' as const, label: 'Light' },
                  { value: 'dark' as const, label: 'Dark' },
                  { value: 'system' as const, label: 'System' },
                ]).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                      theme === opt.value
                        ? 'border-accent bg-accent-light text-accent'
                        : 'border-card-border bg-card text-muted hover:border-accent/50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* GOD MODE (admin only) */}
            {isGodAdmin && (
              <div className="rounded-xl border border-purple-500/30 bg-purple-950/10 p-6 shadow-sm dark:shadow-none">
                <h2 className="text-sm font-semibold text-purple-400">GOD MODE &mdash; Role Simulation</h2>
                <p className="mt-0.5 text-xs text-muted">
                  View the app as a different role. Sidebar and permissions will change immediately.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {([
                    { value: null, label: 'Off (actual role)' },
                    { value: 'owner' as const, label: 'Owner' },
                    { value: 'manager' as const, label: 'Manager' },
                    { value: 'cashier' as const, label: 'Cashier' },
                  ] as const).map((opt) => (
                    <button
                      key={String(opt.value)}
                      onClick={() => setTestRole(opt.value as Role | null)}
                      className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                        (isTestMode ? effectiveRole : null) === opt.value
                          ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                          : 'border-card-border bg-card text-muted hover:border-purple-500/50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {isTestMode && (
                  <p className="mt-3 text-xs text-purple-400">
                    Currently viewing as: <strong>{effectiveRole}</strong>
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Reusable Settings Section Renderer                                 */
/* ------------------------------------------------------------------ */

interface SettingsSectionProps {
  section: (typeof SETTINGS_SECTIONS)[number];
  settings: StoreSettings;
  saving: string | null;
  saved: string | null;
  updateLocal: (key: string, value: unknown) => void;
  saveField: (key: string, value: unknown) => Promise<void>;
  resetSection: (key: string) => Promise<void>;
}

function SettingsSection({ section, settings, saving, saved, updateLocal, saveField, resetSection }: SettingsSectionProps) {
  return (
    <div className="rounded-xl border border-card-border bg-card p-6 shadow-sm dark:shadow-none">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{section.label}</h2>
          <p className="mt-0.5 text-xs text-muted">{section.description}</p>
        </div>
        <button
          onClick={() => resetSection(section.key)}
          className="text-xs text-muted hover:text-foreground transition-colors shrink-0 ml-4"
        >
          {saving === section.key ? 'Resetting...' : saved === section.key ? 'Reset!' : 'Reset to defaults'}
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {section.fields.map((field) => {
          const key = field.key as keyof StoreSettings;
          const value = settings[key];
          const isSaving = saving === field.key;
          const isSaved = saved === field.key;
          const fieldTooltip = 'tooltip' in field ? (field as { tooltip?: string }).tooltip : undefined;

          if (field.type === 'text') {
            return (
              <div key={field.key}>
                <label className="mb-1 flex items-center gap-1.5 text-xs text-muted">{field.label}{fieldTooltip && <HelpTooltip text={fieldTooltip} />}</label>
                <div className="relative">
                  <input
                    type="text"
                    value={String(value ?? '')}
                    placeholder={'placeholder' in field ? (field as { placeholder?: string }).placeholder : ''}
                    onChange={(e) => updateLocal(field.key, e.target.value)}
                    onBlur={(e) => saveField(field.key, e.target.value)}
                    className="w-full rounded-xl border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                  {isSaving && <span className="absolute right-3 top-2.5 text-xs text-muted">Saving...</span>}
                  {isSaved && <span className="absolute right-3 top-2.5 text-xs text-green-400">Saved</span>}
                </div>
              </div>
            );
          }

          if (field.type === 'number') {
            return (
              <div key={field.key}>
                <label className="mb-1 flex items-center gap-1.5 text-xs text-muted">{field.label}{fieldTooltip && <HelpTooltip text={fieldTooltip} />}</label>
                <div className="relative flex items-center gap-2">
                  <input
                    type="number"
                    value={Number(value ?? 0)}
                    min={'min' in field ? (field as { min?: number }).min : undefined}
                    max={'max' in field ? (field as { max?: number }).max : undefined}
                    step={'step' in field ? (field as { step?: number }).step : undefined}
                    onChange={(e) => updateLocal(field.key, Number(e.target.value))}
                    onBlur={(e) => saveField(field.key, Number(e.target.value))}
                    className="w-48 rounded-xl border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground tabular-nums focus:border-accent focus:outline-none"
                  />
                  {isSaving && <span className="text-xs text-muted">Saving...</span>}
                  {isSaved && <span className="text-xs text-green-400">Saved</span>}
                </div>
              </div>
            );
          }

          if (field.type === 'toggle') {
            return (
              <div key={field.key} className="flex items-center justify-between">
                <label className="text-sm text-foreground flex items-center gap-1.5">
                  {field.label}
                  {fieldTooltip && <HelpTooltip text={fieldTooltip} />}
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const newVal = !value;
                      updateLocal(field.key, newVal);
                      saveField(field.key, newVal);
                    }}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      value ? 'bg-accent' : 'bg-card-hover'
                    }`}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                        value ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  {isSaved && <span className="text-xs text-green-400">Saved</span>}
                </div>
              </div>
            );
          }

          if (field.type === 'select' && 'options' in field) {
            return (
              <div key={field.key}>
                <label className="mb-1 flex items-center gap-1.5 text-xs text-muted">
                  {field.label}
                  {fieldTooltip && <HelpTooltip text={fieldTooltip} />}
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={String(value ?? '')}
                    onChange={(e) => {
                      updateLocal(field.key, e.target.value);
                      saveField(field.key, e.target.value);
                    }}
                    className="rounded-xl border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                  >
                    {(field as { options: Array<{ value: string; label: string }> }).options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {isSaved && <span className="text-xs text-green-400">Saved</span>}
                </div>
              </div>
            );
          }

          if (field.type === 'multiselect' && 'options' in field) {
            const selected = Array.isArray(value) ? value as string[] : [];
            return (
              <div key={field.key}>
                <label className="mb-2 block text-xs text-muted">{field.label}</label>
                <div className="flex flex-wrap gap-2">
                  {(field as { options: Array<{ value: string; label: string }> }).options.map((opt) => {
                    const isOn = selected.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        onClick={() => {
                          const newVal = isOn
                            ? selected.filter((v) => v !== opt.value)
                            : [...selected, opt.value];
                          updateLocal(field.key, newVal);
                          saveField(field.key, newVal);
                        }}
                        className={`rounded-xl border px-3 py-1.5 text-sm transition-colors ${
                          isOn
                            ? 'border-accent bg-accent-light text-accent'
                            : 'border-card-border bg-card text-muted hover:border-accent/50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {isSaved && <span className="mt-1 block text-xs text-green-400">Saved</span>}
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Phone Link Row                                                     */
/* ------------------------------------------------------------------ */

function PhoneLinkRow({
  label,
  sublabel,
  path,
  savedKey,
  saved,
  setSaved,
}: {
  label: string;
  sublabel: string;
  path: string;
  savedKey: string;
  saved: string | null;
  setSaved: (v: string | null) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-card-hover px-4 py-3">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted mt-0.5">{sublabel}</p>
      </div>
      <button
        onClick={() => {
          navigator.clipboard.writeText(`${window.location.origin}${path}`);
          setSaved(savedKey);
          setTimeout(() => setSaved(null), 2000);
        }}
        className="text-xs text-accent hover:underline shrink-0 ml-3"
      >
        {saved === savedKey ? 'Copied!' : 'Copy Link'}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Terminal Reader Section                                            */
/* ------------------------------------------------------------------ */
function TerminalReaderSection() {
  const [readerStatus, setReaderStatus] = useState<{
    registered: boolean;
    reader?: { id: string; label: string; device_type: string; status: string; serial_number?: string };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [regCode, setRegCode] = useState("");
  const [regLabel, setRegLabel] = useState("Register 1");
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch("/api/stripe/terminal/register");
        if (res.ok) setReaderStatus(await res.json());
      } catch { /* ignore */ }
      setLoading(false);
    }
    check();
  }, []);

  async function handleRegister() {
    if (!regCode.trim()) return;
    setRegistering(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/terminal/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration_code: regCode.trim(), label: regLabel.trim() || "Register 1" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed");
      } else {
        setReaderStatus({ registered: true, reader: data.reader });
        setShowForm(false);
        setRegCode("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div className="rounded-xl border border-card-border bg-card p-6 shadow-sm dark:shadow-none">
      <h2 className="text-sm font-semibold text-foreground">Card Reader (Stripe Terminal)</h2>
      <p className="mt-0.5 text-xs text-muted">
        Connect a physical card reader for in-person tap/chip/swipe payments. We support the Stripe S710.
      </p>

      <div className="mt-4">
        {loading ? (
          <p className="text-sm text-muted">Checking reader status...</p>
        ) : readerStatus?.registered ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm text-green-400 font-medium">Reader Connected</span>
            </div>
            <div className="text-xs text-muted space-y-0.5">
              <p>Label: <span className="text-foreground">{readerStatus.reader?.label}</span></p>
              <p>Type: <span className="text-foreground">{readerStatus.reader?.device_type}</span></p>
              <p>Status: <span className="text-foreground">{readerStatus.reader?.status}</span></p>
              {readerStatus.reader?.serial_number && (
                <p>Serial: <span className="text-foreground">{readerStatus.reader.serial_number}</span></p>
              )}
            </div>
            <ResetReaderButton readerId={readerStatus.reader?.id} />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted">No reader connected.</p>
            {!showForm ? (
              <button
                onClick={() => setShowForm(true)}
                className="px-4 py-2 bg-accent hover:opacity-90 text-white rounded-xl text-sm font-medium"
              >
                Register Reader
              </button>
            ) : (
              <div className="space-y-3 p-4 rounded-xl border border-card-border bg-card-hover">
                <div>
                  <label className="block text-xs text-muted mb-1">Registration Code</label>
                  <input
                    type="text"
                    value={regCode}
                    onChange={(e) => setRegCode(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") handleRegister();
                    }}
                    placeholder="e.g., sunny-cloud-dolphin"
                    className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                    autoFocus
                  />
                  <p className="mt-1 text-[11px] text-muted/70">
                    Find this code on your card reader&apos;s screen. Power on the reader and wait for the pairing screen to appear.
                  </p>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Label (optional)</label>
                  <input
                    type="text"
                    value={regLabel}
                    onChange={(e) => setRegLabel(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder="Register 1"
                    className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                </div>
                {error && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">
                    {error}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleRegister}
                    disabled={registering || !regCode.trim()}
                    className="px-4 py-2 bg-accent hover:opacity-90 disabled:opacity-50 text-white rounded-xl text-sm font-medium flex items-center gap-2"
                  >
                    {registering && (
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    )}
                    {registering ? "Registering..." : "Register"}
                  </button>
                  <button
                    onClick={() => { setShowForm(false); setError(null); }}
                    className="px-4 py-2 border border-card-border bg-card text-foreground rounded-xl text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Reset Reader Button                                                */
/* ------------------------------------------------------------------ */
function ResetReaderButton({ readerId }: { readerId?: string }) {
  const [resetting, setResetting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleReset() {
    if (!readerId || resetting) return;
    setResetting(true);
    try {
      await fetch("/api/stripe/terminal/reset", { method: "POST" });
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch { /* ignore */ }
    setResetting(false);
  }

  return (
    <button
      onClick={handleReset}
      disabled={resetting || !readerId}
      className={`mt-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        done
          ? "bg-green-500/20 text-green-400"
          : "bg-card-hover text-muted hover:text-foreground"
      }`}
    >
      {resetting ? "Resetting..." : done ? "Reader cleared" : "Reset Reader"}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Geofence Section — GPS-enabled store location setup                */
/* ------------------------------------------------------------------ */

function GeofenceSection({
  settings,
  saving,
  saved,
  updateLocal,
  saveField,
}: {
  settings: StoreSettings;
  saving: string | null;
  saved: string | null;
  updateLocal: (key: string, value: unknown) => void;
  saveField: (key: string, value: unknown) => Promise<void>;
}) {
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsSuccess, setGpsSuccess] = useState(false);

  const lat = Number(settings.timeclock_geofence_lat) || 0;
  const lng = Number(settings.timeclock_geofence_lng) || 0;
  const radius = Number(settings.timeclock_geofence_radius_meters) || 150;
  const enabled = Boolean(settings.timeclock_geofence_enabled);
  const hasLocation = lat !== 0 && lng !== 0;

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      setGpsError("GPS not available on this device.");
      return;
    }

    setLocating(true);
    setGpsError(null);
    setGpsSuccess(false);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const newLat = Math.round(position.coords.latitude * 1000000) / 1000000;
        const newLng = Math.round(position.coords.longitude * 1000000) / 1000000;

        updateLocal("timeclock_geofence_lat", newLat);
        updateLocal("timeclock_geofence_lng", newLng);

        // Save both fields
        await Promise.all([
          saveField("timeclock_geofence_lat", newLat),
          saveField("timeclock_geofence_lng", newLng),
        ]);

        setGpsSuccess(true);
        setLocating(false);
        setTimeout(() => setGpsSuccess(false), 3000);
      },
      (err) => {
        setLocating(false);
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setGpsError("Location access denied. Check your browser permissions.");
            break;
          case err.POSITION_UNAVAILABLE:
            setGpsError("Location unavailable. Try again or enter coordinates manually.");
            break;
          case err.TIMEOUT:
            setGpsError("Location request timed out. Try again.");
            break;
          default:
            setGpsError("Could not get location.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div className="rounded-xl border border-card-border bg-card p-6 shadow-sm dark:shadow-none">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Time Clock &amp; Geofencing</h2>
          <p className="mt-0.5 text-xs text-muted">
            Tag employee clock-ins as &quot;at store&quot; or &quot;remote&quot; based on GPS. Never blocks clock-in &mdash; just tags it.
          </p>
        </div>
        <button
          onClick={() => {
            const newVal = !enabled;
            updateLocal("timeclock_geofence_enabled", newVal);
            saveField("timeclock_geofence_enabled", newVal);
          }}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? 'bg-accent' : 'bg-card-hover border border-card-border'}`}
        >
          <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>

      {enabled && (
        <div className="mt-4 space-y-4">
          {/* GPS Button — primary action */}
          <div className="rounded-lg border border-dashed border-accent/30 bg-accent/5 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Store Location</p>
                {hasLocation ? (
                  <p className="text-xs text-muted mt-0.5">
                    Set to {lat}, {lng}
                  </p>
                ) : (
                  <p className="text-xs text-amber-400 mt-0.5">
                    No location set. Tap the button from inside your store.
                  </p>
                )}
              </div>
              <button
                onClick={useCurrentLocation}
                disabled={locating}
                className="shrink-0 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-2"
              >
                {locating ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Locating...
                  </>
                ) : hasLocation ? (
                  "Update Location"
                ) : (
                  "Use Current Location"
                )}
              </button>
            </div>

            {gpsError && (
              <p className="mt-2 text-xs text-red-400">{gpsError}</p>
            )}
            {gpsSuccess && (
              <p className="mt-2 text-xs text-green-400">Location saved. Clock-ins within {radius}m of here will be tagged &quot;at store.&quot;</p>
            )}
          </div>

          {/* Interactive map — click to place pin, drag to adjust */}
          <LocationPicker
            lat={lat}
            lng={lng}
            radiusMeters={radius}
            onLocationChange={async (newLat, newLng) => {
              updateLocal("timeclock_geofence_lat", newLat);
              updateLocal("timeclock_geofence_lng", newLng);
              await Promise.all([
                saveField("timeclock_geofence_lat", newLat),
                saveField("timeclock_geofence_lng", newLng),
              ]);
            }}
          />

          {/* Radius */}
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs text-muted">
              Geofence Radius
              <HelpTooltip text="How close to the store GPS must be to count as 'at store'. Default 150m (~500ft). Larger radius = more lenient." />
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={50}
                max={2000}
                step={50}
                value={radius}
                onChange={(e) => updateLocal("timeclock_geofence_radius_meters", Number(e.target.value))}
                onMouseUp={(e) => saveField("timeclock_geofence_radius_meters", Number((e.target as HTMLInputElement).value))}
                onTouchEnd={(e) => saveField("timeclock_geofence_radius_meters", Number((e.target as HTMLInputElement).value))}
                className="flex-1 accent-accent"
              />
              <span className="text-sm font-medium text-foreground tabular-nums w-20 text-right">
                {radius >= 1000 ? `${(radius / 1000).toFixed(1)}km` : `${radius}m`}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted/70">
              ~{Math.round(radius * 3.281)}ft &middot; {radius <= 100 ? 'Very tight — front door only' : radius <= 300 ? 'Standard — covers your building' : radius <= 500 ? 'Relaxed — covers parking lot' : 'Very wide — covers the block'}
            </p>
          </div>

          {/* Manual override (collapsed) */}
          <details className="text-xs">
            <summary className="text-muted hover:text-foreground cursor-pointer transition-colors">
              Enter coordinates manually
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted">Latitude</label>
                <input
                  type="number"
                  value={lat}
                  min={-90}
                  max={90}
                  step={0.000001}
                  onChange={(e) => updateLocal("timeclock_geofence_lat", Number(e.target.value))}
                  onBlur={(e) => saveField("timeclock_geofence_lat", Number(e.target.value))}
                  className="w-full rounded-xl border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground tabular-nums focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">Longitude</label>
                <input
                  type="number"
                  value={lng}
                  min={-180}
                  max={180}
                  step={0.000001}
                  onChange={(e) => updateLocal("timeclock_geofence_lng", Number(e.target.value))}
                  onBlur={(e) => saveField("timeclock_geofence_lng", Number(e.target.value))}
                  className="w-full rounded-xl border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground tabular-nums focus:border-accent focus:outline-none"
                />
              </div>
            </div>
          </details>
        </div>
      )}

      {saving === "timeclock_geofence_enabled" && <p className="mt-2 text-xs text-muted">Saving...</p>}
      {saved === "timeclock_geofence_enabled" && <p className="mt-2 text-xs text-green-400">Saved</p>}
    </div>
  );
}
