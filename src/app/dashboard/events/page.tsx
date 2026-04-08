'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store-context';
import { GameEvent, EventCheckin, Customer, formatCents, parseDollars } from '@/lib/types';
import { StatusBadge } from '@/components/mobile-card';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/shared/ui';

type EventWithCount = GameEvent & { checkin_count: number; rsvp_count: number | null };

/* ------------------------------------------------------------------ */
/*  Tournament types (mirrored from tournaments page)                  */
/* ------------------------------------------------------------------ */

interface Tournament {
  id: string;
  store_id: string;
  event_id: string | null;
  name: string;
  format: string | null;
  status: string;
  bracket_type: string;
  max_players: number | null;
  current_round: number;
  total_rounds: number | null;
  created_at: string;
  event?: { id: string; name: string } | null;
  _count?: { players: number; matches: number };
  players?: TournamentPlayer[];
  matches?: TournamentMatch[];
}

interface TournamentPlayer {
  id: string;
  tournament_id: string;
  customer_id: string | null;
  player_name: string;
  seed: number | null;
  wins: number;
  losses: number;
  draws: number;
  dropped: boolean;
  standing: number | null;
}

interface TournamentMatch {
  id: string;
  tournament_id: string;
  round_number: number;
  match_number: number;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  player1_score: number;
  player2_score: number;
  status: string;
  table_number: string | null;
}

const TOURNAMENT_STATUS_COLORS: Record<string, string> = {
  registration: 'bg-blue-900 text-blue-300',
  active: 'bg-green-900 text-green-300',
  completed: 'bg-card-hover text-foreground/70',
};

const FORMAT_OPTIONS = [
  'standard', 'modern', 'commander', 'draft', 'sealed',
  'pioneer', 'pauper', 'legacy', 'vintage', 'other',
];

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
    return <StatusBadge variant="info">Past</StatusBadge>;
  }
  if (now >= start) {
    return <StatusBadge variant="success">Active</StatusBadge>;
  }
  return <StatusBadge variant="pending">Upcoming</StatusBadge>;
}

