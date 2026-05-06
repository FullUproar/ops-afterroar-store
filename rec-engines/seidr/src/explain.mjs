// explain.mjs
// ============================================================================
// Seidr explanation generator.
//
// Pure function. No I/O. Deterministic.
//
// Takes a scored recommendation (with contributingDims from the matcher) +
// dimension taxonomy + (optionally) player/game profiles, and produces a
// natural-language explanation of WHY the matcher ranked the game where
// it did.
//
// Per Credo's "no black-box rankings" principle, every recommendation
// must be defensible in plain English. This module is the substrate.
//
// Two output detail levels:
//   - 'short':  one-sentence reason ("strong match on PSY_KILLER and CTX_TIME")
//   - 'rich':   2-3 sentences with concrete dimensional reasoning grounded
//               in the taxonomy's low/high pole descriptors
// ============================================================================

const DEFAULT_DETAIL = 'rich';
const MIN_CONTRIBUTION_FOR_MENTION = 0.05; // dims below this are noise

/**
 * Build an explanation string for a single ranked recommendation.
 *
 * @param {object} recommendation
 *   The output row from match().recommendations[i]:
 *   { game_id, score, cosineSimilarity, contributingDims, dimsConsidered }
 * @param {object} dimensionsJson
 *   parsed data/dimensions.json
 * @param {object} [options]
 *   - detail: 'short' | 'rich' (default 'rich')
 *   - playerProfile: optional, for "you scored high on X" framing
 *   - gameProfile: optional, for "this game scores high on X" framing
 *   - gameName: optional display name
 * @returns {string}
 */
export function explain(recommendation, dimensionsJson, options = {}) {
  if (!recommendation || typeof recommendation !== 'object') {
    throw new Error('explain: recommendation required');
  }
  if (!dimensionsJson || !Array.isArray(dimensionsJson.dimensions)) {
    throw new Error('explain: dimensionsJson with .dimensions array required');
  }
  const detail = options.detail || DEFAULT_DETAIL;

  const dimById = new Map(dimensionsJson.dimensions.map(d => [d.id, d]));
  const contributing = (recommendation.contributingDims || [])
    .filter(c => Math.abs(c.contribution) >= MIN_CONTRIBUTION_FOR_MENTION);

  if (contributing.length === 0) {
    if (recommendation.cosineSimilarity != null && recommendation.cosineSimilarity < 0.05) {
      return `Low confidence — your profile and this game don't have strong dimensional alignment. Treat as a weak suggestion.`;
    }
    return `No standout dimensional drivers. The match score is ${formatScore(recommendation.cosineSimilarity)}.`;
  }

  if (detail === 'short') {
    return shortExplain(contributing, dimById, recommendation, options);
  }
  return richExplain(contributing, dimById, recommendation, options);
}

function shortExplain(contributing, dimById, recommendation, options) {
  const top = contributing.slice(0, 2);
  const dims = top.map(c => dimById.get(c.dim)?.id || c.dim).join(' + ');
  const verb = recommendation.cosineSimilarity > 0.3 ? 'strong match' :
               recommendation.cosineSimilarity > 0 ? 'aligned' : 'weak match';
  const name = options.gameName ? ` for ${options.gameName}` : '';
  return `${cap(verb)}${name} on ${dims} (cosine ${formatScore(recommendation.cosineSimilarity)}).`;
}

function richExplain(contributing, dimById, recommendation, options) {
  const top = contributing.slice(0, 3);
  const positive = top.filter(c => c.contribution > 0);
  const negative = top.filter(c => c.contribution < 0);

  const fragments = [];

  if (positive.length > 0) {
    const phrases = positive.map(c => describeAlignment(c, dimById, options, true));
    fragments.push(`This game aligns with your profile on ${listJoin(phrases)}.`);
  }

  if (negative.length > 0) {
    const phrases = negative.map(c => describeAlignment(c, dimById, options, false));
    fragments.push(`Note: ${listJoin(phrases)}.`);
  }

  // Add an overall confidence note
  const score = recommendation.cosineSimilarity;
  if (score != null) {
    if (score > 0.5) {
      fragments.push(`Overall, a solid dimensional fit (cosine ${formatScore(score)}).`);
    } else if (score > 0.2) {
      fragments.push(`A moderate fit overall (cosine ${formatScore(score)}).`);
    } else if (score > 0) {
      fragments.push(`A weak overall fit (cosine ${formatScore(score)}); consider this a tentative suggestion.`);
    } else {
      fragments.push(`Overall a poor fit (cosine ${formatScore(score)}); included for diversity, not strong match.`);
    }
  }

  return fragments.join(' ');
}

function describeAlignment(contribution, dimById, options, isPositive) {
  const def = dimById.get(contribution.dim);
  if (!def) {
    return `${contribution.dim} (${formatScore(contribution.contribution)})`;
  }

  // Try to determine WHICH pole both vectors lean toward, for prose framing
  const playerVec = options.playerProfile?.dim_vector?.[contribution.dim];
  const gameVec = options.gameProfile?.dim_vector?.[contribution.dim];

  if (playerVec != null && gameVec != null) {
    const both = Math.sign(playerVec) === Math.sign(gameVec) && playerVec !== 0;
    if (both && isPositive) {
      const pole = playerVec > 0 ? def.high : def.low;
      return `you both lean ${pole.toLowerCase()} on ${def.id}`;
    }
    if (!both && !isPositive) {
      const playerPole = playerVec > 0 ? def.high : def.low;
      const gamePole = gameVec > 0 ? def.high : def.low;
      return `you lean ${playerPole.toLowerCase()} but this game leans ${gamePole.toLowerCase()} on ${def.id}`;
    }
  }

  // Fallback: cluster + magnitude
  return `${def.id} (cluster ${def.cluster}, ${describeMagnitude(contribution.contribution)})`;
}

function describeMagnitude(c) {
  const a = Math.abs(c);
  if (a > 0.5) return 'strong';
  if (a > 0.2) return 'moderate';
  return 'weak';
}

function listJoin(items) {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function cap(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatScore(s) {
  if (typeof s !== 'number') return 'unknown';
  return s.toFixed(2);
}

/**
 * Build explanations for a batch of recommendations.
 *
 * @param {object} matchResult         match() return value
 * @param {object} dimensionsJson
 * @param {object} [options]
 *   - playerProfile, detail: forwarded to explain()
 *   - gameProfilesById: optional Map(game_id -> game_profile) for richer framing
 *   - gameNamesById: optional Map(game_id -> display name)
 * @returns {Array<{game_id, score, explanation}>}
 */
export function explainAll(matchResult, dimensionsJson, options = {}) {
  if (!matchResult || !Array.isArray(matchResult.recommendations)) {
    throw new Error('explainAll: matchResult.recommendations array required');
  }
  return matchResult.recommendations.map(rec => {
    const explainOptions = {
      detail: options.detail,
      playerProfile: options.playerProfile,
      gameProfile: options.gameProfilesById?.get(rec.game_id),
      gameName: options.gameNamesById?.get(rec.game_id),
    };
    return {
      game_id: rec.game_id,
      score: rec.score,
      cosineSimilarity: rec.cosineSimilarity,
      explanation: explain(rec, dimensionsJson, explainOptions),
    };
  });
}
