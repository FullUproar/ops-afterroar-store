// match.mjs
// ============================================================================
// Seidr cosine similarity matcher.
//
// Pure function. No I/O. Deterministic.
//
// Takes a 24-dim player profile and a collection of 24-dim game profiles;
// returns ranked recommendations after MMR diversification + designer cap
// + hard filters (excluded games, player-count constraint).
//
// Per SILO.md sec 8 (engines do not import from each other), this is
// independent of mimir's rank/score pipeline; it shares the same
// architectural pattern (cosine + MMR + designer cap) but operates on
// a different feature substrate (24-dim vector instead of mechanic/
// category attribute sets).
//
// SUBTLE-WRONGNESS ASSERTIONS (per SILO.md sec 7) are tested in
// tests/match.test.mjs. The matcher itself does NOT silently filter out
// "bad" recommendations -- it returns scores and lets callers decide.
// The subtle-wrongness assertions verify that for canonical input shapes,
// the output ordering respects expected dimensional relationships.
// ============================================================================

const DEFAULT_LIMIT = 10;
const DEFAULT_DIVERSITY_LAMBDA = 0.7;
const DEFAULT_MMR_POOL_FACTOR = 3;
const DEFAULT_MAX_PER_DESIGNER = 2;

/**
 * Compute cosine similarity between a player profile and a game profile.
 *
 * @param {object} playerProfile
 *   { dim_vector: {DIM_ID: number, ...}, confidence_vector?: {DIM_ID: number, ...} }
 * @param {object} gameProfile
 *   { dim_vector: {DIM_ID: number, ...}, confidence_per_dim?: {DIM_ID: number, ...} }
 * @param {object} [options]
 *   - useConfidence: if true (default), weight each dim's contribution by
 *     the product of player + game confidences for that dim. If false,
 *     plain cosine.
 *   - dimIds: optional explicit list of dim ids to consider. Defaults to
 *     the intersection of keys present in both vectors.
 * @returns {object} {
 *     cosine,                 // weighted cosine in [-1, 1]
 *     unweightedCosine,       // unconfidence-weighted cosine in [-1, 1]
 *     contributingDims,       // sorted array of {dim, contribution} (top-magnitude)
 *     dimsConsidered,         // number of dims that participated
 *   }
 */
export function similarity(playerProfile, gameProfile, options = {}) {
  if (!playerProfile || !gameProfile) {
    throw new Error('similarity: both playerProfile and gameProfile required');
  }
  const useConfidence = options.useConfidence ?? true;

  const pVec = playerProfile.dim_vector || {};
  const gVec = gameProfile.dim_vector || {};
  const pConf = playerProfile.confidence_vector || {};
  const gConf = gameProfile.confidence_per_dim || {};

  // Dims to consider: explicit list, OR intersection of keys present in both
  const dimIds = options.dimIds
    ? options.dimIds.filter(id => id in pVec && id in gVec)
    : Object.keys(pVec).filter(id => id in gVec);

  if (dimIds.length === 0) {
    return {
      cosine: 0,
      unweightedCosine: 0,
      contributingDims: [],
      dimsConsidered: 0,
    };
  }

  let dot = 0;
  let pNorm = 0;
  let gNorm = 0;
  let dotW = 0;
  let pNormW = 0;
  let gNormW = 0;
  const contributions = [];

  for (const id of dimIds) {
    const pv = numberOr(pVec[id], 0);
    const gv = numberOr(gVec[id], 0);
    const pc = numberOr(pConf[id], 1);
    const gc = numberOr(gConf[id], 1);
    const w = pc * gc;

    dot += pv * gv;
    pNorm += pv * pv;
    gNorm += gv * gv;

    dotW += w * pv * gv;
    pNormW += w * pv * pv;
    gNormW += w * gv * gv;

    contributions.push({ dim: id, contribution: w * pv * gv });
  }

  const unweightedCosine = safeCos(dot, pNorm, gNorm);
  const weightedCosine = safeCos(dotW, pNormW, gNormW);

  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return {
    cosine: useConfidence ? weightedCosine : unweightedCosine,
    unweightedCosine,
    contributingDims: contributions.slice(0, 5),
    dimsConsidered: dimIds.length,
  };
}