function typeBadge(type: string) {
  const variants: Record<string, 'special' | 'pending' | 'error' | 'success' | 'info'> = {
    fnm: 'special',
    prerelease: 'pending',
    tournament: 'error',
    casual: 'success',
    draft: 'info',
    league: 'info',
  };
  return (
    <StatusBadge variant={variants[type] || 'info'} className="uppercase">
      {type}
    </StatusBadge>
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
    // Tournament fields
    format: '',
    bracket_type: 'swiss' as 'swiss' | 'single_elimination',
  });
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(4);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");

  const settings = (store?.settings ?? {}) as Record<string, unknown>;
  const isConnected = Boolean(settings.venueId);
  const venueName = settings.venueName as string | undefined;

  const loadEvents = useCallback(async () => {
    try {
      setLoadError(null);
      const res = await fetch('/api/events');
      if (!res.ok) {
        setLoadError('Failed to load events. Try again.');
        return;
      }
      const data = await res.json();
      setEvents(data);
    } catch {
      setLoadError('Failed to load events. Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const isTournamentType = form.event_type === 'tournament' || form.event_type === 'fnm';

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const weeks = repeatWeekly ? repeatWeeks : 1;
      for (let w = 0; w < weeks; w++) {
        const startOffset = w * 7 * 86400000;
        const startsAt = form.starts_at ? new Date(new Date(form.starts_at).getTime() + startOffset).toISOString() : "";
        const endsAt = form.ends_at ? new Date(new Date(form.ends_at).getTime() + startOffset).toISOString() : null;

        const res = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            event_type: form.event_type,
            starts_at: startsAt,
            ends_at: endsAt,
            entry_fee_cents: form.entry_fee ? parseDollars(form.entry_fee) : 0,
            max_players: form.max_players ? parseInt(form.max_players) : null,
            description: form.description || null,
            create_hq_event: createAsHQ && w === 0, // Only create HQ event for the first one
          }),
        });

        // Auto-create linked tournament for tournament/fnm event types
        if (res.ok && isTournamentType) {
          const event = await res.json();
          await fetch('/api/tournaments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: form.name,
              format: form.format || null,
              bracket_type: form.bracket_type,
              max_players: form.max_players ? parseInt(form.max_players) : null,
              event_id: event.id,
            }),
          });
        }
      }
      setForm({ name: '', event_type: 'fnm', starts_at: '', ends_at: '', entry_fee: '', max_players: '', description: '', format: '', bracket_type: 'swiss' });
      setShowForm(false);
      setCreateAsHQ(false);
      setRepeatWeekly(false);
      loadEvents();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <PageHeader
          title="Events"
          action={
            <div className="flex gap-2">
              <div className="flex rounded-lg border border-card-border overflow-hidden">
                <button onClick={() => setViewMode("list")} className={`px-3 py-2 text-xs font-medium transition-colors ${viewMode === "list" ? "bg-card-hover text-foreground" : "text-muted hover:text-foreground"}`} style={{ minHeight: "auto" }}>List</button>
                <button onClick={() => setViewMode("calendar")} className={`px-3 py-2 text-xs font-medium transition-colors ${viewMode === "calendar" ? "bg-card-hover text-foreground" : "text-muted hover:text-foreground"}`} style={{ minHeight: "auto" }}>Calendar</button>
              </div>
              {isConnected && (
                <button
                  onClick={() => { setShowForm(true); setCreateAsHQ(true); }}
                  className="hidden sm:block px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  New Afterroar Event
                </button>
              )}
              <button
                onClick={() => { setShowForm(!showForm); setCreateAsHQ(false); }}
                className="px-3 sm:px-4 py-2 bg-accent hover:opacity-90 text-white rounded-lg text-sm font-medium transition-colors shrink-0"
              >
                {showForm && !createAsHQ ? 'Cancel' : 'New'}
              </button>
            </div>
          }
        />
        {isConnected ? (
          <p className="text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Connected to {venueName || 'Afterroar'}
            </span>
          </p>
        ) : (
          <p className="text-xs text-muted">
            Connect to the Afterroar Network in{' '}
            <a href="/dashboard/settings" className="text-accent hover:underline">Settings</a>
            {' '}to enable online RSVPs, player identity linking, and cross-store leaderboards.
          </p>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-card border border-card-border rounded-xl p-4 space-y-4 shadow-sm dark:shadow-none">
          {createAsHQ && (
            <div className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/30 rounded-lg px-3 py-2">
              <span className="h-2 w-2 rounded-full bg-purple-500" />
              This event will also appear on your Afterroar store page. Players can RSVP online.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-muted mb-1">Name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-input-bg border border-input-border rounded-lg px-3 py-2 text-foreground text-sm focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Event Type</label>
              <select
                value={form.event_type}
                onChange={(e) => setForm({ ...form, event_type: e.target.value })}
                className="w-full bg-input-bg border border-input-border rounded-lg px-3 py-2 text-foreground text-sm focus:border-accent focus:outline-none"
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
              <label className="block text-sm text-muted mb-1">Starts At</label>
              <input
                required
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                className="w-full bg-input-bg border border-input-border rounded-lg px-3 py-2 text-foreground text-sm focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Ends At</label>
              <input
                type="datetime-local"
                value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                className="w-full bg-input-bg border border-input-border rounded-lg px-3 py-2 text-foreground text-sm focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Entry Fee ($)</label>
              <input
                type="text"
                placeholder="0.00"
                value={form.entry_fee}
                onChange={(e) => setForm({ ...form, entry_fee: e.target.value })}
                className="w-full bg-input-bg border border-input-border rounded-lg px-3 py-2 text-foreground text-sm focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Max Players</label>
              <input
                type="number"
                value={form.max_players}
                onChange={(e) => setForm({ ...form, max_players: e.target.value })}
                className="w-full bg-input-bg border border-input-border rounded-lg px-3 py-2 text-foreground text-sm focus:border-accent focus:outline-none"
              />
            </div>
            {isTournamentType && (
              <>
                <div>
                  <label className="block text-sm text-muted mb-1">Format</label>
                  <select
                    value={form.format}
                    onChange={(e) => setForm({ ...form, format: e.target.value })}
                    className="w-full bg-input-bg border border-input-border rounded-lg px-3 py-2 text-foreground text-sm focus:border-accent focus:outline-none"
                  >
                    <option value="">Select format...</option>
                    {FORMAT_OPTIONS.map((f) => (
                      <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-muted mb-1">Bracket Type</label>
                  <div className="flex gap-1 rounded-lg bg-card-hover p-1 border border-input-border">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, bracket_type: 'swiss' })}
                      className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${form.bracket_type === 'swiss' ? 'bg-card text-foreground shadow-sm' : 'text-muted'}`}
                      style={{ minHeight: 'auto' }}
                    >
                      Swiss
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, bracket_type: 'single_elimination' })}
                      className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${form.bracket_type === 'single_elimination' ? 'bg-card text-foreground shadow-sm' : 'text-muted'}`}
                      style={{ minHeight: 'auto' }}
                    >
                      Single Elim
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full bg-input-bg border border-input-border rounded-lg px-3 py-2 text-foreground text-sm focus:border-accent focus:outline-none"
            />
          </div>
          {/* Repeat weekly toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setRepeatWeekly(!repeatWeekly)}
              className={`relative h-5 w-9 rounded-full transition-colors ${repeatWeekly ? 'bg-accent' : 'bg-card-hover'}`}
              style={{ minHeight: "auto" }}
            >
              <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${repeatWeekly ? 'translate-x-4' : ''}`} />
            </button>
            <span className="text-sm text-foreground">Repeat weekly</span>
            {repeatWeekly && (
              <span className="flex items-center gap-1 text-sm text-muted">
                for
                <input
                  type="number"
                  min={2}
                  max={12}
                  value={repeatWeeks}
                  onChange={(e) => setRepeatWeeks(Math.min(12, Math.max(2, parseInt(e.target.value) || 4)))}
                  className="w-12 bg-input-bg border border-input-border rounded px-2 py-0.5 text-foreground text-sm text-center focus:border-accent focus:outline-none"
                />
                weeks
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className={`px-4 py-2 ${createAsHQ ? 'bg-purple-600 hover:bg-purple-700' : 'bg-accent hover:opacity-90'} disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors`}
            >
              {saving ? 'Creating...' : repeatWeekly ? `Create ${repeatWeeks} Events` : createAsHQ ? 'Create Afterroar Event' : 'Create Event'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setCreateAsHQ(false); }}
              className="px-4 py-2 border border-card-border bg-card hover:bg-card-hover text-foreground rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loadError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
          <p className="text-sm text-red-400">{loadError}</p>
          <button
            onClick={() => { setLoadError(null); loadEvents(); }}
            className="mt-2 text-xs text-red-300 underline hover:text-red-200"
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-muted">Loading events...</p>
      ) : events.length === 0 && !loadError ? (
        <EmptyState
          icon="&#x1F3AE;"
          title="No events yet"
          description="Create your first event to start tracking attendance and check-ins."
          action={{ label: "Create Your First Event", onClick: () => { setShowForm(true); setCreateAsHQ(false); } }}
        />
      ) : viewMode === "calendar" ? (
        <EventCalendar events={events} expandedId={expandedId} onEventClick={(id) => setExpandedId(expandedId === id ? null : id)} />
      ) : (
        <>
          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {events.map((event) => (
              <div key={event.id}>
                <button
                  onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}
                  className="w-full rounded-xl border border-card-border bg-card p-4 text-left min-h-11 active:bg-card-hover shadow-sm dark:shadow-none transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground truncate mr-2 leading-snug">
                      {event.name}
                      {Boolean(event.afterroar_event_id) && (
                        <StatusBadge variant="special" className="ml-1.5 text-[10px]">AR</StatusBadge>
                      )}
                    </span>
                    {statusBadge(event)}
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-xs text-muted">
                    {typeBadge(event.event_type)}
                    <span>{new Date(event.starts_at).toLocaleDateString()}</span>
                    <span>{event.checkin_count} players</span>
                  </div>
                </button>
                {expandedId === event.id && (
                  <div className="bg-card border border-card-border border-t-0 rounded-b-xl px-4 py-3">
                    <MobileEventDetail event={event} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-card border border-card-border rounded-xl overflow-hidden shadow-sm dark:shadow-none">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border text-muted text-left">
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
        </>
      )}
    </div>
  );
}

function MobileEventDetail({ event }: { event: EventWithCount }) {
  const isHQLinked = Boolean(event.afterroar_event_id);
  const isTournamentEvent = event.event_type === 'tournament' || event.event_type === 'fnm';
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between text-muted">
        <span>Entry Fee: {event.entry_fee_cents > 0 ? formatCents(event.entry_fee_cents) : 'Free'}</span>
        <span>{new Date(event.starts_at).toLocaleString()}</span>
      </div>
      <div className="flex items-center gap-2 text-muted">
        <span>Players: {event.checkin_count}</span>
        {event.rsvp_count !== null && <span className="text-zinc-500 dark:text-zinc-500">({event.rsvp_count} RSVP)</span>}
      </div>
      {isHQLinked && (
        <div className="flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400">
          <span className="h-2 w-2 rounded-full bg-purple-500" />
          Afterroar linked event
        </div>
      )}
      {event.description && (
        <p className="text-xs text-muted">{event.description}</p>
      )}
      {isTournamentEvent && (
        <InlineTournamentPanel eventId={event.id} />
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
        className="border-b border-card-border hover:bg-card-hover cursor-pointer text-foreground"
      >
        <td className="px-4 py-3 font-medium">
          <span className="flex items-center gap-2">
            {event.name}
            {isHQLinked && (
              <StatusBadge variant="special" className="text-[10px]">Afterroar</StatusBadge>
            )}
          </span>
        </td>
        <td className="px-4 py-3">{typeBadge(event.event_type)}</td>
        <td className="px-4 py-3 text-muted">
          {new Date(event.starts_at).toLocaleString()}
        </td>
        <td className="px-4 py-3 text-muted tabular-nums">
          {event.entry_fee_cents > 0 ? formatCents(event.entry_fee_cents) : 'Free'}
        </td>
        <td className="px-4 py-3 text-muted">
          <span>{event.checkin_count}</span>
          {event.rsvp_count !== null && (
            <span className="text-zinc-500 dark:text-zinc-500 ml-1">/ {event.rsvp_count} RSVP</span>
          )}
        </td>
        <td className="px-4 py-3">{statusBadge(event)}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-background px-4 py-4 border-b border-card-border">
            <div className="space-y-4">
              {isHQLinked && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">
                    RSVP Guest List
                    {loadingGuests && <span className="ml-2 text-muted font-normal">Loading...</span>}
                  </h3>
                  {hqGuests.length > 0 ? (
                    <div className="space-y-1">
                      {hqGuests.map((guest) => (
                        <div
                          key={guest.id}
                          className="flex items-center justify-between bg-card border border-card-border rounded-lg px-3 py-2 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            {guest.avatarUrl ? (
                              <img
                                src={guest.avatarUrl}
                                alt=""
                                className="h-6 w-6 rounded-full"
                              />
                            ) : (
                              <div className="h-6 w-6 rounded-full bg-card-hover flex items-center justify-center text-xs text-muted">
                                {guest.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span className="text-foreground">{guest.name}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${trustBadgeClasses(guest.trustBadge.level)}`}>
                              {guest.trustBadge.label}
                            </span>
                            {guest.identityVerified && (
                              <StatusBadge variant="info" className="text-[10px]">Verified</StatusBadge>
                            )}
                            <span className="text-muted text-xs uppercase">{guest.status}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {guest.checkedIn ? (
                              <span className="text-green-600 dark:text-green-400 text-xs font-medium">Checked In</span>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQRCheckin(guest.id);
                                }}
                                disabled={checkingIn}
                                className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
                              >
                                Check In
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : !loadingGuests ? (
                    <p className="text-sm text-muted">No RSVPs yet.</p>
                  ) : null}
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">
                  {isHQLinked ? 'Walk-in Check-In' : 'Check-In Players'}
                </h3>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search customers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full max-w-md bg-input-bg border border-input-border rounded-lg px-3 py-2 text-foreground text-sm placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                  {searching && (
                    <p className="text-xs text-muted mt-1">Searching...</p>
                  )}
                  {searchResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full max-w-md bg-card border border-card-border rounded-lg shadow-lg">
                      {searchResults.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => handleCheckin(c.id)}
                          disabled={checkingIn}
                          className="w-full text-left px-3 py-2 hover:bg-card-hover text-sm text-foreground flex justify-between items-center"
                        >
                          <span>{c.name}</span>
                          <span className="text-muted text-xs">{c.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {checkins.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs text-muted uppercase tracking-wide">
                    Checked In ({checkins.length})
                  </p>
                  {checkins.map((ci) => (
                    <div
                      key={ci.id}
                      className="flex items-center justify-between bg-card border border-card-border rounded-lg px-3 py-2 text-sm"
                    >
                      <span className="text-foreground">{ci.customer_name || ci.customer_id}</span>
                      <span className="text-muted text-xs">
                        {new Date(ci.checked_in_at).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">No players checked in yet.</p>
              )}

              {/* Inline tournament management for tournament/fnm events */}
              {(event.event_type === 'tournament' || event.event_type === 'fnm') && (
                <InlineTournamentPanel eventId={event.id} />
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline Tournament Panel — embedded in event detail                 */
/* ------------------------------------------------------------------ */

function InlineTournamentPanel({ eventId }: { eventId: string }) {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [creatingTournament, setCreatingTournament] = useState(false);

  // Round timer
  const [roundStartTime, setRoundStartTime] = useState<Date | null>(null);
  const [roundMinutes, setRoundMinutes] = useState(50);
  const [timerDisplay, setTimerDisplay] = useState('');

  // Report match
  const [reportMatch, setReportMatch] = useState<TournamentMatch | null>(null);
  const [reportWinnerId, setReportWinnerId] = useState('');
  const [reportP1Score, setReportP1Score] = useState('0');
  const [reportP2Score, setReportP2Score] = useState('0');
  const [reporting, setReporting] = useState(false);

  const loadTournament = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournaments?event_id=${eventId}`);
      if (res.ok) {
        const data = await res.json();
        // Find the tournament linked to this event
        const linked = Array.isArray(data)
          ? data.find((t: Tournament) => t.event_id === eventId)
          : null;
        if (linked) {
          // Fetch full detail
          const detailRes = await fetch(`/api/tournaments/${linked.id}`);
          if (detailRes.ok) {
            setTournament(await detailRes.json());
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { loadTournament(); }, [loadTournament]);

  // Round timer effect
  useEffect(() => {
    if (!roundStartTime) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - roundStartTime.getTime()) / 1000);
      const remaining = roundMinutes * 60 - elapsed;
      if (remaining <= 0) {
        setTimerDisplay("TIME!");
      } else {
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        setTimerDisplay(`${m}:${String(s).padStart(2, "0")}`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [roundStartTime, roundMinutes]);

  async function handleCreateTournament() {
    setCreatingTournament(true);
    try {
      const res = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Tournament',
          bracket_type: 'swiss',
          event_id: eventId,
        }),
      });
      if (res.ok) {
        loadTournament();
      }
    } finally {
      setCreatingTournament(false);
    }
  }

  async function handleAddPlayer() {
    if (!tournament || !playerName.trim()) return;
    setAddingPlayer(true);
    try {
      const res = await fetch(`/api/tournaments/${tournament.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_player', player_name: playerName.trim() }),
      });
      if (res.ok) {
        setPlayerName('');
        const detailRes = await fetch(`/api/tournaments/${tournament.id}`);
        if (detailRes.ok) setTournament(await detailRes.json());
      }
    } finally {
      setAddingPlayer(false);
    }
  }

  async function handleStart() {
    if (!tournament) return;
    const action = tournament.bracket_type === "swiss" ? "start_swiss" : "start";
    const res = await fetch(`/api/tournaments/${tournament.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      setTournament(await res.json());
      setRoundStartTime(new Date());
    }
  }

  async function handleNextRound() {
    if (!tournament) return;
    const res = await fetch(`/api/tournaments/${tournament.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'next_round' }),
    });
    if (res.ok) {
      setTournament(await res.json());
      setRoundStartTime(new Date());
    }
  }

  async function handleDropPlayer(playerId: string) {
    if (!tournament) return;
    await fetch(`/api/tournaments/${tournament.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'drop_player', player_id: playerId }),
    });
    const detailRes = await fetch(`/api/tournaments/${tournament.id}`);
    if (detailRes.ok) setTournament(await detailRes.json());
  }

  async function handleReportMatch() {
    if (!tournament || !reportMatch || !reportWinnerId) return;
    setReporting(true);
    try {
      const res = await fetch(`/api/tournaments/${tournament.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'report_match',
          match_id: reportMatch.id,
          winner_id: reportWinnerId,
          player1_score: parseInt(reportP1Score) || 0,
          player2_score: parseInt(reportP2Score) || 0,
        }),
      });
      if (res.ok) {
        setTournament(await res.json());
        setReportMatch(null);
        setReportWinnerId('');
        setReportP1Score('0');
        setReportP2Score('0');
      }
    } finally {
      setReporting(false);
    }
  }

  function getPlayerName(playerId: string | null): string {
    if (!playerId || !tournament?.players) return 'BYE';
    return tournament.players.find((p) => p.id === playerId)?.player_name || 'Unknown';
  }

  if (loading) return <p className="text-xs text-muted mt-2">Loading tournament...</p>;

  // No tournament linked yet - offer to create one
  if (!tournament) {
    return (
      <div className="mt-3 pt-3 border-t border-card-border">
        <button
          onClick={handleCreateTournament}
          disabled={creatingTournament}
          className="px-3 py-1.5 bg-accent hover:opacity-90 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
        >
          {creatingTournament ? 'Creating...' : 'Create Tournament Bracket'}
        </button>
        <p className="text-xs text-muted mt-1">
          Add a tournament bracket to manage pairings, rounds, and standings.
        </p>
      </div>
    );
  }

  const players = tournament.players || [];
  const matches = tournament.matches || [];
  const rounds: Record<number, TournamentMatch[]> = {};
  matches.forEach((m) => {
    if (!rounds[m.round_number]) rounds[m.round_number] = [];
    rounds[m.round_number].push(m);
  });
  const roundNumbers = Object.keys(rounds).map(Number).sort((a, b) => a - b);

  const standings = [...players]
    .filter((p) => !p.dropped)
    .sort((a, b) => {
      if (a.standing && b.standing) return a.standing - b.standing;
      if (a.standing) return -1;
      if (b.standing) return 1;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return a.losses - b.losses;
    });

  return (
    <div className="mt-3 pt-3 border-t border-card-border space-y-3">
      {/* Tournament header - collapsible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
        style={{ minHeight: 'auto' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Tournament</span>
          <span className={`px-2 py-0.5 rounded text-xs capitalize ${TOURNAMENT_STATUS_COLORS[tournament.status] || 'bg-card-hover text-foreground/70'}`}>
            {tournament.status}
          </span>
          {tournament.format && (
            <span className="text-xs text-muted">{tournament.format}</span>
          )}
          {tournament.current_round > 0 && (
            <span className="text-xs text-muted">
              Round {tournament.current_round}/{tournament.total_rounds}
            </span>
          )}
          <span className="text-xs text-muted">
            {players.filter((p) => !p.dropped).length} players
          </span>
        </div>
        <span className="text-xs text-muted">{expanded ? '\u25BE' : '\u25B8'}</span>
      </button>

      {expanded && (
        <div className="space-y-4">
          {/* Registration phase: add players */}
          {tournament.status === 'registration' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddPlayer()}
                  placeholder="Player name"
                  className="flex-1 max-w-xs bg-input-bg border border-input-border rounded-lg px-3 py-2 text-foreground text-sm focus:border-accent focus:outline-none"
                />
                <button
                  onClick={handleAddPlayer}
                  disabled={addingPlayer || !playerName.trim()}
                  className="px-3 py-2 bg-accent hover:opacity-90 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Add
                </button>
              </div>
              {players.length > 0 && (
                <div className="space-y-1">
                  {players.map((p, i) => (
                    <div key={p.id} className="flex items-center justify-between bg-card-hover rounded-lg px-3 py-2 text-sm text-foreground">
                      <span>{i + 1}. {p.player_name}</span>
                      <button onClick={() => handleDropPlayer(p.id)} className="text-red-500 hover:text-red-400 text-xs">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {players.length >= 2 && (
                <button
                  onClick={handleStart}
                  className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Start Tournament ({players.length} players)
                </button>
              )}
            </div>
          )}

          {/* Active / Completed: Bracket */}
          {(tournament.status === 'active' || tournament.status === 'completed') && roundNumbers.length > 0 && (
            <div>
              <h4 className="text-xs text-muted uppercase tracking-wide mb-2">Bracket</h4>
              <div className="flex gap-6 overflow-x-auto pb-2">
                {roundNumbers.map((round) => (
                  <div key={round} className="min-w-50">
                    <h5 className="text-xs text-muted uppercase tracking-wide mb-2">
                      {round === (tournament.total_rounds || 1) ? 'Finals' : `Round ${round}`}
                    </h5>
                    <div className="space-y-3">
                      {rounds[round].map((match) => {
                        const isActive = match.status === 'pending' && match.player1_id && match.player2_id;
                        return (
                          <div
                            key={match.id}
                            className={`rounded border text-sm ${
                              match.status === 'completed'
                                ? 'border-input-border bg-card-hover'
                                : isActive
                                ? 'border-indigo-700 bg-card-hover'
                                : 'border-card-border bg-card'
                            }`}
                          >
                            <div className={`px-2 py-1.5 flex items-center justify-between border-b border-input-border ${
                              match.winner_id === match.player1_id ? 'text-green-400 font-medium' : 'text-foreground'
                            }`}>
                              <span className="text-xs">{match.player1_id ? getPlayerName(match.player1_id) : 'TBD'}</span>
                              {match.status === 'completed' && <span className="text-[10px] text-muted">{match.player1_score}</span>}
                            </div>
                            <div className={`px-2 py-1.5 flex items-center justify-between ${
                              match.winner_id === match.player2_id ? 'text-green-400 font-medium' : 'text-foreground'
                            }`}>
                              <span className="text-xs">{match.player2_id ? getPlayerName(match.player2_id) : 'TBD'}</span>
                              {match.status === 'completed' && <span className="text-[10px] text-muted">{match.player2_score}</span>}
                            </div>
                            {isActive && tournament.status === 'active' && (
                              <div className="border-t border-input-border px-2 py-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setReportMatch(match);
                                    setReportWinnerId('');
                                    setReportP1Score('0');
                                    setReportP2Score('0');
                                  }}
                                  className="text-xs text-indigo-400 hover:text-indigo-300"
                                >
                                  Report Result
                                </button>
                                {match.table_number && (
                                  <span className="text-[10px] text-muted ml-2">{match.table_number}</span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Round Timer + Next Round (Swiss) */}
          {tournament.status === "active" && tournament.bracket_type === "swiss" && (
            <div className="flex items-center justify-between bg-card-hover rounded-lg px-3 py-2">
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <div className={`text-xl font-mono font-bold tabular-nums ${timerDisplay === "TIME!" ? "text-red-400 animate-pulse" : "text-foreground"}`}>
                    {timerDisplay || "--:--"}
                  </div>
                  <div className="text-[10px] text-muted">Round Timer</div>
                </div>
                {!roundStartTime && (
                  <button onClick={() => setRoundStartTime(new Date())} className="px-2 py-1 bg-accent text-white rounded text-xs font-medium" style={{ minHeight: "auto" }}>
                    Start Timer
                  </button>
                )}
                <div className="flex items-center gap-1">
                  <input type="number" min={10} max={90} value={roundMinutes} onChange={(e) => setRoundMinutes(parseInt(e.target.value) || 50)} className="w-12 bg-input-bg border border-input-border rounded px-2 py-1 text-foreground text-xs text-center" />
                  <span className="text-[10px] text-muted">min</span>
                </div>
              </div>
              <div>
                {(() => {
                  const currentRoundMatches = rounds[tournament.current_round] || [];
                  const allComplete = currentRoundMatches.length > 0 && currentRoundMatches.every((m) => m.status === "completed");
                  return allComplete ? (
                    <button onClick={handleNextRound} className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded text-xs font-medium">
                      {tournament.current_round >= (tournament.total_rounds || 99) ? "Finalize" : `Round ${tournament.current_round + 1}`}
                    </button>
                  ) : (
                    <span className="text-[10px] text-muted">
                      {currentRoundMatches.filter((m) => m.status !== "completed").length} pending
                    </span>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Standings */}
          {(tournament.status === 'active' || tournament.status === 'completed') && standings.length > 0 && (
            <div>
              <h4 className="text-xs text-muted uppercase tracking-wide mb-2">
                {tournament.status === 'completed' ? 'Final Standings' : 'Standings'}
              </h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted text-left">
                    <th className="pb-1 font-medium text-xs">#</th>
                    <th className="pb-1 font-medium text-xs">Player</th>
                    <th className="pb-1 font-medium text-xs text-center">W</th>
                    <th className="pb-1 font-medium text-xs text-center">L</th>
                    <th className="pb-1 font-medium text-xs text-center">D</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((p, i) => (
                    <tr key={p.id} className={`border-t border-card-border ${
                      p.standing === 1 ? 'text-yellow-400' : 'text-foreground'
                    }`}>
                      <td className="py-1 text-xs">{p.standing || i + 1}</td>
                      <td className="py-1 text-xs font-medium">
                        {p.player_name}
                        {p.standing === 1 && tournament.status === 'completed' && (
                          <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-yellow-900 text-yellow-300">Champ</span>
                        )}
                      </td>
                      <td className="py-1 text-xs text-center text-green-400">{p.wins}</td>
                      <td className="py-1 text-xs text-center text-red-400">{p.losses}</td>
                      <td className="py-1 text-xs text-center text-muted">{p.draws}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Report Match Modal */}
          {reportMatch && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-bg outline-none" onClick={() => setReportMatch(null)} onKeyDown={(e) => { if (e.key === "Escape") setReportMatch(null); }} tabIndex={-1} ref={(el) => el?.focus()}>
              <div className="w-full max-w-sm bg-card border border-card-border rounded-xl p-6 shadow-2xl mx-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-foreground">Report Match Result</h2>
                  <button onClick={() => setReportMatch(null)} className="flex items-center justify-center h-8 w-8 rounded-full text-muted hover:text-foreground active:bg-card-hover transition-colors text-lg">&times;</button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-muted mb-1">Winner</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[reportMatch.player1_id, reportMatch.player2_id].filter(Boolean).map((pid) => (
                        <button
                          key={pid}
                          onClick={() => setReportWinnerId(pid!)}
                          className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                            reportWinnerId === pid
                              ? 'bg-green-700 text-foreground'
                              : 'bg-card-hover text-foreground/70 hover:bg-card-hover'
                          }`}
                        >
                          {getPlayerName(pid!)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-muted mb-1">{getPlayerName(reportMatch.player1_id)} Score</label>
                      <input
                        type="number"
                        min={0}
                        value={reportP1Score}
                        onChange={(e) => setReportP1Score(e.target.value)}
                        className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-foreground text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted mb-1">{getPlayerName(reportMatch.player2_id)} Score</label>
                      <input
                        type="number"
                        min={0}
                        value={reportP2Score}
                        onChange={(e) => setReportP2Score(e.target.value)}
                        className="w-full bg-input-bg border border-input-border rounded px-3 py-2 text-foreground text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setReportMatch(null)} className="flex-1 px-3 py-2 bg-card-hover hover:bg-card-hover text-foreground rounded text-sm">
                      Cancel
                    </button>
                    <button
                      onClick={handleReportMatch}
                      disabled={reporting || !reportWinnerId}
                      className="flex-1 px-3 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded text-sm font-medium"
                    >
                      {reporting ? 'Saving...' : 'Submit'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Event Calendar — monthly grid view                                 */
/* ------------------------------------------------------------------ */

function EventCalendar({ events, expandedId, onEventClick }: { events: EventWithCount[]; expandedId: string | null; onEventClick: (id: string) => void }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Build calendar grid
  const cells: Array<{ day: number | null; events: EventWithCount[] }> = [];
  for (let i = 0; i < firstDay; i++) cells.push({ day: null, events: [] });
  for (let d = 1; d <= daysInMonth; d++) {
    const dayEvents = events.filter((e) => {
      const eDate = new Date(e.starts_at);
      return eDate.getFullYear() === year && eDate.getMonth() === month && eDate.getDate() === d;
    });
    cells.push({ day: d, events: dayEvents });
  }
  // Pad to fill last row
  while (cells.length % 7 !== 0) cells.push({ day: null, events: [] });

  const today = new Date();
  const isToday = (d: number) => d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  return (
    <div className="rounded-xl border border-card-border bg-card shadow-sm dark:shadow-none overflow-hidden">
      {/* Month nav */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-card-border">
        <button onClick={() => setCurrentMonth(new Date(year, month - 1, 1))} className="text-muted hover:text-foreground text-lg px-2" style={{ minHeight: "auto" }}>{"\u25C0"}</button>
        <h3 className="text-sm font-semibold text-foreground">{monthName}</h3>
        <button onClick={() => setCurrentMonth(new Date(year, month + 1, 1))} className="text-muted hover:text-foreground text-lg px-2" style={{ minHeight: "auto" }}>{"\u25B6"}</button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-card-border">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center text-[10px] text-muted font-medium py-1.5">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => (
          <div
            key={i}
            className={`min-h-20 border-b border-r border-card-border p-1 ${
              cell.day === null ? "bg-card-hover/30" : isToday(cell.day) ? "bg-accent/5" : ""
            }`}
          >
            {cell.day && (
              <>
                <div className={`text-xs font-medium mb-0.5 ${isToday(cell.day) ? "text-accent font-bold" : "text-muted"}`}>
                  {cell.day}
                </div>
                <div className="space-y-0.5">
                  {cell.events.map((evt) => (
                    <button
                      key={evt.id}
                      onClick={() => onEventClick(evt.id)}
                      className={`w-full text-left rounded px-1 py-0.5 text-[10px] font-medium truncate transition-colors ${
                        expandedId === evt.id
                          ? "bg-accent text-white"
                          : evt.event_type === "fnm"
                            ? "bg-indigo-900/40 text-indigo-300 hover:bg-indigo-900/60"
                            : evt.event_type === "prerelease"
                              ? "bg-amber-900/40 text-amber-300 hover:bg-amber-900/60"
                              : evt.event_type === "tournament"
                                ? "bg-red-900/40 text-red-300 hover:bg-red-900/60"
                                : "bg-card-hover text-foreground/70 hover:bg-card-hover"
                      }`}
                      style={{ minHeight: "auto" }}
                      title={`${evt.name} — ${new Date(evt.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
                    >
                      {evt.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
