import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { prisma } from "@/lib/prisma";

/* ------------------------------------------------------------------ */
/*  /api/network/tournaments — cross-store tournament management        */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { storeId } = await requirePermission("events.manage");

    const status = request.nextUrl.searchParams.get("status") || "upcoming";

    const tournaments = await prisma.posNetworkTournament.findMany({
      where: status === "all" ? {} : { status },
      orderBy: { starts_at: status === "completed" ? "desc" : "asc" },
      take: 20,
      include: {
        host_store: { select: { name: true, slug: true } },
        participating_stores: {
          include: { store: { select: { name: true, slug: true } } },
        },
      },
    });

    // Mark which ones this store is participating in
    const enriched = tournaments.map((t) => ({
      ...t,
      is_host: t.host_store_id === storeId,
      is_participating: t.participating_stores.some((ps) => ps.store_id === storeId),
      total_players: t.participating_stores.reduce((s, ps) => s + ps.player_count, 0),
    }));

    return NextResponse.json(enriched);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requirePermission("events.manage");

    const body = await request.json();
    const { name, format, game, starts_at, entry_fee_cents, max_players_per_store, prize_pool_description } = body;

    if (!name || !starts_at) {
      return NextResponse.json({ error: "name and starts_at required" }, { status: 400 });
    }

    const tournament = await prisma.posNetworkTournament.create({
      data: {
        name,
        format: format || null,
        game: game || "MTG",
        host_store_id: storeId,
        starts_at: new Date(starts_at),
        entry_fee_cents: entry_fee_cents || 0,
        max_players_per_store: max_players_per_store || null,
        prize_pool_description: prize_pool_description || null,
      },
    });

    // Auto-add host store as participant
    await prisma.posNetworkTournamentStore.create({
      data: {
        network_tournament_id: tournament.id,
        store_id: storeId,
      },
    });

    return NextResponse.json(tournament, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { storeId } = await requirePermission("events.manage");

    const body = await request.json();
    const { tournament_id, action } = body;

    if (!tournament_id || !action) {
      return NextResponse.json({ error: "tournament_id and action required" }, { status: 400 });
    }

    if (action === "join") {
      // Join a network tournament
      const existing = await prisma.posNetworkTournamentStore.findFirst({
        where: { network_tournament_id: tournament_id, store_id: storeId },
      });
      if (existing) {
        return NextResponse.json({ error: "Already participating" }, { status: 409 });
      }
      await prisma.posNetworkTournamentStore.create({
        data: { network_tournament_id: tournament_id, store_id: storeId },
      });
      return NextResponse.json({ joined: true });
    }

    if (action === "start" || action === "complete" || action === "cancel") {
      // Only host can change status
      const tournament = await prisma.posNetworkTournament.findFirst({
        where: { id: tournament_id, host_store_id: storeId },
      });
      if (!tournament) {
        return NextResponse.json({ error: "Not the host" }, { status: 403 });
      }
      const statusMap: Record<string, string> = { start: "active", complete: "completed", cancel: "cancelled" };
      await prisma.posNetworkTournament.update({
        where: { id: tournament_id },
        data: {
          status: statusMap[action],
          ...(action === "complete" ? { ends_at: new Date() } : {}),
        },
      });
      return NextResponse.json({ status: statusMap[action] });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return handleAuthError(error);
  }
}
