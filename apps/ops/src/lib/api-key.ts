/**
 * Server-to-server API key auth — same plumbing as apps/me, sharing the
 * ApiKey table. Used by the register Capacitor app to push events to
 * /api/sync.
 *
 * Refactor target: extract to packages/api-auth when both apps/me and
 * apps/ops are using identical code. For now, duplicated here to avoid
 * blocking R2 progress on a shared-package setup.
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export function hashKey(fullKey: string): string {
  return createHash("sha256").update(fullKey).digest("hex");
}

export function extractKey(req: Request): string | null {
  const header = req.headers.get("x-api-key") ?? req.headers.get("authorization");
  if (!header) return null;
  return header.replace(/^Bearer\s+/i, "").trim() || null;
}

export interface VerifiedKey {
  /** Source row id (ApiKey.id OR RegisterDevice.id depending on `kind`). */
  id: string;
  /** "api_key" → headless integrations (cron, partners). "device" → register
   *  tablets paired through Passport. Same scope semantics, different surface. */
  kind: "api_key" | "device";
  scopes: string[];
  name: string;
  prefix: string;
  /** For device-kind: store the device was paired to. For api_key-kind: derived
   *  from the User → PosStaff mapping (resolveStoreId). Helpers may use this. */
  storeId?: string;
}

/** Token prefix for register-device tokens. Distinct from ApiKey's `ar_` so
 *  the verifier can dispatch by prefix without two DB hits. */
const DEVICE_TOKEN_PREFIX = "ardv_";

export async function verifyKey(presentedKey: string): Promise<VerifiedKey | null> {
  if (!presentedKey) return null;
  if (presentedKey.startsWith(DEVICE_TOKEN_PREFIX)) {
    return verifyDeviceToken(presentedKey);
  }
  if (!presentedKey.startsWith("ar_")) return null;
  const hash = hashKey(presentedKey);
  const row = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
    select: { id: true, scopes: true, name: true, keyPrefix: true, revokedAt: true, expiresAt: true },
  });
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt < new Date()) return null;
  return { id: row.id, kind: "api_key", scopes: row.scopes, name: row.name, prefix: row.keyPrefix };
}

async function verifyDeviceToken(presentedKey: string): Promise<VerifiedKey | null> {
  const hash = hashKey(presentedKey);
  const row = await prisma.registerDevice.findUnique({
    where: { token_hash: hash },
    select: {
      id: true,
      store_id: true,
      display_name: true,
      scopes: true,
      revoked_at: true,
    },
  });
  if (!row) return null;
  if (row.revoked_at) return null;
  return {
    id: row.id,
    kind: "device",
    scopes: row.scopes,
    name: row.display_name,
    prefix: presentedKey.slice(0, DEVICE_TOKEN_PREFIX.length + 6),
    storeId: row.store_id,
  };
}

export function bumpUsage(verified: VerifiedKey): void {
  if (verified.kind === "api_key") {
    prisma.apiKey
      .update({ where: { id: verified.id }, data: { lastUsedAt: new Date(), usageCount: { increment: 1 } } })
      .catch((err) => console.error("[api-key] bumpUsage failed:", err));
  } else {
    prisma.registerDevice
      .update({ where: { id: verified.id }, data: { last_seen_at: new Date() } })
      .catch((err) => console.error("[api-key] bumpUsage (device) failed:", err));
  }
}

export { DEVICE_TOKEN_PREFIX };

export function hasScope(presented: string[], required: string): boolean {
  if (presented.includes("admin:*")) return true;
  if (presented.includes(required)) return true;
  const [verb, resource] = required.split(":");
  if (resource && presented.includes(`${verb}:${resource}:*`)) return true;
  return false;
}
