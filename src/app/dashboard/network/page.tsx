"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatCard, EmptyState, SectionHeader } from "@/components/shared/ui";
import { formatCents } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  /dashboard/network — Afterroar Network Dashboard                    */
/*  Cross-store tournaments, leaderboard, benchmarks, inventory net.    */
/*  Purple accent (#7D55C7) for network features.                      */
/* ------------------------------------------------------------------ */

interface NetworkStore { id: string; name: string; slug: string; city: string | null; state: string | null }
interface NetworkStats { total_stores: number; total_shared_items: number; total_events_this_month: number; total_tournament_players: number }
interface LeaderboardEntry { player_name: string; store_name: string; rating: number; wins: number; losses: number; draws: number; events_played: number; rank: number }
interface Benchmark { metric: string; label: string; your_value: number; network_avg: number; percentile: number; description: string }
interface NetworkTournament { id: string; name: string; game: string; format: string | null; status: string; starts_at: string; host_store: { name: string }; is_host: boolean; is_participating: boolean; total_players: number; participating_stores: Array<{ store: { name: string }; player_count: number }> }

export default function NetworkPage() {
  const [stores, setStores] = useState<NetworkStore[]>([]);
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [tournaments, setTournaments] = useState<NetworkTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "tournaments" | "leaderboard" | "benchmarks">("overview");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewRes, leaderboardRes, benchRes, tournamentRes] = await Promise.all([
        fetch("/api/network?action=overview"),
        fetch("/api/network?action=leaderboard&game=MTG"),
        fetch("/api/network?action=benchmarks"),
        fetch("/api/network/tournaments?status=all"),
      ]);

      if (overviewRes.ok) {
        const data = await overviewRes.json();
        setStores(data.stores || []);
        setStats(data.stats || null);
      }
      if (leaderboardRes.ok) {
        const data = await leaderboardRes.json();
        setLeaderboard(data.leaderboard || []);
      }
      if (benchRes.ok) {
        const data = await benchRes.json();
        setBenchmarks(data.benchmarks || []);
      }
      if (tournamentRes.ok) {
        const data = await tournamentRes.json();
        setTournaments(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const medals = ["\uD83E\uDD47", "\uD83E\uDD48", "\uD83E\uDD49"];

  const tabs = [
    { key: "overview" as const, label: "Network" },
    { key: "tournaments" as const, label: "Tournaments" },
    { key: "leaderboard" as const, label: "Leaderboard" },
    { key: "benchmarks" as const, label: "Benchmarks" },
  ];

  return (
    <div className="flex flex-col h-full gap-4">
      <PageHeader title="Afterroar Network" />

      {/* Purple accent bar */}
      <div className="rounded-xl bg-[#7D55C7]/10 border border-[#7D55C7]/30 p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">&#x1F310;</span>
          <div>
            <div className="text-sm font-semibold text-[#7D55C7]">
              {stats ? `Connected to ${stats.total_stores} store${stats.total_stores !== 1 ? "s" : ""} in the network` : "Loading network..."}
            </div>
            <div className="text-xs text-muted mt-0.5">
              {stats ? `${stats.total_shared_items.toLocaleString()} shared items \u00B7 ${stats.total_events_this_month} events this month` : ""}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-card-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.key
                ? "border-[#7D55C7] text-[#7D55C7]"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-12 text-muted">Loading network data...</div>}

      {/* ---- OVERVIEW ---- */}
      {!loading && activeTab === "overview" && (
        <div className="space-y-6">
          {stats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Network Stores" value={String(stats.total_stores)} accent="purple" />
              <StatCard label="Shared Items" value={stats.total_shared_items.toLocaleString()} accent="purple" />
              <StatCard label="Events This Month" value={String(stats.total_events_this_month)} />
              <StatCard label="Tournament Players" value={String(stats.total_tournament_players)} />
            </div>
          )}

          <SectionHeader>Partner Stores</SectionHeader>
          {stores.length === 0 ? (
            <EmptyState icon="&#x1F310;" title="No partner stores yet" description="When other stores join the Afterroar Network, they'll appear here." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {stores.map((s) => (
                <div key={s.id} className="rounded-xl border border-[#7D55C7]/20 bg-card p-4">
                  <div className="font-semibold text-foreground">{s.name}</div>
                  {s.city && <div className="text-sm text-muted mt-0.5">{s.city}{s.state ? `, ${s.state}` : ""}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---- TOURNAMENTS ---- */}
      {!loading && activeTab === "tournaments" && (
        <div className="space-y-4">
          {tournaments.length === 0 ? (
            <EmptyState icon="&#x1F3C6;" title="No network tournaments yet" description="Create a cross-store tournament to compete with other Afterroar stores." />
          ) : (
            tournaments.map((t) => (
              <div key={t.id} className="rounded-xl border border-card-border bg-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-foreground">{t.name}</div>
                    <div className="text-sm text-muted">
                      {t.game}{t.format ? ` \u00B7 ${t.format}` : ""} \u00B7 Hosted by {t.host_store.name}
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded ${
                    t.status === "upcoming" ? "bg-blue-500/20 text-blue-400" :
                    t.status === "active" ? "bg-green-500/20 text-green-400" :
                    t.status === "completed" ? "bg-emerald-500/20 text-emerald-400" :
                    "bg-red-500/20 text-red-400"
                  }`}>
                    {t.status}
                  </span>
                </div>
                <div className="text-xs text-muted">
                  {new Date(t.starts_at).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                  {" \u00B7 "}{t.participating_stores.length} store{t.participating_stores.length !== 1 ? "s" : ""}
                  {" \u00B7 "}{t.total_players} player{t.total_players !== 1 ? "s" : ""}
                </div>
                {t.participating_stores.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {t.participating_stores.map((ps, i) => (
                      <span key={i} className="text-xs bg-[#7D55C7]/10 text-[#7D55C7] px-2 py-0.5 rounded">
                        {ps.store.name} ({ps.player_count})
                      </span>
                    ))}
                  </div>
                )}
                {!t.is_participating && t.status === "upcoming" && (
                  <button
                    onClick={async () => {
                      await fetch("/api/network/tournaments", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ tournament_id: t.id, action: "join" }),
                      });
                      loadData();
                    }}
                    className="rounded-lg bg-[#7D55C7] px-4 py-2 text-sm font-medium text-white hover:bg-[#6B45B7] transition-colors"
                  >
                    Join Tournament
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ---- LEADERBOARD ---- */}
      {!loading && activeTab === "leaderboard" && (
        <div className="space-y-4">
          {leaderboard.length === 0 ? (
            <EmptyState icon="&#x1F3C5;" title="No ranked players yet" description="Player ratings are calculated from tournament match results across the network." />
          ) : (
            <div className="rounded-xl border border-card-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-card-border text-muted text-xs uppercase tracking-wider">
                    <th className="px-4 py-3 text-left w-12">#</th>
                    <th className="px-4 py-3 text-left">Player</th>
                    <th className="px-4 py-3 text-left">Store</th>
                    <th className="px-4 py-3 text-right">Rating</th>
                    <th className="px-4 py-3 text-right">W-L-D</th>
                    <th className="px-4 py-3 text-right">Events</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry) => (
                    <tr key={`${entry.player_name}-${entry.rank}`} className="border-b border-card-border/50 hover:bg-card-hover transition-colors">
                      <td className="px-4 py-3 text-lg">
                        {entry.rank <= 3 ? medals[entry.rank - 1] : <span className="text-muted text-sm">{entry.rank}</span>}
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">{entry.player_name}</td>
                      <td className="px-4 py-3 text-muted">{entry.store_name}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-[#7D55C7] tabular-nums">{entry.rating}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-muted">{entry.wins}-{entry.losses}-{entry.draws}</td>
                      <td className="px-4 py-3 text-right text-muted">{entry.events_played}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ---- BENCHMARKS ---- */}
      {!loading && activeTab === "benchmarks" && (
        <div className="space-y-4">
          {benchmarks.length === 0 ? (
            <EmptyState
              icon="&#x1F4CA;"
              title="Not enough data yet"
              description="Benchmarks require at least 3 stores with benchmarking enabled. Enable it in Settings to participate."
            />
          ) : (
            <>
              <div className="text-sm text-muted">How your store compares to the Afterroar Network (anonymized, last 30 days)</div>
              {benchmarks.map((b) => (
                <div key={b.metric} className="rounded-xl border border-card-border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-foreground">{b.label}</div>
                    <div className="text-sm font-bold text-[#7D55C7]">Top {100 - b.percentile}%</div>
                  </div>
                  {/* Percentile bar */}
                  <div className="relative h-3 rounded-full bg-card-hover overflow-hidden">
                    <div
                      className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${b.percentile}%`,
                        background: b.percentile >= 70 ? "#22c55e" : b.percentile >= 40 ? "#eab308" : "#ef4444",
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>You: {b.metric.includes("transaction") ? formatCents(b.your_value) : b.your_value}</span>
                    <span>Network avg: {b.metric.includes("transaction") ? formatCents(Math.round(b.network_avg)) : Math.round(b.network_avg)}</span>
                  </div>
                  <div className="text-sm text-muted">{b.description}</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
