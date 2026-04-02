"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

/* ------------------------------------------------------------------ */
/*  Mobile Timeclock — /clock/[slug]                                   */
/*  PIN-based, no session required. PWA-installable.                   */
/*  Employee opens on phone → picks name → enters PIN → clock in/out.  */
/* ------------------------------------------------------------------ */

interface StaffOption {
  id: string;
  name: string;
}

interface StoreInfo {
  id: string;
  name: string;
  slug: string;
}

interface Geofence {
  lat: number;
  lng: number;
  radius: number;
}

type ClockLocation = "on_site" | "remote" | "no_gps";

export default function MobileTimeclockPage() {
  const params = useParams();
  const slug = params.slug as string;

  // Store data
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [geofence, setGeofence] = useState<Geofence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auth state
  const [selectedStaff, setSelectedStaff] = useState<StaffOption | null>(null);
  const [pin, setPin] = useState("");
  const [authing, setAuthing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Clock state
  const [clockedIn, setClockedIn] = useState(false);
  const [staffName, setStaffName] = useState("");
  const [clockInTime, setClockInTime] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [locationStatus, setLocationStatus] = useState<ClockLocation>("no_gps");

  // Time display
  const [currentTime, setCurrentTime] = useState(new Date());
  const pinInputRef = useRef<HTMLInputElement>(null);

  // GPS coords
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);

  // Update clock every second
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Load store data
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/clock?store=${encodeURIComponent(slug)}`);
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Store not found");
          return;
        }
        const data = await res.json();
        setStore(data.store);
        setStaffList(data.staff);
        setGeofence(data.geofence);
      } catch {
        setError("Unable to connect. Check your internet connection.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  // Request GPS on mount
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLat(pos.coords.latitude);
        setUserLng(pos.coords.longitude);
      },
      () => {
        // GPS denied or unavailable — that's fine
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // Compute location status when GPS or geofence changes
  useEffect(() => {
    if (userLat == null || userLng == null) {
      setLocationStatus("no_gps");
      return;
    }
    if (!geofence) {
      setLocationStatus("on_site");
      return;
    }
    const distance = haversineDistance(userLat, userLng, geofence.lat, geofence.lng);
    setLocationStatus(distance <= geofence.radius ? "on_site" : "remote");
  }, [userLat, userLng, geofence]);

  const handlePunch = useCallback(async (action: "clock_in" | "clock_out") => {
    if (!selectedStaff || !store) return;
    setProcessing(true);
    setAuthError(null);

    try {
      const res = await fetch("/api/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_slug: store.slug,
          staff_id: selectedStaff.id,
          pin,
          action,
          lat: userLat,
          lng: userLng,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error || "Failed");
        setProcessing(false);
        return;
      }

      setClockedIn(data.clocked_in);
      setStaffName(data.staff_name);

      if (data.clocked_in) {
        setClockInTime(data.entry.clock_in);
        const loc = data.entry.location as ClockLocation;
        setLastAction(`Clocked in${loc === "remote" ? " (remote)" : ""}`);
      } else {
        setClockInTime(null);
        const hours = Number(data.entry.hours_worked);
        setLastAction(`Clocked out — ${hours.toFixed(1)} hours`);
      }
    } catch {
      setAuthError("Connection error. Try again.");
    } finally {
      setProcessing(false);
    }
  }, [selectedStaff, store, pin, userLat, userLng]);

  // Elapsed time
  const elapsed = clockInTime
    ? Math.floor((currentTime.getTime() - new Date(clockInTime).getTime()) / 60000)
    : 0;
  const elapsedHours = Math.floor(elapsed / 60);
  const elapsedMins = elapsed % 60;

  // ---- LOADING ----
  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#0a0a1a]">
        <div className="text-center">
          <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <p className="text-sm text-zinc-400">Loading...</p>
        </div>
      </div>
    );
  }

  // ---- ERROR ----
  if (error) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#0a0a1a] p-6">
        <div className="text-center">
          <p className="text-xl text-zinc-300">{error}</p>
          <p className="mt-2 text-sm text-zinc-500">Check the URL or ask your manager for the clock-in link.</p>
        </div>
      </div>
    );
  }

  // ---- NO STAFF WITH PINS ----
  if (staffList.length === 0) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#0a0a1a] p-6">
        <div className="text-center max-w-sm">
          <p className="text-xl text-zinc-300 font-semibold">{store?.name}</p>
          <p className="mt-4 text-sm text-zinc-400">
            No staff PINs have been set up yet. Ask your store owner to set PINs in Staff settings.
          </p>
        </div>
      </div>
    );
  }

  // ---- SELECT STAFF ----
  if (!selectedStaff) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#0a0a1a] p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <p className="text-xs uppercase tracking-widest text-amber-500/70 font-semibold">
              {store?.name}
            </p>
            <h1 className="text-2xl font-bold text-zinc-100 mt-2">Time Clock</h1>
            <p className="text-sm text-zinc-500 mt-1">Tap your name to clock in</p>
          </div>

          <div className="space-y-2">
            {staffList.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedStaff(s);
                  setPin("");
                  setAuthError(null);
                  setTimeout(() => pinInputRef.current?.focus(), 100);
                }}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4 text-left text-lg font-medium text-zinc-200 active:bg-zinc-800 transition-colors"
              >
                {s.name}
              </button>
            ))}
          </div>

          {/* Location indicator */}
          <div className="mt-6 text-center">
            <LocationBadge status={locationStatus} />
          </div>
        </div>
      </div>
    );
  }

  // ---- PIN ENTRY + CLOCK ----
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#0a0a1a] p-6">
      <div className="w-full max-w-sm">
        {/* Time */}
        <div className="text-center mb-6">
          <div className="text-5xl font-bold tabular-nums text-zinc-100">
            {currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
          <div className="text-sm text-zinc-500 mt-1">
            {currentTime.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}
          </div>
        </div>

        {/* Staff name */}
        <div className="text-center mb-6">
          <p className="text-xl font-semibold text-zinc-200">{selectedStaff.name}</p>
          {clockedIn && (
            <p className="text-sm text-green-400 mt-1">
              Clocked in {"\u00B7"} {elapsedHours}h {elapsedMins}m
            </p>
          )}
          <LocationBadge status={locationStatus} />
        </div>

        {/* PIN Input */}
        {!clockedIn && !staffName && (
          <div className="mb-6">
            <input
              ref={pinInputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={pin}
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setAuthError(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && pin.length >= 4) {
                  handlePunch("clock_in");
                }
              }}
              placeholder="Enter PIN"
              autoFocus
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-5 py-4 text-center text-2xl font-mono tracking-[0.5em] text-zinc-100 placeholder:text-zinc-600 placeholder:tracking-normal focus:border-amber-500 focus:outline-none"
            />
          </div>
        )}

        {/* Auth error */}
        {authError && (
          <div className="mb-4 rounded-xl bg-red-900/30 border border-red-500/30 px-4 py-3 text-center text-sm text-red-300">
            {authError}
          </div>
        )}

        {/* Action message */}
        {lastAction && (
          <div className="mb-4 rounded-xl bg-zinc-800/50 px-4 py-3 text-center text-sm text-zinc-300">
            {lastAction}
          </div>
        )}

        {/* Clock buttons */}
        <div className="space-y-3">
          {!clockedIn ? (
            <button
              onClick={() => handlePunch("clock_in")}
              disabled={processing || pin.length < 4}
              className="w-full rounded-2xl bg-green-600 py-5 text-xl font-bold text-white shadow-lg shadow-green-600/20 active:bg-green-700 disabled:opacity-40 transition-all"
            >
              {processing ? "..." : "CLOCK IN"}
            </button>
          ) : (
            <button
              onClick={() => handlePunch("clock_out")}
              disabled={processing}
              className="w-full rounded-2xl bg-red-600 py-5 text-xl font-bold text-white shadow-lg shadow-red-600/20 active:bg-red-700 disabled:opacity-40 transition-all"
            >
              {processing ? "..." : "CLOCK OUT"}
            </button>
          )}

          {/* Switch user */}
          <button
            onClick={() => {
              setSelectedStaff(null);
              setPin("");
              setClockedIn(false);
              setStaffName("");
              setClockInTime(null);
              setLastAction(null);
              setAuthError(null);
            }}
            className="w-full rounded-xl border border-zinc-800 bg-transparent py-3 text-sm font-medium text-zinc-400 active:bg-zinc-900 transition-colors"
          >
            Switch User
          </button>
        </div>
      </div>

      {/* Store name at bottom */}
      <p className="mt-8 text-[10px] uppercase tracking-widest text-zinc-700">
        {store?.name}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Location Badge                                                      */
/* ------------------------------------------------------------------ */

function LocationBadge({ status }: { status: ClockLocation }) {
  if (status === "on_site") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-900/30 border border-green-500/20 px-3 py-1 text-xs text-green-400 mt-2">
        <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
        At store
      </span>
    );
  }
  if (status === "remote") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-900/30 border border-amber-500/20 px-3 py-1 text-xs text-amber-400 mt-2">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        Remote
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 border border-zinc-700 px-3 py-1 text-xs text-zinc-500 mt-2">
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
      No GPS
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Haversine (client-side for preview)                                */
/* ------------------------------------------------------------------ */

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
