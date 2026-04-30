/**
 * Smiirl push helper — pushes the verified Passport user count to a
 * Smiirl Custom Counter device using the PUSH NUMBER mode.
 *
 * Per Smiirl's docs (https://github.com/smiirl/smiirl-custom-samples):
 *   GET http://api.smiirl.com/{MAC}/set-number/{TOKEN}/{N}
 *
 * The device must be configured for PUSH mode in https://my.smiirl.com.
 * If the device is in JSON URL mode, this push has no effect — Smiirl
 * ignores set-number calls in poll mode.
 *
 * Env vars expected:
 *   SMIIRL_DEVICE_MAC   — 12-char hex device id (no colons)
 *   SMIIRL_AUTH_TOKEN   — 32-char hex token from the device's admin page
 *
 * The device this is configured for currently has a mechanical wheel-
 * alignment defect (each commanded digit displays as digit-1 with 0->9
 * wrap). We push the *compensated* value, not the raw count, so the
 * device displays the correct number. When the device is repaired,
 * either remove the compensation here OR keep it but redeploy with a
 * SMIIRL_COMPENSATE=false env var. See passport-users-compensated route
 * for the math.
 */

import { prisma } from "@/lib/prisma";

const SMIIRL_API = "http://api.smiirl.com";
const PAD_WIDTH = 5;

interface PushResult {
  ok: boolean;
  realCount: number;
  pushedValue: number;
  error?: string;
  deviceResponseStatus?: number;
}

function compensate(target: number): number {
  if (target < 0) target = 0;
  const padded = String(target).padStart(PAD_WIDTH, "0");
  const truncated = padded.slice(-PAD_WIDTH);
  let out = "";
  for (const ch of truncated) {
    const d = Number.parseInt(ch, 10);
    out += String((d + 1) % 10);
  }
  return Number.parseInt(out, 10);
}

export async function pushVerifiedCountToSmiirl(): Promise<PushResult> {
  const mac = process.env.SMIIRL_DEVICE_MAC;
  const token = process.env.SMIIRL_AUTH_TOKEN;
  if (!mac || !token) {
    return {
      ok: false,
      realCount: 0,
      pushedValue: 0,
      error: "SMIIRL_DEVICE_MAC and SMIIRL_AUTH_TOKEN must be set",
    };
  }

  const realCount = await prisma.user.count({
    where: { emailVerified: { not: null } },
  });

  // Compensation toggle: defaults to true while the device has the
  // off-by-one wheel defect. Set SMIIRL_COMPENSATE=false (case-insensitive)
  // to push the raw count once the device is fixed/replaced.
  const compensateEnabled =
    (process.env.SMIIRL_COMPENSATE ?? "true").toLowerCase() !== "false";
  const pushedValue = compensateEnabled ? compensate(realCount) : realCount;

  const url = `${SMIIRL_API}/${mac}/set-number/${token}/${pushedValue}`;
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    if (!res.ok) {
      return {
        ok: false,
        realCount,
        pushedValue,
        deviceResponseStatus: res.status,
        error: `Smiirl returned ${res.status}`,
      };
    }
    return { ok: true, realCount, pushedValue, deviceResponseStatus: res.status };
  } catch (err) {
    return {
      ok: false,
      realCount,
      pushedValue,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
