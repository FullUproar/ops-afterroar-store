"use client";

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store-context";
import { PageHeader } from "@/components/page-header";

interface StaffMember {
  id: string;
  user_id: string;
  name: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  active: boolean;
  has_pin: boolean;
  created_at: string;
}

export default function StaffPage() {
  const { can, staff: currentStaff } = useStore();
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite modal
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("cashier");
  const [inviting, setInviting] = useState(false);

  // PIN management
  const [pinModal, setPinModal] = useState<{ staffId: string; staffName: string } | null>(null);
  const [pinValue, setPinValue] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [pinMessage, setPinMessage] = useState<string | null>(null);

  async function handleSetPin() {
    if (!pinModal || !pinValue || pinValue.length < 4) return;
    setPinSaving(true);
    setPinMessage(null);
    try {
      const res = await fetch("/api/clock", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_id: pinModal.staffId, pin: pinValue }),
      });
      if (res.ok) {
        setPinMessage("PIN set!");
        loadStaff();
        setTimeout(() => { setPinModal(null); setPinValue(""); setPinMessage(null); }, 1500);
      } else {
        const data = await res.json();
        setPinMessage(data.error || "Failed to set PIN");
      }
    } catch {
      setPinMessage("Connection error");
    } finally {
      setPinSaving(false);
    }
  }

  const loadStaff = useCallback(async () => {
    try {
      const res = await fetch("/api/staff");
      if (res.ok) {
        setStaffList(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  async function handleInvite() {
    if (inviting || !inviteEmail.trim() || !inviteName.trim()) return;
    setInviting(true);
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          name: inviteName.trim(),
          role: inviteRole,
        }),
      });
      if (res.ok) {
        setShowInvite(false);
        setInviteEmail("");
        setInviteName("");
        setInviteRole("cashier");
        loadStaff();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to invite staff");
      }
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(staffId: string, newRole: string) {
    const res = await fetch("/api/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staff_id: staffId, role: newRole }),
    });
    if (res.ok) {
      loadStaff();
    } else {
      const data = await res.json();
      alert(data.error || "Failed to update role");
    }
  }

  async function handleToggleActive(staffId: string, active: boolean) {
    const res = await fetch("/api/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staff_id: staffId, active }),
    });
    if (res.ok) {
      loadStaff();
    } else {
      const data = await res.json();
      alert(data.error || "Failed to update status");
    }
  }

  if (!can("staff.manage")) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted">You don&apos;t have permission to manage staff.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff"
        action={
          <button
            onClick={() => setShowInvite(true)}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-foreground hover:opacity-90 transition-colors"
          >
            Invite Staff
          </button>
        }
      />

      {loading ? (
        <p className="text-muted py-12 text-center">Loading staff...</p>
      ) : staffList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-input-border bg-card-hover p-12 text-center">
          <p className="text-muted">No staff members yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-card-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border bg-card text-left text-muted">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">PIN</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {staffList.map((member) => {
                const isCurrentUser = member.id === currentStaff?.id;
                return (
                  <tr
                    key={member.id}
                    className={`bg-background hover:bg-card-hover transition-colors ${
                      !member.active ? "opacity-60" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {member.avatar_url ? (
                          <img
                            src={member.avatar_url}
                            alt=""
                            className="h-7 w-7 rounded-full"
                          />
                        ) : (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-card-hover text-xs text-muted">
                            {member.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="text-foreground font-medium">
                          {member.name}
                          {isCurrentUser && (
                            <span className="ml-2 text-xs text-muted">(you)</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">{member.email}</td>
                    <td className="px-4 py-3">
                      {member.role === "owner" || isCurrentUser ? (
                        <span className="inline-block rounded-full bg-card-hover px-2 py-0.5 text-xs font-medium text-foreground/70 capitalize">
                          {member.role}
                        </span>
                      ) : (
                        <select
                          value={member.role}
                          onChange={(e) =>
                            handleRoleChange(member.id, e.target.value)
                          }
                          className="rounded border border-input-border bg-card-hover px-2 py-1 text-xs text-foreground focus:border-accent focus:outline-none"
                        >
                          <option value="manager">Manager</option>
                          <option value="cashier">Cashier</option>
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          member.active
                            ? "bg-green-900/50 text-green-400"
                            : "bg-card-hover text-muted"
                        }`}
                      >
                        {member.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {member.has_pin ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-block rounded-full bg-green-900/50 text-green-400 px-2 py-0.5 text-xs font-medium">Set</span>
                          {!isCurrentUser && member.role !== "owner" && (
                            <button
                              onClick={() => { setPinModal({ staffId: member.id, staffName: member.name }); setPinValue(""); setPinMessage(null); }}
                              className="text-xs text-muted hover:text-foreground transition-colors"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => { setPinModal({ staffId: member.id, staffName: member.name }); setPinValue(""); setPinMessage(null); }}
                          className="rounded px-2 py-1 text-xs font-medium bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
                        >
                          Set PIN
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {new Date(member.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {!isCurrentUser && member.role !== "owner" && (
                        <button
                          onClick={() =>
                            handleToggleActive(member.id, !member.active)
                          }
                          className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                            member.active
                              ? "bg-red-900/30 text-red-400 hover:bg-red-900/50"
                              : "bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50"
                          }`}
                        >
                          {member.active ? "Deactivate" : "Reactivate"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* PIN Modal */}
      {pinModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-bg"
          onClick={() => setPinModal(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-card-border bg-card p-6 shadow-2xl mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">
                {pinModal.staffName}&apos;s PIN
              </h2>
              <button onClick={() => setPinModal(null)} className="text-muted hover:text-foreground text-lg" style={{ minHeight: "auto" }}>&times;</button>
            </div>
            <p className="text-sm text-muted mb-4">
              Set a 4-8 digit PIN for mobile clock-in and register access.
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={pinValue}
              onChange={(e) => { setPinValue(e.target.value.replace(/\D/g, "")); setPinMessage(null); }}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && pinValue.length >= 4) handleSetPin(); }}
              placeholder="Enter 4-8 digit PIN"
              autoFocus
              className="w-full rounded-xl border border-input-border bg-input-bg px-4 py-3 text-center text-2xl font-mono tracking-[0.3em] text-foreground placeholder:text-muted placeholder:tracking-normal placeholder:text-base focus:border-accent focus:outline-none"
            />
            {pinMessage && (
              <p className={`mt-2 text-sm text-center ${pinMessage === "PIN set!" ? "text-green-400" : "text-red-400"}`}>
                {pinMessage}
              </p>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setPinModal(null)}
                className="flex-1 rounded-xl border border-card-border py-2.5 text-sm text-muted hover:text-foreground hover:bg-card-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSetPin}
                disabled={pinSaving || pinValue.length < 4}
                className="flex-1 rounded-xl bg-accent py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 transition-colors"
              >
                {pinSaving ? "Setting..." : "Set PIN"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-bg"
          onClick={() => setShowInvite(false)}
          onKeyDown={(e) => e.key === "Escape" && setShowInvite(false)}
        >
          <div
            ref={(el: HTMLDivElement | null) => {
              if (!el) return;
              const handler = (e: FocusEvent) => {
                const target = e.target as HTMLElement;
                if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") {
                  setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
                }
              };
              el.addEventListener("focusin", handler);
              return () => el.removeEventListener("focusin", handler);
            }}
            className="w-full max-w-md rounded-xl border border-card-border bg-card p-6 shadow-2xl mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Invite Staff Member</h2>
              <button
                onClick={() => setShowInvite(false)}
                className="flex items-center justify-center h-8 w-8 rounded-full text-muted hover:text-foreground active:bg-card-hover transition-colors text-lg"
              >
                &times;
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Staff member's name"
                  autoFocus
                  className="w-full rounded-xl border border-card-border bg-background px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="staff@example.com"
                  className="w-full rounded-xl border border-card-border bg-background px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full rounded-xl border border-card-border bg-background px-3 py-2 text-foreground focus:border-accent focus:outline-none"
                >
                  <option value="cashier">Cashier</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowInvite(false)}
                className="flex-1 rounded-xl border border-input-border py-2 text-sm text-foreground/70 hover:bg-card-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleInvite}
                disabled={inviting || !inviteEmail.trim() || !inviteName.trim()}
                className="flex-1 rounded-xl bg-accent py-2 text-sm font-medium text-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                {inviting ? "Inviting..." : "Invite"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
