import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/public/counters/passport-users
 *
 * Public unauthenticated endpoint that returns the count of verified
 * Passport users in the format Smiirl Custom Counter expects:
 *
 *     { "number": 1234 }
 *
 * Used by physical Smiirl LED counters at conventions / events.
 *
 * "Verified" means User.emailVerified is non-null — i.e. the user has
 * completed signup + email verification. This filters out abandoned
 * signups and gives a defensible "real Passports issued" number rather
 * than a vanity total of all submitted forms.
 *
 * If you need a different definition (recently-active, all-signups, etc.)
 * adjust the prisma where clause below.
 *
 * Cached 30 seconds — Smiirl typically polls every few seconds, so
 * 30s cache means we hit the DB ~2x/minute regardless of poll volume.
 */

export const revalidate = 30;
export const dynamic = "force-static";

export async function GET() {
  try {
    const number = await prisma.user.count({
      where: { emailVerified: { not: null } },
    });

    return NextResponse.json(
      { number },
      {
        headers: {
          // Smiirl polls from their cloud; permissive CORS keeps it simple.
          "Access-Control-Allow-Origin": "*",
          // Belt-and-suspenders cache hint for the edge in case the
          // framework-level `revalidate` ever stops applying (e.g. if
          // a contributor flips this to `force-dynamic` later).
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      },
    );
  } catch {
    // Fail soft: return 0 so the Smiirl shows "0" rather than going into
    // a connection-error state at a convention. The next successful poll
    // recovers the real number. We deliberately don't surface the error
    // — this endpoint is public + read-only, no useful info to leak.
    return NextResponse.json(
      { number: 0 },
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
