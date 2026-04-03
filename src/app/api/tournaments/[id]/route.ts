import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import {
  generateSwissPairings,
  calculateStandings,
  recommendedRounds,
  type SwissPlayer,
} from "@/lib/swiss-pairing";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db } = await requirePermission("events.manage");
    const { id } = await params;

    const tournament = await db.posTournament.findFirst({
      where: { id },
      include: {
        event: { select: { id: true, name: true } },
        players: { orderBy: { standing: "asc" } },
        matches: {
          orderBy: [{ round_number: "asc" }, { match_number: "asc" }],
        },
      },
    });

    if (!tournament) {
      return NextResponse.json(
        { error: "Tournament not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(tournament);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db } = await requirePermission("events.manage");
    const { id } = await params;
    const body = await request.json();
    const { name, format, max_players } = body;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = { updated_at: new Date() };
    if (name) updateData.name = name.trim();
    if (format !== undefined) updateData.format = format;
    if (max_players !== undefined)
      updateData.max_players = max_players ? parseInt(max_players) : null;

    const updated = await db.posTournament.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db } = await requirePermission("events.manage");
    const { id } = await params;
    const body = await request.json();

    const tournament = await db.posTournament.findFirst({
      where: { id },
      include: {
        players: true,
        matches: true,
      },
    });

    if (!tournament) {
      return NextResponse.json(
        { error: "Tournament not found" },
        { status: 404 }
      );
    }

    // --- ADD PLAYER ---
    if (body.action === "add_player") {
      if (tournament.status !== "registration") {
        return NextResponse.json(
          { error: "Can only add players during registration" },
          { status: 400 }
        );
      }

      const { player_name, customer_id } = body;
      if (!player_name || typeof player_name !== "string") {
        return NextResponse.json(
          { error: "Player name is required" },
          { status: 400 }
        );
      }

      if (
        tournament.max_players &&
        tournament.players.length >= tournament.max_players
      ) {
        return NextResponse.json(
          { error: "Tournament is full" },
          { status: 400 }
        );
      }

      const player = await db.posTournamentPlayer.create({
        data: {
          tournament_id: id,
          player_name: player_name.trim(),
          customer_id: customer_id || null,
          seed: tournament.players.length + 1,
        },
      });

      return NextResponse.json(player, { status: 201 });
    }

    // --- START TOURNAMENT ---
    if (body.action === "start") {
      if (tournament.status !== "registration") {
        return NextResponse.json(
          { error: "Tournament already started" },
          { status: 400 }
        );
      }

      const activePlayers = tournament.players.filter((p) => !p.dropped);
      if (activePlayers.length < 2) {
        return NextResponse.json(
          { error: "Need at least 2 players" },
          { status: 400 }
        );
      }

      // Shuffle players
      const shuffled = [...activePlayers];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      // Calculate rounds for single elimination
      const totalRounds = Math.ceil(Math.log2(shuffled.length));
      const bracketSize = Math.pow(2, totalRounds);

      // Create round 1 matches with byes
      const matches = [];
      const matchCount = bracketSize / 2;

      for (let m = 0; m < matchCount; m++) {
        const p1 = shuffled[m] || null;
        const p2 = shuffled[bracketSize - 1 - m] || null;

        const isBye = !p1 || !p2;

        matches.push({
          tournament_id: id,
          round_number: 1,
          match_number: m + 1,
          player1_id: p1?.id || null,
          player2_id: p2?.id || null,
          winner_id: isBye ? (p1?.id || p2?.id || null) : null,
          status: isBye ? "completed" : "pending",
          table_number: `Table ${m + 1}`,
        });
      }

      // Create future round matches (empty)
      for (let round = 2; round <= totalRounds; round++) {
        const roundMatches = Math.pow(2, totalRounds - round);
        for (let m = 0; m < roundMatches; m++) {
          matches.push({
            tournament_id: id,
            round_number: round,
            match_number: m + 1,
            player1_id: null,
            player2_id: null,
            winner_id: null,
            status: "pending",
            table_number: null,
          });
        }
      }

      // Bulk create matches
      await db.posTournamentMatch.createMany({ data: matches });

      // Update tournament
      await db.posTournament.update({
        where: { id },
        data: {
          status: "active",
          current_round: 1,
          total_rounds: totalRounds,
          updated_at: new Date(),
        },
      });

      // After creating matches, advance byes for round 1
      const createdMatches = await db.posTournamentMatch.findMany({
        where: { tournament_id: id, round_number: 1, status: "completed" },
      });

      for (const byeMatch of createdMatches) {
        if (byeMatch.winner_id) {
          await advanceWinner(db, id, 1, byeMatch.match_number, byeMatch.winner_id, totalRounds);
          // Give bye player a win
          await db.posTournamentPlayer.update({
            where: { id: byeMatch.winner_id },
            data: { wins: { increment: 1 } },
          });
        }
      }

      const result = await db.posTournament.findFirst({
        where: { id },
        include: {
          players: true,
          matches: {
            orderBy: [{ round_number: "asc" }, { match_number: "asc" }],
          },
        },
      });

      return NextResponse.json(result);
    }

    // --- REPORT MATCH ---
    if (body.action === "report_match") {
      const { match_id, winner_id, player1_score, player2_score } = body;

      if (!match_id || !winner_id) {
        return NextResponse.json(
          { error: "match_id and winner_id are required" },
          { status: 400 }
        );
      }

      const match = tournament.matches.find((m) => m.id === match_id);
      if (!match) {
        return NextResponse.json(
          { error: "Match not found" },
          { status: 404 }
        );
      }

      if (match.status === "completed") {
        return NextResponse.json(
          { error: "Match already completed" },
          { status: 400 }
        );
      }

      if (winner_id !== match.player1_id && winner_id !== match.player2_id) {
        return NextResponse.json(
          { error: "Winner must be one of the match players" },
          { status: 400 }
        );
      }

      const loserId =
        winner_id === match.player1_id ? match.player2_id : match.player1_id;

      // Update match
      await db.posTournamentMatch.update({
        where: { id: match_id },
        data: {
          winner_id,
          player1_score: player1_score ?? 0,
          player2_score: player2_score ?? 0,
          status: "completed",
        },
      });

      // Update player records
      await db.posTournamentPlayer.update({
        where: { id: winner_id },
        data: { wins: { increment: 1 } },
      });

      if (loserId) {
        await db.posTournamentPlayer.update({
          where: { id: loserId },
          data: { losses: { increment: 1 } },
        });
      }

      // Advance winner to next round
      const totalRounds = tournament.total_rounds || 1;
      await advanceWinner(
        db,
        id,
        match.round_number,
        match.match_number,
        winner_id,
        totalRounds
      );

      // Check if tournament is complete (final match decided)
      if (match.round_number === totalRounds) {
        await db.posTournament.update({
          where: { id },
          data: { status: "completed", updated_at: new Date() },
        });

        // Set standings
        await db.posTournamentPlayer.update({
          where: { id: winner_id },
          data: { standing: 1 },
        });
        if (loserId) {
          await db.posTournamentPlayer.update({
            where: { id: loserId },
            data: { standing: 2 },
          });
        }
      }

      const result = await db.posTournament.findFirst({
        where: { id },
        include: {
          players: true,
          matches: {
            orderBy: [{ round_number: "asc" }, { match_number: "asc" }],
          },
        },
      });

      return NextResponse.json(result);
    }

    // --- DROP PLAYER ---
    if (body.action === "drop_player") {
      const { player_id } = body;
      if (!player_id) {
        return NextResponse.json(
          { error: "player_id required" },
          { status: 400 }
        );
      }

      await db.posTournamentPlayer.update({
        where: { id: player_id },
        data: { dropped: true },
      });

      return NextResponse.json({ success: true });
    }

    // --- START SWISS ---
    if (body.action === "start_swiss") {
      if (tournament.status !== "registration") {
        return NextResponse.json({ error: "Tournament already started" }, { status: 400 });
      }

      const activePlayers = tournament.players.filter((p) => !p.dropped);
      if (activePlayers.length < 2) {
        return NextResponse.json({ error: "Need at least 2 players" }, { status: 400 });
      }

      const totalRounds = body.rounds || recommendedRounds(activePlayers.length);

      // Build Swiss player data
      const swissPlayers: SwissPlayer[] = activePlayers.map((p) => ({
        id: p.id,
        name: p.player_name,
        matchPoints: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        dropped: false,
        opponents: [],
        hadBye: false,
      }));

      // Generate round 1 pairings
      const pairings = generateSwissPairings(swissPlayers);

      // Create matches
      for (let i = 0; i < pairings.length; i++) {
        const p = pairings[i];
        const isBye = !p.player2_id;

        await db.posTournamentMatch.create({
          data: {
            tournament_id: id,
            round_number: 1,
            match_number: i + 1,
            player1_id: p.player1_id,
            player2_id: p.player2_id,
            winner_id: isBye ? p.player1_id : null,
            status: isBye ? "completed" : "pending",
            table_number: p.table_number,
          },
        });

        // Award bye win
        if (isBye) {
          await db.posTournamentPlayer.update({
            where: { id: p.player1_id },
            data: { wins: { increment: 1 } },
          });
        }
      }

      await db.posTournament.update({
        where: { id },
        data: {
          status: "active",
          bracket_type: "swiss",
          current_round: 1,
          total_rounds: totalRounds,
          updated_at: new Date(),
        },
      });

      const result = await db.posTournament.findFirst({
        where: { id },
        include: { players: true, matches: { orderBy: [{ round_number: "asc" }, { match_number: "asc" }] } },
      });
      return NextResponse.json(result);
    }

    // --- NEXT SWISS ROUND ---
    if (body.action === "next_round") {
      if (tournament.bracket_type !== "swiss" || tournament.status !== "active") {
        return NextResponse.json({ error: "Tournament is not an active Swiss tournament" }, { status: 400 });
      }

      const currentRound = tournament.current_round || 1;
      const totalRounds = tournament.total_rounds || 3;

      // Check all current round matches are complete
      const pendingMatches = tournament.matches.filter(
        (m) => m.round_number === currentRound && m.status !== "completed"
      );
      if (pendingMatches.length > 0) {
        return NextResponse.json({
          error: `${pendingMatches.length} match${pendingMatches.length > 1 ? "es" : ""} still pending in round ${currentRound}`,
        }, { status: 400 });
      }

      // Check if tournament is complete
      if (currentRound >= totalRounds) {
        // Calculate final standings
        const swissPlayers: SwissPlayer[] = tournament.players.map((p) => {
          const opponents = tournament.matches
            .filter((m) => m.player1_id === p.id || m.player2_id === p.id)
            .map((m) => m.player1_id === p.id ? m.player2_id : m.player1_id)
            .filter((id): id is string => !!id);

          return {
            id: p.id,
            name: p.player_name,
            matchPoints: (p.wins * 3) + p.draws,
            wins: p.wins,
            losses: p.losses,
            draws: p.draws,
            dropped: p.dropped,
            opponents,
            hadBye: tournament.matches.some(
              (m) => (m.player1_id === p.id || m.player2_id === p.id) && (!m.player1_id || !m.player2_id)
            ),
          };
        });

        const standings = calculateStandings(swissPlayers);

        // Update standings
        for (const s of standings) {
          await db.posTournamentPlayer.update({
            where: { id: s.id },
            data: { standing: s.standing },
          });
        }

        await db.posTournament.update({
          where: { id },
          data: { status: "completed", updated_at: new Date() },
        });

        // Send tournament results to HQ for Passport
        try {
          const { enqueueHQ } = await import("@/lib/hq-outbox");
          const { storeId } = await requirePermission("events.manage");
          const storeRecord = await db.posStore.findFirst({ select: { settings: true } });
          const venueId = ((storeRecord?.settings as Record<string, unknown>)?.venueId as string) || "";

          // Build results for linked players only
          const playerResults = [];
          for (const s of standings) {
            const player = tournament.players.find((p) => p.id === s.id);
            if (!player?.customer_id) continue;
            const cust = await db.posCustomer.findFirst({
              where: { id: player.customer_id },
              select: { afterroar_user_id: true },
            });
            if (!cust?.afterroar_user_id) continue;
            playerResults.push({
              afterroar_user_id: cust.afterroar_user_id,
              pos_customer_id: player.customer_id,
              record: { wins: s.wins, losses: s.losses, draws: s.draws },
              placement: s.standing,
              points_earned: 0,
            });
          }

          if (playerResults.length > 0) {
            await enqueueHQ(storeId, "tournament_result", {
              store_id: venueId,
              event: {
                name: tournament.name,
                format: tournament.format || "unknown",
                date: new Date().toISOString().slice(0, 10),
                type: tournament.bracket_type,
                rounds: tournament.total_rounds,
                total_players: tournament.players.filter((p) => !p.dropped).length,
              },
              results: playerResults,
            });
          }
        } catch {}

        const result = await db.posTournament.findFirst({
          where: { id },
          include: { players: { orderBy: { standing: "asc" } }, matches: { orderBy: [{ round_number: "asc" }, { match_number: "asc" }] } },
        });
        return NextResponse.json({ ...result, standings: standings.map((s) => ({ id: s.id, name: s.name, standing: s.standing, matchPoints: s.matchPoints, omwPercent: s.omwPercent, wins: s.wins, losses: s.losses, draws: s.draws })) });
      }

      // Generate next round pairings
      const nextRound = currentRound + 1;
      const swissPlayers: SwissPlayer[] = tournament.players.map((p) => {
        const opponents = tournament.matches
          .filter((m) => (m.player1_id === p.id || m.player2_id === p.id) && m.status === "completed")
          .map((m) => m.player1_id === p.id ? m.player2_id : m.player1_id)
          .filter((id): id is string => !!id);

        return {
          id: p.id,
          name: p.player_name,
          matchPoints: (p.wins * 3) + p.draws,
          wins: p.wins,
          losses: p.losses,
          draws: p.draws,
          dropped: p.dropped,
          opponents,
          hadBye: tournament.matches.some(
            (m) => (m.player1_id === p.id || m.player2_id === p.id) && (!m.player1_id || !m.player2_id)
          ),
        };
      });

      const pairings = generateSwissPairings(swissPlayers);

      for (let i = 0; i < pairings.length; i++) {
        const p = pairings[i];
        const isBye = !p.player2_id;

        await db.posTournamentMatch.create({
          data: {
            tournament_id: id,
            round_number: nextRound,
            match_number: i + 1,
            player1_id: p.player1_id,
            player2_id: p.player2_id,
            winner_id: isBye ? p.player1_id : null,
            status: isBye ? "completed" : "pending",
            table_number: p.table_number,
          },
        });

        if (isBye) {
          await db.posTournamentPlayer.update({
            where: { id: p.player1_id },
            data: { wins: { increment: 1 } },
          });
        }
      }

      await db.posTournament.update({
        where: { id },
        data: { current_round: nextRound, updated_at: new Date() },
      });

      const result = await db.posTournament.findFirst({
        where: { id },
        include: { players: true, matches: { orderBy: [{ round_number: "asc" }, { match_number: "asc" }] } },
      });
      return NextResponse.json(result);
    }

    // --- PRIZE PAYOUT ---
    if (body.action === "prize_payout") {
      const { prizes } = body as { prizes: Array<{ player_id: string; credit_cents: number }> };
      if (!prizes || !Array.isArray(prizes)) {
        return NextResponse.json({ error: "prizes array required" }, { status: 400 });
      }

      const { storeId, staff } = await requirePermission("events.manage");

      for (const prize of prizes) {
        if (!prize.player_id || !prize.credit_cents || prize.credit_cents <= 0) continue;

        const player = tournament.players.find((p) => p.id === prize.player_id);
        if (!player?.customer_id) continue;

        // Create ledger entry for prize payout
        await db.posLedgerEntry.create({
          data: {
            store_id: storeId,
            type: "credit_issue",
            customer_id: player.customer_id,
            staff_id: staff.id,
            amount_cents: prize.credit_cents,
            description: `Tournament prize: ${tournament.name} (${player.player_name})`,
            metadata: JSON.parse(JSON.stringify({
              tournament_id: id,
              player_id: player.id,
              standing: player.standing,
            })),
          },
        });

        // Update customer credit balance
        await db.posCustomer.update({
          where: { id: player.customer_id },
          data: { credit_balance_cents: { increment: prize.credit_cents } },
        });
      }

      return NextResponse.json({ success: true, prizes_awarded: prizes.length });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return handleAuthError(error);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function advanceWinner(
  db: any,
  tournamentId: string,
  currentRound: number,
  currentMatchNumber: number,
  winnerId: string,
  totalRounds: number
) {
  if (currentRound >= totalRounds) return;

  const nextRound = currentRound + 1;
  const nextMatchNumber = Math.ceil(currentMatchNumber / 2);

  // Find next round match
  const nextMatch = await db.posTournamentMatch.findFirst({
    where: {
      tournament_id: tournamentId,
      round_number: nextRound,
      match_number: nextMatchNumber,
    },
  });

  if (!nextMatch) return;

  // Determine if winner goes to player1 or player2 slot
  const isOddMatch = currentMatchNumber % 2 === 1;
  const updateData = isOddMatch
    ? { player1_id: winnerId }
    : { player2_id: winnerId };

  await db.posTournamentMatch.update({
    where: { id: nextMatch.id },
    data: updateData,
  });
}
