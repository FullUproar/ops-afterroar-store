/**
 * POST /api/devices/pair
 *
 * Tablet exchanges a 6-digit pairing code for a long-lived device token.
 *
 * Public — this endpoint IS the bootstrap. Auth comes from the code itself.
 * Each code is single-use: marking the RegisterPairingCode as claimed_at
 * happens atomically with creating the RegisterDevice row.
 *
 * Request:  { code, deviceId, displayName? }
 * Response: { token: "ardv_...", store: { id, name }, deviceId }
 *
 * The plaintext token is shown ONCE and never reappears anywhere on the
 * server. The tablet stores it locally and sends it as X-API-Key.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes, createHash } from "node:crypto";

interface PairBody {
  code?: string;
  deviceId?: string;
  displayName?: string;
}

function mintToken(): { plaintext: string; hash: string } {
  const plaintext = `ardv_${randomBytes(32).toString("hex")}`;
  const hash = createHash("sha256").update(plaintext).digest("hex");
  return { plaintext, hash };
}

export async function POST(request: NextRequest) {
  let body: PairBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const code = body.code?.trim();
  const deviceId = body.deviceId?.trim();
  const displayNameOverride = body.displayName?.trim();

  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "code must be 6 digits" }, { status: 400 });
  }
  if (!deviceId) {
    return NextResponse.json({ error: "deviceId required" }, { status: 400 });
  }

  // Atomically: validate code, mark claimed, create device, return token.
  // If anything fails after token mint, we're left with a stranded device row;
  // we don't want a stranded code (so claim is bound to device creation).
  try {
    const result = await prisma.$transaction(async (tx) => {
      const codeRow = await tx.registerPairingCode.findUnique({
        where: { code },
      });
      if (!codeRow) {
        throw new PairError("invalid_code", "Code not recognized.");
      }
      if (codeRow.claimed_at) {
        throw new PairError("already_claimed", "Code has already been used.");
      }
      if (codeRow.expires_at < new Date()) {
        throw new PairError("expired", "Code has expired. Generate a new one.");
      }

      const { plaintext, hash } = mintToken();
      const displayName = displayNameOverride || codeRow.display_name || `Register ${deviceId.slice(0, 8)}`;

      const device = await tx.registerDevice.create({
        data: {
          store_id: codeRow.store_id,
          paired_by: codeRow.paired_by,
          display_name: displayName,
          token_hash: hash,
          device_id: deviceId,
        },
      });

      await tx.registerPairingCode.update({
        where: { code },
        data: {
          claimed_at: new Date(),
          claimed_device_id: device.id,
        },
      });

      const store = await tx.posStore.findUnique({
        where: { id: codeRow.store_id },
        select: { id: true, name: true },
      });
      if (!store) {
        throw new PairError("store_missing", "Store not found.");
      }

      return { plaintext, deviceId: device.id, store };
    });

    return NextResponse.json({
      token: result.plaintext,
      device_id: result.deviceId,
      store: result.store,
    });
  } catch (err) {
    if (err instanceof PairError) {
      const status = err.code === "store_missing" ? 500 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[devices/pair] unexpected error:", err);
    return NextResponse.json({ error: "Pairing failed" }, { status: 500 });
  }
}

class PairError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}
