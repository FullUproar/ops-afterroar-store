'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/page-header';

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

const STATUS_COLORS: Record<string, string> = {
  registration: 'bg-blue-900 text-blue-300',
  active: 'bg-green-900 text-green-300',
  completed: 'bg-card-hover text-foreground/70',
};

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [activeTournament, setActiveTournament] = useState<Tournament | null>(null);

  // New tournament form
  const [formName, setFormName] = useState('');
  const [formFormat, setFormFormat] = useState('');
  const [formMaxPlayers, setFormMaxPlayers] = useState('');
  const [formBracketType, setFormBracketType] = useState<'swiss' | 'single_elimination'>('swiss');
  const [saving, setSaving] = useState(false);

  // Round timer
  const [roundStartTime, setRoundStartTime] = useState<Date | null>(null);
  const [roundMinutes, setRoundMinutes] = useState(50);
  const [timerDisplay, setTimerDisplay] = useState('');

  // Add player
  const [playerName, setPlayerName] = useState('');
  const [addingPlayer, setAddingPlayer] = useState(false);

  // Report match
  const [reportMatch, setReportMatch] = useState<TournamentMatch | null>(null);
  const [reportWinnerId, setReportWinnerId] = useState('');
  const [reportP1Score, setReportP1Score] = useState('0');
  const [reportP2Score, setReportP2Score] = useState('0');
  const [reporting, setReporting] = useState(false);

  const loadTournaments = useCallback(async () => {
    try {
      const res = await fetch('/api/tournaments');
      if (res.ok) setTournaments(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTournaments(); }, [loadTournaments]);

  async function openTournament(id: string) {
    const res = await fetch(`/api/tournaments/${id}`);
    if (res.ok) setActiveTournament(await res.json());
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          format: formFormat || null,
          bracket_type: formBracketType,
          max_players: formMaxPlayers || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowForm(false);
        setFormName('');
        setFormFormat('');
        setFormMaxPlayers('');
        loadTournaments();
        openTournament(data.id);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleAddPlayer() {
    if (!activeTournament || !playerName.trim()) return;
    setAddingPlayer(true);
    try {
      const res = await fetch(`/api/tournaments/${activeTournament.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_player', player_name: playerName.trim() }),
      });
      if (res.ok) {
        setPlayerName('');
        openTournament(activeTournament.id);
      }
    } finally {
      setAddingPlayer(false);
    }
  }

  async function handleStart() {
    if (!activeTournament) return;
    const action = activeTournament.bracket_type === "swiss" ? "start_swiss" : "start";
    const res = await fetch(`/api/tournaments/${activeTournament.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      const data = await res.json();
      setActiveTournament(data);
      setRoundStartTime(new Date());
      loadTournaments();
    }
  }

  async function handleNextRound() {
    if (!activeTournament) return;
    const res = await fetch(`/api/tournaments/${activeTournament.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'next_round' }),
    });
    if (res.ok) {
      const data = await res.json();
      setActiveTournament(data);
      setRoundStartTime(new Date());
    }
  }

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

  async function handleReportMatch() {
    if (!activeTournament || !reportMatch || !reportWinnerId) return;
    setReporting(true);
    try {
      const res = await fetch(`/api/tournaments/${activeTournament.id}`, {
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
        const data = await res.json();
        setActiveTournament(data);
        setReportMatch(null);
        setReportWinnerId('');
        setReportP1Score('0');
        setReportP2Score('0');
        loadTournaments();
      }
    } finally {
      setReporting(false);
    }
  }

  async function handleDropPlayer(playerId: string) {
    if (!activeTournament) return;
    await fetch(`/api/tournaments/${activeTournament.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'drop_player', player_id: playerId }),
    });
    openTournament(activeTournament.id);
  }

  function getPlayerName(playerId: string | null): string {
    if (!playerId || !activeTournament?.players) return 'BYE';
    return activeTournament.players.find((p) => p.id === playerId)?.player_name || 'Unknown';
  }

  // Active tournament detail view
  if (activeTournament) {
    const players = activeTournament.players || [];
    const matches = activeTournament.matches || [];
    const rounds: Record<number, TournamentMatch[]> = {};
    matches.forEach((m) => {
      if (!rounds[m.round_number]) rounds[m.round_number] = [];
      rounds[m.round_number].push(m);
    });
    const roundNumbers = Object.keys(rounds).map(Number).sort((a, b) => a - b);

    // Standings: sort by wins desc, losses asc
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <PageHeader title={activeTournament.name} backHref="/dashboard/tournaments" />
            <div className="flex items-center gap-3 mt-1">
              {activeTournament.format && (
                <span className="text-sm text-muted">Format: {activeTournament.format}</span>
              )}
              <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[activeTournament.status] || 'bg-card-hover text-foreground/70'}`}>
                {activeTournament.status}
              </span>
              {activeTournament.current_round > 0 && (
                <span className="text-sm text-muted">
                  Round {activeTournament.current_round}/{activeTournament.total_rounds}
                </span>
              )}
            </div>
          </div>
          {activeTournament.status === 'registration' && players.length >= 2 && (
            <button
              onClick={handleStart}
              className="px-4 py-2 bg-green-700 hover:bg-green-600 text-foreground rounded text-sm font-medium"
            >
              Start Tournament ({players.length} players)
            </button>
          )}
        </div>

        {/* Registration phase: add players */}
        {activeTournament.status === 'registration' && (
          <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Players ({players.length}{activeTournament.max_players ? `/${activeTournament.max_players}` : ''})</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddPlayer()}
                placeholder="Player name"
                className="flex-1 max-w-xs bg-card-hover border border-input-border rounded px-3 py-2 text-foreground text-sm"
              />
              <button
                onClick={handleAddPlayer}
                disabled={addingPlayer || !playerName.trim()}
                className="px-4 py-2 bg-accent hover:opacity-90 disabled:opacity-50 text-foreground rounded text-sm"
              >
                Add Player
              </button>
            </div>
            {players.length > 0 && (
              <div className="space-y-1">
                {players.map((p, i) => (
                  <div key={p.id} className="flex items-center justify-between bg-card-hover rounded px-3 py-2 text-sm text-foreground">
                    <span>{i + 1}. {p.player_name}</span>
                    <button onClick={() => handleDropPlayer(p.id)} className="text-red-500 hover:text-red-400 text-xs">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Active / Completed: Bracket */}
        {(activeTournament.status === 'active' || activeTournament.status === 'completed') && roundNumbers.length > 0 && (
          <div className="bg-card border border-card-border rounded-xl p-4">
            <h2 className="text-sm font-semibold text-foreground mb-4">Bracket</h2>
            <div className="flex gap-8 overflow-x-auto pb-4 scroll-visible">
              {roundNumbers.map((round) => (
                <div key={round} className="min-w-55">
                  <h3 className="text-xs text-muted uppercase tracking-wide mb-3">
                    {round === (activeTournament.total_rounds || 1) ? 'Finals' : `Round ${round}`}
                  </h3>
                  <div className="space-y-4">
                    {rounds[round].map((match) => {
                      const isActive = match.status === 'pending' && match.player1_id && match.player2_id;
                      return (
                        <div
                          key={match.id}
                          className={`rounded border ${
                            match.status === 'completed'
                              ? 'border-input-border bg-card-hover'
                              : isActive
                              ? 'border-indigo-700 bg-card-hover'
                              : 'border-card-border bg-card'
                          }`}
                        >
                          {/* Player 1 */}
                          <div className={`px-3 py-2 text-sm flex items-center justify-between border-b border-input-border ${
                            match.winner_id === match.player1_id ? 'text-green-400 font-medium' : 'text-foreground'
                          }`}>
                            <span>{match.player1_id ? getPlayerName(match.player1_id) : 'TBD'}</span>
                            {match.status === 'completed' && <span className="text-xs text-muted">{match.player1_score}</span>}
                          </div>
                          {/* Player 2 */}
                          <div className={`px-3 py-2 text-sm flex items-center justify-between ${
                            match.winner_id === match.player2_id ? 'text-green-400 font-medium' : 'text-foreground'
                          }`}>
                            <span>{match.player2_id ? getPlayerName(match.player2_id) : 'TBD'}</span>
                            {match.status === 'completed' && <span className="text-xs text-muted">{match.player2_score}</span>}
                          </div>
                          {/* Report button */}
                          {isActive && activeTournament.status === 'active' && (
                            <div className="border-t border-input-border px-3 py-1.5">
                              <button
                                onClick={() => {
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
                                <span className="text-xs text-muted ml-2">{match.table_number}</span>
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
        {activeTournament.status === "active" && activeTournament.bracket_type === "swiss" && (
          <div className="bg-card border border-card-border rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className={`text-3xl font-mono font-bold tabular-nums ${timerDisplay === "TIME!" ? "text-red-400 animate-pulse" : "text-foreground"}`}>
                  {timerDisplay || "--:--"}
                </div>
                <div className="text-[10px] text-muted">Round Timer</div>
              </div>
              {!roundStartTime && (
                <button onClick={() => setRoundStartTime(new Date())} className="px-3 py-1.5 bg-accent text-white rounded text-sm font-medium" style={{ minHeight: "auto" }}>
                  Start Timer
                </button>
              )}
              <div className="flex items-center gap-1">
                <input type="number" min={10} max={90} value={roundMinutes} onChange={(e) => setRoundMinutes(parseInt(e.target.value) || 50)} className="w-14 bg-card-hover border border-input-border rounded px-2 py-1 text-foreground text-sm text-center" />
                <span className="text-xs text-muted">min</span>
              </div>
            </div>
            <div className="flex gap-2">
              {(() => {
                const currentRoundMatches = rounds[activeTournament.current_round] || [];
                const allComplete = currentRoundMatches.length > 0 && currentRoundMatches.every((m) => m.status === "completed");
                return allComplete ? (
                  <button onClick={handleNextRound} className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded text-sm font-medium">
                    {activeTournament.current_round >= (activeTournament.total_rounds || 99) ? "Finalize Tournament" : `Start Round ${activeTournament.current_round + 1}`}
                  </button>
                ) : (
                  <span className="text-xs text-muted px-3 py-2">
                    {currentRoundMatches.filter((m) => m.status !== "completed").length} match{currentRoundMatches.filter((m) => m.status !== "completed").length !== 1 ? "es" : ""} pending
                  </span>
                );
              })()}
            </div>
          </div>
        )}

        {/* Standings */}
        {(activeTournament.status === 'active' || activeTournament.status === 'completed') && standings.length > 0 && (
          <div className="bg-card border border-card-border rounded-xl p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3">
              {activeTournament.status === 'completed' ? 'Final Standings' : 'Current Standings'}
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-left">
                  <th className="pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">Player</th>
                  <th className="pb-2 font-medium text-center">W</th>
                  <th className="pb-2 font-medium text-center">L</th>
                  <th className="pb-2 font-medium text-center">D</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((p, i) => (
                  <tr key={p.id} className={`border-t border-card-border ${
                    p.standing === 1 ? 'text-yellow-400' : 'text-foreground'
                  }`}>
                    <td className="py-2">{p.standing || i + 1}</td>
                    <td className="py-2 font-medium">
                      {p.player_name}
                      {p.standing === 1 && activeTournament.status === 'completed' && (
                        <span className="ml-2 px-2 py-0.5 rounded text-xs bg-yellow-900 text-yellow-300">Champion</span>
                      )}
                    </td>
                    <td className="py-2 text-center text-green-400">{p.wins}</td>
                    <td className="py-2 text-center text-red-400">{p.losses}</td>
                    <td className="py-2 text-center text-muted">{p.draws}</td>
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
                      className="w-full bg-card-hover border border-input-border rounded px-3 py-2 text-foreground text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted mb-1">{getPlayerName(reportMatch.player2_id)} Score</label>
                    <input
                      type="number"
                      min={0}
                      value={reportP2Score}
                      onChange={(e) => setReportP2Score(e.target.value)}
                      className="w-full bg-card-hover border border-input-border rounded px-3 py-2 text-foreground text-sm"
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
                    className="flex-1 px-3 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-foreground rounded text-sm font-medium"
                  >
                    {reporting ? 'Saving...' : 'Submit'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Tournament list view
  return (
    <div className="flex flex-col h-full gap-4">
      <PageHeader
        title="Tournaments"
        action={
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-accent hover:opacity-90 text-foreground rounded text-sm font-medium"
          >
            {showForm ? 'Cancel' : 'New Tournament'}
          </button>
        }
      />

      {showForm && (
        <form onSubmit={handleCreate} className="bg-card border border-card-border rounded-xl p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-muted mb-1">Name *</label>
              <input
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full bg-card-hover border border-input-border rounded px-3 py-2 text-foreground text-sm"
                placeholder="Friday Night Magic"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Format</label>
              <input
                value={formFormat}
                onChange={(e) => setFormFormat(e.target.value)}
                className="w-full bg-card-hover border border-input-border rounded px-3 py-2 text-foreground text-sm"
                placeholder="Standard, Modern, Draft..."
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Max Players</label>
              <input
                type="number"
                min={2}
                value={formMaxPlayers}
                onChange={(e) => setFormMaxPlayers(e.target.value)}
                className="w-full bg-card-hover border border-input-border rounded px-3 py-2 text-foreground text-sm"
                placeholder="No limit"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Bracket Type</label>
              <div className="flex gap-1 rounded-lg bg-card-hover p-1">
                <button type="button" onClick={() => setFormBracketType("swiss")} className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${formBracketType === "swiss" ? "bg-card text-foreground shadow-sm" : "text-muted"}`} style={{ minHeight: "auto" }}>Swiss</button>
                <button type="button" onClick={() => setFormBracketType("single_elimination")} className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${formBracketType === "single_elimination" ? "bg-card text-foreground shadow-sm" : "text-muted"}`} style={{ minHeight: "auto" }}>Single Elim</button>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-accent hover:opacity-90 disabled:opacity-50 text-foreground rounded text-sm font-medium">
              {saving ? 'Creating...' : 'Create Tournament'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-card-hover hover:bg-card-hover text-foreground rounded text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-muted">Loading tournaments...</p>
      ) : tournaments.length === 0 ? (
        <p className="text-muted">No tournaments yet. Create one to get started.</p>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="md:hidden space-y-2">
            {tournaments.map((t) => (
              <button
                key={t.id}
                onClick={() => openTournament(t.id)}
                className="w-full rounded-xl border border-card-border bg-card p-3 text-left min-h-11 active:bg-card-hover"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground truncate mr-2">{t.name}</span>
                  <span className={`px-2 py-0.5 rounded text-xs capitalize ${STATUS_COLORS[t.status] || 'bg-card-hover text-foreground/70'}`}>
                    {t.status}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted">
                  <span>{t.format || 'No format'} &middot; {t._count?.players || 0} players</span>
                  <span>{new Date(t.created_at).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-card border border-card-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border text-muted text-left">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Format</th>
                  <th className="px-4 py-3 font-medium text-center">Players</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {tournaments.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => openTournament(t.id)}
                    className="border-b border-card-border hover:bg-card-hover cursor-pointer text-foreground"
                  >
                    <td className="px-4 py-3 font-medium">
                      {t.name}
                      {t.event && (
                        <span className="ml-2 text-xs text-muted">({t.event.name})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-foreground/70">{t.format || '--'}</td>
                    <td className="px-4 py-3 text-center text-foreground/70">
                      {t._count?.players || 0}
                      {t.max_players && <span className="text-muted">/{t.max_players}</span>}
                    </td>
                    <td className="px-4 py-3 text-foreground/70">{new Date(t.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs capitalize ${STATUS_COLORS[t.status] || 'bg-card-hover text-foreground/70'}`}>
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
