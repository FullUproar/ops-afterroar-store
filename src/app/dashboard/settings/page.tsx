'use client';

import { useState, useCallback, useEffect } from 'react';
import { useStore } from '@/lib/store-context';
import {
  useStoreSettings,
  SETTINGS_SECTIONS,
  SETTINGS_DEFAULTS,
  type StoreSettings,
} from '@/lib/store-settings';

interface VenueResult {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
}

export default function SettingsPage() {
  const { can, store } = useStore();
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

  if (!can('store.settings')) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-zinc-500">You don&apos;t have permission to view settings.</p>
      </div>
    );
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Store Settings</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {store?.name} &middot; Changes save automatically
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Afterroar Integration Section */}
      <div className="max-w-2xl">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-sm font-semibold text-white">Afterroar Integration</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
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
                    <span className="text-sm text-zinc-300">to {connectedVenueName || 'Afterroar Venue'}</span>
                  </div>
                  <div className="text-xs text-zinc-500 space-y-1">
                    <p>Events you create as &quot;Afterroar Events&quot; will appear on your venue page.</p>
                    <p>Player RSVPs are visible in the check-in list.</p>
                    <p>Loyalty points sync to the Afterroar wallet for linked customers.</p>
                  </div>
                  <button
                    onClick={disconnectVenue}
                    disabled={disconnecting}
                    className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-300 rounded text-xs font-medium"
                  >
                    {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                  </button>
                </div>
              );
            }

            return (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-zinc-400">
                  Do you have a venue page on Afterroar? Connect it to enable event sync, QR check-ins, and player identity linking.
                </p>
                <div className="relative">
                  <label className="mb-1 block text-xs text-zinc-400">Search by venue name</label>
                  <input
                    type="text"
                    placeholder="Search venues..."
                    value={venueSearch}
                    onChange={(e) => setVenueSearch(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-indigo-500 focus:outline-none"
                  />
                  {searchingVenues && <p className="mt-1 text-xs text-zinc-500">Searching...</p>}
                  {venueResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {venueResults.map((v) => (
                        <button
                          key={v.id}
                          onClick={() => connectVenue(v.id)}
                          disabled={connecting}
                          className="w-full text-left px-3 py-2 hover:bg-zinc-700 text-sm text-white flex justify-between items-center"
                        >
                          <span>{v.name}</span>
                          <span className="text-zinc-400 text-xs">
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
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
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
                        className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-indigo-500 focus:outline-none"
                      />
                      <button
                        onClick={() => manualVenueId && connectVenue(manualVenueId)}
                        disabled={connecting || !manualVenueId}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
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

      <div className="max-w-2xl space-y-4">
        {SETTINGS_SECTIONS.map((section) => (
          <div
            key={section.key}
            className="rounded-lg border border-zinc-800 bg-zinc-900 p-6"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">{section.label}</h2>
                <p className="mt-0.5 text-xs text-zinc-500">{section.description}</p>
              </div>
              <button
                onClick={() => resetSection(section.key)}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
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

                if (field.type === 'text') {
                  return (
                    <div key={field.key}>
                      <label className="mb-1 block text-xs text-zinc-400">{field.label}</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={String(value ?? '')}
                          placeholder={'placeholder' in field ? (field as { placeholder?: string }).placeholder : ''}
                          onChange={(e) => updateLocal(field.key, e.target.value)}
                          onBlur={(e) => saveField(field.key, e.target.value)}
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-indigo-500 focus:outline-none"
                        />
                        {isSaving && <span className="absolute right-3 top-2.5 text-xs text-zinc-500">Saving...</span>}
                        {isSaved && <span className="absolute right-3 top-2.5 text-xs text-green-400">Saved</span>}
                      </div>
                    </div>
                  );
                }

                if (field.type === 'number') {
                  return (
                    <div key={field.key}>
                      <label className="mb-1 block text-xs text-zinc-400">{field.label}</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={Number(value ?? 0)}
                          min={'min' in field ? (field as { min?: number }).min : undefined}
                          max={'max' in field ? (field as { max?: number }).max : undefined}
                          step={'step' in field ? (field as { step?: number }).step : undefined}
                          onChange={(e) => updateLocal(field.key, Number(e.target.value))}
                          onBlur={(e) => saveField(field.key, Number(e.target.value))}
                          className="w-48 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white tabular-nums focus:border-indigo-500 focus:outline-none"
                        />
                        {isSaving && <span className="ml-3 text-xs text-zinc-500">Saving...</span>}
                        {isSaved && <span className="ml-3 text-xs text-green-400">Saved</span>}
                      </div>
                    </div>
                  );
                }

                if (field.type === 'toggle') {
                  return (
                    <div key={field.key} className="flex items-center justify-between">
                      <label className="text-sm text-zinc-300">{field.label}</label>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const newVal = !value;
                            updateLocal(field.key, newVal);
                            saveField(field.key, newVal);
                          }}
                          className={`relative h-6 w-11 rounded-full transition-colors ${
                            value ? 'bg-indigo-600' : 'bg-zinc-700'
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
                      <label className="mb-1 block text-xs text-zinc-400">{field.label}</label>
                      <select
                        value={String(value ?? '')}
                        onChange={(e) => {
                          updateLocal(field.key, e.target.value);
                          saveField(field.key, e.target.value);
                        }}
                        className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
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
                      <label className="mb-2 block text-xs text-zinc-400">{field.label}</label>
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
                              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                                isOn
                                  ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300'
                                  : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600'
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
