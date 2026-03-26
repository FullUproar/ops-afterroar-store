"use client";

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store-context";

interface StaffMember {
  id: string;
  user_id: string;
  name: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  active: boolean;
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
        <p className="text-zinc-500">You don&apos;t have permission to manage staff.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Staff</h1>
        <button
          onClick={() => setShowInvite(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          Invite Staff
        </button>
      </div>

      {loading ? (
        <p className="text-zinc-400 py-12 text-center">Loading staff...</p>
      ) : staffList.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 p-12 text-center">
          <p className="text-zinc-400">No staff members yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900 text-left text-zinc-400">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
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
                    className={`bg-zinc-950 hover:bg-zinc-900/50 transition-colors ${
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
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-xs text-zinc-400">
                            {member.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="text-white font-medium">
                          {member.name}
                          {isCurrentUser && (
                            <span className="ml-2 text-xs text-zinc-500">(you)</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{member.email}</td>
                    <td className="px-4 py-3">
                      {member.role === "owner" || isCurrentUser ? (
                        <span className="inline-block rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-300 capitalize">
                          {member.role}
                        </span>
                      ) : (
                        <select
                          value={member.role}
                          onChange={(e) =>
                            handleRoleChange(member.id, e.target.value)
                          }
                          className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white focus:border-blue-500 focus:outline-none"
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
                            : "bg-zinc-800 text-zinc-500"
                        }`}
                      >
                        {member.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
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

      {/* Invite Modal */}
      {showInvite && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setShowInvite(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white mb-4">Invite Staff Member</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Staff member's name"
                  autoFocus
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="staff@example.com"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="cashier">Cashier</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowInvite(false)}
                className="flex-1 rounded-lg border border-zinc-700 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleInvite}
                disabled={inviting || !inviteEmail.trim() || !inviteName.trim()}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
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
