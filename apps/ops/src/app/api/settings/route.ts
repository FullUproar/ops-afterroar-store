import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff, requirePermission, handleAuthError } from "@/lib/require-staff";
import { SETTINGS_DEFAULTS, type StoreSettings } from "@/lib/store-settings-shared";
import { opLog } from "@/lib/op-log";

/* ------------------------------------------------------------------ */
/*  GET /api/settings — current store settings merged with defaults     */
/* ------------------------------------------------------------------ */
export async function GET() {
  try {
    const { storeId } = await requireStaff();

    const store = await prisma.posStore.findUnique({
      where: { id: storeId },
      select: { settings: true },
    });

    const raw = (store?.settings ?? {}) as Partial<StoreSettings>;
    const merged = { ...SETTINGS_DEFAULTS, ...raw };

    return NextResponse.json(merged);
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  PATCH /api/settings — update specific settings (owner only)         */
/*  Merges with existing settings, doesn't replace the whole object.    */
/* ------------------------------------------------------------------ */
export async function PATCH(request: NextRequest) {
  try {
    const { staff, storeId } = await requirePermission("store.settings");

    const store = await prisma.posStore.findUnique({
      where: { id: storeId },
      select: { settings: true },
    });

    let updates: Partial<StoreSettings>;
    try {
      updates = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Merge with existing settings
    const existing = (store?.settings ?? {}) as Record<string, unknown>;
    const merged = { ...existing, ...updates };

    await prisma.posStore.update({
      where: { id: storeId },
      data: { settings: JSON.parse(JSON.stringify(merged)), updated_at: new Date() },
    });

    // Log what changed
    const changedKeys = Object.keys(updates as Record<string, unknown>);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of changedKeys) {
      const oldVal = (existing as Record<string, unknown>)[key];
      const newVal = (updates as Record<string, unknown>)[key];
      if (oldVal !== newVal) {
        changes[key] = { from: oldVal, to: newVal };
      }
    }
    if (Object.keys(changes).length > 0) {
      const summary = Object.entries(changes)
        .map(([k, v]) => `${k}: ${JSON.stringify(v.from)} → ${JSON.stringify(v.to)}`)
        .join(", ");
      opLog({
        storeId,
        eventType: "settings.changed",
        message: `${summary.slice(0, 120)} · ${staff.name}`,
        metadata: { changes },
        staffName: staff.name,
        userId: staff.user_id,
      });
    }

    // Return full settings with defaults
    const full = { ...SETTINGS_DEFAULTS, ...merged };
    return NextResponse.json(full);
  } catch (error) {
    return handleAuthError(error);
  }
}
