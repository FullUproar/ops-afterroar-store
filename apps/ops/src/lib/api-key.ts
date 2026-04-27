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
  id: string;
  scopes: string[];
  name: string;
  prefix: string;
}

export async function verifyKey(presentedKey: string): Promise<VerifiedKey | null> {
  if (!presentedKey || !presentedKey.startsWith("ar_")) return null;
  const hash = hashKey(presentedKey);
  const row = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
    select: { id: true, scopes: true, name: true, keyPrefix: true, revokedAt: true, expiresAt: true },
  });
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt < new Date()) return null;
  return { id: row.id, scopes: row.scopes, name: row.name, prefix: row.keyPrefix };
}

export function bumpUsage(apiKeyId: string): void {
  prisma.apiKey
    .update({ where: { id: apiKeyId }, data: { lastUsedAt: new Date(), usageCount: { increment: 1 } } })
    .catch((err) => console.error("[api-key] bumpUsage failed:", err));
}

export function hasScope(presented: string[], required: string): boolean {
  if (presented.includes("admin:*")) return true;
  if (presented.includes(required)) return true;
  const [verb, resource] = required.split(":");
  if (resource && presented.includes(`${verb}:${resource}:*`)) return true;
  return false;
}
