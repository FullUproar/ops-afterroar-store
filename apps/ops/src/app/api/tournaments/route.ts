import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

export async function GET() {
  try {
    const { db } = await requirePermission("events.manage");

    const data = await db.posTournament.findMany({
      orderBy: { created_at: "desc" },
      include: {
        event: { select: { id: true, name: true } },
        _count: { select: { players: true, matches: true } },
      },
    });

    return NextResponse.json(data);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db, storeId } = await requirePermission("events.manage");

    const body = await request.json();
    const { name, format, bracket_type, max_players, event_id } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Tournament name is required" },
        { status: 400 }
      );
    }

    const tournament = await db.posTournament.create({
      data: {
        store_id: storeId,
        name: name.trim(),
        format: format || null,
        bracket_type: bracket_type || "single_elimination",
        max_players: max_players ? parseInt(max_players) : null,
        event_id: event_id || null,
      },
    });

    return NextResponse.json(tournament, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
