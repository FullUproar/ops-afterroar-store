"use client";

/**
 * /dashboard/devices — Paired register tablets.
 *
 * Each row is a tablet that's been paired to this store. Owner can:
 *   - "Pair new register" → 6-digit code modal (10-min expiry, big readable digits)
 *   - Rename a device
 *   - Revoke a device (the token immediately stops working)
 *
 * Identity chain shown per row: device ← paired by → Passport user.
 */

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";

interface DeviceRow {
  id: string;
  display_name: string;
  device_id: string;
  paired_by: { id: string; email: string; display_name: string | null };
  last_seen_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  scopes: string[];
  created_at: string;
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pairOpen, setPairOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/devices");
      if (!res.ok) throw new Error(`Load failed (${res.status})`);
      const data = await res.json();
      setDevices(data.devices ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const active = devices.filter((d) => !d.revoked_at);
  const revoked = devices.filter((d) => d.revoked_at);

  return (
    <div className="flex flex-col h-full gap-4">
      <PageHeader
        title="Devices"
        crumb="Console · People"
        desc="Paired register tablets, signed in via Passport. Revoke anytime — the token stops working immediately."
        action={
          <button
            type="button"
            onClick={() => setPairOpen(true)}
            className="inline-flex items-center font-display uppercase transition-colors"
            style={{
              fontSize: "0.85rem",
              letterSpacing: "0.06em",
              fontWeight: 700,
              padding: "0 1rem",
              minHeight: 48,
              color: "var(--void)",
              background: "var(--orange)",
              border: "1px solid var(--orange)",
            }}
          >
            Pair new register
          </button>
        }
      />

      {error && (
        <div className="p-3" style={{ border: "1px solid var(--red)", background: "var(--red-mute)", color: "var(--red)", fontSize: "0.85rem" }}>
          {error}
        </div>
      )}

      {/* Active devices */}
      <div className="ar-zone">
        <div className="ar-zone-head">
          <span>Active</span>
          <span>{loading ? "Loading…" : `${active.length}`}</span>
        </div>
        {loading ? (
          <div className="p-8 text-center font-mono text-ink-soft" style={{ fontSize: "0.74rem" }}>Loading…</div>
        ) : active.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-mono uppercase text-ink-faint mb-2" style={{ fontSize: "0.66rem", letterSpacing: "0.28em" }}>
              No paired registers
            </p>
            <p className="text-ink-soft mb-4" style={{ fontSize: "0.85rem" }}>
              Pair a tablet to use it as a register.
            </p>
            <button
              type="button"
              onClick={() => setPairOpen(true)}
              className="inline-flex items-center font-display uppercase"
              style={{
                fontSize: "0.85rem",
                letterSpacing: "0.06em",
                fontWeight: 700,
                padding: "0 1rem",
                minHeight: 48,
                color: "var(--void)",
                background: "var(--orange)",
                border: "1px solid var(--orange)",
              }}
            >
              Pair new register
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-soft" style={{ fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Paired by</th>
                <th className="px-4 py-2 font-medium">Last seen</th>
                <th className="px-4 py-2 font-medium">Paired</th>
                <th className="px-4 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {active.map((d) => (
                <DeviceRowDisplay key={d.id} device={d} onChange={load} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Revoked devices */}
      {revoked.length > 0 && (
        <div className="ar-zone">
          <div className="ar-zone-head">
            <span>Revoked</span>
            <span>{revoked.length}</span>
          </div>
          <table className="w-full text-sm opacity-70">
            <thead>
              <tr className="text-left text-ink-soft" style={{ fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Paired by</th>
                <th className="px-4 py-2 font-medium">Revoked</th>
                <th className="px-4 py-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {revoked.map((d) => (
                <tr key={d.id} className="border-t border-rule">
                  <td className="px-4 py-3 line-through text-ink-soft">{d.display_name}</td>
                  <td className="px-4 py-3">{d.paired_by.display_name ?? d.paired_by.email}</td>
                  <td className="px-4 py-3 font-mono text-xs">{formatRelative(d.revoked_at)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{d.revoke_reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pairOpen && (
        <PairModal
          onClose={() => setPairOpen(false)}
          onPaired={() => {
            setPairOpen(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function DeviceRowDisplay({ device, onChange }: { device: DeviceRow; onChange: () => void }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(device.display_name);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await fetch(`/api/devices/${device.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: name.trim() }),
      });
      setRenaming(false);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!confirm(`Revoke "${device.display_name}"? The tablet will stop working immediately.`)) return;
    setBusy(true);
    try {
      await fetch(`/api/devices/${device.id}`, { method: "DELETE" });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-t border-rule">
      <td className="px-4 py-3">
        {renaming ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") setRenaming(false);
            }}
            autoFocus
            className="bg-input-bg text-foreground border border-input-border px-2 py-1 text-sm rounded"
          />
        ) : (
          <button
            type="button"
            onClick={() => setRenaming(true)}
            className="text-ink hover:text-cream cursor-pointer"
            style={{ background: "transparent", border: "none", padding: 0 }}
          >
            {device.display_name}
          </button>
        )}
        <div className="font-mono text-ink-faint mt-1" style={{ fontSize: "0.66rem" }}>
          {device.device_id.slice(0, 16)}…
        </div>
      </td>
      <td className="px-4 py-3">
        <div>{device.paired_by.display_name ?? device.paired_by.email}</div>
        {device.paired_by.display_name && (
          <div className="text-ink-soft" style={{ fontSize: "0.72rem" }}>{device.paired_by.email}</div>
        )}
      </td>
      <td className="px-4 py-3 font-mono text-xs">
        {device.last_seen_at ? formatRelative(device.last_seen_at) : "Never"}
      </td>
      <td className="px-4 py-3 font-mono text-xs">{formatRelative(device.created_at)}</td>
      <td className="px-4 py-3 text-right">
        {renaming ? (
          <div className="flex gap-1 justify-end">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="font-mono uppercase"
              style={{
                fontSize: "0.7rem",
                letterSpacing: "0.1em",
                padding: "0.4rem 0.625rem",
                background: "var(--orange)",
                color: "var(--void)",
                border: "1px solid var(--orange)",
              }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => { setRenaming(false); setName(device.display_name); }}
              disabled={busy}
              className="font-mono uppercase"
              style={{
                fontSize: "0.7rem",
                letterSpacing: "0.1em",
                padding: "0.4rem 0.625rem",
                background: "transparent",
                color: "var(--ink-soft)",
                border: "1px solid var(--rule)",
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={revoke}
            disabled={busy}
            className="font-mono uppercase"
            style={{
              fontSize: "0.7rem",
              letterSpacing: "0.1em",
              padding: "0.4rem 0.75rem",
              background: "transparent",
              color: "var(--red)",
              border: "1px solid var(--red)",
            }}
          >
            Revoke
          </button>
        )}
      </td>
    </tr>
  );
}

function PairModal({ onClose, onPaired }: { onClose: () => void; onPaired: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Live countdown so the cashier sees the timer
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const ms = expiresAt.getTime() - Date.now();
      setSecondsLeft(Math.max(0, Math.floor(ms / 1000)));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [expiresAt]);

  // Poll the device list every 4s so when the cashier types the code, the new
  // device appears and we auto-close the modal.
  useEffect(() => {
    if (!code) return;
    const id = setInterval(async () => {
      const res = await fetch("/api/devices");
      if (!res.ok) return;
      const data = await res.json();
      const justPaired = (data.devices ?? []).find(
        (d: { revoked_at: string | null; created_at: string }) =>
          !d.revoked_at && new Date(d.created_at).getTime() > Date.now() - 12 * 60 * 1000,
      );
      if (justPaired) onPaired();
    }, 4000);
    return () => clearInterval(id);
  }, [code, onPaired]);

  async function generate() {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/devices/pairing-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed (${res.status})`);
      }
      const data = await res.json();
      setCode(data.code);
      setExpiresAt(new Date(data.expires_at));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setGenerating(false);
    }
  }

  const expired = secondsLeft === 0 && expiresAt !== null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel)",
          border: "1px solid var(--rule)",
          maxWidth: "520px",
          width: "100%",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem",
            borderBottom: "1px solid var(--rule)",
          }}
        >
          <h2 className="font-display" style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--cream)" }}>
            Pair new register
          </h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink" style={{ fontSize: "1.4rem" }}>×</button>
        </header>

        <div style={{ padding: "1.5rem" }}>
          {!code ? (
            <>
              <p className="text-ink-soft mb-4" style={{ fontSize: "0.9rem", lineHeight: 1.5 }}>
                Generate a 6-digit code, then type it on the new tablet's pairing screen. Code expires in 10 minutes.
              </p>
              <div className="font-mono uppercase text-ink-faint mb-2" style={{ fontSize: "0.66rem", letterSpacing: "0.12em" }}>
                Device name (optional)
              </div>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Counter 1, Mobile sale runner, …"
                className="bg-input-bg text-foreground border border-input-border px-3 py-2 text-sm w-full rounded"
              />
              {error && (
                <div className="mt-3 p-2" style={{ border: "1px solid var(--red)", background: "var(--red-mute)", color: "var(--red)", fontSize: "0.85rem" }}>
                  {error}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-ink-soft mb-3 text-center" style={{ fontSize: "0.85rem" }}>
                On the new tablet, type this code:
              </p>
              <div
                className="font-mono text-center"
                style={{
                  fontSize: "3.5rem",
                  fontWeight: 900,
                  letterSpacing: "0.4em",
                  color: expired ? "var(--ink-faint)" : "var(--cream)",
                  padding: "1rem 0",
                  textDecoration: expired ? "line-through" : "none",
                }}
              >
                {code}
              </div>
              <div className="text-center font-mono text-ink-soft" style={{ fontSize: "0.78rem" }}>
                {expired ? (
                  <span style={{ color: "var(--red)" }}>Expired</span>
                ) : (
                  <>Expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}</>
                )}
              </div>
              <p className="text-ink-faint mt-4 text-center" style={{ fontSize: "0.78rem" }}>
                This dialog will close automatically when the tablet pairs.
              </p>
            </>
          )}
        </div>

        <footer
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.5rem",
            padding: "1rem",
            borderTop: "1px solid var(--rule)",
            background: "var(--panel-hi)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="font-mono uppercase"
            style={{
              fontSize: "0.74rem",
              letterSpacing: "0.1em",
              padding: "0.55rem 1rem",
              color: "var(--ink-soft)",
              border: "1px solid var(--rule)",
            }}
          >
            {code ? "Done" : "Cancel"}
          </button>
          {!code && (
            <button
              type="button"
              onClick={generate}
              disabled={generating}
              className="font-mono uppercase disabled:opacity-30"
              style={{
                fontSize: "0.74rem",
                letterSpacing: "0.1em",
                fontWeight: 700,
                padding: "0.55rem 1.25rem",
                color: "var(--void)",
                background: "var(--orange)",
                border: "1px solid var(--orange)",
              }}
            >
              {generating ? "Generating…" : "Generate code"}
            </button>
          )}
          {code && expired && (
            <button
              type="button"
              onClick={() => {
                setCode(null);
                setExpiresAt(null);
                void generate();
              }}
              className="font-mono uppercase"
              style={{
                fontSize: "0.74rem",
                letterSpacing: "0.1em",
                fontWeight: 700,
                padding: "0.55rem 1.25rem",
                color: "var(--void)",
                background: "var(--orange)",
                border: "1px solid var(--orange)",
              }}
            >
              New code
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h ago`;
  if (ms < 604800_000) return `${Math.floor(ms / 86400_000)}d ago`;
  return d.toLocaleDateString();
}
