'use client';

import { useEffect, useState } from 'react';
import { useSession, SessionProvider } from 'next-auth/react';

/**
 * Time Clock — Super Simple PWA
 *
 * Designed for a wall-mounted tablet in the back room.
 * One giant button: CLOCK IN or CLOCK OUT.
 * Shows current time, staff name, hours this week.
 *
 * This page is OUTSIDE the dashboard layout — no sidebar,
 * no navigation, just the clock.
 *
 * Access: ops.afterroar.store/timeclock
 */

function TimeClock() {
  const { data: session, status } = useSession();
  const [clockedIn, setClockedIn] = useState(false);
  const [staffName, setStaffName] = useState('');
  const [hoursThisWeek, setHoursThisWeek] = useState(0);
  const [clockInTime, setClockInTime] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  // Update clock every second
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Load current status
  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/timeclock')
      .then((r) => r.json())
      .then((d) => {
        setClockedIn(d.clocked_in);
        setStaffName(d.staff_name);
        setHoursThisWeek(d.hours_this_week);
        if (d.current_entry?.clock_in) {
          setClockInTime(d.current_entry.clock_in);
        }
      })
      .catch(() => setMessage('Failed to load status'))
      .finally(() => setLoading(false));
  }, [status]);

  async function handleToggle() {
    setProcessing(true);
    setMessage('');
    try {
      const res = await fetch('/api/timeclock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: clockedIn ? 'clock_out' : 'clock_in' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setClockedIn(data.clocked_in);
      if (data.clocked_in) {
        setClockInTime(data.entry.clock_in);
        setMessage('Clocked in!');
      } else {
        const hours = data.entry.hours_worked;
        setClockInTime(null);
        setHoursThisWeek((prev) => prev + (hours ?? 0));
        setMessage(`Clocked out — ${hours?.toFixed(1)} hours`);
      }
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Error');
    } finally {
      setProcessing(false);
    }
  }

  // Elapsed time since clock in
  const elapsed = clockInTime
    ? Math.floor((currentTime.getTime() - new Date(clockInTime).getTime()) / 60000)
    : 0;
  const elapsedHours = Math.floor(elapsed / 60);
  const elapsedMins = elapsed % 60;

  if (status === 'loading' || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  if (status !== 'authenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-xl text-muted">Sign in to use the time clock</p>
          <a href="/login" className="mt-4 inline-block rounded-xl bg-indigo-600 px-6 py-3 text-foreground hover:bg-indigo-500">
            Sign In
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      {/* Current time — BIG */}
      <div className="text-6xl font-bold tabular-nums text-foreground sm:text-8xl">
        {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
      <div className="mt-2 text-lg text-muted">
        {currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>

      {/* Staff name */}
      <div className="mt-8 text-2xl font-medium text-foreground">{staffName}</div>

      {/* Status */}
      <div className="mt-2 text-sm text-muted">
        {clockedIn ? (
          <span className="text-green-400">
            Clocked in · {elapsedHours}h {elapsedMins}m
          </span>
        ) : (
          <span>Not clocked in</span>
        )}
        {' · '}
        {hoursThisWeek.toFixed(1)}h this week
      </div>

      {/* THE BUTTON — one giant tap target */}
      <button
        onClick={handleToggle}
        disabled={processing}
        className={`mt-10 h-40 w-40 rounded-full text-2xl font-bold text-foreground shadow-xl transition-all active:scale-95 disabled:opacity-50 sm:h-52 sm:w-52 sm:text-3xl ${
          clockedIn
            ? 'bg-red-600 hover:bg-red-500 shadow-red-600/30'
            : 'bg-green-600 hover:bg-green-500 shadow-green-600/30'
        }`}
      >
        {processing
          ? '...'
          : clockedIn
            ? 'CLOCK\nOUT'
            : 'CLOCK\nIN'}
      </button>

      {/* Message */}
      {message && (
        <div className="mt-6 rounded-xl bg-card-hover px-4 py-2 text-sm text-foreground/70">
          {message}
        </div>
      )}

      {/* Tiny link to main app */}
      <a href="/dashboard" className="mt-12 text-xs text-zinc-600 hover:text-muted">
        Open Store Ops
      </a>
    </div>
  );
}

export default function TimeClockPage() {
  return (
    <SessionProvider>
      <TimeClock />
    </SessionProvider>
  );
}
