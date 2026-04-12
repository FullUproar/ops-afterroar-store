"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [staffName, setStaffName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function validate() {
      try {
        const res = await fetch(`/api/staff/accept-invite?token=${token}`);
        if (res.ok) {
          const data = await res.json();
          setStaffName(data.staff_name);
          setStoreName(data.store_name);
          setRole(data.role);
        } else {
          const data = await res.json().catch(() => ({ error: "Invalid invite" }));
          setError(data.error);
        }
      } catch {
        setError("Failed to validate invite link.");
      } finally {
        setLoading(false);
      }
    }
    validate();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
      setError("PIN must be 4-8 digits.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/staff/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, pin }),
      });

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => router.push("/login"), 3000);
      } else {
        const data = await res.json().catch(() => ({ error: "Failed to accept invite" }));
        setError(data.error);
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white">
        <p className="text-muted">Validating invite...</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white">
        <div className="max-w-sm text-center space-y-4">
          <span className="text-4xl">&#x2705;</span>
          <h1 className="text-xl font-bold">You're all set!</h1>
          <p className="text-muted">Your account is ready. Redirecting to login...</p>
        </div>
      </div>
    );
  }

  if (error && !staffName) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white">
        <div className="max-w-sm text-center space-y-4">
          <span className="text-4xl">&#x26A0;</span>
          <h1 className="text-xl font-bold">Invalid Invite</h1>
          <p className="text-muted">{error}</p>
          <a href="/login" className="inline-block mt-4 px-6 py-2 bg-accent text-white rounded-lg text-sm font-medium">
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-bold">Join {storeName}</h1>
          <p className="text-muted mt-1">
            Welcome, {staffName}! You've been added as <strong className="text-foreground">{role}</strong>.
          </p>
          <p className="text-xs text-muted mt-2">Set your password and PIN to get started.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-muted mb-1">Password (min 8 characters)</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-white focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Confirm Password</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-white focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">PIN (4-8 digits, for clock-in and register)</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              required
              minLength={4}
              maxLength={8}
              value={pin}
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError(null); }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-white text-center tracking-[0.3em] font-mono focus:border-accent focus:outline-none"
            />
          </div>

          {error && <p className="text-xs text-red-400 text-center">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-accent py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? "Setting up..." : "Set Password & PIN"}
          </button>
        </form>
      </div>
    </div>
  );
}
