/* ------------------------------------------------------------------ */
/*  Swiss Pairing Algorithm                                            */
/*  Standard tournament format for FLGS events (FNM, league, etc.)     */
/*                                                                     */
/*  Rules:                                                             */
/*  1. Players sorted by match points (3 for win, 1 for draw, 0 loss) */
/*  2. Within each point group, pair players who haven't played each   */
/*     other yet                                                       */
/*  3. Odd player count: lowest-ranked without a bye gets the bye      */
/*  4. Byes award 3 match points (a free win)                          */
/*  5. Recommended rounds = ceil(log2(player_count))                   */
/* ------------------------------------------------------------------ */

export interface SwissPlayer {
  id: string;
  name: string;
  matchPoints: number;
  wins: number;
  losses: number;
  draws: number;
  dropped: boolean;
  opponents: string[]; // IDs of previous opponents
  hadBye: boolean;
}

export interface SwissPairing {
  player1_id: string;
  player2_id: string | null; // null = bye
  table_number: string;
}

/**
 * Calculate recommended number of rounds for Swiss.
 * Standard: ceil(log2(players))
 */
export function recommendedRounds(playerCount: number): number {
  if (playerCount <= 1) return 0;
  return Math.ceil(Math.log2(playerCount));
}

/**
 * Generate Swiss pairings for the next round.
 *
 * Algorithm:
 * 1. Sort active players by match points (descending)
 * 2. If odd number, assign bye to lowest-ranked player without a previous bye
 * 3. Group players by point bracket
 * 4. Within each bracket, greedily pair players who haven't faced each other
 * 5. If no valid pairing in bracket, cross-pair with next bracket down
 */
export function generateSwissPairings(players: SwissPlayer[]): SwissPairing[] {
  // Filter out dropped players
  const active = players.filter((p) => !p.dropped);
  if (active.length < 2) return [];

  // Sort by match points descending, then by wins as tiebreaker
  const sorted = [...active].sort((a, b) => {
    if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
    return b.wins - a.wins;
  });

  const pairings: SwissPairing[] = [];
  const paired = new Set<string>();
  let tableNum = 1;

  // Handle bye for odd player count
  if (sorted.length % 2 === 1) {
    // Find lowest-ranked player who hasn't had a bye
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (!sorted[i].hadBye) {
        pairings.push({
          player1_id: sorted[i].id,
          player2_id: null,
          table_number: "BYE",
        });
        paired.add(sorted[i].id);
        break;
      }
    }
    // If everyone has had a bye, give it to the lowest player
    if (paired.size === 0) {
      const byePlayer = sorted[sorted.length - 1];
      pairings.push({
        player1_id: byePlayer.id,
        player2_id: null,
        table_number: "BYE",
      });
      paired.add(byePlayer.id);
    }
  }

  // Greedy pairing: go through sorted list, pair with best available opponent
  const unpaired = sorted.filter((p) => !paired.has(p.id));

  for (let i = 0; i < unpaired.length; i++) {
    const p1 = unpaired[i];
    if (paired.has(p1.id)) continue;

    // Find best opponent: same point bracket, hasn't played p1, not yet paired
    let bestOpponent: SwissPlayer | null = null;
    for (let j = i + 1; j < unpaired.length; j++) {
      const p2 = unpaired[j];
      if (paired.has(p2.id)) continue;
      if (p1.opponents.includes(p2.id)) continue; // Already played
      bestOpponent = p2;
      break;
    }

    // If no valid opponent in remaining list (all played before), take the first unpaired
    if (!bestOpponent) {
      for (let j = i + 1; j < unpaired.length; j++) {
        if (!paired.has(unpaired[j].id)) {
          bestOpponent = unpaired[j];
          break;
        }
      }
    }

    if (bestOpponent) {
      pairings.push({
        player1_id: p1.id,
        player2_id: bestOpponent.id,
        table_number: `Table ${tableNum}`,
      });
      paired.add(p1.id);
      paired.add(bestOpponent.id);
      tableNum++;
    }
  }

  return pairings;
}

/**
 * Calculate standings with tiebreakers.
 * Returns players sorted by: match points > OMW% > wins
 */
export function calculateStandings(
  players: SwissPlayer[],
): Array<SwissPlayer & { omwPercent: number; standing: number }> {
  // Calculate OMW% (Opponent Match Win Percentage) for each player
  const playerMap = new Map(players.map((p) => [p.id, p]));

  const standings = players
    .filter((p) => !p.dropped)
    .map((p) => {
      // OMW% = average of each opponent's match win percentage (min 33%)
      let omwTotal = 0;
      let omwCount = 0;
      for (const oppId of p.opponents) {
        const opp = playerMap.get(oppId);
        if (opp) {
          const oppGames = opp.wins + opp.losses + opp.draws;
          const oppMwp = oppGames > 0 ? Math.max(0.33, opp.matchPoints / (oppGames * 3)) : 0.33;
          omwTotal += oppMwp;
          omwCount++;
        }
      }
      const omwPercent = omwCount > 0 ? Math.round((omwTotal / omwCount) * 100) : 0;

      return { ...p, omwPercent, standing: 0 };
    })
    .sort((a, b) => {
      if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
      if (b.omwPercent !== a.omwPercent) return b.omwPercent - a.omwPercent;
      return b.wins - a.wins;
    });

  // Assign standings
  standings.forEach((p, i) => {
    p.standing = i + 1;
  });

  return standings;
}