function safeCos(dot, pNorm, gNorm) {
  if (pNorm === 0 || gNorm === 0) return 0;
  const c = dot / (Math.sqrt(pNorm) * Math.sqrt(gNorm));
  // Clamp to [-1, 1] to defend against floating-point drift
  if (c > 1) return 1;
  if (c < -1) return -1;
  return c;
}

function numberOr(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * Score every game profile against the player profile and return them
 * sorted descending by similarity. No filtering, no diversification.
 *
 * @returns {Array} of { game_id, score, cosineSimilarity, contributingDims }
 */
export function scoreAll(playerProfile, gameProfiles, options = {}) {
  if (!Array.isArray(gameProfiles)) {
    throw new Error('scoreAll: gameProfiles must be an array');
  }
  return gameProfiles
    .filter(g => g && g.game_id != null)
    .map(g => {
      const sim = similarity(playerProfile, g, options);
      return {
        game_id: g.game_id,
        score: sim.cosine,
        cosineSimilarity: sim.cosine,
        unweightedCosine: sim.unweightedCosine,
        contributingDims: sim.contributingDims,
        dimsConsidered: sim.dimsConsidered,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Game-to-game similarity in the dim space. Used for MMR diversification:
 * when picking the next item, we penalize items that look (dim-wise)
 * like already-picked items.
 */
export function gameGameSimilarity(g1, g2) {
  return similarity(
    { dim_vector: g1.dim_vector, confidence_vector: g1.confidence_per_dim },
    g2,
    { useConfidence: false }
  ).unweightedCosine;
}

/**
 * Normalize raw scores to [0, 1] for MMR computation. Avoids divide-by-zero
 * for single-element pools.
 */
export function normalizeScores(scored) {
  if (scored.length === 0) return [];
  const scores = scored.map(s => s.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min;
  if (range === 0) {
    return scored.map(s => ({ ...s, normalizedScore: 1.0 }));
  }
  return scored.map(s => ({ ...s, normalizedScore: (s.score - min) / range }));
}

/**
 * Greedy MMR selection over a scored pool with optional designer cap.
 *
 * @param {Array} scoredPool      output of scoreAll(), already filtered
 * @param {Array} gameProfiles    same array passed to scoreAll (for game lookup)
 * @param {number} limit
 * @param {number} lambda
 * @param {object} [options]
 *   - bggMetadata: { game_id -> { designers: [{id, value}], ... } }
 *     when present, applies designer cap
 *   - designerCap: integer (default 2)
 */
export function mmrSelect(scoredPool, gameProfiles, limit, lambda, options = {}) {
  if (scoredPool.length === 0) return [];

  const { bggMetadata = null, designerCap = DEFAULT_MAX_PER_DESIGNER } = options;
  const profilesById = new Map(gameProfiles.map(g => [g.game_id, g]));
  const items = normalizeScores(scoredPool);
  const picked = [];
  const remaining = [...items];

  while (picked.length < limit && remaining.length > 0) {
    const designerCounts = bggMetadata ? countDesigners(picked, bggMetadata) : null;
    const eligible = remaining.filter(item =>
      designerCounts ? respectsDesignerCap(item.game_id, bggMetadata, designerCounts, designerCap) : true
    );
    if (eligible.length === 0) break;

    let bestIdx = -1;
    let bestMmr = -Infinity;

    for (let i = 0; i < eligible.length; i++) {
      const item = eligible[i];
      const itemProfile = profilesById.get(item.game_id);
      if (!itemProfile) continue;
      const maxSim =
        picked.length === 0
          ? 0
          : Math.max(
              ...picked.map(p => {
                const pProfile = profilesById.get(p.game_id);
                return pProfile ? gameGameSimilarity(itemProfile, pProfile) : 0;
              })
            );
      const mmr = lambda * item.normalizedScore - (1 - lambda) * maxSim;
      if (mmr > bestMmr) {
        bestMmr = mmr;
        bestIdx = i;
      }
    }

    if (bestIdx < 0) break;
    const chosen = eligible[bestIdx];
    picked.push(chosen);
    const remIdx = remaining.indexOf(chosen);
    if (remIdx >= 0) remaining.splice(remIdx, 1);
  }

  return picked;
}

function countDesigners(picked, bggMetadata) {
  const counts = new Map();
  for (const p of picked) {
    const meta = bggMetadata[p.game_id];
    if (!meta || !Array.isArray(meta.designers)) continue;
    for (const d of meta.designers) {
      counts.set(d.id, (counts.get(d.id) || 0) + 1);
    }
  }
  return counts;
}

function respectsDesignerCap(gameId, bggMetadata, counts, cap) {
  const meta = bggMetadata[gameId];
  if (!meta || !Array.isArray(meta.designers)) return true;
  for (const d of meta.designers) {
    if ((counts.get(d.id) || 0) + 1 > cap) return false;
  }
  return true;
}

/**
 * Top-level matcher. Filters, scores, diversifies.
 *
 * @param {object} playerProfile
 * @param {Array} gameProfiles
 * @param {object} [options]
 *   - limit: int (default 10)
 *   - excludeGameIds: number[] (default [])
 *   - playerCount: int -- hard filter games whose [minPlayers, maxPlayers]
 *     don't span this count (requires bggMetadata for the player-count fields)
 *   - bggMetadata: { game_id -> { designers, minPlayers, maxPlayers } }
 *   - diversify: bool (default true)
 *   - diversityLambda: number (default 0.7)
 *   - designerCap: int (default 2)
 *   - mmrPoolFactor: int (default 3)
 *   - useConfidence: bool (default true)
 * @returns {object} {
 *     recommendations: [...],   // top-K with score + diagnostics
 *     filtered: [...],          // game_ids filtered with reason codes
 *     totalConsidered: int,     // size of input candidate pool after structural validation
 *   }
 */
export function match(playerProfile, gameProfiles, options = {}) {
  if (!playerProfile || typeof playerProfile !== 'object') {
    throw new Error('match: playerProfile required');
  }
  if (!Array.isArray(gameProfiles)) {
    throw new Error('match: gameProfiles must be an array');
  }

  const {
    limit = DEFAULT_LIMIT,
    excludeGameIds = [],
    playerCount = null,
    bggMetadata = null,
    diversify = true,
    diversityLambda = DEFAULT_DIVERSITY_LAMBDA,
    designerCap = DEFAULT_MAX_PER_DESIGNER,
    mmrPoolFactor = DEFAULT_MMR_POOL_FACTOR,
    useConfidence = true,
  } = options;

  const excludeSet = new Set(excludeGameIds);
  const filtered = [];
  const candidates = [];

  for (const g of gameProfiles) {
    if (!g || g.game_id == null) continue;
    if (excludeSet.has(g.game_id)) {
      filtered.push({ game_id: g.game_id, reason: 'excluded' });
      continue;
    }
    if (playerCount != null && bggMetadata) {
      const meta = bggMetadata[g.game_id];
      if (meta && Number.isInteger(meta.minPlayers) && Number.isInteger(meta.maxPlayers)) {
        if (playerCount < meta.minPlayers || playerCount > meta.maxPlayers) {
          filtered.push({
            game_id: g.game_id,
            reason: 'player_count_out_of_range',
            range: [meta.minPlayers, meta.maxPlayers],
          });
          continue;
        }
      }
      // If meta is missing, we DON'T filter -- absence of data is not
      // grounds for exclusion. The caller can pre-filter by metadata
      // presence if they want strict filtering.
    }
    candidates.push(g);
  }

  const scored = scoreAll(playerProfile, candidates, { useConfidence });

  if (!diversify || scored.length <= 1) {
    return {
      recommendations: scored.slice(0, limit),
      filtered,
      totalConsidered: candidates.length,
    };
  }

  const pool = scored.slice(0, Math.min(scored.length, limit * mmrPoolFactor));
  const diversified = mmrSelect(pool, candidates, limit, diversityLambda, {
    bggMetadata,
    designerCap,
  });

  return {
    recommendations: diversified,
    filtered,
    totalConsidered: candidates.length,
  };
}
