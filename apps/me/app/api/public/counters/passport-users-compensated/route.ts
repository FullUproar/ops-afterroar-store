import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/public/counters/passport-users-compensated
 *
 * TEMPORARY HACK ENDPOINT — points one specific Smiirl device at this URL
 * because that device's digit wheels are mechanically offset by one
 * position (each commanded digit displays as `digit - 1` with 0->9 wrap).
 * Smiirl support has been notified; once the device is repaired or
 * recalibrated, point it back at /api/public/counters/passport-users
 * (the un-compensated endpoint that returns the true count) and DELETE
 * THIS ROUTE.
 *
 * The compensation math, given a target display value V padded to PAD_WIDTH
 * digits, is: for each digit d of the padded V, command (d + 1) mod 10.
 * The Smiirl's defect then subtracts 1 from each (with 0->9 wrap),
 * producing the original target digits.
 *
 * Worked example for target = 13:
 *   13 padded to 5 digits = 00013
 *   per-digit +1 (mod 10) = 11124
 *   Smiirl shows each digit -1 = 00013 -> "13" after leading-zero strip
 *
 * PAD_WIDTH must match the Smiirl device's physical digit count. The
 * Smiirl Custom Counter sold for convention use is typically 5 digits.
 * If the broken device has more or fewer wheels, change this constant.
 *
 * Cache: same 30s as the main counter endpoint. Smiirl polls slowly so
 * caching aggressively is fine; the count rarely changes second-by-second.
 */

const PAD_WIDTH = 5;

export const revalidate = 30;
export const dynamic = "force-static";

function compensate(target: number): number {
  // Negative or absurdly large values fall back to 0 — defensive only;
  // user count won't go there in practice.
  if (target < 0) target = 0;
  const padded = String(target).padStart(PAD_WIDTH, "0");
  // If the count exceeds what PAD_WIDTH can express, the leading digits
  // get truncated. That's a graceful failure mode — better a wrong
  // display than a 500 — and the device support ticket should be closed
  // by then anyway.
  const truncated = padded.slice(-PAD_WIDTH);
  let out = "";
  for (const ch of truncated) {
    const d = Number.parseInt(ch, 10);
    out += String((d + 1) % 10);
  }
  return Number.parseInt(out, 10);
}

export async function GET() {
  try {
    const realCount = await prisma.user.count({
      where: { emailVerified: { not: null } },
    });
    const number = compensate(realCount);
    return NextResponse.json(
      { number },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
          // Helpful for ops debugging — the real count is recoverable from
          // headers if you're inspecting why the Smiirl shows what it does.
          "X-Real-Count": String(realCount),
          "X-Compensation": "smiirl-digit-minus-one-defect",
        },
      },
    );
  } catch {
    // Same fail-soft as the main endpoint: return a valid JSON shape so
    // the Smiirl doesn't go into connection-error mode mid-convention.
    return NextResponse.json(
      { number: compensate(0) },
      {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, s-maxage=10",
        },
      },
    );
  }
}
