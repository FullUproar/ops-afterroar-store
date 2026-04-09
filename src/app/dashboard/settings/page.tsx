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
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const LocationPicker = dynamic(() => import('@/components/location-picker').then(m => ({ default: m.LocationPicker })), { ssr: false });

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

type TabKey = 'store' | 'payments' | 'staff' | 'integrations' | 'intelligence' | 'operations' | 'test-mode';

const TABS: { key: TabKey; label: string; icon: string; description: string }[] = [
  { key: 'store', label: 'Store', icon: '⌂', description: 'Your store identity, tax, checkout, and receipt settings' },
  { key: 'payments', label: 'Payments', icon: '◈', description: 'Stripe, card reader, and payment method configuration' },
  { key: 'staff', label: 'Staff', icon: '⊞', description: 'Roles, permissions, and mobile access' },
  { key: 'integrations', label: 'Integrations', icon: '◎', description: 'Afterroar Network, Shopify, and external connections' },
  { key: 'intelligence', label: 'Intelligence', icon: '◉', description: 'Store advisor, cash flow thresholds, and monthly fixed costs' },
  { key: 'operations', label: 'Operations', icon: '⚙', description: 'Cafe, loyalty, promotions, and appearance' },
  { key: 'test-mode', label: 'Test Mode', icon: '◌', description: 'Training mode, demo data, and testing tools' },
];

const TAB_SECTIONS: Record<TabKey, string[]> = {
  store: ['identity', 'tax', 'checkout', 'inventory', 'returns', 'trade_ins'],
  payments: ['payments'],
  staff: ['staff_lock', 'mobile_register'], // timeclock rendered manually for GPS button
  integrations: [],
  intelligence: ['intelligence', 'intelligence_costs', 'intelligence_thresholds'],
  operations: ['cafe', 'loyalty', 'promo_guardrails', 'nav_visibility'],
  'test-mode': [],
};

/* ------------------------------------------------------------------ */
/*  Main Settings Page                                                 */
/* ------------------------------------------------------------------ */

