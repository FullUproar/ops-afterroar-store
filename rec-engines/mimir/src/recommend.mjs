// recommend.mjs
// ============================================================================
// Mimir end-to-end recommender (v0 content similarity).
//
// Composes the pipeline:
//   computeTasteVector -> rankCandidates (which calls scoreCandidate) -> explain
//
// Conforms to the API contract from design doc § 4 (RecommendRequest /
// RecommendResponse). For Phase 0 (no DB yet), seed_loved / seed_noped /
// noped_ids are passed directly in the request context. Phase 1+ will
// look these up from rec_edge by player_id.
//
// Pure function. No I/O. Deterministic given inputs (except request_id
// which is generated, but can be supplied via options.requestId).
// ============================================================================

import { computeTasteVector } from './taste-vector.mjs';
import { rankCandidates } from './rank.mjs';
import { explain } from './explain.mjs';

export const RANKER_VERSION = 'mimir-content-similarity-0.1';
const DEFAULT_LIMIT = 10;
const LOW_CONFIDENCE_THRESHOLD = 0.3;

/**
 * Generate a recommendation response.
 *
 * @param {Object} request - matches design doc § 4.1 RecommendRequest shape
 * @param {Map<number, object>|Object} gameMetadata - BGG metadata lookup
 * @param {Object} [options] - { requestId?, candidatePool? }
 * @returns {Object} matches design doc § 4.2 RecommendResponse shape
 */
export function recommend(request, gameMetadata, options = {}) {
  const requestId = options.requestId || generateRequestId();
  const context = request?.context || {};
  const reqOptions = request?.options || {};

  // Phase 0: seed_loved / seed_noped come directly from context.
  // Phase 1+ replaces this with a DB lookup keyed on caller.player_id.
  const seedLoved = context.seed_loved || [];
  const seedNoped = context.seed_noped || [];

  const tasteVector = computeTasteVector(seedLoved, seedNoped, gameMetadata);

  const candidatePool =
    options.candidatePool || buildCandidatePool(gameMetadata, reqOptions);

  // Combine all noped sources into a single hard-veto list:
  //   1. seed_noped (player explicitly disliked at onboarding)
  //   2. noped_ids (any other source the caller wants vetoed)
  const nopedIds = [...new Set([...seedNoped, ...(context.noped_ids || [])])];

  const scorerContext = {
    desiredPlayerCount: context.desired_player_count,
    minutesAvailable: context.minutes_available,
    nopedIds,
  };

  // exclude_seeds defaults to true: don't recommend games the player just
  // told us they love or hate. Set to false to opt out (e.g. eval harness).
  const excludeSeeds = reqOptions.exclude_seeds !== false;
  const exclude = [...(reqOptions.exclude || [])];
  if (excludeSeeds) {
    exclude.push(...seedLoved, ...seedNoped);
  }

  const ranked = rankCandidates(candidatePool, tasteVector, scorerContext, {
    limit: reqOptions.limit ?? DEFAULT_LIMIT,
    diversify: reqOptions.diversify !== false,
    exclude,
  });

  // Confidence filter: low-confidence requests should optionally return
  // an empty list rather than nonsense. Default is to include them so
  // the caller can decide.
  const includeLowConfidence = reqOptions.include_low_confidence !== false;
  const filtered = includeLowConfidence
    ? ranked
    : ranked.filter(r => r.confidence >= LOW_CONFIDENCE_THRESHOLD);

  const explainLevel = reqOptions.explain || 'short';
  const results = filtered.map((r, idx) => {
    const expl = explain(r, r.candidate, tasteVector, { context });
    const explanation = {
      reason_codes: r.reasonCodes,
      natural_language: explainLevel === 'short' ? expl.short : expl.long,
    };
    if (explainLevel === 'rich') {
      explanation.contributors = expl.contributors;
    }

    const result = {
      game_id: r.candidate.id,
      game_name: r.candidate.name,
      score: r.score,
      confidence: r.confidence,
      explanation,
    };

    if (explainLevel === 'rich') {
      result.diagnostics = {
        candidate_rank: idx + 1,
        score_breakdown: r.breakdown,
      };
    }

    return result;
  });

  return {
    request_id: requestId,
    ranker_version: RANKER_VERSION,
    results,
  };
}

/**
 * Build the candidate pool from gameMetadata. For Phase 0 we use all
 * known games; future phases can filter by candidate_pool='owned' /
 * 'in_store' / 'wishlist' once those edges exist.
 */
function buildCandidatePool(gameMetadata) {
  if (!gameMetadata) return [];
  return gameMetadata instanceof Map
    ? [...gameMetadata.values()]
    : Object.values(gameMetadata);
}

/**
 * Lightweight request id generator. Not crypto; just enough uniqueness
 * for log correlation in Phase 0. Phase 1+ may swap to crypto.randomUUID().
 */
function generateRequestId() {
  return (
    'rec-' +
    Math.random().toString(36).slice(2, 10) +
    '-' +
    Date.now().toString(36)
  );
}
