import { NextRequest, NextResponse } from "next/server";
import { pushVerifiedCountToSmiirl } from "@/lib/smiirl";

/**
 * POST /api/cron/smiirl-push
 *
 * Vercel cron endpoint that pushes the current verified-Passport-user
 * count to the Smiirl Custom Counter device. Called hourly per the
 * vercel.json schedule.
 *
 * Auth: same Bearer CRON_SECRET shape used by /api/cron/retention. Manual
 * invocation works the same way:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *     https://www.afterroar.me/api/cron/smiirl-push
 *
 * The push helper handles the device's off-by-one wheel defect via the
 * SMIIRL_COMPENSATE env var (defaults to true). When the device is fixed
 * or replaced, set SMIIRL_COMPENSATE=false in Vercel and redeploy.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await pushVerifiedCountToSmiirl();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
