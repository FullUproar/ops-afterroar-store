import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/cron/users-audit
//
// Diagnostic. Same Bearer CRON_SECRET as the other cron endpoints.
// Lists the most recent 20 user records with their verified status and
// signup path so we can spot which signups didn't bump the Smiirl
// counter (emailVerified IS NULL → not counted).
//
// Reads-only. Should be removed once we have a proper admin surface.

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      createdAt: true,
      email: true,
      emailVerified: true,
      passwordHash: true,
      passportCode: true,
    },
  });

  const verifiedCount = await prisma.user.count({
    where: { emailVerified: { not: null } },
  });
  const totalCount = await prisma.user.count();

  return NextResponse.json({
    totalCount,
    verifiedCount,
    users: users.map((u) => ({
      created: u.createdAt,
      email: u.email,
      verified: u.emailVerified ? u.emailVerified : null,
      path: u.passwordHash ? "credentials" : "oauth",
      passportCode: u.passportCode,
    })),
  });
}
