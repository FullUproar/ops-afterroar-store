"use client";

import { useState, useRef, useEffect } from "react";

/* ------------------------------------------------------------------ */
/*  Manager Override — PIN entry modal for action escalation           */
/*  Usage: <ManagerOverride action="adjust_credit" onAuthorized={fn} onCancel={fn} />  */
/* ------------------------------------------------------------------ */

interface ManagerOverrideProps {
  /** Description of the action being authorized (for logging) */
  action: string;
  /** Human-readable label shown in the modal */
  label?: string;
  /** Called when a manager's PIN is verified */
  onAuthorized: (manager: { id: string; name: string; role: string }) => void;
  /** Called when the modal is dismissed */
  onCancel: () => void;
}

export function ManagerOverride({ action, label, onAuthorized, onCancel }: ManagerOverrideProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus PIN input on mount
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  async function verify() {
    if (pin.length < 4) {
      setError("PIN must be at least 4 digits");
      return;
    }

    setVerifying(true);
    setError(null);

    try {
      const res = await fetch("/api/staff/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, action }),
      });

      const data = await res.json();

      if (res.ok && data.authorized) {
        onAuthorized(data.manager);
      } else {
        setError(data.error || "Invalid PIN");
        setPin("");
        inputRef.current?.focus();
      }
    } catch {
      setError("Connection error. Try again.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-bg">
      <div className="w-full max-w-xs rounded-xl border border-amber-500/30 bg-card p-6 shadow-lg mx-4">
        <div className="text-center space-y-4">
          <span className="text-3xl block">🔐</span>
          <div>
            <h3 className="text-base font-bold text-foreground">Manager Authorization</h3>
            <p className="text-xs text-muted mt-1">
              {label || "This action requires manager approval."}
            </p>
          </div>

          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={8}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ""));
              setError(null);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") verify();
              if (e.key === "Escape") onCancel();
            }}
            placeholder="Manager PIN"
            className="w-full rounded-lg border border-input-border bg-input-bg px-4 py-3 text-center text-lg font-mono tracking-[0.3em] text-foreground placeholder:text-muted focus:border-amber-500 focus:outline-none"
            disabled={verifying}
          />

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 rounded-lg border border-card-border py-2.5 text-sm font-medium text-muted hover:bg-card-hover transition-colors"
              disabled={verifying}
            >
              Cancel
            </button>
            <button
              onClick={verify}
              disabled={verifying || pin.length < 4}
              className="flex-1 rounded-lg bg-amber-600 py-2.5 text-sm font-bold text-white hover:bg-amber-500 disabled:opacity-50 transition-colors"
            >
              {verifying ? "Verifying..." : "Authorize"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
