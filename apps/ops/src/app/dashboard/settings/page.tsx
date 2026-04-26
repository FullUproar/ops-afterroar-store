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
import { SubNav } from "@/components/ui/sub-nav";
import { CustomTagsPanel, type CustomTag } from "@/components/settings/custom-tags-panel";
import { QuickItemsPanel, type QuickItem } from "@/components/settings/quick-items-panel";
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const SETTINGS_TABS = [
  { href: '/dashboard/settings', label: 'Settings' },
  { href: '/dashboard/help', label: 'Help Center' },
];

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

const TABS: { key: TabKey; label: string; description: string }[] = [
  { key: 'store', label: 'Store', description: 'Identity, tax, checkout, and receipt settings' },
  { key: 'payments', label: 'Payments', description: 'Stripe, card reader, and payment methods' },
  { key: 'staff', label: 'Staff', description: 'Roles, permissions, and mobile access' },
  { key: 'integrations', label: 'Integrations', description: 'Afterroar Network, Shopify, and external connections' },
  { key: 'intelligence', label: 'Intelligence', description: 'Store advisor, cash flow, and monthly fixed costs' },
  { key: 'operations', label: 'Operations', description: 'Cafe, loyalty, promotions, and appearance' },
  { key: 'test-mode', label: 'Test Mode', description: 'Training mode, demo data, and testing tools' },
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
/*  Shared visual primitives — Operator Console styled                 */
/* ------------------------------------------------------------------ */

/** Operator panel — the main "group" container for setting groups. */
function Panel({
  num,
  eyebrow,
  title,
  desc,
  action,
  children,
}: {
  num?: string;
  eyebrow?: string;
  title: string;
  desc?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="border border-rule bg-panel mb-5">
      <header
        className="px-5 pt-4 pb-3 border-b border-rule bg-panel-mute"
        style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}
      >
        <div className="min-w-0">
          {(num || eyebrow) && (
            <div
              className="font-mono text-ink-faint mb-1.5 flex items-center gap-1.5"
              style={{ fontSize: '0.6rem', letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 600 }}
            >
              {num && <span className="text-orange font-bold">{num}</span>}
              {eyebrow && <span>{eyebrow}</span>}
            </div>
          )}
          <h3
            className="font-display text-ink leading-none"
            style={{ fontWeight: 600, fontSize: '1.1rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}
          >
            {title}
          </h3>
          {desc && (
            <p className="text-ink-soft mt-1.5" style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>
              {desc}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div>{children}</div>
    </section>
  );
}

/** Settings row — label/help on left, control on right. >= 64px tall. */
function SettingRow({
  label,
  help,
  control,
  required,
  isLast,
}: {
  label: React.ReactNode;
  help?: React.ReactNode;
  control: React.ReactNode;
  required?: boolean;
  isLast?: boolean;
}) {
  return (
    <div
      className={`px-5 py-4 ${isLast ? '' : 'border-b border-rule-faint'}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr minmax(220px, 320px)',
        alignItems: 'center',
        gap: '1.25rem',
        minHeight: 64,
      }}
    >
      <div>
        <div className="text-ink" style={{ fontSize: '0.95rem', fontWeight: 500 }}>
          {label}
          {required && (
            <span className="text-orange ml-1 font-mono" style={{ fontSize: '0.7em' }}>
              *
            </span>
          )}
        </div>
        {help && (
          <div className="text-ink-soft mt-1" style={{ fontSize: '0.8rem', lineHeight: 1.5 }}>
            {help}
          </div>
        )}
      </div>
      <div className="flex items-center justify-end">{control}</div>
    </div>
  );
}

/** Operator console toggle — 48×26, teal when on, yellow variant for "warn/live". */
function ConsoleToggle({
  on,
  onClick,
  warn,
  ariaLabel,
}: {
  on: boolean;
  onClick: () => void;
  warn?: boolean;
  ariaLabel?: string;
}) {
  const trackBorder = on ? (warn ? 'var(--yellow)' : 'var(--teal)') : 'var(--rule-hi)';
  const trackBg = on ? (warn ? 'var(--yellow-mute)' : 'var(--teal-mute)') : 'var(--panel-mute)';
  const knobBg = on ? (warn ? 'var(--yellow)' : 'var(--teal)') : 'var(--ink-soft)';
  const lblColor = on ? (warn ? 'var(--yellow)' : 'var(--teal)') : 'var(--ink-soft)';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={on}
      className="inline-flex items-center gap-2.5 cursor-pointer p-2 -m-2"
    >
      <span
        style={{
          width: 48,
          height: 26,
          border: `1px solid ${trackBorder}`,
          background: trackBg,
          position: 'relative',
          transition: 'background .2s, border-color .2s',
          display: 'inline-block',
        }}
      >
        <span
          style={{
            content: '""',
            position: 'absolute',
            top: 2,
            left: 2,
            width: 20,
            height: 20,
            background: knobBg,
            transform: on ? 'translateX(22px)' : 'translateX(0)',
            transition: 'transform .2s, background .2s',
            display: 'block',
          }}
        />
      </span>
      <span
        className="font-mono"
        style={{
          fontSize: '0.65rem',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: lblColor,
          fontWeight: 600,
          minWidth: 32,
        }}
      >
        {on ? (warn ? 'Live' : 'On') : 'Off'}
      </span>
    </button>
  );
}

/** Console input — 44px min, panel-mute background, orange focus border. */
function ConsoleInput({
  mono,
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  return (
    <input
      {...props}
      className={`w-full bg-panel-mute border border-rule-hi text-ink outline-none transition-colors focus:border-orange ${mono ? 'font-mono' : ''} ${className}`}
      style={{
        fontSize: '0.92rem',
        padding: '0.65rem 0.85rem',
        minHeight: 44,
        ...(props.style ?? {}),
      }}
    />
  );
}

/** Console select — 44px min, custom chevron. */
function ConsoleSelect({
  className = '',
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full bg-panel-mute border border-rule-hi text-ink outline-none transition-colors focus:border-orange appearance-none ${className}`}
      style={{
        fontSize: '0.92rem',
        padding: '0.65rem 2rem 0.65rem 0.85rem',
        minHeight: 44,
        backgroundImage:
          "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23a8adb8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.7rem center',
        backgroundSize: '14px',
        ...(props.style ?? {}),
      }}
    />
  );
}

/** Save / status bar — pinned bottom of content. Yellow indicator when saving/dirty, teal when just saved, red on error. */
function StatusBar({
  saving,
  saved,
  error,
  onDiscard,
}: {
  saving: string | null;
  saved: string | null;
  error: string;
  onDiscard?: () => void;
}) {
  const visible = saving || saved || error;
  if (!visible) return null;

  let kind: 'saving' | 'saved' | 'error' = 'saving';
  if (error) kind = 'error';
  else if (saving) kind = 'saving';
  else if (saved) kind = 'saved';

  const palette = {
    saving: { text: 'var(--yellow)', label: 'Saving' },
    saved: { text: 'var(--teal)', label: 'Saved' },
    error: { text: 'var(--red)', label: 'Error' },
  }[kind];

  return (
    <div
      className="sticky bottom-0 z-20 flex items-center justify-between gap-4 bg-slate"
      style={{
        padding: '0.75rem 1.25rem',
        borderTop: '1px solid var(--rule)',
      }}
    >
      <span
        className="font-mono inline-flex items-center gap-2"
        style={{
          fontSize: '0.7rem',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: palette.text,
          fontWeight: 600,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            background: palette.text,
            borderRadius: '50%',
          }}
        />
        {palette.label}
        {kind === 'saving' && saving ? (
          <span className="text-ink-soft">· {saving}</span>
        ) : null}
        {kind === 'saved' && saved ? (
          <span className="text-ink-soft">· {saved}</span>
        ) : null}
        {kind === 'error' && error ? (
          <span className="text-ink">· {error}</span>
        ) : null}
      </span>
      {onDiscard && kind === 'error' && (
        <button
          onClick={onDiscard}
          className="font-display uppercase border border-rule-hi text-ink-soft hover:text-ink hover:border-ink-faint hover:bg-panel transition-colors"
          style={{
            fontSize: '0.85rem',
            letterSpacing: '0.06em',
            fontWeight: 600,
            padding: '0.55rem 1rem',
            minHeight: 40,
            background: 'transparent',
          }}
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

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
        <p
          className="font-mono text-ink-faint"
          style={{ fontSize: '0.7rem', letterSpacing: '0.22em', textTransform: 'uppercase' }}
        >
          Loading settings…
        </p>
      </div>
    );
  }

  if (!can('store.settings')) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p
          className="font-mono text-ink-faint"
          style={{ fontSize: '0.7rem', letterSpacing: '0.22em', textTransform: 'uppercase' }}
        >
          You don&apos;t have permission to view settings.
        </p>
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
  function getTabSummary(tab: TabKey): {
    status: 'configured' | 'needs-setup' | 'info';
    summary: string;
    badge?: { kind: 'warn' | 'err' | 'ok'; text: string };
  } {
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
          badge: !hasName || !hasTax ? { kind: 'warn', text: 'Setup' } : { kind: 'ok', text: 'Ready' },
        };
      }
      case 'payments': {
        const hasStripe = !!((store?.settings as Record<string, unknown>)?.stripe_connected_account_id);
        return {
          status: hasStripe ? 'configured' : 'needs-setup',
          summary: hasStripe ? 'Stripe connected' : 'No payment processor connected',
          badge: hasStripe ? { kind: 'ok', text: 'Live' } : { kind: 'err', text: 'Setup' },
        };
      }
      case 'staff':
        return { status: 'info', summary: 'Permissions, mobile register, time clock' };
      case 'integrations': {
        const hasShopify = !!((store?.settings as Record<string, unknown>)?.shopify_store_domain);
        const hasAfterroar = !!((store?.settings as Record<string, unknown>)?.venueName);
        const parts: string[] = [];
        if (hasAfterroar) parts.push('Afterroar linked');
        if (hasShopify) parts.push('Shopify connected');
        if (parts.length === 0) parts.push('No integrations connected');
        const linked = hasShopify || hasAfterroar;
        return {
          status: linked ? 'configured' : 'info',
          summary: parts.join(' · '),
          badge: linked ? { kind: 'ok', text: `${[hasShopify, hasAfterroar].filter(Boolean).length}` } : undefined,
        };
      }
      case 'intelligence':
        return {
          status: 'info',
          summary: `Advisor tone: ${settings.intel_advisor_tone ?? 'default'} · Thresholds configured`,
        };
      case 'operations': {
        const parts: string[] = [];
        if (settings.loyalty_enabled) parts.push('Loyalty on');
        if ((settings as unknown as Record<string, unknown>).cafe_enabled) parts.push('Café on');
        if (parts.length === 0) parts.push('Loyalty, promotions, café');
        return { status: 'info', summary: parts.join(' · ') };
      }
      case 'test-mode':
        return {
          status: 'info',
          summary: isTraining ? 'Training mode active' : 'Training mode off',
          badge: isTraining ? { kind: 'warn', text: 'Live' } : undefined,
        };
      default:
        return { status: 'info', summary: '' };
    }
  }

  // ── OVERVIEW: settings hub (when at /dashboard/settings root) ──
  if (isOverview) {
    return (
      <div className="flex flex-col h-full">
        <SubNav items={SETTINGS_TABS} />
        <PageHeader
          title="Settings"
          crumb={`Settings · ${store?.name ?? 'Store'}`}
          desc="Configure how the register behaves, what the customer sees, and what each device does. Changes save per-store."
          backHref="/dashboard"
        />

        {error && (
          <div
            className="mb-4 border border-red-fu/30 bg-red-fu/10 text-red-fu px-4 py-3 font-mono"
            style={{ fontSize: '0.78rem', letterSpacing: '0.06em' }}
          >
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pb-8">
          {TABS.map((tab) => {
            const { status, summary, badge } = getTabSummary(tab.key);
            const needsSetup = status === 'needs-setup';
            const borderColor = needsSetup ? 'border-yellow/40 hover:border-yellow' : 'border-rule hover:border-orange/50';
            const bgColor = needsSetup ? 'bg-yellow/5 hover:bg-yellow/10' : 'bg-panel hover:bg-panel-hi';

            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`ar-stripe text-left border transition-all active:scale-[0.99] ${borderColor} ${bgColor}`}
                style={{ padding: '1.1rem 1.15rem', minHeight: 120 }}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <span
                    className="font-mono uppercase text-ink-faint"
                    style={{ fontSize: '0.58rem', letterSpacing: '0.3em', fontWeight: 600 }}
                  >
                    {tab.key.toUpperCase().replace('-', ' ')}
                  </span>
                  {badge && (
                    <span
                      className="font-mono uppercase border"
                      style={{
                        fontSize: '0.58rem',
                        letterSpacing: '0.14em',
                        fontWeight: 700,
                        padding: '2px 6px',
                        color:
                          badge.kind === 'warn'
                            ? 'var(--yellow)'
                            : badge.kind === 'err'
                              ? 'var(--red)'
                              : 'var(--teal)',
                        borderColor:
                          badge.kind === 'warn'
                            ? 'rgba(251,219,101,.35)'
                            : badge.kind === 'err'
                              ? 'rgba(214,90,90,.35)'
                              : 'rgba(94,176,155,.35)',
                        background:
                          badge.kind === 'warn'
                            ? 'var(--yellow-mute)'
                            : badge.kind === 'err'
                              ? 'var(--red-mute)'
                              : 'var(--teal-mute)',
                      }}
                    >
                      {badge.text}
                    </span>
                  )}
                </div>
                <h3
                  className="font-display text-ink leading-tight mb-1.5"
                  style={{ fontWeight: 600, fontSize: '1.25rem', letterSpacing: '0.02em' }}
                >
                  {tab.label}
                </h3>
                <p className="text-ink-soft line-clamp-2" style={{ fontSize: '0.82rem', lineHeight: 1.55 }}>
                  {summary || tab.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── SUB-PAGE VIEW ──
  const activeTabMeta = TABS.find((t) => t.key === activeTab);
  const activeSectionMeta = activeSection ? tabSections.find((s) => s.key === activeSection) : null;

  // Build tab strip items for the horizontal nav
  const tabStripItems = TABS.map((t) => {
    const summary = getTabSummary(t.key);
    const item: {
      href: string;
      label: string;
      badge?: { kind: 'warn' | 'err' | 'live'; text: string };
    } = { href: `/dashboard/settings/${t.key}`, label: t.label };
    if (summary.badge) {
      if (summary.badge.kind === 'warn') item.badge = { kind: 'warn', text: summary.badge.text };
      else if (summary.badge.kind === 'err') item.badge = { kind: 'err', text: summary.badge.text };
      else item.badge = { kind: 'live', text: summary.badge.text };
    }
    return item;
  });

  return (
    <div className="flex flex-col h-full">
      <SubNav items={SETTINGS_TABS} />

      <PageHeader
        title={activeSectionMeta?.label ?? activeTabMeta?.label ?? 'Settings'}
        crumb={
          activeSectionMeta
            ? `Settings · ${activeTabMeta?.label} · ${activeSectionMeta.label}`
            : `Settings · ${activeTabMeta?.label}`
        }
        desc={activeSectionMeta?.description ?? activeTabMeta?.description}
        backHref={activeSection ? undefined : '/dashboard/settings'}
        action={
          activeSection ? (
            <button
              onClick={() => setActiveSection(null)}
              className="font-mono uppercase border border-rule-hi text-ink-soft hover:text-ink hover:border-ink-faint hover:bg-panel transition-colors"
              style={{
                fontSize: '0.65rem',
                letterSpacing: '0.18em',
                fontWeight: 600,
                padding: '0.6rem 0.95rem',
                minHeight: 44,
                background: 'transparent',
              }}
            >
              ← Back
            </button>
          ) : null
        }
      />

      {/* Tab strip — settings categories */}
      <SubNav items={tabStripItems} />

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-8" style={{ minHeight: 0 }}>
        {error && (
          <div
            className="mb-4 border border-red-fu/30 bg-red-fu/10 text-red-fu px-4 py-3 font-mono"
            style={{ fontSize: '0.78rem', letterSpacing: '0.06em' }}
          >
            {error}
          </div>
        )}

        <div className="max-w-4xl">
          {/* ════════════════ STORE TAB ════════════════ */}
          {activeTab === 'store' && !activeSection && (
            <SectionTileGrid
              sections={[
                ...tabSections.map((s) => ({
                  key: s.key,
                  label: s.label,
                  summary: sectionSummary(s, settings),
                })),
                {
                  key: 'custom_tags',
                  label: 'Custom Tags',
                  summary: (() => {
                    const ct = (settings.custom_tags ?? []) as CustomTag[];
                    return ct.length === 0
                      ? 'Define your own merchandising labels'
                      : `${ct.length} tag${ct.length === 1 ? '' : 's'} defined`;
                  })(),
                },
              ]}
              onSelect={setActiveSection}
            />
          )}
          {activeTab === 'store' && activeSection && activeSection !== 'custom_tags' && (
            <>
              {tabSections
                .filter((s) => s.key === activeSection)
                .map((section, i) => (
                  <SettingsSection
                    key={section.key}
                    section={section}
                    num={String(i + 1).padStart(2, '0')}
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
          {activeTab === 'store' && activeSection === 'custom_tags' && (
            <Panel
              num="01"
              eyebrow="Merchandising"
              title="Custom Tags"
              desc="Store-defined labels you can apply to inventory and target with promotions. Use these for distributor exclusives, clearance, staff picks, holiday themes, or anything else specific to how you merchandise."
            >
              <CustomTagsPanel
                value={(settings.custom_tags ?? []) as CustomTag[]}
                saving={saving === 'custom_tags'}
                onChange={(next) => {
                  updateLocal('custom_tags' as keyof StoreSettings, next as unknown as StoreSettings[keyof StoreSettings]);
                  saveField('custom_tags', next);
                }}
              />
            </Panel>
          )}

          {/* ════════════════ PAYMENTS TAB ════════════════ */}
          {activeTab === 'payments' && !activeSection && (
            <SectionTileGrid
              sections={[
                {
                  key: 'stripe',
                  label: 'Stripe Connect',
                  summary: stripeStatus?.connected
                    ? stripeStatus.charges_enabled
                      ? 'Connected & active'
                      : 'Connected, pending setup'
                    : 'Not connected',
                  badge: stripeStatus?.connected
                    ? stripeStatus.charges_enabled
                      ? { kind: 'ok', text: 'Live' }
                      : { kind: 'warn', text: 'Pending' }
                    : { kind: 'err', text: 'Setup' },
                },
                {
                  key: 'terminal',
                  label: 'Card Reader',
                  summary: 'Stripe Terminal S710 configuration',
                },
                ...tabSections.map((s) => ({
                  key: s.key,
                  label: s.label,
                  summary: s.description,
                })),
              ]}
              onSelect={setActiveSection}
            />
          )}
          {activeTab === 'payments' && activeSection === 'stripe' && (
            <Panel
              num="01"
              eyebrow="Payment Processor"
              title="Stripe Connect"
              desc="Accept card payments via Stripe. Stripe handles processing — we add nothing on top."
            >
              <div className="px-5 py-5">
                {stripeLoading ? (
                  <p className="text-ink-soft" style={{ fontSize: '0.88rem' }}>
                    Checking Stripe status…
                  </p>
                ) : stripeStatus?.connected ? (
                  <div className="space-y-3">
                    <StatusPill
                      kind={stripeStatus.charges_enabled ? 'ok' : 'warn'}
                      label={stripeStatus.charges_enabled ? 'Connected' : 'Pending Setup'}
                    />
                    {stripeStatus.business_profile?.name && (
                      <p className="text-ink" style={{ fontSize: '0.92rem' }}>
                        {stripeStatus.business_profile.name}
                      </p>
                    )}
                    <dl className="font-mono space-y-1 text-ink-soft" style={{ fontSize: '0.78rem' }}>
                      <div>
                        <span className="text-ink-faint">Account · </span>
                        <span className="text-ink">{stripeStatus.account_id}</span>
                      </div>
                      <div>
                        <span className="text-ink-faint">Charges · </span>
                        <span className={stripeStatus.charges_enabled ? 'text-teal' : 'text-yellow'}>
                          {stripeStatus.charges_enabled ? 'Enabled' : 'Not yet enabled'}
                        </span>
                      </div>
                      <div>
                        <span className="text-ink-faint">Payouts · </span>
                        <span className={stripeStatus.payouts_enabled ? 'text-teal' : 'text-yellow'}>
                          {stripeStatus.payouts_enabled ? 'Enabled' : 'Not yet enabled'}
                        </span>
                      </div>
                    </dl>
                    {stripeStatus.details_submitted === false && (
                      <p className="text-yellow" style={{ fontSize: '0.82rem' }}>
                        Complete your Stripe onboarding to start accepting payments.
                      </p>
                    )}
                    <div className="flex gap-2 pt-2">
                      {stripeStatus.details_submitted === false && (
                        <PrimaryButton onClick={startStripeOnboarding} disabled={stripeConnecting}>
                          {stripeConnecting ? 'Loading…' : 'Complete Onboarding'}
                        </PrimaryButton>
                      )}
                      <a
                        href="https://dashboard.stripe.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-display uppercase border border-rule-hi text-ink hover:bg-panel-hi transition-colors inline-flex items-center gap-2"
                        style={{
                          fontSize: '0.85rem',
                          letterSpacing: '0.06em',
                          fontWeight: 600,
                          padding: '0.6rem 1rem',
                          minHeight: 44,
                          background: 'transparent',
                          textDecoration: 'none',
                        }}
                      >
                        Stripe Dashboard <span className="text-ink-soft">↗</span>
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <StatusPill kind="off" label="No Stripe account connected" />
                    <p className="text-ink-soft" style={{ fontSize: '0.85rem', lineHeight: 1.55 }}>
                      Connect your own Stripe account to receive payments directly. Takes about 5 minutes.
                      Stripe charges their standard processing rate — we don&apos;t add any markup.
                    </p>
                    <PrimaryButton onClick={startStripeOnboarding} disabled={stripeConnecting} large>
                      {stripeConnecting ? 'Connecting…' : 'Connect Stripe'}
                    </PrimaryButton>
                  </div>
                )}
              </div>
            </Panel>
          )}
          {activeTab === 'payments' && activeSection === 'terminal' && <TerminalReaderSection />}
          {activeTab === 'payments' && activeSection && activeSection !== 'stripe' && activeSection !== 'terminal' && (
            <>
              {tabSections
                .filter((s) => s.key === activeSection)
                .map((section, i) => (
                  <SettingsSection
                    key={section.key}
                    section={section}
                    num={String(i + 1).padStart(2, '0')}
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
          {activeTab === 'staff' && !activeSection && (
            <SectionTileGrid
              sections={[
                { key: 'permissions', label: 'Role Permissions', summary: 'Customize what each role can access' },
                { key: 'phone_access', label: 'Employee Phone Access', summary: 'Clock in/out and mobile register links' },
                ...tabSections.map((s) => ({ key: s.key, label: s.label, summary: s.description })),
                { key: 'geofence', label: 'Time Clock & Geofence', summary: 'GPS tagging on clock-in' },
              ]}
              onSelect={setActiveSection}
            />
          )}
          {activeTab === 'staff' && activeSection === 'permissions' && (
            <Panel
              num="01"
              eyebrow="Access Control"
              title="Role Permissions"
              desc="Customize what each role can access. Owner always has full access. Changes apply immediately."
            >
              <div className="px-5 py-5">
                <PermissionsEditor />
              </div>
            </Panel>
          )}
          {activeTab === 'staff' && activeSection === 'phone_access' && store?.slug && (
            <Panel
              num="02"
              eyebrow="Mobile"
              title="Employee Phone Access"
              desc="Share these links with your team. They work on any phone — no app download needed. Employees use their PIN to clock in and sell."
            >
              <div className="px-5 py-5 space-y-3">
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
            </Panel>
          )}
          {activeTab === 'staff' && activeSection === 'geofence' && (
            <GeofenceSection
              settings={settings}
              saving={saving}
              saved={saved}
              updateLocal={updateLocal}
              saveField={saveField}
            />
          )}
          {activeTab === 'staff' && activeSection && !['permissions', 'phone_access', 'geofence'].includes(activeSection) && (
            <>
              {tabSections
                .filter((s) => s.key === activeSection)
                .map((section, i) => (
                  <SettingsSection
                    key={section.key}
                    section={section}
                    num={String(i + 1).padStart(2, '0')}
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

          {/* ════════════════ INTEGRATIONS TAB ════════════════ */}
          {activeTab === 'integrations' && (
            <>
              {/* Afterroar Network */}
              <Panel
                num="01"
                eyebrow="Network"
                title="Afterroar Network"
                desc="Connect to the Afterroar Network to sync events, enable QR check-ins, link player identities, and participate in cross-store leaderboards."
              >
                <div className="px-5 py-5">
                  {venueId ? (
                    <div className="space-y-3">
                      <StatusPill kind="ok" label="Connected" />
                      <p className="text-ink" style={{ fontSize: '0.92rem' }}>
                        to {connectedVenueName || 'Afterroar Network'}
                      </p>
                      <ul className="text-ink-soft space-y-1" style={{ fontSize: '0.82rem', lineHeight: 1.55 }}>
                        <li>· Events you create as &quot;Afterroar Events&quot; will appear on your store page.</li>
                        <li>· Player RSVPs are visible in the check-in list.</li>
                        <li>· Loyalty points sync to the Afterroar wallet for linked customers.</li>
                      </ul>
                      <button
                        onClick={disconnectVenue}
                        disabled={disconnecting}
                        className="font-display uppercase border border-rule-hi text-ink-soft hover:text-ink hover:border-ink-faint hover:bg-panel transition-colors disabled:opacity-50"
                        style={{
                          fontSize: '0.8rem',
                          letterSpacing: '0.06em',
                          fontWeight: 600,
                          padding: '0.55rem 0.95rem',
                          minHeight: 44,
                          background: 'transparent',
                        }}
                      >
                        {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-ink-soft" style={{ fontSize: '0.88rem', lineHeight: 1.55 }}>
                        Is your store listed on the Afterroar Network? Connect it to enable event sync, QR check-ins, and player identity linking.
                      </p>
                      <p className="text-ink-faint" style={{ fontSize: '0.78rem', lineHeight: 1.55 }}>
                        The Afterroar Network connects game stores and players. Customers earn loyalty points that work across participating stores. Events get online RSVPs and your store appears in the store finder.
                      </p>
                      <div className="relative">
                        <label
                          className="font-mono uppercase block mb-1.5 text-ink-faint"
                          style={{ fontSize: '0.6rem', letterSpacing: '0.22em', fontWeight: 600 }}
                        >
                          Search by store name
                        </label>
                        <ConsoleInput
                          type="text"
                          placeholder="Search stores…"
                          value={venueSearch}
                          onChange={(e) => setVenueSearch(e.target.value)}
                        />
                        {searchingVenues && (
                          <p className="mt-1 text-ink-faint font-mono" style={{ fontSize: '0.7rem', letterSpacing: '0.18em' }}>
                            Searching…
                          </p>
                        )}
                        {venueResults.length > 0 && (
                          <div
                            className="absolute z-10 mt-1 w-full bg-panel border border-rule-hi shadow-lg max-h-56 overflow-y-auto scroll-visible"
                          >
                            {venueResults.map((v) => (
                              <button
                                key={v.id}
                                onClick={() => connectVenue(v.id)}
                                disabled={connecting}
                                className="w-full text-left text-ink hover:bg-panel-hi flex justify-between items-center transition-colors border-b border-rule-faint last:border-b-0"
                                style={{ padding: '0.65rem 0.85rem', fontSize: '0.88rem', minHeight: 44 }}
                              >
                                <span>{v.name}</span>
                                <span className="text-ink-faint font-mono" style={{ fontSize: '0.72rem' }}>
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
                          className="font-mono uppercase text-ink-soft hover:text-ink transition-colors"
                          style={{ fontSize: '0.65rem', letterSpacing: '0.18em', fontWeight: 600 }}
                        >
                          {showManualInput ? 'Hide manual input' : 'Or enter Store ID manually'}
                        </button>
                        {showManualInput && (
                          <div className="mt-3 flex gap-2">
                            <ConsoleInput
                              mono
                              type="text"
                              placeholder="Store ID"
                              value={manualVenueId}
                              onChange={(e) => setManualVenueId(e.target.value)}
                            />
                            <PrimaryButton
                              onClick={() => manualVenueId && connectVenue(manualVenueId)}
                              disabled={connecting || !manualVenueId}
                            >
                              {connecting ? 'Connecting…' : 'Connect'}
                            </PrimaryButton>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </Panel>

              <ShopifyConnectionSection />

              {/* Pointer panels — non-editable hints */}
              <div
                className="border border-dashed border-rule-hi bg-panel-mute mb-5 px-5 py-4 text-center text-ink-soft"
                style={{ fontSize: '0.85rem' }}
              >
                eBay and marketplace integrations are managed on the{' '}
                <Link href="/dashboard/singles/ebay" className="text-orange hover:underline">
                  eBay Listings page
                </Link>
                .
              </div>
              <div
                className="border border-dashed border-rule-hi bg-panel-mute mb-5 px-5 py-4 text-center text-ink-soft"
                style={{ fontSize: '0.85rem' }}
              >
                Plan, add-ons, and billing are managed on the{' '}
                <Link href="/dashboard/billing" className="text-orange hover:underline">
                  Subscription page
                </Link>
                .
              </div>
            </>
          )}

          {/* ════════════════ INTELLIGENCE TAB ════════════════ */}
          {activeTab === 'intelligence' && !activeSection && (
            <SectionTileGrid
              sections={tabSections.map((s) => ({
                key: s.key,
                label: s.label,
                summary: sectionSummary(s, settings),
              }))}
              onSelect={setActiveSection}
            />
          )}
          {activeTab === 'intelligence' && activeSection && (
            <>
              {tabSections
                .filter((s) => s.key === activeSection)
                .map((section, i) => (
                  <SettingsSection
                    key={section.key}
                    section={section}
                    num={String(i + 1).padStart(2, '0')}
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
          {activeTab === 'operations' && !activeSection && (
            <SectionTileGrid
              sections={[
                ...tabSections.map((s) => ({
                  key: s.key,
                  label: s.label,
                  summary: sectionSummary(s, settings),
                })),
                {
                  key: 'quick_items',
                  label: 'Register Quick Buttons',
                  summary: (() => {
                    const qi = (settings.quick_items ?? []) as QuickItem[];
                    return qi.length === 0
                      ? 'Auto-fills from top sellers — configure to override'
                      : `${qi.length} button${qi.length === 1 ? '' : 's'} configured`;
                  })(),
                },
                {
                  key: 'appearance',
                  label: 'Appearance',
                  summary: `Theme: ${theme === 'system' ? 'System' : theme === 'dark' ? 'Dark' : 'Light'}`,
                },
              ]}
              onSelect={setActiveSection}
            />
          )}
          {activeTab === 'operations' && activeSection === 'quick_items' && (
            <Panel
              num="01"
              eyebrow="Register"
              title="Quick Buttons"
              desc="The tap-to-add tiles on the register screen. Curate them for the items you sell most often, or leave it empty to let the register auto-fill from your top sellers."
            >
              <QuickItemsPanel
                value={(settings.quick_items ?? []) as QuickItem[]}
                saving={saving === 'quick_items'}
                onChange={(next) => {
                  updateLocal('quick_items' as keyof StoreSettings, next as unknown as StoreSettings[keyof StoreSettings]);
                  saveField('quick_items', next);
                }}
              />
            </Panel>
          )}
          {activeTab === 'operations' && activeSection && activeSection !== 'appearance' && activeSection !== 'quick_items' && (
            <>
              {tabSections
                .filter((s) => s.key === activeSection)
                .map((section, i) => (
                  <SettingsSection
                    key={section.key}
                    section={section}
                    num={String(i + 1).padStart(2, '0')}
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
          {activeTab === 'operations' && activeSection === 'appearance' && (
            <Panel
              num="01"
              eyebrow="Display"
              title="Appearance"
              desc="Choose your preferred color theme. Applies to this device only."
            >
              <div className="px-5 py-5">
                <div className="inline-flex border border-rule-hi bg-panel-mute">
                  {(
                    [
                      { value: 'light' as const, label: 'Light' },
                      { value: 'dark' as const, label: 'Dark' },
                      { value: 'system' as const, label: 'System' },
                    ]
                  ).map((opt, idx, arr) => {
                    const active = theme === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setTheme(opt.value)}
                        className="font-mono uppercase transition-colors"
                        style={{
                          padding: '0.65rem 1rem',
                          fontSize: '0.7rem',
                          letterSpacing: '0.16em',
                          fontWeight: 600,
                          minHeight: 44,
                          color: active ? 'var(--void)' : 'var(--ink-soft)',
                          background: active ? 'var(--orange)' : 'transparent',
                          borderRight: idx < arr.length - 1 ? '1px solid var(--rule-hi)' : 'none',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Panel>
          )}

          {/* ════════════════ TEST MODE TAB ════════════════ */}
          {activeTab === 'test-mode' && (
            <>
              {(effectiveRole === 'owner' || isGodAdmin) && (
                <Panel
                  num="01"
                  eyebrow={isTraining ? 'Active' : 'Sandbox'}
                  title="Training Mode"
                  desc="Practice without affecting real data. Transactions are tagged and excluded from reports."
                  action={
                    <ConsoleToggle
                      warn
                      on={isTraining}
                      ariaLabel="Toggle training mode"
                      onClick={async () => {
                        const goingOff = isTraining;
                        setTraining(!isTraining);
                        if (goingOff) {
                          try {
                            await fetch('/api/store/seed-demo', {
                              method: 'DELETE',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({}),
                            });
                          } catch {
                            /* ignore */
                          }
                        }
                      }}
                    />
                  }
                >
                  {isTraining && (
                    <div className="px-5 py-5 space-y-4">
                      <p className="text-yellow font-mono" style={{ fontSize: '0.78rem', letterSpacing: '0.06em' }}>
                        Training mode is ON. All transactions are marked as training data.
                      </p>
                      <DemoDataButtons />
                    </div>
                  )}
                </Panel>
              )}

              {isGodAdmin && (
                <Panel
                  num="02"
                  eyebrow="Admin"
                  title="God Mode — Role Simulation"
                  desc="View the app as a different role. Sidebar and permissions will change immediately."
                >
                  <div className="px-5 py-5 space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          { value: null, label: 'Off (actual role)' },
                          { value: 'owner' as const, label: 'Owner' },
                          { value: 'manager' as const, label: 'Manager' },
                          { value: 'cashier' as const, label: 'Cashier' },
                        ] as const
                      ).map((opt) => {
                        const active = (isTestMode ? effectiveRole : null) === opt.value;
                        return (
                          <button
                            key={String(opt.value)}
                            onClick={() => setTestRole(opt.value as Role | null)}
                            className="font-mono uppercase transition-colors"
                            style={{
                              padding: '0.65rem 1rem',
                              fontSize: '0.7rem',
                              letterSpacing: '0.16em',
                              fontWeight: 600,
                              minHeight: 44,
                              color: active ? 'var(--void)' : 'var(--ink-soft)',
                              background: active ? 'var(--orange)' : 'transparent',
                              border: `1px solid ${active ? 'var(--orange)' : 'var(--rule-hi)'}`,
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    {isTestMode && (
                      <p className="text-orange font-mono" style={{ fontSize: '0.78rem', letterSpacing: '0.06em' }}>
                        Currently viewing as: <strong className="text-ink">{effectiveRole}</strong>
                      </p>
                    )}
                  </div>
                </Panel>
              )}
            </>
          )}
        </div>
      </div>

      <StatusBar saving={saving} saved={saved} error={error} onDiscard={() => setError('')} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section tile grid + helpers                                        */
/* ------------------------------------------------------------------ */

function sectionSummary(
  section: (typeof SETTINGS_SECTIONS)[number],
  settings: StoreSettings
): string {
  const fieldSummary = section.fields
    .slice(0, 2)
    .map((f) => {
      const val = settings[f.key as keyof StoreSettings];
      if (f.type === 'toggle') return `${f.label}: ${val ? 'On' : 'Off'}`;
      if (f.type === 'number' && val !== undefined) return `${f.label}: ${val}`;
      if (f.type === 'text' && val) return String(val).slice(0, 30);
      return null;
    })
    .filter(Boolean)
    .join(' · ');
  return fieldSummary || section.description;
}

function SectionTileGrid({
  sections,
  onSelect,
}: {
  sections: { key: string; label: string; summary: string; badge?: { kind: 'ok' | 'warn' | 'err'; text: string } }[];
  onSelect: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {sections.map((s) => (
        <button
          key={s.key}
          onClick={() => onSelect(s.key)}
          className="ar-stripe text-left border border-rule bg-panel hover:bg-panel-hi hover:border-orange/50 transition-all active:scale-[0.99]"
          style={{ padding: '1rem 1.1rem', minHeight: 96 }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span
              className="font-display text-ink uppercase leading-none"
              style={{ fontWeight: 600, fontSize: '1rem', letterSpacing: '0.05em' }}
            >
              {s.label}
            </span>
            <span
              className="font-mono text-ink-faint"
              style={{ fontSize: '0.7rem', letterSpacing: '0.18em' }}
            >
              →
            </span>
          </div>
          <p className="text-ink-soft line-clamp-2" style={{ fontSize: '0.82rem', lineHeight: 1.55 }}>
            {s.summary}
          </p>
          {s.badge && (
            <span
              className="font-mono uppercase border inline-block mt-2"
              style={{
                fontSize: '0.55rem',
                letterSpacing: '0.14em',
                fontWeight: 700,
                padding: '2px 5px',
                color:
                  s.badge.kind === 'warn'
                    ? 'var(--yellow)'
                    : s.badge.kind === 'err'
                      ? 'var(--red)'
                      : 'var(--teal)',
                borderColor:
                  s.badge.kind === 'warn'
                    ? 'rgba(251,219,101,.35)'
                    : s.badge.kind === 'err'
                      ? 'rgba(214,90,90,.35)'
                      : 'rgba(94,176,155,.35)',
                background:
                  s.badge.kind === 'warn'
                    ? 'var(--yellow-mute)'
                    : s.badge.kind === 'err'
                      ? 'var(--red-mute)'
                      : 'var(--teal-mute)',
              }}
            >
              {s.badge.text}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Status pill — small inline status indicator with icon + text       */
/* ------------------------------------------------------------------ */
function StatusPill({ kind, label }: { kind: 'ok' | 'warn' | 'err' | 'off'; label: string }) {
  const map = {
    ok: { color: 'var(--teal)', bg: 'var(--teal-mute)' },
    warn: { color: 'var(--yellow)', bg: 'var(--yellow-mute)' },
    err: { color: 'var(--red)', bg: 'var(--red-mute)' },
    off: { color: 'var(--ink-faint)', bg: 'var(--panel-mute)' },
  }[kind];
  return (
    <span
      className="font-mono uppercase inline-flex items-center gap-2 border"
      style={{
        fontSize: '0.7rem',
        letterSpacing: '0.18em',
        fontWeight: 600,
        padding: '0.4rem 0.7rem',
        color: map.color,
        borderColor: map.color,
        background: map.bg,
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: 7,
          height: 7,
          background: map.color,
          borderRadius: '50%',
        }}
      />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Primary CTA button                                                 */
/* ------------------------------------------------------------------ */
function PrimaryButton({
  children,
  onClick,
  disabled,
  large,
  type,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  large?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type ?? 'button'}
      onClick={onClick}
      disabled={disabled}
      className="font-display uppercase inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
      style={{
        background: 'var(--orange)',
        color: 'var(--void)',
        border: '1px solid var(--orange)',
        padding: large ? '0.85rem 1.4rem' : '0.65rem 1.1rem',
        minHeight: large ? 56 : 48,
        fontWeight: 600,
        fontSize: large ? '1rem' : '0.9rem',
        letterSpacing: '0.06em',
      }}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Reusable Settings Section Renderer                                 */
/* ------------------------------------------------------------------ */

interface SettingsSectionProps {
  section: (typeof SETTINGS_SECTIONS)[number];
  num?: string;
  settings: StoreSettings;
  saving: string | null;
  saved: string | null;
  updateLocal: (key: string, value: unknown) => void;
  saveField: (key: string, value: unknown) => Promise<void>;
  resetSection: (key: string) => Promise<void>;
}

function SettingsSection({ section, num, settings, saving, saved, updateLocal, saveField, resetSection }: SettingsSectionProps) {
  return (
    <Panel
      num={num ?? '01'}
      eyebrow="Settings"
      title={section.label}
      desc={section.description}
      action={
        <button
          onClick={() => resetSection(section.key)}
          className="font-mono uppercase text-ink-soft hover:text-ink transition-colors"
          style={{
            fontSize: '0.62rem',
            letterSpacing: '0.18em',
            fontWeight: 600,
            padding: '0.5rem 0.85rem',
            minHeight: 40,
            border: '1px solid var(--rule-hi)',
            background: 'transparent',
          }}
        >
          {saving === section.key ? 'Resetting…' : saved === section.key ? 'Reset!' : 'Reset to defaults'}
        </button>
      }
    >
      {section.fields.map((field, fieldIdx) => {
        const key = field.key as keyof StoreSettings;
        const value = settings[key];
        const isSaving = saving === field.key;
        const isSaved = saved === field.key;
        const isLast = fieldIdx === section.fields.length - 1;
        const fieldTooltip = 'tooltip' in field ? (field as { tooltip?: string }).tooltip : undefined;

        const labelNode = (
          <span className="inline-flex items-center gap-1.5">
            {field.label}
            {fieldTooltip && <HelpTooltip text={fieldTooltip} />}
            {isSaving && <span className="ml-2 text-yellow font-mono" style={{ fontSize: '0.6rem', letterSpacing: '0.18em' }}>SAVING</span>}
            {isSaved && <span className="ml-2 text-teal font-mono" style={{ fontSize: '0.6rem', letterSpacing: '0.18em' }}>SAVED</span>}
          </span>
        );

        if (field.type === 'text') {
          return (
            <SettingRow
              key={field.key}
              label={labelNode}
              isLast={isLast}
              control={
                <ConsoleInput
                  type="text"
                  value={String(value ?? '')}
                  placeholder={'placeholder' in field ? (field as { placeholder?: string }).placeholder : ''}
                  onChange={(e) => updateLocal(field.key, e.target.value)}
                  onBlur={(e) => saveField(field.key, e.target.value)}
                />
              }
            />
          );
        }

        if (field.type === 'number') {
          return (
            <SettingRow
              key={field.key}
              label={labelNode}
              isLast={isLast}
              control={
                <ConsoleInput
                  mono
                  type="number"
                  value={Number(value ?? 0)}
                  min={'min' in field ? (field as { min?: number }).min : undefined}
                  max={'max' in field ? (field as { max?: number }).max : undefined}
                  step={'step' in field ? (field as { step?: number }).step : undefined}
                  onChange={(e) => updateLocal(field.key, Number(e.target.value))}
                  onBlur={(e) => saveField(field.key, Number(e.target.value))}
                  className="tabular-nums"
                  style={{ textAlign: 'right' }}
                />
              }
            />
          );
        }

        if (field.type === 'toggle') {
          return (
            <SettingRow
              key={field.key}
              label={labelNode}
              isLast={isLast}
              control={
                <ConsoleToggle
                  on={Boolean(value)}
                  ariaLabel={field.label}
                  onClick={() => {
                    const newVal = !value;
                    updateLocal(field.key, newVal);
                    saveField(field.key, newVal);
                  }}
                />
              }
            />
          );
        }

        if (field.type === 'select' && 'options' in field) {
          return (
            <SettingRow
              key={field.key}
              label={labelNode}
              isLast={isLast}
              control={
                <ConsoleSelect
                  value={String(value ?? '')}
                  onChange={(e) => {
                    updateLocal(field.key, e.target.value);
                    saveField(field.key, e.target.value);
                  }}
                >
                  {(field as { options: Array<{ value: string; label: string }> }).options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </ConsoleSelect>
              }
            />
          );
        }

        if (field.type === 'multiselect' && 'options' in field) {
          const selected = Array.isArray(value) ? (value as string[]) : [];
          return (
            <div
              key={field.key}
              className={`px-5 py-4 ${isLast ? '' : 'border-b border-rule-faint'}`}
            >
              <div className="text-ink mb-3" style={{ fontSize: '0.95rem', fontWeight: 500 }}>
                {labelNode}
              </div>
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
                      className="font-mono uppercase transition-colors"
                      style={{
                        padding: '0.55rem 0.9rem',
                        fontSize: '0.7rem',
                        letterSpacing: '0.14em',
                        fontWeight: 600,
                        minHeight: 44,
                        color: isOn ? 'var(--void)' : 'var(--ink-soft)',
                        background: isOn ? 'var(--orange)' : 'transparent',
                        border: `1px solid ${isOn ? 'var(--orange)' : 'var(--rule-hi)'}`,
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        }

        return null;
      })}
    </Panel>
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
  const isCopied = saved === savedKey;
  return (
    <div
      className="flex items-center justify-between gap-3 border border-rule-faint bg-panel-mute"
      style={{ padding: '0.85rem 1rem', minHeight: 64 }}
    >
      <div className="min-w-0">
        <p className="text-ink" style={{ fontSize: '0.92rem', fontWeight: 500 }}>
          {label}
        </p>
        <p className="text-ink-soft mt-0.5" style={{ fontSize: '0.78rem' }}>
          {sublabel}
        </p>
      </div>
      <button
        onClick={() => {
          navigator.clipboard.writeText(`${window.location.origin}${path}`);
          setSaved(savedKey);
          setTimeout(() => setSaved(null), 2000);
        }}
        className="shrink-0 font-mono uppercase transition-colors"
        style={{
          fontSize: '0.65rem',
          letterSpacing: '0.18em',
          fontWeight: 600,
          padding: '0.55rem 0.95rem',
          minHeight: 44,
          color: isCopied ? 'var(--teal)' : 'var(--orange)',
          background: 'transparent',
          border: `1px solid ${isCopied ? 'var(--teal)' : 'var(--orange)'}`,
        }}
      >
        {isCopied ? 'Copied' : 'Copy Link'}
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
    <Panel
      num="02"
      eyebrow="Hardware"
      title="Card Reader (Stripe Terminal)"
      desc="Connect a physical card reader for in-person tap/chip/swipe payments. We support the Stripe S710."
    >
      <div className="px-5 py-5">
        {loading ? (
          <p className="text-ink-soft" style={{ fontSize: '0.88rem' }}>
            Checking reader status…
          </p>
        ) : readerStatus?.registered ? (
          <div className="space-y-3">
            <StatusPill kind="ok" label="Reader Connected" />
            <dl className="font-mono space-y-1 text-ink-soft" style={{ fontSize: '0.78rem' }}>
              <div><span className="text-ink-faint">Label · </span><span className="text-ink">{readerStatus.reader?.label}</span></div>
              <div><span className="text-ink-faint">Type · </span><span className="text-ink">{readerStatus.reader?.device_type}</span></div>
              <div><span className="text-ink-faint">Status · </span><span className="text-ink">{readerStatus.reader?.status}</span></div>
              {readerStatus.reader?.serial_number && (
                <div><span className="text-ink-faint">Serial · </span><span className="text-ink">{readerStatus.reader.serial_number}</span></div>
              )}
            </dl>
            <ResetReaderButton readerId={readerStatus.reader?.id} />
          </div>
        ) : (
          <div className="space-y-3">
            <StatusPill kind="off" label="No reader connected" />
            {!showForm ? (
              <PrimaryButton onClick={() => setShowForm(true)}>Register Reader</PrimaryButton>
            ) : (
              <div
                className="border border-rule-hi bg-panel-mute"
                style={{ padding: '1rem' }}
              >
                <div className="space-y-3">
                  <div>
                    <label
                      className="font-mono uppercase block mb-1.5 text-ink-faint"
                      style={{ fontSize: '0.6rem', letterSpacing: '0.22em', fontWeight: 600 }}
                    >
                      Registration Code
                    </label>
                    <ConsoleInput
                      mono
                      type="text"
                      value={regCode}
                      onChange={(e) => setRegCode(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") handleRegister();
                      }}
                      placeholder="e.g., sunny-cloud-dolphin"
                      autoFocus
                    />
                    <p className="mt-1.5 text-ink-faint" style={{ fontSize: '0.74rem', lineHeight: 1.5 }}>
                      Find this code on your card reader&apos;s screen. Power on the reader and wait for the pairing screen to appear.
                    </p>
                  </div>
                  <div>
                    <label
                      className="font-mono uppercase block mb-1.5 text-ink-faint"
                      style={{ fontSize: '0.6rem', letterSpacing: '0.22em', fontWeight: 600 }}
                    >
                      Label (optional)
                    </label>
                    <ConsoleInput
                      type="text"
                      value={regLabel}
                      onChange={(e) => setRegLabel(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      placeholder="Register 1"
                    />
                  </div>
                  {error && (
                    <div
                      className="border border-red-fu/30 bg-red-fu/10 text-red-fu font-mono"
                      style={{ fontSize: '0.78rem', padding: '0.55rem 0.85rem' }}
                    >
                      {error}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <PrimaryButton onClick={handleRegister} disabled={registering || !regCode.trim()}>
                      {registering && (
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      )}
                      {registering ? 'Registering…' : 'Register'}
                    </PrimaryButton>
                    <button
                      onClick={() => { setShowForm(false); setError(null); }}
                      className="font-display uppercase border border-rule-hi text-ink-soft hover:text-ink hover:bg-panel transition-colors"
                      style={{
                        fontSize: '0.85rem',
                        letterSpacing: '0.06em',
                        fontWeight: 600,
                        padding: '0.65rem 1.1rem',
                        minHeight: 48,
                        background: 'transparent',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
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
      className="font-mono uppercase transition-colors mt-2"
      style={{
        fontSize: '0.65rem',
        letterSpacing: '0.18em',
        fontWeight: 600,
        padding: '0.55rem 0.95rem',
        minHeight: 44,
        color: done ? 'var(--teal)' : 'var(--ink-soft)',
        background: 'transparent',
        border: `1px solid ${done ? 'var(--teal)' : 'var(--rule-hi)'}`,
      }}
    >
      {resetting ? 'Resetting…' : done ? 'Reader cleared' : 'Reset Reader'}
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
    <Panel
      num="03"
      eyebrow="Time Clock"
      title="Time Clock & Geofencing"
      desc='Tag employee clock-ins as "at store" or "remote" based on GPS. Never blocks clock-in — just tags it.'
      action={
        <ConsoleToggle
          on={enabled}
          ariaLabel="Toggle geofence"
          onClick={() => {
            const newVal = !enabled;
            updateLocal("timeclock_geofence_enabled", newVal);
            saveField("timeclock_geofence_enabled", newVal);
          }}
        />
      }
    >
      {enabled && (
        <div className="px-5 py-5 space-y-5">
          {/* GPS button — primary action */}
          <div
            className="border border-orange/30 bg-orange/5"
            style={{ padding: '1rem' }}
          >
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="text-ink" style={{ fontSize: '0.92rem', fontWeight: 500 }}>
                  Store Location
                </p>
                {hasLocation ? (
                  <p className="text-ink-soft font-mono mt-1" style={{ fontSize: '0.78rem' }}>
                    {lat}, {lng}
                  </p>
                ) : (
                  <p className="text-yellow mt-1 font-mono" style={{ fontSize: '0.78rem', letterSpacing: '0.06em' }}>
                    No location set. Tap the button from inside your store.
                  </p>
                )}
              </div>
              <PrimaryButton onClick={useCurrentLocation} disabled={locating}>
                {locating ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Locating…
                  </>
                ) : hasLocation ? (
                  'Update Location'
                ) : (
                  'Use Current Location'
                )}
              </PrimaryButton>
            </div>

            {gpsError && (
              <p className="mt-2 text-red-fu font-mono" style={{ fontSize: '0.78rem', letterSpacing: '0.06em' }}>
                {gpsError}
              </p>
            )}
            {gpsSuccess && (
              <p className="mt-2 text-teal font-mono" style={{ fontSize: '0.78rem', letterSpacing: '0.06em' }}>
                Location saved. Clock-ins within {radius}m of here will be tagged &quot;at store.&quot;
              </p>
            )}
          </div>

          {/* Map */}
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
            <label
              className="font-mono uppercase mb-2 flex items-center gap-1.5 text-ink-faint"
              style={{ fontSize: '0.6rem', letterSpacing: '0.22em', fontWeight: 600 }}
            >
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
                className="flex-1"
                style={{ accentColor: 'var(--orange)' }}
              />
              <span
                className="text-ink font-mono tabular-nums"
                style={{ fontSize: '0.92rem', fontWeight: 600, minWidth: 80, textAlign: 'right' }}
              >
                {radius >= 1000 ? `${(radius / 1000).toFixed(1)}km` : `${radius}m`}
              </span>
            </div>
            <p className="mt-1.5 text-ink-faint" style={{ fontSize: '0.74rem', lineHeight: 1.55 }}>
              ~{Math.round(radius * 3.281)}ft &middot;{' '}
              {radius <= 100
                ? 'Very tight — front door only'
                : radius <= 300
                  ? 'Standard — covers your building'
                  : radius <= 500
                    ? 'Relaxed — covers parking lot'
                    : 'Very wide — covers the block'}
            </p>
          </div>

          {/* Manual override */}
          <details>
            <summary
              className="font-mono uppercase text-ink-soft hover:text-ink cursor-pointer transition-colors"
              style={{ fontSize: '0.65rem', letterSpacing: '0.18em', fontWeight: 600 }}
            >
              Enter coordinates manually
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label
                  className="font-mono uppercase block mb-1.5 text-ink-faint"
                  style={{ fontSize: '0.6rem', letterSpacing: '0.22em', fontWeight: 600 }}
                >
                  Latitude
                </label>
                <ConsoleInput
                  mono
                  type="number"
                  value={lat}
                  min={-90}
                  max={90}
                  step={0.000001}
                  onChange={(e) => updateLocal("timeclock_geofence_lat", Number(e.target.value))}
                  onBlur={(e) => saveField("timeclock_geofence_lat", Number(e.target.value))}
                  className="tabular-nums"
                />
              </div>
              <div>
                <label
                  className="font-mono uppercase block mb-1.5 text-ink-faint"
                  style={{ fontSize: '0.6rem', letterSpacing: '0.22em', fontWeight: 600 }}
                >
                  Longitude
                </label>
                <ConsoleInput
                  mono
                  type="number"
                  value={lng}
                  min={-180}
                  max={180}
                  step={0.000001}
                  onChange={(e) => updateLocal("timeclock_geofence_lng", Number(e.target.value))}
                  onBlur={(e) => saveField("timeclock_geofence_lng", Number(e.target.value))}
                  className="tabular-nums"
                />
              </div>
            </div>
          </details>
        </div>
      )}

      {saving === "timeclock_geofence_enabled" && (
        <p className="px-5 pb-4 -mt-2 text-yellow font-mono" style={{ fontSize: '0.7rem', letterSpacing: '0.18em' }}>
          Saving…
        </p>
      )}
      {saved === "timeclock_geofence_enabled" && (
        <p className="px-5 pb-4 -mt-2 text-teal font-mono" style={{ fontSize: '0.7rem', letterSpacing: '0.18em' }}>
          Saved
        </p>
      )}
    </Panel>
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
    <div
      className="border border-yellow/30 bg-yellow/5"
      style={{ padding: '1rem' }}
    >
      <p
        className="font-mono uppercase text-yellow mb-1.5"
        style={{ fontSize: '0.65rem', letterSpacing: '0.22em', fontWeight: 600 }}
      >
        Demo Data
      </p>
      <p className="text-ink-soft mb-3" style={{ fontSize: '0.78rem', lineHeight: 1.55 }}>
        Populate the store with sample customers, inventory, and events for testing. Cleaned up automatically when you leave training mode.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={seedDemo}
          disabled={seeding || cleaning}
          className="font-mono uppercase transition-colors disabled:opacity-50"
          style={{
            fontSize: '0.7rem',
            letterSpacing: '0.16em',
            fontWeight: 600,
            padding: '0.6rem 1rem',
            minHeight: 44,
            color: 'var(--void)',
            background: 'var(--yellow)',
            border: '1px solid var(--yellow)',
          }}
        >
          {seeding ? 'Seeding…' : 'Seed Demo Data'}
        </button>
        <button
          onClick={cleanDemo}
          disabled={seeding || cleaning}
          className="font-mono uppercase transition-colors disabled:opacity-50"
          style={{
            fontSize: '0.7rem',
            letterSpacing: '0.16em',
            fontWeight: 600,
            padding: '0.6rem 1rem',
            minHeight: 44,
            color: 'var(--yellow)',
            background: 'transparent',
            border: '1px solid var(--yellow)',
          }}
        >
          {cleaning ? 'Cleaning…' : 'Clean Up Demo Data'}
        </button>
        <button
          onClick={clearAll}
          disabled={seeding || cleaning}
          className="font-mono uppercase transition-colors disabled:opacity-50"
          style={{
            fontSize: '0.7rem',
            letterSpacing: '0.16em',
            fontWeight: 600,
            padding: '0.6rem 1rem',
            minHeight: 44,
            color: 'var(--red)',
            background: 'transparent',
            border: '1px solid var(--red)',
          }}
        >
          {cleaning ? 'Clearing…' : 'Clear All Store Data'}
        </button>
      </div>
      {message && (
        <p className="mt-3 text-yellow font-mono" style={{ fontSize: '0.78rem', letterSpacing: '0.06em' }}>
          {message}
        </p>
      )}
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
    <Panel
      num="02"
      eyebrow="Inventory"
      title="Shopify"
      desc="Connect your Shopify store for real-time inventory sync. In-store sales update Shopify automatically."
    >
      <div className="px-5 py-5">
        {currentUrl && hasToken ? (
          <div className="space-y-3">
            <StatusPill kind="ok" label="Connected" />
            <p className="text-ink" style={{ fontSize: '0.92rem' }}>
              {currentUrl}
            </p>
            <ul className="text-ink-soft space-y-1" style={{ fontSize: '0.82rem', lineHeight: 1.55 }}>
              <li>· Inventory syncs automatically after each in-store sale.</li>
              <li>· Online orders are pulled in via webhook.</li>
              <li>· Set online allocations on each item&apos;s detail page.</li>
            </ul>
            <button
              onClick={disconnect}
              disabled={disconnecting}
              className="font-display uppercase border border-rule-hi text-ink-soft hover:text-ink hover:border-ink-faint hover:bg-panel transition-colors disabled:opacity-50"
              style={{
                fontSize: '0.8rem',
                letterSpacing: '0.06em',
                fontWeight: 600,
                padding: '0.55rem 0.95rem',
                minHeight: 44,
                background: 'transparent',
              }}
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
            {saved && (
              <p className="text-teal font-mono" style={{ fontSize: '0.78rem', letterSpacing: '0.06em' }}>
                Connected!
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label
                className="font-mono uppercase block mb-1.5 text-ink-faint"
                style={{ fontSize: '0.6rem', letterSpacing: '0.22em', fontWeight: 600 }}
              >
                Shopify Store URL
              </label>
              <ConsoleInput
                type="text"
                value={shopUrl}
                onChange={(e) => setShopUrl(e.target.value)}
                placeholder="your-store.myshopify.com"
              />
            </div>
            <div>
              <label
                className="font-mono uppercase block mb-1.5 text-ink-faint"
                style={{ fontSize: '0.6rem', letterSpacing: '0.22em', fontWeight: 600 }}
              >
                Admin API Access Token
              </label>
              <ConsoleInput
                mono
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="shpat_…"
              />
              <p className="mt-1.5 text-ink-faint" style={{ fontSize: '0.74rem', lineHeight: 1.55 }}>
                Create a custom app in Shopify with read/write products + inventory scopes. Token is stored encrypted.
              </p>
            </div>
            {error && (
              <p className="text-red-fu font-mono" style={{ fontSize: '0.78rem', letterSpacing: '0.06em' }}>
                {error}
              </p>
            )}
            {saving && (
              <div className="flex items-center gap-2 text-orange font-mono" style={{ fontSize: '0.78rem', letterSpacing: '0.06em' }}>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Connecting to Shopify and verifying access…
              </div>
            )}
            <PrimaryButton onClick={connect} disabled={saving || !shopUrl || !token} large>
              {saving ? 'Connecting…' : 'Connect Shopify'}
            </PrimaryButton>
          </div>
        )}
      </div>
    </Panel>
  );
}
