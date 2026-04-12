import { NextResponse } from "next/server";
import { requirePermissionAndFeature, handleAuthError } from "@/lib/require-staff";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

/* ------------------------------------------------------------------ */
/*  /api/settings/api-key — generate / revoke store API key            */
/*  POST: generate new key (returns it once, stores hash)              */
/*  DELETE: revoke key                                                 */
/*  GET: check if key exists (never returns the key itself)            */
/* ------------------------------------------------------------------ */

function generateApiKey(): string {
  return `ars_${crypto.randomBytes(32).toString("hex")}`;
}

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export async function GET() {
  try {
    const { db } = await requirePermissionAndFeature("store.settings", "api_access");

    const store = await db.posStore.findFirst({
      select: { settings: true },
    });

    const settings = (store?.settings ?? {}) as Record<string, unknown>;
    const hasKey = !!settings.api_key_hash;
    const createdAt = settings.api_key_created_at as string | undefined;

    return NextResponse.json({ has_key: hasKey, created_at: createdAt || null });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST() {
  try {
    const { db, storeId } = await requirePermissionAndFeature("store.settings", "api_access");

    const store = await db.posStore.findFirst({
      select: { settings: true },
    });

    const settings = (store?.settings ?? {}) as Record<string, unknown>;
    const apiKey = generateApiKey();

    await prisma.posStore.update({
      where: { id: storeId },
      data: {
        settings: JSON.parse(JSON.stringify({
          ...settings,
          api_key_hash: hashKey(apiKey),
          api_key_created_at: new Date().toISOString(),
        })),
        updated_at: new Date(),
      },
    });

    // Return the key exactly once — it's never stored in plaintext
    return NextResponse.json({
      api_key: apiKey,
      message: "Save this key — it will not be shown again.",
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE() {
  try {
    const { db, storeId } = await requirePermissionAndFeature("store.settings", "api_access");

    const store = await db.posStore.findFirst({
      select: { settings: true },
    });

    const settings = (store?.settings ?? {}) as Record<string, unknown>;
    delete settings.api_key_hash;
    delete settings.api_key_created_at;

    await prisma.posStore.update({
      where: { id: storeId },
      data: {
        settings: JSON.parse(JSON.stringify(settings)),
        updated_at: new Date(),
      },
    });

    return NextResponse.json({ revoked: true });
  } catch (error) {
    return handleAuthError(error);
  }
}
