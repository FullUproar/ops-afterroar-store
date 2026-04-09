"use client";

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store-context";
import { PageHeader } from "@/components/page-header";

interface TimeEntry {
  id: string;
  clock_in: string;
  clock_out: string | null;
  hours_worked: number | null;
  notes: string | null;
}

interface TimeclockData {
  clocked_in: boolean;
  current_entry: TimeEntry | null;
  recent: TimeEntry[];
  hours_this_week: number;
  staff_name: string;
}

interface StaffClockStatus {
  staff_id: string;
  staff_name: string;
  clocked_in: boolean;
  clock_in_time: string | null;
}

export default function TimeclockPage() {
  const { can } = useStore();
  const [data, setData] = useState<TimeclockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [allStaff, setAllStaff] = useState<StaffClockStatus[]>([]);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/timeclock");
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAllStaff = useCallback(async () => {
    if (!can("staff.manage")) return;
    try {
      const res = await fetch("/api/timeclock/staff");
      if (res.ok) {
        setAllStaff(await res.json());
      }
    } catch {
      // Staff endpoint may not exist yet — that's okay
    }
  }, [can]);

  useEffect(() => {
    loadData();
    loadAllStaff();
  }, [loadData, loadAllStaff]);

  async function handleClockAction(action: "clock_in" | "clock_out") {
    if (processing) return;
    setProcessing(true);
    try {
      const res = await fetch("/api/timeclock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        loadData();
        loadAllStaff();
      } else {
        const d = await res.json();
        alert(d.error || "Failed");
      }
    } finally {
      setProcessing(false);
    }
  }

  function formatHours(hours: number | null): string {
    if (hours === null || hours === undefined) return "--";
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  }

  function formatDuration(clockIn: string): string {
    const diff = Date.now() - new Date(clockIn).getTime();
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${mins}m`;
  }

  if (!can("checkout")) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted">You don&apos;t have permission to access time clock.</p>
      </div>
    );
  }

  if (loading) {
    return <p className="text-muted py-12 text-center">Loading time clock...</p>;
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <PageHeader title="Time Clock" />

      {data && (
        <>
          {/* Current Status + Clock Button */}
          <div className="rounded-xl border border-card-border bg-card p-6">
            <div className="text-center space-y-4">
              <div>
                <div className="text-sm text-muted">Welcome, {data.staff_name}</div>
                <div className="mt-1">
                  {data.clocked_in ? (
                    <span className="rounded-full bg-emerald-900/50 px-3 py-1 text-sm font-medium text-emerald-400">
                      Clocked In
                    </span>
                  ) : (
                    <span className="rounded-full bg-card-hover px-3 py-1 text-sm font-medium text-muted">
                      Clocked Out
                    </span>
                  )}
                </div>
              </div>

              {data.clocked_in && data.current_entry && (
                <div>
                  <div className="text-sm text-muted">Current shift started</div>
                  <div className="text-foreground font-medium">
                    {new Date(data.current_entry.clock_in).toLocaleTimeString()}
                  </div>
                  <div className="text-sm text-muted">
                    {formatDuration(data.current_entry.clock_in)} so far
                  </div>
                </div>
              )}

              <button
                onClick={() =>
                  handleClockAction(data.clocked_in ? "clock_out" : "clock_in")
                }
                disabled={processing}
                className={`w-full max-w-xs mx-auto rounded-xl py-4 text-lg font-bold transition-colors ${
                  data.clocked_in
                    ? "bg-red-600 text-foreground hover:bg-red-500"
                    : "bg-emerald-600 text-foreground hover:bg-emerald-500"
                } disabled:opacity-50`}
              >
                {processing
                  ? "Processing..."
                  : data.clocked_in
                  ? "Clock Out"
                  : "Clock In"}
              </button>
            </div>
          </div>

          {/* This Week Summary */}
          <div className="rounded-xl border border-card-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">This Week</span>
              <span className="text-lg font-semibold text-foreground">
                {formatHours(data.hours_this_week)}
              </span>
            </div>
          </div>

          {/* Manager view: all staff status */}
          {can("staff.manage") && allStaff.length > 0 && (
            <div className="rounded-xl border border-card-border bg-card">
              <div className="border-b border-card-border px-4 py-3">
                <h3 className="text-sm font-semibold text-foreground/70">All Staff Status</h3>
              </div>
              <div className="divide-y divide-zinc-800">
                {allStaff.map((s) => (
                  <div
                    key={s.staff_id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div className="text-sm text-foreground">{s.staff_name}</div>
                    <div>
                      {s.clocked_in ? (
                        <div className="text-right">
                          <span className="rounded-full bg-emerald-900/50 px-2 py-0.5 text-xs font-medium text-emerald-400">
                            In
                          </span>
                          {s.clock_in_time && (
                            <div className="text-xs text-muted mt-0.5">
                              since {new Date(s.clock_in_time).toLocaleTimeString()}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="rounded-full bg-card-hover px-2 py-0.5 text-xs font-medium text-muted">
                          Out
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent History */}
          <div className="rounded-xl border border-card-border bg-card">
            <div className="border-b border-card-border px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground/70">Recent Shifts</h3>
            </div>
            {data.recent.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted">No shifts recorded yet.</p>
            ) : (
              <>
                {/* Mobile card view */}
                <div className="md:hidden divide-y divide-zinc-800">
                  {data.recent.map((entry) => (
                    <div key={entry.id} className="px-4 py-3 min-h-11">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-foreground">
                          {new Date(entry.clock_in).toLocaleDateString()}
                        </span>
                        <span className="text-sm font-mono text-foreground">
                          {entry.hours_worked !== null
                            ? formatHours(Number(entry.hours_worked))
                            : "---"}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted">
                        {new Date(entry.clock_in).toLocaleTimeString()} &mdash;{" "}
                        {entry.clock_out
                          ? new Date(entry.clock_out).toLocaleTimeString()
                          : "ongoing"}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto scroll-visible">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-card-border text-muted text-left">
                        <th className="px-4 py-2 font-medium">Date</th>
                        <th className="px-4 py-2 font-medium">Clock In</th>
                        <th className="px-4 py-2 font-medium">Clock Out</th>
                        <th className="px-4 py-2 font-medium text-right">Hours</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {data.recent.map((entry) => (
                        <tr key={entry.id} className="text-foreground">
                          <td className="px-4 py-2 text-foreground/70">
                            {new Date(entry.clock_in).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-2">
                            {new Date(entry.clock_in).toLocaleTimeString()}
                          </td>
                          <td className="px-4 py-2">
                            {entry.clock_out
                              ? new Date(entry.clock_out).toLocaleTimeString()
                              : "---"}
                          </td>
                          <td className="px-4 py-2 text-right font-mono">
                            {entry.hours_worked !== null
                              ? formatHours(Number(entry.hours_worked))
                              : "---"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
