// score.mjs
// ============================================================================
// Mimir candidate scorer (v0 content-similarity ranker).
//
// Takes a candidate game (BGG metadata shape from fetch-bgg.mjs), a player's
// taste vector (from computeTasteVector), and a recommendation context
// (player count, time available, etc.). Returns:
//   - score: numeric, higher = better
//   - confidence: [0, 1] reflecting how much signal we had
//   - reasonCodes: array of human-meaningful tags for the explanation generator
//   - breakdown: per-term contribution for debugging
//
// Pure function. No I/O. Deterministic.
//
// Per design doc § 5.1.
// ============================================================================

// Hand-tuned starting weights. Tune via offline eval once we have logged
// requests + outcomes (Sprint 0.3+).
export const WEIGHTS = {
  mechanicOverlap: 3.0, // largest signal: shared mechanics dominate
  categoryOverlap: 1.5,
  familyOverlap: 1.0,
  designerMatch: 1.0,
  weightSimilarity: 1.0,
  playerCountFit: 1.5, // hard practical constraint, weighted up
  lengthFit: 1.0,
  qualityPrior: 0.5, // tiebreaker, not the answer
};

const NOPED_PENALTY_SCORE = -10; // ensures noped game ranks below any positive
const NEUTRAL_SCORE = 0.5; // when no signal available
const REASON_THRESHOLD = 0.05; // abs threshold to emit a reason code

// ----------------------------------------------------------------------------
// Public: scoreCandidate
// ----------------------------------------------------------------------------

/**
 * Score a candidate game against a player's taste vector + context.
 *
 * @param {Object} candidate - BGG metadata shape (from fetch-bgg.mjs)
 * @param {Object} tasteVector - output of computeTasteVector()
 * @param {Object} [context] - { desiredPlayerCount?, minutesAvailable?,
 *                                nopedIds? }
 * @param {Object} [options] - { weights? } override defaults
 * @returns {Object} { score, confidence, reasonCodes, breakdown }
 */
export function scoreCandidate(candidate, tasteVector, context = {}, options = {}) {
  const w = { ...WEIGHTS, ...(options.weights || {}) };

  // SUBTLE-WRONGNESS GUARD #1: hard veto on explicitly noped IDs.
  // Required by SILO.md § 7 ("Noped games never appear in recs").
  if (context.nopedIds && context.nopedIds.includes(candidate.id)) {
    return {
      score: NOPED_PENALTY_SCORE,
      confidence: 1.0,
      reasonCodes: ['noped_explicitly'],
      breakdown: { nopedPenalty: NOPED_PENALTY_SCORE },
    };
  }

  const breakdown = {};
  const reasonCodes = [];

  // --- Affinity terms (signed: positive = match, negative = anti-match) ---
  const mechSig = sumAffinity(candidate.mechanics, tasteVector.mechanics);
  breakdown.mechanicOverlap = mechSig * w.mechanicOverlap;
  if (Math.abs(mechSig) > REASON_THRESHOLD) {
    reasonCodes.push(mechSig > 0 ? 'mechanic_match' : 'mechanic_mismatch');
  }

  const catSig = sumAffinity(candidate.categories, tasteVector.categories);
  breakdown.categoryOverlap = catSig * w.categoryOverlap;
  if (Math.abs(catSig) > REASON_THRESHOLD) {
    reasonCodes.push(catSig > 0 ? 'category_match' : 'category_mismatch');
  }

  const famSig = sumAffinity(candidate.families, tasteVector.families);
  breakdown.familyOverlap = famSig * w.familyOverlap;
  if (Math.abs(famSig) > REASON_THRESHOLD) {
    reasonCodes.push(famSig > 0 ? 'family_match' : 'family_mismatch');
  }

  const desSig = sumAffinity(candidate.designers, tasteVector.designers);
  breakdown.designerMatch = desSig * w.designerMatch;
  if (desSig > REASON_THRESHOLD) reasonCodes.push('designer_match');

  // --- Fitness terms (always in [0, 1]) ---
  const weightSim = weightSimilarity(candidate.weight, tasteVector.weightPreference);
  breakdown.weightSimilarity = weightSim * w.weightSimilarity;
  if (weightSim > 0.7) reasonCodes.push('weight_match');

  const pcFit = playerCountFit(candidate, context.desiredPlayerCount);
  breakdown.playerCountFit = pcFit * w.playerCountFit;
  if (pcFit >= 0.99) reasonCodes.push('player_count_fit');
  else if (pcFit === 0 && context.desiredPlayerCount != null) {
    reasonCodes.push('player_count_violated');
  }

  const lenFit = lengthFit(candidate, context.minutesAvailable);
  breakdown.lengthFit = lenFit * w.lengthFit;
  if (lenFit >= 0.95 && context.minutesAvailable != null) {
    reasonCodes.push('length_fit');
  } else if (lenFit === 0 && context.minutesAvailable != null) {
    reasonCodes.push('length_violated');
  }

  // --- Quality prior ---
  const qual = qualityPrior(candidate.bggRank);
  breakdown.qualityPrior = qual * w.qualityPrior;

  const score = Object.values(breakdown).reduce((s, x) => s + x, 0);
  const confidence = computeConfidence(tasteVector, context);

  return { score, confidence, reasonCodes, breakdown };
}

