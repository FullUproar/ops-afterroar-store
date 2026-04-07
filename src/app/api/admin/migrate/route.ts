import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

const GOD_ADMIN = "info@fulluproar.com";

/**
 * POST /api/admin/migrate — run pending migrations
 * GOD MODE only. Runs raw SQL migrations against the database.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (session?.user?.email !== GOD_ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results: string[] = [];

  try {
    // 032: Add hold_type to pos_tabs
    await prisma.$executeRawUnsafe(
      `ALTER TABLE pos_tabs ADD COLUMN IF NOT EXISTS hold_type TEXT DEFAULT 'cafe'`
    );
    results.push("032a: hold_type added");

    await prisma.$executeRawUnsafe(
      `ALTER TABLE pos_tabs ADD COLUMN IF NOT EXISTS parked_by_staff_id TEXT`
    );
    results.push("032b: parked_by_staff_id added");

    await prisma.$executeRawUnsafe(
      `ALTER TABLE pos_tabs ADD COLUMN IF NOT EXISTS parked_at TIMESTAMPTZ`
    );
    results.push("032c: parked_at added");

    return NextResponse.json({ success: true, results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Migration failed", results },
      { status: 500 }
    );
  }
}
