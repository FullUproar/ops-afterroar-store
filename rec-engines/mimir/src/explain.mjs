// explain.mjs
// ============================================================================
// Mimir explanation generator.
//
// Takes a scored candidate (output of scoreCandidate) along with the
// candidate's BGG metadata + the player's taste vector, and produces:
//   - short: one-sentence headline reason
//   - long:  2-3-clause sentence combining top reasons
//   - contributors: per-feature breakdown with source tags for the
//                   API response when explain='rich'
//
// Pure function. No I/O.
//
// Per design doc § 5.1 ("Explanation generation: rule-based templates.").
// Future engines (saga/simulator) will replace these templates with
// generative narrative; the API contract stays the same.
// ============================================================================

const CONTRIBUTOR_THRESHOLD = 0.05; // ignore terms below this absolute weight

/**
 * Generate human-readable explanations from a scored candidate.
 *
 * @param {Object} scoredCandidate - { score, confidence, reasonCodes, breakdown }
 * @param {Object} candidate - BGG metadata for this game
 * @param {Object} tasteVector - taste vector used to score it
 * @param {Object} [options]
 * @param {Object} [options.context] - the request context (for length/player-count hints)
 * @returns {Object} { short, long, contributors }
 */
export function explain(scoredCandidate, candidate, tasteVector = {}, options = {}) {
  const { reasonCodes = [], breakdown = {} } = scoredCandidate;
  const ctx = { candidate, tasteVector, context: options.context || {} };

  // Hard veto: noped_explicitly returns immediately, no other reasons relevant
  if (reasonCodes.includes('noped_explicitly')) {
    return {
      short: 'You marked this as one to avoid.',
      long: "This game is on your no-list, so we won't recommend it.",
      contributors: [],
    };
  }

  // Render fragments in priority order; keep first non-null per reason
  const fragments = [];
  for (const code of orderByPriority(reasonCodes)) {
    const renderer = REASON_RENDERERS[code];
    if (!renderer) continue;
    const fragment = renderer(ctx);
    if (fragment) fragments.push(fragment);
  }

  if (fragments.length === 0) {
    return {
      short: 'A general recommendation based on overall popularity.',
      long: "We don't have strong personal signal on this one yet, but it ranks well overall.",
      contributors: buildContributors(breakdown),
    };
  }

  const short = capitalize(fragments[0]) + '.';
  const long = composeLong(fragments.slice(0, 3));

  return {
    short,
    long,
    contributors: buildContributors(breakdown),
  };
}

// ----------------------------------------------------------------------------
// Reason renderers
// ----------------------------------------------------------------------------

