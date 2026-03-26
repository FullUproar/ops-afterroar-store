'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store-context';
import { GameEvent, EventCheckin, Customer, formatCents, parseDollars } from '@/lib/types';

type EventWithCount = GameEvent & { checkin_count: number; rsvp_count: number | null };

interface HQGuest {
  id: string;
  userId: string | null;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  status: string;
  attended: boolean;
  noShow: boolean;
  trustBadge: { level: 'green' | 'yellow' | 'red'; label: string };
  identityVerified: boolean;
  checkedIn: boolean;
  reputationScore: number | null;
}

function trustBadgeClasses(level: 'green' | 'yellow' | 'red') {
  const map = {
    green: 'text-green-400 bg-green-900/30',
    yellow: 'text-yellow-400 bg-yellow-900/30',
    red: 'text-red-400 bg-red-900/30',
  };
  return map[level];
}

function statusBadge(event: EventWithCount) {
  const now = new Date();
  const start = new Date(event.starts_at);
  const end = event.ends_at ? new Date(event.ends_at) : null;

  if (end && now > end) {
    return <span className="px-2 py-0.5 rounded text-xs bg-zinc-700 text-zinc-400">Past</span>;
  }
  if (now >= start) {
    return <span className="px-2 py-0.5 rounded text-xs bg-green-900 text-green-300">Active</span>;
  }
  return <span className="px-2 py-0.5 rounded text-xs bg-blue-900 text-blue-300">Upcoming</span>;
}

