"use client";

import { useState, useEffect, useCallback } from "react";
import { type Role, type Permission, ALL_PERMISSIONS, PERMISSION_CATEGORIES, getDefaultPermissions } from "@/lib/permissions";

/* ------------------------------------------------------------------ */
/*  Permissions Editor                                                  */
/*  Toggle-based UI for customizing role permissions.                   */
/*  Owner configures on Tuesday. Cashier benefits on Saturday.          */
/* ------------------------------------------------------------------ */

interface PermissionsData {
  roles: Record<string, {
    permissions: Permission[];
    overrides: Partial<Record<Permission, boolean>>;
  }>;
  defaults: Record<string, Permission[]>;
}

export function PermissionsEditor() {
  const [data, setData] = useState<PermissionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeRole, setActiveRole] = useState<Role>("cashier");
  const [saving, setSaving] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const loadPermissions = useCallback(async () => {
    try {
      const res = await fetch("/api/permissions");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  async function togglePermission(permission: Permission, enabled: boolean) {
    setSaving(permission);
    try {
      const res = await fetch("/api/permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: activeRole, permission, enabled }),
      });
      if (res.ok) {
        const updated = await res.json();
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            roles: {
              ...prev.roles,
              [activeRole]: {
                permissions: updated.permissions,
                overrides: updated.overrides,
              },
            },
          };
        });
      }
    } finally {
      setSaving(null);
    }
  }

  async function resetRole() {
    setResetting(true);
    try {
      const res = await fetch("/api/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: activeRole }),
      });
      if (res.ok) {
        const updated = await res.json();
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            roles: {
              ...prev.roles,
              [activeRole]: {
                permissions: updated.permissions,
                overrides: {},
              },
            },
          };
        });
      }
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted py-4">Loading permissions...</p>;
  }

  if (!data) {
    return <p className="text-sm text-red-400 py-4">Failed to load permissions</p>;
  }

  const roleData = data.roles[activeRole];
  const activePerms = new Set(roleData?.permissions ?? []);
  const overrides = roleData?.overrides ?? {};
  const defaults = new Set(getDefaultPermissions(activeRole));
  const hasOverrides = Object.keys(overrides).length > 0;

  return (
    <div className="space-y-4">
      {/* Role Selector */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-xl bg-card-hover p-1">
          {(["cashier", "manager"] as Role[]).map((role) => {
            const roleOverrideCount = Object.keys(data.roles[role]?.overrides ?? {}).length;
            return (
              <button
                key={role}
                onClick={() => setActiveRole(role)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  activeRole === role
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
                style={{ minHeight: "auto" }}
              >
                {role.charAt(0).toUpperCase() + role.slice(1)}
                {roleOverrideCount > 0 && (
                  <span className="ml-1.5 text-[10px] text-accent">{roleOverrideCount} custom</span>
                )}
              </button>
            );
          })}
        </div>
        {activeRole !== "owner" && hasOverrides && (
          <button
            onClick={resetRole}
            disabled={resetting}
            className="text-xs text-muted hover:text-foreground transition-colors"
          >
            {resetting ? "Resetting..." : "Reset to defaults"}
          </button>
        )}
      </div>

      {activeRole === "owner" && (
        <p className="text-xs text-muted italic">Owner has all permissions and cannot be restricted.</p>
      )}

      {/* Permission toggles by category */}
      {activeRole !== "owner" && PERMISSION_CATEGORIES.map((cat) => {
        const catPerms = ALL_PERMISSIONS.filter((p) => p.category === cat.key);
        if (catPerms.length === 0) return null;

        return (
          <div key={cat.key} className="space-y-1">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted pt-2">
              {cat.label}
            </h4>
            {catPerms.map((perm) => {
              const isEnabled = activePerms.has(perm.key);
              const isDefault = defaults.has(perm.key);
              const isOverridden = perm.key in overrides;
              const isSaving = saving === perm.key;

              return (
                <div
                  key={perm.key}
                  className="flex items-center justify-between py-2 px-1"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground">{perm.label}</span>
                      {isOverridden && (
                        <span className="text-[10px] text-accent font-medium">custom</span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted leading-snug">{perm.description}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <button
                      onClick={() => togglePermission(perm.key, !isEnabled)}
                      disabled={!!saving}
                      className={`relative h-6 w-11 rounded-full transition-colors ${
                        isEnabled ? "bg-accent" : "bg-card-hover"
                      }`}
                    >
                      <span
                        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform shadow-sm ${
                          isEnabled ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                    {isSaving && (
                      <span className="text-[10px] text-muted">...</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
