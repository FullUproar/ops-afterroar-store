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

export default function SettingsPage() {
  const { can, store, isGodAdmin, isTestMode, effectiveRole, setTestRole } = useStore();
  const { theme, setTheme } = useTheme();
  const { isTraining, setTraining } = useTrainingMode();
  const currentSettings = useStoreSettings();
  const [settings, setSettings] = useState<StoreSettings>(currentSettings);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState('');

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
      const res = await fetch('/api/stripe/connect', {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.onboarding_url) {
          window.location.href = data.onboarding_url;
        }
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
        // Reload the page to refresh store context
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
      if (res.ok) {
        window.location.reload();
      } else {
        setError('Failed to disconnect');
      }
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

  return (
    <div className="space-y-6">
      <PageHeader title="Store Settings" backHref="/dashboard" />
      <p className="text-sm text-muted -mt-4">
        {store?.name} &middot; Changes save automatically
      </p>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Afterroar Integration Section */}
      <div className="max-w-2xl">
        <div className="rounded-xl border border-card-border bg-card p-6 shadow-sm dark:shadow-none">
          <h2 className="text-sm font-semibold text-foreground">Afterroar Integration</h2>
          <p className="mt-0.5 text-xs text-muted">
            Connect your store to Afterroar to sync events, check-ins, and player identity.
          </p>

          {(() => {
            const storeSettings = (store?.settings ?? {}) as Record<string, unknown>;
            const venueId = storeSettings.venueId as string | undefined;
            const connectedVenueName = storeSettings.venueName as string | undefined;

            if (venueId) {
              return (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-sm text-green-400 font-medium">Connected</span>
                    <span className="text-sm text-foreground">to {connectedVenueName || 'Afterroar Venue'}</span>
                  </div>
                  <div className="text-xs text-muted space-y-1">
                    <p>Events you create as &quot;Afterroar Events&quot; will appear on your venue page.</p>
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
              );
            }

            return (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-muted">
                  Do you have a venue page on Afterroar? Connect it to enable event sync, QR check-ins, and player identity linking.
                </p>
                <div className="relative">
                  <label className="mb-1 block text-xs text-muted">Search by venue name</label>
                  <input
                    type="text"
                    placeholder="Search venues..."
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
                    {showManualInput ? 'Hide manual input' : 'Or enter Venue ID manually'}
                  </button>
                  {showManualInput && (
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        placeholder="Venue ID"
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
            );
          })()}
        </div>
      </div>

      {/* Payments / Stripe Section */}
      <div className="max-w-2xl">
        <div className="rounded-xl border border-card-border bg-card p-6 shadow-sm dark:shadow-none">
          <h2 className="text-sm font-semibold text-foreground">Payments</h2>
          <p className="mt-0.5 text-xs text-muted">
            Stripe integration for card payments. Tax is calculated using your configured tax rate above.
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
                  Connect a Stripe account to accept card payments directly. Without Stripe Connect,
                  card payments use {process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ? 'the platform Stripe account (test mode)' : 'simulated processing'}.
                </p>
                <button
                  onClick={startStripeOnboarding}
                  disabled={stripeConnecting}
                  className="px-4 py-2 bg-accent hover:opacity-90 disabled:opacity-50 text-white rounded-xl text-sm font-medium"
                >
                  {stripeConnecting ? 'Connecting...' : 'Connect Stripe'}
                </button>
                <p className="text-xs text-muted italic">
                  Stripe Tax auto-calculation is coming soon. For now, configure your tax rate manually in the Tax section below.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Terminal Reader Section */}
      <TerminalReaderSection />

      {/* Theme Section */}
      <div className="max-w-2xl">
        <div className="rounded-xl border border-card-border bg-card p-6 shadow-sm dark:shadow-none">
          <h2 className="text-sm font-semibold text-foreground">Appearance</h2>
          <p className="mt-0.5 text-xs text-muted">
            Choose your preferred color theme.
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
      </div>

      {/* Training Mode (owner only) */}
      {(effectiveRole === 'owner' || isGodAdmin) && (
        <div className="max-w-2xl">
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
        </div>
      )}

      {/* GOD MODE — Role Simulation (admin only) */}
      {isGodAdmin && (
        <div className="max-w-2xl">
          <div className="rounded-xl border border-purple-500/30 bg-purple-950/10 p-6 shadow-sm dark:shadow-none">
            <h2 className="text-sm font-semibold text-purple-400">GOD MODE — Role Simulation</h2>
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
        </div>
      )}

      <div className="max-w-2xl space-y-4">
        {SETTINGS_SECTIONS.map((section) => (
          <div
            key={section.key}
            className="rounded-xl border border-card-border bg-card p-6 shadow-sm dark:shadow-none"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">{section.label}</h2>
                <p className="mt-0.5 text-xs text-muted">{section.description}</p>
              </div>
              <button
                onClick={() => resetSection(section.key)}
                className="text-xs text-muted hover:text-foreground transition-colors"
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
                      <div className="relative">
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
                        {isSaving && <span className="ml-3 text-xs text-muted">Saving...</span>}
                        {isSaved && <span className="ml-3 text-xs text-green-400">Saved</span>}
                      </div>
                    </div>
                  );
                }

                if (field.type === 'toggle') {
                  return (
                    <div key={field.key} className="flex items-center justify-between">
                      <label className="text-sm text-foreground">{field.label}</label>
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
                      <label className="mb-1 block text-xs text-muted">{field.label}</label>
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
                      {isSaved && <span className="ml-3 text-xs text-green-400">Saved</span>}
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
        ))}
      </div>
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
    <div className="max-w-2xl">
      <div className="rounded-xl border border-card-border bg-card p-6 shadow-sm dark:shadow-none">
        <h2 className="text-sm font-semibold text-foreground">Card Reader (Stripe Terminal)</h2>
        <p className="mt-0.5 text-xs text-muted">
          Connect a physical card reader to accept in-person card payments.
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
                  <p className="text-xs text-muted">
                    Enter the code shown on your Stripe Terminal reader screen. The reader must be powered on and in pairing mode.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
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
      {resetting ? "Resetting..." : done ? "Reader cleared ✓" : "Reset Reader"}
    </button>
  );
}