function typeBadge(type: string) {
  const colors: Record<string, string> = {
    fnm: 'bg-purple-900 text-purple-300',
    prerelease: 'bg-amber-900 text-amber-300',
    tournament: 'bg-red-900 text-red-300',
    casual: 'bg-green-900 text-green-300',
    draft: 'bg-blue-900 text-blue-300',
    league: 'bg-cyan-900 text-cyan-300',
    other: 'bg-zinc-700 text-zinc-300',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs uppercase ${colors[type] || colors.other}`}>
      {type}
    </span>
  );
}

export default function EventsPage() {
  const { store } = useStore();
  const [events, setEvents] = useState<EventWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [createAsHQ, setCreateAsHQ] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    event_type: 'fnm',
    starts_at: '',
    ends_at: '',
    entry_fee: '',
    max_players: '',
    description: '',
  });
  const [saving, setSaving] = useState(false);

  const settings = (store?.settings ?? {}) as Record<string, unknown>;
  const isConnected = Boolean(settings.venueId);
  const venueName = settings.venueName as string | undefined;

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/events');
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          event_type: form.event_type,
          starts_at: form.starts_at,
          ends_at: form.ends_at || null,
          entry_fee_cents: form.entry_fee ? parseDollars(form.entry_fee) : 0,
          max_players: form.max_players ? parseInt(form.max_players) : null,
          description: form.description || null,
          create_hq_event: createAsHQ,
        }),
      });
      if (res.ok) {
        setForm({ name: '', event_type: 'fnm', starts_at: '', ends_at: '', entry_fee: '', max_players: '', description: '' });
        setShowForm(false);
        setCreateAsHQ(false);
        loadEvents();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Events</h1>
          {isConnected && (
            <p className="mt-1 text-sm text-zinc-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                Connected to {venueName || 'Afterroar'}
              </span>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {isConnected && (
            <button
              onClick={() => { setShowForm(true); setCreateAsHQ(true); }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-medium"
            >
              New Afterroar Event
            </button>
          )}
          <button
            onClick={() => { setShowForm(!showForm); setCreateAsHQ(false); }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium"
          >
            {showForm && !createAsHQ ? 'Cancel' : 'New Event'}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4">
          {createAsHQ && (
            <div className="flex items-center gap-2 text-sm text-indigo-400 bg-indigo-900/20 border border-indigo-800/30 rounded px-3 py-2">
              <span className="h-2 w-2 rounded-full bg-indigo-400" />
              This event will also be created on your Afterroar venue page. Players can RSVP online.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Event Type</label>
              <select
                value={form.event_type}
                onChange={(e) => setForm({ ...form, event_type: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm"
              >
                <option value="fnm">FNM</option>
                <option value="prerelease">Prerelease</option>
                <option value="tournament">Tournament</option>
                <option value="casual">Casual</option>
                <option value="draft">Draft</option>
                <option value="league">League</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Starts At</label>
              <input
                required
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Ends At</label>
              <input
                type="datetime-local"
                value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Entry Fee ($)</label>
              <input
                type="text"
                placeholder="0.00"
                value={form.entry_fee}
                onChange={(e) => setForm({ ...form, entry_fee: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Max Players</label>
              <input
                type="number"
                value={form.max_players}
                onChange={(e) => setForm({ ...form, max_players: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className={`px-4 py-2 ${createAsHQ ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-blue-600 hover:bg-blue-700'} disabled:opacity-50 text-white rounded text-sm font-medium`}
            >
              {saving ? 'Creating...' : createAsHQ ? 'Create Afterroar Event' : 'Create Event'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setCreateAsHQ(false); }}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-zinc-400">Loading events...</p>
      ) : events.length === 0 ? (
        <p className="text-zinc-400">No events yet. Create one to get started.</p>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 text-left">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Date/Time</th>
                <th className="px-4 py-3 font-medium">Entry Fee</th>
                <th className="px-4 py-3 font-medium">Players</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  expanded={expandedId === event.id}
                  onToggle={() => setExpandedId(expandedId === event.id ? null : event.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EventRow({
  event,
  expanded,
  onToggle,
}: {
  event: EventWithCount;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [checkins, setCheckins] = useState<(EventCheckin & { customer_name?: string })[]>([]);
  const [hqGuests, setHqGuests] = useState<HQGuest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [loadingGuests, setLoadingGuests] = useState(false);

  const isHQLinked = Boolean(event.afterroar_event_id);

  useEffect(() => {
    if (expanded) {
      fetch(`/api/events/${event.id}/checkin`)
        .then((r) => r.json())
        .then(setCheckins)
        .catch(() => {});

      // If HQ-linked, also load RSVP guest list
      if (isHQLinked) {
        setLoadingGuests(true);
        fetch(`/api/events/${event.id}/guests`)
          .then((r) => r.json())
          .then((data) => {
            if (Array.isArray(data)) setHqGuests(data);
          })
          .catch(() => {})
          .finally(() => setLoadingGuests(false));
      }
    }
  }, [expanded, event.id, isHQLinked]);

  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/customers?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) setSearchResults(await res.json());
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  async function handleCheckin(customerId: string) {
    setCheckingIn(true);
    try {
      const res = await fetch(`/api/events/${event.id}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId }),
      });
      if (res.ok) {
        setSearchQuery('');
        setSearchResults([]);
        const updatedRes = await fetch(`/api/events/${event.id}/checkin`);
        if (updatedRes.ok) setCheckins(await updatedRes.json());
      }
    } finally {
      setCheckingIn(false);
    }
  }

  async function handleQRCheckin(guestId: string) {
    setCheckingIn(true);
    try {
      const res = await fetch(`/api/events/${event.id}/qr-checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guest_id: guestId }),
      });
      if (res.ok) {
        // Reload both lists
        const [checkinRes, guestRes] = await Promise.all([
          fetch(`/api/events/${event.id}/checkin`),
          fetch(`/api/events/${event.id}/guests`),
        ]);
        if (checkinRes.ok) setCheckins(await checkinRes.json());
        if (guestRes.ok) {
          const data = await guestRes.json();
          if (Array.isArray(data)) setHqGuests(data);
        }
      }
    } finally {
      setCheckingIn(false);
    }
  }

  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-zinc-800 hover:bg-zinc-800/50 cursor-pointer text-white"
      >
        <td className="px-4 py-3 font-medium">
          <span className="flex items-center gap-2">
            {event.name}
            {isHQLinked && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-900/40 text-indigo-400 border border-indigo-800/30 font-normal">
                Afterroar
              </span>
            )}
          </span>
        </td>
        <td className="px-4 py-3">{typeBadge(event.event_type)}</td>
        <td className="px-4 py-3 text-zinc-300">
          {new Date(event.starts_at).toLocaleString()}
        </td>
        <td className="px-4 py-3 text-zinc-300">
          {event.entry_fee_cents > 0 ? formatCents(event.entry_fee_cents) : 'Free'}
        </td>
        <td className="px-4 py-3 text-zinc-300">
          <span>{event.checkin_count}</span>
          {event.rsvp_count !== null && (
            <span className="text-zinc-500 ml-1">/ {event.rsvp_count} RSVP</span>
          )}
        </td>
        <td className="px-4 py-3">{statusBadge(event)}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-zinc-950 px-4 py-4 border-b border-zinc-800">
            <div className="space-y-4">
              {/* HQ RSVP Guest List */}
              {isHQLinked && (
                <div>
                  <h3 className="text-sm font-semibold text-white mb-2">
                    RSVP Guest List
                    {loadingGuests && <span className="ml-2 text-zinc-500 font-normal">Loading...</span>}
                  </h3>
                  {hqGuests.length > 0 ? (
                    <div className="space-y-1">
                      {hqGuests.map((guest) => (
                        <div
                          key={guest.id}
                          className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            {guest.avatarUrl ? (
                              <img
                                src={guest.avatarUrl}
                                alt=""
                                className="h-6 w-6 rounded-full"
                              />
                            ) : (
                              <div className="h-6 w-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs text-zinc-400">
                                {guest.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span className="text-white">{guest.name}</span>
                            {/* Trust badge */}
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${trustBadgeClasses(guest.trustBadge.level)}`}>
                              {guest.trustBadge.label}
                            </span>
                            {/* Verified badge */}
                            {guest.identityVerified && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-900/30 text-blue-400 font-medium">
                                Verified
                              </span>
                            )}
                            {/* RSVP status */}
                            <span className="text-zinc-500 text-xs uppercase">{guest.status}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {guest.checkedIn ? (
                              <span className="text-green-400 text-xs font-medium">Checked In</span>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQRCheckin(guest.id);
                                }}
                                disabled={checkingIn}
                                className="px-3 py-1 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded text-xs font-medium"
                              >
                                Check In
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : !loadingGuests ? (
                    <p className="text-sm text-zinc-500">No RSVPs yet.</p>
                  ) : null}
                </div>
              )}

              {/* Walk-in check-in search */}
              <div>
                <h3 className="text-sm font-semibold text-white mb-2">
                  {isHQLinked ? 'Walk-in Check-In' : 'Check-In Players'}
                </h3>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search customers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full max-w-md bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm"
                  />
                  {searching && (
                    <p className="text-xs text-zinc-500 mt-1">Searching...</p>
                  )}
                  {searchResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full max-w-md bg-zinc-800 border border-zinc-700 rounded shadow-lg">
                      {searchResults.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => handleCheckin(c.id)}
                          disabled={checkingIn}
                          className="w-full text-left px-3 py-2 hover:bg-zinc-700 text-sm text-white flex justify-between items-center"
                        >
                          <span>{c.name}</span>
                          <span className="text-zinc-400 text-xs">{c.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Checked-in list */}
              {checkins.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs text-zinc-500 uppercase tracking-wide">
                    Checked In ({checkins.length})
                  </p>
                  {checkins.map((ci) => (
                    <div
                      key={ci.id}
                      className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm"
                    >
                      <span className="text-white">{ci.customer_name || ci.customer_id}</span>
                      <span className="text-zinc-500 text-xs">
                        {new Date(ci.checked_in_at).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">No players checked in yet.</p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
