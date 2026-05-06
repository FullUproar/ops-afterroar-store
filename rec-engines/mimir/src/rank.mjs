// rank.mjs
// ============================================================================
// Mimir ranking pipeline: score every candidate → sort by score → apply MMR
// diversification with a hard designer cap (per SILO.md § 7).
//
// Pure function. No I/O. Deterministic.
//
// Per design doc § 5.1 ("Diversification: Maximal Marginal Relevance (MMR)
// on top-K to prevent monocultures").
// ============================================================================

import { scoreCandidate } from './score.mjs';

const DEFAULT_DIVERSITY_LAMBDA = 0.7; // 0.7 prefers relevance with some diversity
const DEFAULT_LIMIT = 10;
const MMR_POOL_FACTOR = 3;            // consider top 3*limit candidates for MMR
const MAX_PER_DESIGNER = 2;           // SILO § 7: "≤2 from same designer in top 10"

/**
 * Rank a candidate set against a taste vector + context.
 *
 * @param {Array} candidates - BGG metadata shapes
 * @param {Object} tasteVector - output of computeTasteVector()
 * @param {Object} [context] - { desiredPlayerCount?, minutesAvailable?, nopedIds? }
 * @param {Object} [options] - {
 *     limit?: number,                 // default 10
 *     diversityLambda?: number,       // default 0.7; 1 = pure relevance, 0 = pure diversity
 *     diversify?: boolean,            // default true (apply MMR pass)
 *     exclude?: number[],             // candidate IDs to filter out before scoring
 *     weights?: object,               // override score weights
 *   }
 * @returns {Array} ranked list of { candidate, score, confidence, reasonCodes, breakdown }
 */
export function rankCandidates(candidates, tasteVector, context = {}, options = {}) {
  const {
    limit = DEFAULT_LIMIT,
    diversityLambda = DEFAULT_DIVERSITY_LAMBDA,
    diversify = true,
    exclude = [],
    weights,
  } = options;

  const excludeSet = new Set(exclude);

  const scored = (candidates || [])
    .filter(c => c && c.id != null && !excludeSet.has(c.id))
    .map(c => ({
      candidate: c,
      ...scoreCandidate(c, tasteVector, context, { weights }),
    }))
    .sort((a, b) => b.score - a.score);

  if (!diversify || scored.length <= 1) {
    return scored.slice(0, limit);
  }

  const pool = scored.slice(0, Math.min(scored.length, limit * MMR_POOL_FACTOR));
  return mmrSelect(pool, limit, diversityLambda);
}

/**
 * Greedy MMR selection with hard designer cap.
 *
 * Picks the item maximizing
 *   lambda * normalized_relevance - (1 - lambda) * max_similarity_to_already_picked
 * subject to the constraint that no single designer appears in more
 * than MAX_PER_DESIGNER of the picked items.
 *
 * If the cap eliminates all remaining candidates, we stop early
 * (returning fewer items than `limit`). Better short-and-diverse
 * than long-and-monocultural.
 */
export function mmrSelect(scoredCandidates, limit, lambda) {
  if (scoredCandidates.length === 0) return [];

  const items = normalizeScores(scoredCandidates);
  const picked = [];
  const remaining = [...items];

  while (picked.length < limit && remaining.length > 0) {
    // Apply designer cap: filter remaining to items that don’t push any
    // designer count > MAX_PER_DESIGNER.
    const designerCounts = countDesigners(picked);
    const eligible = remaining.filter(item =>
      itemRespectsDesignerCap(item.candidate, designerCounts)
    );

    if (eligible.length === 0) {
      // No item satisfies the cap. Stop early; return what we have.
      break;
    }

    let bestIdx = -1;
    let bestMmr = -Infinity;

    for (let i = 0; i < eligible.length; i++) {
      const item = eligible[i];
      const maxSim =
        picked.length === 0
          ? 0
          : Math.max(
              ...picked.map(p =>
                itemSimilarity(item.candidate, p.candidate)
              )
            );
      const mmrScore =
        lambda * item.normalizedScore - (1 - lambda) * maxSim;

      if (mmrScore > bestMmr) {
        bestMmr = mmrScore;
        bestIdx = i;
      }
    }

    const chosen = eligible[bestIdx];
    picked.push(chosen);
    // Remove from `remaining` by reference
    const remIdx = remaining.indexOf(chosen);
    if (remIdx >= 0) remaining.splice(remIdx, 1);
  }

  return picked;
}

/**
 * Normalize scored candidates' raw scores to a [0, 1] range stored as
 * `normalizedScore`. Avoids divide-by-zero by treating a single-element
 * pool as score 1.0.
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
  return scored.map(s => ({
    ...s,
    normalizedScore: (s.score - min) / range,
  }));
}

/**
 * Jaccard similarity between two candidates over the union of their
 * mechanic / category / family / designer ids.
 */
export function itemSimilarity(a, b) {
  const aSet = candidateAttributeSet(a);
  const bSet = candidateAttributeSet(b);
  if (aSet.size === 0 && bSet.size === 0) return 0;
  let intersection = 0;
  for (const x of aSet) if (bSet.has(x)) intersection++;
  const union = aSet.size + bSet.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function candidateAttributeSet(c) {
  const set = new Set();
  for (const m of c.mechanics || []) set.add(`m:${m.id}`);
  for (const cat of c.categories || []) set.add(`c:${cat.id}`);
  for (const f of c.families || []) set.add(`f:${f.id}`);
  for (const d of c.designers || []) set.add(`d:${d.id}`);
  return set;
}

function countDesigners(picked) {
  const counts = new Map();
  for (const p of picked) {
    for (const d of p.candidate.designers || []) {
      counts.set(d.id, (counts.get(d.id) || 0) + 1);
    }
  }
  return counts;
}

function itemRespectsDesignerCap(candidate, designerCounts) {
  for (const d of candidate.designers || []) {
    if ((designerCounts.get(d.id) || 0) >= MAX_PER_DESIGNER) return false;
  }
  return true;
}
