'use client';

import { useState, useEffect, useCallback } from 'react';
import { GameEvent, EventCheckin, Customer, formatCents, parseDollars } from '@/lib/types';

type EventWithCount = GameEvent & { checkin_count: number };

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
  const [events, setEvents] = useState<EventWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
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
        }),
      });
      if (res.ok) {
        setForm({ name: '', event_type: 'fnm', starts_at: '', ends_at: '', entry_fee: '', max_players: '', description: '' });
        setShowForm(false);
        loadEvents();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Events</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium"
        >
          {showForm ? 'Cancel' : 'New Event'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4">
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
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-sm font-medium"
          >
            {saving ? 'Creating...' : 'Create Event'}
          </button>
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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  useEffect(() => {
    if (expanded) {
      fetch(`/api/events/${event.id}/checkin`)
        .then((r) => r.json())
        .then(setCheckins)
        .catch(() => {});
    }
  }, [expanded, event.id]);

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

  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-zinc-800 hover:bg-zinc-800/50 cursor-pointer text-white"
      >
        <td className="px-4 py-3 font-medium">{event.name}</td>
        <td className="px-4 py-3">{typeBadge(event.event_type)}</td>
        <td className="px-4 py-3 text-zinc-300">
          {new Date(event.starts_at).toLocaleString()}
        </td>
        <td className="px-4 py-3 text-zinc-300">
          {event.entry_fee_cents > 0 ? formatCents(event.entry_fee_cents) : 'Free'}
        </td>
        <td className="px-4 py-3 text-zinc-300">{event.checkin_count}</td>
        <td className="px-4 py-3">{statusBadge(event)}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-zinc-950 px-4 py-4 border-b border-zinc-800">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-white">Check-In Players</h3>
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
