// taste-vector.mjs
// ============================================================================
// Mimir taste vector computation.
//
// Given a player's seed-loved + seed-noped game IDs (from onboarding) and
// the BGG metadata for those games, compute a multidimensional taste vector
// that the scorer (Sprint 1.0.3) will use to rank candidate games.
//
// Pure function. No I/O. Deterministic given inputs.
//
// Per design doc § 5.1 "Taste vector construction (Phase 0)":
//   From onboarding: seed-loved games contribute positively, seed-noped
//   games contribute negatively, in mechanic/theme/designer feature space.
// ============================================================================

const DEFAULT_NOPE_WEIGHT = 1.5;

/**
 * Compute a taste vector from seed-loved / seed-noped BGG IDs.
 *
 * @param {number[]} seedLoved   - BGG IDs the player loves
 * @param {number[]} seedNoped   - BGG IDs the player can't stand
 * @param {Map<number, object>|Object} gameMetadata - lookup of BGG ID →
 *     parsed game data. Shape from fetch-bgg.mjs:
 *       { mechanics: [{id, value}], categories: [...], families: [...],
 *         designers: [...], weight: number|null, minPlayers, maxPlayers,
 *         playingTime, ... }
 * @param {Object} options
 * @param {number} [options.nopeWeight=1.5] - magnitude of noped-game
 *     contribution. > 1 because explicit negative signal is rarer and
 *     more informative than positive (Trade-In Hypothesis: a player who
 *     said "don't show me this" is signaling more strongly than one who
 *     said "I like this").
 *
 * @returns {Object} TasteVector:
 *   {
 *     mechanics: { [id]: weight },     // L1-normalized; |sum| = 1 if non-empty
 *     categories: { [id]: weight },
 *     families: { [id]: weight },
 *     designers: { [id]: weight },
 *     weightPreference: { mean, std, count },         // from loved games only
 *     playerCountPreference: { mean, std, count },
 *     playTimePreference: { mean, std, count },
 *     seedCounts: { loved, noped, lovedFound, nopedFound },
 *   }
 */
export function computeTasteVector(seedLoved, seedNoped, gameMetadata, options = {}) {
  const { nopeWeight = DEFAULT_NOPE_WEIGHT } = options;
  const lookup = id =>
    gameMetadata instanceof Map ? gameMetadata.get(id) : gameMetadata[id];

  const mechanics = {};
  const categories = {};
  const families = {};
  const designers = {};
  const lovedWeights = [];
  const lovedPlayerCounts = [];
  const lovedPlayTimes = [];
  let lovedFound = 0;
  let nopedFound = 0;

  const accumulate = (target, items, sign) => {
    for (const item of items || []) {
      const k = String(item.id);
      target[k] = (target[k] || 0) + sign;
    }
  };

  for (const id of seedLoved || []) {
    const game = lookup(id);
    if (!game) continue;
    lovedFound++;
    accumulate(mechanics, game.mechanics, 1);
    accumulate(categories, game.categories, 1);
    accumulate(families, game.families, 1);
    accumulate(designers, game.designers, 1);
    if (game.weight != null) lovedWeights.push(game.weight);
    if (game.minPlayers != null && game.maxPlayers != null) {
      lovedPlayerCounts.push((game.minPlayers + game.maxPlayers) / 2);
    }
    if (game.playingTime != null) lovedPlayTimes.push(game.playingTime);
  }

  for (const id of seedNoped || []) {
    const game = lookup(id);
    if (!game) continue;
    nopedFound++;
    accumulate(mechanics, game.mechanics, -nopeWeight);
    accumulate(categories, game.categories, -nopeWeight);
    accumulate(families, game.families, -nopeWeight);
    accumulate(designers, game.designers, -nopeWeight);
  }

  return {
    mechanics: l1Normalize(mechanics),
    categories: l1Normalize(categories),
    families: l1Normalize(families),
    designers: l1Normalize(designers),
    weightPreference: stats(lovedWeights),
    playerCountPreference: stats(lovedPlayerCounts),
    playTimePreference: stats(lovedPlayTimes),
    seedCounts: {
      loved: (seedLoved || []).length,
      noped: (seedNoped || []).length,
      lovedFound,
      nopedFound,
    },
  };
}

/**
 * L1-normalize a {key: number} map so the sum of absolute values equals 1.0.
 * Returns {} for an all-zero or empty input (avoids divide-by-zero).
 */
export function l1Normalize(obj) {
  const totalAbs = Object.values(obj).reduce((s, v) => s + Math.abs(v), 0);
  if (totalAbs === 0) return {};
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = v / totalAbs;
  }
  return result;
}

/**
 * Compute mean, population std-dev, and count of an array of numbers.
 * Returns { mean: null, std: null, count: 0 } for an empty array.
 */
export function stats(arr) {
  if (!arr || arr.length === 0) {
    return { mean: null, std: null, count: 0 };
  }
  const n = arr.length;
  const mean = arr.reduce((s, x) => s + x, 0) / n;
  const variance = arr.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  return { mean, std: Math.sqrt(variance), count: n };
}
