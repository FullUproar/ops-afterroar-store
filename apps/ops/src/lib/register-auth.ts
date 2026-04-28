/**
 * Resolve the store_id for a register-authed request.
 *
 * Two auth paths converge here:
 *   - kind: "device" — paired register tablet. The store is pre-bound on the
 *     RegisterDevice row; we just hand back `verified.storeId`. Cheap.
 *   - kind: "api_key" — headless integration (cron, partner). The store is
 *     derived from the User who minted the key → PosStaff record on a store.
 *     One DB lookup. Backwards-compat with the pre-pairing flow.
 *
 * Returns null if the resolution fails — the caller should 403.
 */

import { prisma } from "./prisma";
import type { VerifiedKey } from "./api-key";

export async function resolveRegisterStoreId(verified: VerifiedKey): Promise<string | null> {
  if (verified.kind === "device") {
    return verified.storeId ?? null;
  }
  // api_key path — historical "minted by an owner staff record" model
  const keyOwner = await prisma.apiKey.findUnique({
    where: { id: verified.id },
    select: { createdById: true },
  });
  if (!keyOwner?.createdById) return null;
  const staff = await prisma.posStaff.findFirst({
    where: { user_id: keyOwner.createdById, active: true },
    select: { store_id: true },
  });
  return staff?.store_id ?? null;
}