// ----------------------------------------------------------------------------
// Internal: term computations (exported for direct testing)
// ----------------------------------------------------------------------------

/** Sum of taste-vector axis values over a candidate's tagged items. */
export function sumAffinity(items, axis) {
  if (!items || !axis) return 0;
  let sum = 0;
  for (const item of items) {
    const k = String(item.id);
    if (axis[k] != null) sum += axis[k];
  }
  return sum;
}

/**
 * Gaussian-like similarity between a candidate weight and the player's
 * preferred weight (mean/std from loved games). Returns NEUTRAL_SCORE
 * when either input is missing.
 */
export function weightSimilarity(candidateWeight, weightPref) {
  if (candidateWeight == null) return NEUTRAL_SCORE;
  if (!weightPref || weightPref.mean == null) return NEUTRAL_SCORE;
  // Avoid divide-by-zero when only one loved game (std = 0).
  const sigma = Math.max(weightPref.std || 0.5, 0.5);
  const diff = candidateWeight - weightPref.mean;
  return Math.exp(-(diff * diff) / (2 * sigma * sigma));
}

/**
 * Player count fit: 1.0 if desired in [min, max]; 0.3 if within ±1;
 * 0.0 otherwise; NEUTRAL when desired or candidate range unknown.
 */
export function playerCountFit(candidate, desired) {
  if (desired == null) return NEUTRAL_SCORE;
  if (candidate.minPlayers == null || candidate.maxPlayers == null) {
    return NEUTRAL_SCORE;
  }
  if (desired >= candidate.minPlayers && desired <= candidate.maxPlayers) {
    return 1.0;
  }
  if (
    desired === candidate.minPlayers - 1 ||
    desired === candidate.maxPlayers + 1
  ) {
    return 0.3;
  }
  return 0.0;
}

/**
 * Length fit: 1.0 if candidate fits within available time; linearly
 * decays to 0 at 1.5x available; NEUTRAL when either input unknown.
 */
export function lengthFit(candidate, minutesAvailable) {
  if (minutesAvailable == null) return NEUTRAL_SCORE;
  if (candidate.playingTime == null) return NEUTRAL_SCORE;
  if (candidate.playingTime <= minutesAvailable) return 1.0;
  if (candidate.playingTime >= 1.5 * minutesAvailable) return 0.0;
  // linear interpolation between 1x and 1.5x available
  return 1.0 - (candidate.playingTime - minutesAvailable) / (0.5 * minutesAvailable);
}

/**
 * Quality prior from BGG rank. Top 100 ≈ 0.91; rank 1000 = 0.5;
 * rank 10000 ≈ 0.09. Returns NEUTRAL when rank is unknown or zero.
 */
export function qualityPrior(bggRank) {
  if (bggRank == null || bggRank <= 0) return NEUTRAL_SCORE;
  return 1.0 / (1 + bggRank / 1000);
}

/**
 * Confidence: how much signal the taste vector + context carry.
 * Useful for the API to decide whether to return "insufficient data"
 * vs a real rec list.
 */
export function computeConfidence(tasteVector, context = {}) {
  let c = 0;
  if (Object.keys(tasteVector?.mechanics || {}).length > 0) c += 0.3;
  if (Object.keys(tasteVector?.categories || {}).length > 0) c += 0.1;
  if (Object.keys(tasteVector?.families || {}).length > 0) c += 0.1;
  if (tasteVector?.weightPreference?.count > 0) c += 0.1;
  if (context.desiredPlayerCount != null) c += 0.2;
  if (context.minutesAvailable != null) c += 0.2;
  return Math.min(c, 1.0);
}
