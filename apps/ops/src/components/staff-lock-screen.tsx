"use client";

import { useState, useEffect, useRef } from "react";
import { signOut } from "next-auth/react";

/* ------------------------------------------------------------------ */
/*  Staff Lock Screen — Layer 2 authentication                         */
/*  Shows when staff_lock_enabled and no active staff cookie.          */
/*  Staff picks their name → enters PIN → system unlocks.              */
/* ------------------------------------------------------------------ */

interface StaffOption {
  id: string;
  name: string;
  has_pin: boolean;
}

interface StaffLockScreenProps {
  storeName: string;
  onUnlock: (staff: { id: string; name: string; role: string }) => void;
}

export function StaffLockScreen({ storeName, onUnlock }: StaffLockScreenProps) {
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<StaffOption | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [authing, setAuthing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const pinRef = useRef<HTMLInputElement>(null);

  // Clock
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Load staff list
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/staff");
        if (res.ok) {
          const data = await res.json();
          setStaffList(data.filter((s: StaffOption & { active: boolean }) => s.active && s.has_pin));
        }
      } catch {
        // fail silently
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleAuth() {
    if (!selectedStaff || pin.length < 4) return;
    setAuthing(true);
    setError(null);

    try {
      const res = await fetch("/api/staff-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_id: selectedStaff.id, pin }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Invalid PIN");
        setPin("");
        setAuthing(false);
        return;
      }

      onUnlock(data.staff);
    } catch {
      setError("Connection error");
    } finally {
      setAuthing(false);
    }
  }

  // ---- Loading ----
  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0a1a]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  // ---- No PINs set ----
  if (staffList.length === 0) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0a0a1a] p-6">
        <div className="text-center max-w-sm">
          <p className="text-xs uppercase tracking-widest text-accent/70 font-semibold">{storeName}</p>
          <h1 className="text-xl font-bold text-zinc-100 mt-2">Staff Lock Enabled</h1>
          <p className="mt-4 text-sm text-zinc-400">
            No staff PINs have been set up yet. Go to Staff settings to set PINs for your team.
          </p>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="mt-6 rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // ---- Staff picker ----
  if (!selectedStaff) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0a0a1a] p-6">
        <div className="w-full max-w-sm">
          {/* Time */}
          <div className="text-center mb-8">
            <div className="text-5xl font-bold tabular-nums text-zinc-100">
              {currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="text-sm text-zinc-500 mt-1">
              {currentTime.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}
            </div>
          </div>

          <div className="text-center mb-6">
            <p className="text-xs uppercase tracking-widest text-accent/70 font-semibold">{storeName}</p>
            <h2 className="text-lg font-bold text-zinc-100 mt-1">Start Your Shift</h2>
          </div>

          <div className="space-y-2">
            {staffList.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedStaff(s);
                  setPin("");
                  setError(null);
                  setTimeout(() => pinRef.current?.focus(), 100);
                }}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4 text-left text-lg font-medium text-zinc-200 active:bg-zinc-800 transition-colors"
              >
                {s.name}
              </button>
            ))}
          </div>

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="mt-8 w-full text-center text-xs text-zinc-600 hover:text-zinc-400 transition-colors py-2"
          >
            Switch Account
          </button>
        </div>
      </div>
    );
  }

  // ---- PIN entry ----
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0a0a1a] p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <p className="text-lg font-semibold text-zinc-200">{selectedStaff.name}</p>
          <p className="text-sm text-zinc-500">Enter your PIN</p>
        </div>

        <input
          ref={pinRef}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={8}
          value={pin}
          onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter" && pin.length >= 4) handleAuth(); }}
          placeholder="PIN"
          autoFocus
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-5 py-4 text-center text-2xl font-mono tracking-[0.5em] text-zinc-100 placeholder:text-zinc-600 placeholder:tracking-normal focus:border-accent focus:outline-none"
        />

        {error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}

        <button
          onClick={handleAuth}
          disabled={authing || pin.length < 4}
          className="mt-4 w-full rounded-xl bg-emerald-600 py-4 text-lg font-bold text-white active:bg-emerald-700 disabled:opacity-40 transition-all"
        >
          {authing ? "..." : "Start Shift"}
        </button>

        <button
          onClick={() => { setSelectedStaff(null); setPin(""); setError(null); }}
          className="mt-2 w-full text-center text-sm text-zinc-500 hover:text-zinc-300 transition-colors py-2"
        >
          Back
        </button>
      </div>
    </div>
  );
}