const REASON_RENDERERS = {
  mechanic_match: ({ candidate, tasteVector }) => {
    const matched = (candidate.mechanics || [])
      .filter(m => (tasteVector.mechanics?.[String(m.id)] ?? 0) > 0)
      .map(m => m.value)
      .slice(0, 3);
    if (matched.length === 0) return 'matches mechanics you tend to enjoy';
    return `shares ${formatList(matched)} with games you loved`;
  },

  mechanic_mismatch: ({ candidate, tasteVector }) => {
    const mismatched = (candidate.mechanics || [])
      .filter(m => (tasteVector.mechanics?.[String(m.id)] ?? 0) < 0)
      .map(m => m.value)
      .slice(0, 3);
    if (mismatched.length === 0) return null;
    return `includes ${formatList(mismatched)} which you tagged to avoid`;
  },

  designer_match: ({ candidate, tasteVector }) => {
    const matched = (candidate.designers || [])
      .filter(d => (tasteVector.designers?.[String(d.id)] ?? 0) > 0)
      .map(d => d.value)
      .slice(0, 2);
    if (matched.length === 0) return null;
    return `by ${formatList(matched)}, whose work you've enjoyed before`;
  },

  category_match: ({ candidate, tasteVector }) => {
    const matched = (candidate.categories || [])
      .filter(c => (tasteVector.categories?.[String(c.id)] ?? 0) > 0)
      .map(c => c.value)
      .slice(0, 2);
    if (matched.length === 0) return 'in a category you favor';
    return `in the ${formatList(matched)} category`;
  },

  category_mismatch: ({ candidate, tasteVector }) => {
    const mismatched = (candidate.categories || [])
      .filter(c => (tasteVector.categories?.[String(c.id)] ?? 0) < 0)
      .map(c => c.value)
      .slice(0, 2);
    if (mismatched.length === 0) return null;
    return `${formatList(mismatched)} category isn't typically your style`;
  },

  family_match: () => 'in a series you've shown interest in',
  family_mismatch: () => null, // family mismatches are usually weak signal

  weight_match: ({ candidate, tasteVector }) => {
    const w = candidate.weight;
    const mean = tasteVector.weightPreference?.mean;
    if (w == null || mean == null) return 'around the complexity you tend to enjoy';
    return `around the complexity (${w.toFixed(1)}/5) you tend to enjoy`;
  },

  player_count_fit: ({ candidate, context }) => {
    if (context?.desiredPlayerCount && candidate.minPlayers && candidate.maxPlayers) {
      return `fits your ${context.desiredPlayerCount}-player group (supports ${candidate.minPlayers}–${candidate.maxPlayers})`;
    }
    return 'fits your group size';
  },

  player_count_violated: ({ candidate, context }) => {
    if (context?.desiredPlayerCount && candidate.minPlayers && candidate.maxPlayers) {
      return `doesn't fit your ${context.desiredPlayerCount}-player group (needs ${candidate.minPlayers}–${candidate.maxPlayers})`;
    }
    return 'does not fit your group size';
  },

  length_fit: ({ candidate, context }) => {
    const t = candidate.playingTime;
    if (t && context?.minutesAvailable) {
      return `plays in ~${t} min, within your ${context.minutesAvailable}-min window`;
    }
    if (t) return `plays in ~${t} minutes`;
    return 'fits your time window';
  },

  length_violated: ({ candidate, context }) => {
    const t = candidate.playingTime;
    if (t && context?.minutesAvailable) {
      return `runs ~${t} min, longer than your ${context.minutesAvailable}-min window`;
    }
    return 'runs longer than your time window';
  },
};

// Priority order: positive matches first, fitness terms next, mismatches last
const REASON_PRIORITY = [
  'mechanic_match',
  'designer_match',
  'category_match',
  'family_match',
  'weight_match',
  'length_fit',
  'player_count_fit',
  'mechanic_mismatch',
  'category_mismatch',
  'family_mismatch',
  'length_violated',
  'player_count_violated',
];

function orderByPriority(reasonCodes) {
  const set = new Set(reasonCodes);
  return REASON_PRIORITY.filter(c => set.has(c));
}

// ----------------------------------------------------------------------------
// Contributors (per-feature breakdown for rich explanations)
// ----------------------------------------------------------------------------

export function buildContributors(breakdown) {
  return Object.entries(breakdown || {})
    .filter(([, weight]) => Math.abs(weight) >= CONTRIBUTOR_THRESHOLD)
    .map(([feature, weight]) => ({
      feature,
      weight,
      source: featureSource(feature),
    }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
}

function featureSource(feature) {
  if (
    feature.startsWith('mechanic') ||
    feature.startsWith('category') ||
    feature.startsWith('family') ||
    feature.startsWith('designer')
  ) {
    return 'bgg_metadata';
  }
  if (
    feature.startsWith('weight') ||
    feature.startsWith('player') ||
    feature.startsWith('length')
  ) {
    return 'context_match';
  }
  if (feature === 'qualityPrior') return 'bgg_rank';
  if (feature === 'nopedPenalty') return 'user_preference';
  return 'unknown';
}

// ----------------------------------------------------------------------------
// String formatting utilities
// ----------------------------------------------------------------------------

/** Oxford-comma list formatter. */
export function formatList(items) {
  if (!items || items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Compose a long-form sentence from up to 3 fragments. Uses a comma
 * between the first two and "and" before the last.
 */
export function composeLong(fragments) {
  if (!fragments || fragments.length === 0) return '';
  if (fragments.length === 1) return capitalize(fragments[0]) + '.';
  if (fragments.length === 2) {
    return `${capitalize(fragments[0])}, and ${fragments[1]}.`;
  }
  return `${capitalize(fragments[0])}, ${fragments[1]}, and ${fragments[2]}.`;
}
