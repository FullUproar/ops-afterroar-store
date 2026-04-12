import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { prisma } from "@/lib/prisma";
import {
  type Role,
  type Permission,
  type RolePermissionOverrides,
  getPermissions,
  getDefaultPermissions,
  ALL_PERMISSIONS,
  PERMISSION_CATEGORIES,
} from "@/lib/permissions";

/* ------------------------------------------------------------------ */
/*  GET /api/permissions — get current permission config for all roles */
/* ------------------------------------------------------------------ */
export async function GET() {
  try {
    const { storeId, roleOverrides } = await requirePermission("store.settings");

    // Build the full picture: defaults + overrides for each role
    const roles: Record<string, { permissions: Permission[]; overrides: Partial<Record<Permission, boolean>> }> = {};

    for (const role of ["owner", "manager", "cashier"] as Role[]) {
      roles[role] = {
        permissions: getPermissions(role, roleOverrides),
        overrides: roleOverrides?.[role] ?? {},
      };
    }

    return NextResponse.json({
      roles,
      all_permissions: ALL_PERMISSIONS,
      categories: PERMISSION_CATEGORIES,
      defaults: {
        owner: getDefaultPermissions("owner"),
        manager: getDefaultPermissions("manager"),
        cashier: getDefaultPermissions("cashier"),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  PATCH /api/permissions — update permission overrides for a role    */
/*  Body: { role: "manager", permission: "checkout.void", enabled: false }
/*  Or bulk: { role: "cashier", overrides: { "trade_ins": true, ... } }
/* ------------------------------------------------------------------ */
export async function PATCH(request: NextRequest) {
  try {
    const { storeId } = await requirePermission("store.settings");

    const body = await request.json();
    const { role, permission, enabled, overrides: bulkOverrides } = body as {
      role: Role;
      permission?: Permission;
      enabled?: boolean;
      overrides?: Partial<Record<Permission, boolean>>;
    };

    if (!role || !["owner", "manager", "cashier"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Can't modify owner permissions
    if (role === "owner") {
      return NextResponse.json({ error: "Owner permissions cannot be modified" }, { status: 400 });
    }

    // Get current store settings
    const store = await prisma.posStore.findUnique({
      where: { id: storeId },
      select: { settings: true },
    });
    const settings = (store?.settings ?? {}) as Record<string, unknown>;
    const currentOverrides = (settings.role_permissions ?? {}) as RolePermissionOverrides;
    const roleOverrides = { ...currentOverrides[role] } as Partial<Record<Permission, boolean>>;

    if (bulkOverrides) {
      // Bulk update
      for (const [perm, value] of Object.entries(bulkOverrides)) {
        const permKey = perm as Permission;
        if (!ALL_PERMISSIONS.find((p) => p.key === permKey)) continue;

        // Check if this matches the default — if so, remove the override
        const defaults = getDefaultPermissions(role);
        const isDefault = defaults.includes(permKey);
        if ((value && isDefault) || (!value && !isDefault)) {
          delete roleOverrides[permKey];
        } else {
          roleOverrides[permKey] = !!value;
        }
      }
    } else if (permission && typeof enabled === "boolean") {
      // Single permission update
      if (!ALL_PERMISSIONS.find((p) => p.key === permission)) {
        return NextResponse.json({ error: "Invalid permission" }, { status: 400 });
      }

      const defaults = getDefaultPermissions(role);
      const isDefault = defaults.includes(permission);
      if ((enabled && isDefault) || (!enabled && !isDefault)) {
        delete roleOverrides[permission];
      } else {
        roleOverrides[permission] = enabled;
      }
    } else {
      return NextResponse.json({ error: "Provide permission+enabled or overrides" }, { status: 400 });
    }

    // Save back
    const newOverrides = { ...currentOverrides, [role]: roleOverrides };
    // Clean up empty override objects
    if (Object.keys(roleOverrides).length === 0) {
      delete (newOverrides as Record<string, unknown>)[role];
    }

    await prisma.posStore.update({
      where: { id: storeId },
      data: {
        settings: JSON.parse(JSON.stringify({
          ...settings,
          role_permissions: Object.keys(newOverrides).length > 0 ? newOverrides : undefined,
        })),
      },
    });

    return NextResponse.json({
      role,
      permissions: getPermissions(role, newOverrides),
      overrides: newOverrides[role] ?? {},
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/permissions/reset — reset a role to defaults             */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requirePermission("store.settings");

    const body = await request.json();
    const { role } = body as { role: Role };

    if (!role || !["manager", "cashier"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const store = await prisma.posStore.findUnique({
      where: { id: storeId },
      select: { settings: true },
    });
    const settings = (store?.settings ?? {}) as Record<string, unknown>;
    const currentOverrides = { ...(settings.role_permissions ?? {}) } as Record<string, unknown>;
    delete currentOverrides[role];

    await prisma.posStore.update({
      where: { id: storeId },
      data: {
        settings: JSON.parse(JSON.stringify({
          ...settings,
          role_permissions: Object.keys(currentOverrides).length > 0 ? currentOverrides : undefined,
        })),
      },
    });

    return NextResponse.json({
      role,
      permissions: getDefaultPermissions(role),
      overrides: {},
      reset: true,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