export default function SettingsPage() {
  const { can, store, loading: storeLoading, isGodAdmin, isTestMode, effectiveRole, setTestRole } = useStore();
  const { theme, setTheme } = useTheme();
  const { isTraining, setTraining } = useTrainingMode();
  const currentSettings = useStoreSettings();
  const [settings, setSettings] = useState<StoreSettings>(currentSettings);
  const [initialSynced, setInitialSynced] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState('');
  const pathname = usePathname();
  const router = useRouter();

  // Derive active tab from URL pathname — 'settings' root shows overview
  const pathTab = pathname.split('/').pop();
  const isOverview = pathTab === 'settings';
  const activeTab: TabKey = (TABS.some(t => t.key === pathTab) ? pathTab : 'store') as TabKey;
  const setActiveTab = (tab: TabKey) => router.push(`/dashboard/settings/${tab}`);

  // Drill-down: which section within a tab is expanded (null = show section cards)
  const [activeSection, setActiveSection] = useState<string | null>(null);
  // Reset section when tab changes
  useEffect(() => { setActiveSection(null); }, [activeTab]);

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

  // Sync once when store context first loads (not on every render)
  const storeId = store?.id;
  useEffect(() => {
    if (storeId && !initialSynced) {
      setSettings(currentSettings);
      setInitialSynced(true);
    }
  }, [storeId, initialSynced, currentSettings]);

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

  // Wait for store context before checking permissions — avoids hydration mismatch
  // (server renders "no permission" → client renders full page = React crash)
  if (storeLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted">Loading settings...</p>
      </div>
    );
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

  // ── Settings overview: compute status summaries per tab ──
  function getTabSummary(tab: TabKey): { status: 'configured' | 'needs-setup' | 'info'; summary: string } {
    switch (tab) {
      case 'store': {
        const hasName = settings.store_display_name || store?.name;
        const hasTax = (settings.tax_rate_percent as number) > 0;
        return {
          status: hasName && hasTax ? 'configured' : 'needs-setup',
          summary: [
            hasName ? (settings.store_display_name || store?.name) : 'Name not set',
            hasTax ? `Tax: ${settings.tax_rate_percent}%` : 'No tax configured',
            `Credit bonus: ${settings.trade_in_credit_bonus_percent}%`,
          ].join(' · '),
        };
      }
      case 'payments': {
        const hasStripe = !!((store?.settings as Record<string, unknown>)?.stripe_connected_account_id);
        return {
          status: hasStripe ? 'configured' : 'needs-setup',
          summary: hasStripe ? 'Stripe connected' : 'No payment processor connected',
        };
      }
      case 'staff':
        return { status: 'info', summary: 'Permissions, mobile register, time clock' };
      case 'integrations': {
        const hasShopify = !!((store?.settings as Record<string, unknown>)?.shopify_store_domain);
        const hasAfterroar = !!((store?.settings as Record<string, unknown>)?.venueName);
        const parts = [];
        if (hasAfterroar) parts.push('Afterroar linked');
        if (hasShopify) parts.push('Shopify connected');
        if (parts.length === 0) parts.push('No integrations connected');
        return { status: parts.length > 0 && (hasShopify || hasAfterroar) ? 'configured' : 'info', summary: parts.join(' · ') };
      }
      case 'intelligence':
        return { status: 'info', summary: `Advisor tone: ${settings.intel_advisor_tone ?? 'default'} · Thresholds configured` };
      case 'operations': {
        const parts = [];
        if (settings.loyalty_enabled) parts.push('Loyalty on');
        if ((settings as unknown as Record<string, unknown>).cafe_enabled) parts.push('Café on');
        if (parts.length === 0) parts.push('Loyalty, promotions, café');
        return { status: 'info', summary: parts.join(' · ') };
      }
      case 'test-mode':
        return { status: 'info', summary: isTraining ? 'Training mode active' : 'Training mode off' };
      default:
        return { status: 'info', summary: '' };
    }
  }

  // ── OVERVIEW: settings hub (when at /dashboard/settings root) ──
  if (isOverview) {
    return (
      <div className="space-y-4">
        <PageHeader title="Settings" backHref="/dashboard" />
        <p className="text-sm text-muted -mt-2">
          {store?.name} · Tap a section to configure
        </p>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TABS.map((tab) => {
            const { status, summary } = getTabSummary(tab.key);
            const needsSetup = status === 'needs-setup';
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-xl border p-5 text-left transition-all active:scale-[0.98] ${
                  needsSetup
                    ? 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50'
                    : 'border-card-border bg-card hover:border-accent/30 hover:bg-card-hover'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{tab.icon}</span>
                  <span className="text-sm font-semibold text-foreground">{tab.label}</span>
                  {needsSetup && (
                    <span className="ml-auto text-xs font-medium text-amber-400">Setup needed</span>
                  )}
                </div>
                <p className="text-xs text-muted leading-relaxed line-clamp-2">{summary}</p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title={TABS.find(t => t.key === activeTab)?.label || 'Settings'} backHref="/dashboard/settings" />
      <p className="text-sm text-muted -mt-2">
        {store?.name} &middot; Changes save automatically
      </p>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm -mt-2">
        <button onClick={() => router.push('/dashboard/settings')} className="text-accent hover:underline">Settings</button>
        <span className="text-muted">/</span>
        {activeSection ? (
          <>
            <button onClick={() => setActiveSection(null)} className="text-accent hover:underline">
              {TABS.find((t) => t.key === activeTab)?.label}
            </button>
            <span className="text-muted">/</span>
            <span className="text-foreground font-medium">
              {tabSections.find((s) => s.key === activeSection)?.label ?? activeSection}
            </span>
          </>
        ) : (
          <span className="text-foreground font-medium">{TABS.find((t) => t.key === activeTab)?.label}</span>
        )}
      </div>

      {/* ── Tab Content ── */}
      <div className="max-w-2xl space-y-6 pb-8">

        {/* ════════════════ STORE TAB ════════════════ */}
        {activeTab === 'store' && !activeSection && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tabSections.map((section) => {
              // Generate a summary for each section card
              const fieldSummary = section.fields.slice(0, 2).map((f) => {
                const val = settings[f.key as keyof StoreSettings];
                if (f.type === 'toggle') return `${f.label}: ${val ? 'On' : 'Off'}`;
                if (f.type === 'number' && val !== undefined) return `${f.label}: ${val}`;
                if (f.type === 'text' && val) return String(val).slice(0, 30);
                return null;
              }).filter(Boolean).join(' · ') || section.description;

              return (
                <button
                  key={section.key}
                  onClick={() => setActiveSection(section.key)}
                  className="rounded-xl border border-card-border bg-card p-4 text-left hover:border-accent/30 hover:bg-card-hover active:scale-[0.98] transition-all"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-foreground">{section.label}</span>
                    <span className="text-xs text-muted">→</span>
                  </div>
                  <p className="text-xs text-muted line-clamp-2">{fieldSummary}</p>
                </button>
              );
            })}
          </div>
        )}
        {activeTab === 'store' && activeSection && (
          <>
            {tabSections.filter((s) => s.key === activeSection).map((section) => (
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
                        <div className="absolute z-10 mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-xl shadow-lg max-h-48 overflow-y-auto scroll-visible">
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

            {/* Shopify Connection */}
            <ShopifyConnectionSection />

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
          </>
        )}

        {/* ════════════════ TEST MODE TAB ════════════════ */}
        {activeTab === 'test-mode' && (
          <>
            {/* Training Mode Toggle */}
            {(effectiveRole === 'owner' || isGodAdmin) && (
              <div className={`rounded-xl border p-6 shadow-sm dark:shadow-none ${isTraining ? 'border-yellow-500/30 bg-yellow-950/10' : 'border-card-border bg-card'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Training Mode</h2>
                    <p className="mt-0.5 text-xs text-muted">
                      Practice without affecting real data. Transactions are tagged and excluded from reports.
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      const goingOff = isTraining;
                      setTraining(!isTraining);
                      if (goingOff) {
                        try { await fetch("/api/store/seed-demo", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }); } catch {}
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${isTraining ? 'bg-yellow-500' : 'bg-card-hover border border-card-border'}`}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${isTraining ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`} />
                  </button>
                </div>
                {isTraining && (
                  <div className="mt-3 space-y-3">
                    <p className="text-xs text-yellow-400">
                      Training mode is ON. All transactions are marked as training data.
                    </p>
                    <DemoDataButtons />
                  </div>
                )}
              </div>
            )}

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

/* ------------------------------------------------------------------ */
/*  Demo Data Buttons — seed / clean up test data (training mode only)  */
/* ------------------------------------------------------------------ */

function DemoDataButtons() {
  const [seeding, setSeeding] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function seedDemo() {
    setSeeding(true);
    setMessage(null);
    try {
      const res = await fetch("/api/store/seed-demo", { method: "POST" });
      const data = await res.json();
      setMessage(res.ok ? data.message : data.error);
    } catch {
      setMessage("Failed to seed demo data.");
    } finally {
      setSeeding(false);
    }
  }

  async function clearAll() {
    if (!confirm("This will delete ALL inventory, customers, events, and transactions. Are you sure?")) return;
    setCleaning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/store/seed-demo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear_all: true }),
      });
      const data = await res.json();
      setMessage(res.ok ? data.message : data.error);
    } catch {
      setMessage("Failed to clear data.");
    } finally {
      setCleaning(false);
    }
  }

  async function cleanDemo() {
    setCleaning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/store/seed-demo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setMessage(res.ok ? data.message : data.error);
    } catch {
      setMessage("Failed to clean up demo data.");
    } finally {
      setCleaning(false);
    }
  }

  return (
    <div className="rounded-lg border border-yellow-500/20 bg-yellow-950/10 p-3 space-y-2">
      <p className="text-xs text-yellow-300 font-medium">Demo Data</p>
      <p className="text-[11px] text-yellow-400/70">
        Populate the store with sample customers, inventory, and events for testing. Cleaned up automatically when you leave training mode.
      </p>
      <div className="flex gap-2">
        <button
          onClick={seedDemo}
          disabled={seeding || cleaning}
          className="px-3 py-1.5 bg-yellow-600 text-white rounded text-xs font-medium hover:bg-yellow-500 disabled:opacity-50 transition-colors"
        >
          {seeding ? "Seeding..." : "Seed Demo Data"}
        </button>
        <button
          onClick={cleanDemo}
          disabled={seeding || cleaning}
          className="px-3 py-1.5 border border-yellow-500/30 text-yellow-400 rounded text-xs font-medium hover:bg-yellow-950/30 disabled:opacity-50 transition-colors"
        >
          {cleaning ? "Cleaning..." : "Clean Up Demo Data"}
        </button>
        <button
          onClick={clearAll}
          disabled={seeding || cleaning}
          className="px-3 py-1.5 border border-red-500/30 text-red-400 rounded text-xs font-medium hover:bg-red-950/30 disabled:opacity-50 transition-colors"
        >
          {cleaning ? "Clearing..." : "Clear All Store Data"}
        </button>
      </div>
      {message && <p className="text-xs text-yellow-300">{message}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shopify Connection Section                                         */
/* ------------------------------------------------------------------ */

function ShopifyConnectionSection() {
  const { store } = useStore();
  const storeSettings = (store?.settings ?? {}) as Record<string, unknown>;
  const currentUrl = (storeSettings.shopify_url as string) || "";
  const hasToken = !!(storeSettings.shopify_access_token as string);

  const [shopUrl, setShopUrl] = useState(currentUrl);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    if (!shopUrl || !token) {
      setError("Store URL and access token are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Verify the token works
      const testUrl = shopUrl.includes(".myshopify.com") ? shopUrl : `${shopUrl}.myshopify.com`;
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopify_url: testUrl,
          shopify_access_token: token,
        }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        setError("Failed to save.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopify_url: "", shopify_access_token: "" }),
      });
      window.location.reload();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="rounded-xl border border-card-border bg-card p-6 shadow-sm dark:shadow-none">
      <h2 className="text-sm font-semibold text-foreground">Shopify</h2>
      <p className="mt-0.5 text-xs text-muted">
        Connect your Shopify store for real-time inventory sync. In-store sales update Shopify automatically.
      </p>

      <div className="mt-4">
        {currentUrl && hasToken ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm text-green-400 font-medium">Connected</span>
              <span className="text-sm text-foreground">{currentUrl}</span>
            </div>
            <div className="text-xs text-muted space-y-1">
              <p>Inventory syncs automatically after each in-store sale.</p>
              <p>Online orders are pulled in via webhook.</p>
              <p>Set online allocations on each item&apos;s detail page.</p>
            </div>
            <button
              onClick={disconnect}
              disabled={disconnecting}
              className="px-3 py-1.5 bg-card-hover hover:bg-zinc-600 disabled:opacity-50 text-foreground rounded text-xs font-medium"
            >
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </button>
            {saved && <p className="text-xs text-green-400">Connected!</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-muted mb-1">Shopify Store URL</label>
              <input
                type="text"
                value={shopUrl}
                onChange={(e) => setShopUrl(e.target.value)}
                placeholder="your-store.myshopify.com"
                className="w-full rounded-xl border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Admin API Access Token</label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="shpat_..."
                className="w-full rounded-xl border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none font-mono"
              />
              <p className="mt-1 text-[11px] text-muted/70">
                Create a custom app in Shopify with read/write products + inventory scopes. Token is stored encrypted.
              </p>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            {saving && (
              <div className="flex items-center gap-2 text-xs text-accent">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Connecting to Shopify and verifying access...
              </div>
            )}
            <button
              onClick={connect}
              disabled={saving || !shopUrl || !token}
              className="px-4 py-2 bg-accent hover:opacity-90 disabled:opacity-50 text-white rounded-xl text-sm font-medium"
            >
              {saving ? "Connecting..." : "Connect Shopify"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
