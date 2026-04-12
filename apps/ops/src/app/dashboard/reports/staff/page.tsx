"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/page-header";
import { formatCents } from "@/lib/types";
import { FeatureGate } from "@/components/feature-gate";
import { StatCard, SectionHeader, EmptyState, MonoValue } from "@/components/shared/ui";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TeamSummary {
  revenue_cents: number;
  hours_worked: number;
  transaction_count: number;
  tips_cents: number;
  revenue_per_hour_cents: number;
}

interface StaffMember {
  staff_id: string;
  name: string;
  role: string;
  revenue_cents: number;
  transaction_count: number;
  avg_transaction_cents: number;
  items_per_transaction: number;
  tips_cents: number;
  hours_worked: number;
  revenue_per_hour_cents: number;
  clock_ins: number;
  on_site_pct: number | null;
}

interface StaffData {
  period: { from: string; to: string };
  team: TeamSummary;
  leaderboard: StaffMember[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const ROLE_STYLES: Record<string, string> = {
  owner: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  manager: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  cashier: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

function RoleBadge({ role }: { role: string }) {
  const cls = ROLE_STYLES[role] || "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${cls}`}>
      {role}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Period                                                              */
/* ------------------------------------------------------------------ */

type PeriodKey = "7d" | "30d" | "90d";
const PERIOD_LABELS: Record<PeriodKey, string> = { "7d": "7 Days", "30d": "30 Days", "90d": "90 Days" };

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function StaffPerformancePage() {
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [data, setData] = useState<StaffData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/staff?period=${period}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <FeatureGate module="advanced_reports">
      <div className="space-y-6">
        <PageHeader title="Staff Performance" backHref="/dashboard/reports" />

        {/* Period selector */}
        <div className="flex flex-wrap items-center gap-2">
          {(["7d", "30d", "90d"] as PeriodKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                period === key
                  ? "bg-accent text-white"
                  : "bg-card border border-card-border text-muted hover:text-foreground"
              }`}
            >
              {PERIOD_LABELS[key]}
            </button>
          ))}
        </div>

        {loading && (
          <div className="rounded-xl border border-card-border bg-card p-8 text-center">
            <p className="text-muted">Loading staff data...</p>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* Team summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Team Revenue" value={formatCents(data.team.revenue_cents)} accent="green" />
              <StatCard label="Total Hours" value={`${data.team.hours_worked}h`} />
              <StatCard label="Revenue / Hour" value={formatCents(data.team.revenue_per_hour_cents)} />
              <StatCard label="Tips Earned" value={formatCents(data.team.tips_cents)} accent={data.team.tips_cents > 0 ? "green" : "default"} />
            </div>

            {/* Leaderboard */}
            <section className="space-y-3">
              <SectionHeader count={data.leaderboard.length}>Team Leaderboard</SectionHeader>
              <p className="text-sm text-muted">Celebrate your top performers. Ranked by revenue generated.</p>

              {data.leaderboard.length === 0 ? (
                <EmptyState
                  icon={"\u229E"}
                  title="No staff activity in this period"
                  description="Staff need to ring up sales to appear here."
                />
              ) : (
                <div className="space-y-3">
                  {data.leaderboard.map((staff, i) => {
                    const medal = i === 0 ? "\u{1F947}" : i === 1 ? "\u{1F948}" : i === 2 ? "\u{1F949}" : null;
                    return (
                      <div
                        key={staff.staff_id}
                        className={`rounded-xl border bg-card p-4 ${
                          i === 0 ? "border-amber-500/30" : "border-card-border"
                        }`}
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {medal && <span className="text-lg">{medal}</span>}
                            <span className="font-semibold text-foreground text-lg">{staff.name}</span>
                            <RoleBadge role={staff.role} />
                          </div>
                          <MonoValue size="lg" className="text-green-400">
                            {formatCents(staff.revenue_cents)}
                          </MonoValue>
                        </div>

                        {/* Stats grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div>
                            <p className="text-xs text-muted">Transactions</p>
                            <p className="font-mono font-bold text-foreground">{staff.transaction_count}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted">Avg Sale</p>
                            <p className="font-mono font-bold text-foreground">{formatCents(staff.avg_transaction_cents)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted">Items / Sale</p>
                            <p className="font-mono font-bold text-foreground">{staff.items_per_transaction}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted">Tips</p>
                            <p className={`font-mono font-bold ${staff.tips_cents > 0 ? "text-green-400" : "text-muted"}`}>
                              {formatCents(staff.tips_cents)}
                            </p>
                          </div>
                        </div>

                        {/* Hours & revenue per hour */}
                        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                          {staff.hours_worked > 0 && (
                            <span className="text-muted">
                              {staff.hours_worked}h worked &middot;{" "}
                              <MonoValue size="sm">{formatCents(staff.revenue_per_hour_cents)}</MonoValue>/hr
                            </span>
                          )}
                          {staff.on_site_pct !== null && staff.clock_ins > 0 && (
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${
                              staff.on_site_pct >= 90
                                ? "border-green-500/30 bg-green-500/10 text-green-400"
                                : staff.on_site_pct >= 70
                                  ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                                  : "border-zinc-500/30 bg-zinc-500/10 text-zinc-400"
                            }`}>
                              {staff.on_site_pct}% on-site ({staff.clock_ins} clock-ins)
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Hours summary */}
            {data.leaderboard.some((s) => s.hours_worked > 0) && (
              <section className="space-y-3">
                <SectionHeader>Hours Worked</SectionHeader>
                <div className="rounded-xl border border-card-border bg-card p-4 space-y-2">
                  {(() => {
                    const maxHours = Math.max(...data.leaderboard.map((s) => s.hours_worked), 1);
                    return data.leaderboard
                      .filter((s) => s.hours_worked > 0)
                      .sort((a, b) => b.hours_worked - a.hours_worked)
                      .map((staff) => (
                        <div key={staff.staff_id} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-foreground font-medium">{staff.name}</span>
                            <span className="text-muted font-mono">{staff.hours_worked}h</span>
                          </div>
                          <div className="h-3 rounded-full bg-card-hover overflow-hidden">
                            <div
                              className="h-full rounded-full bg-blue-500 transition-all duration-500"
                              style={{ width: `${(staff.hours_worked / maxHours) * 100}%` }}
                            />
                          </div>
                        </div>
                      ));
                  })()}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </FeatureGate>
  );
}
