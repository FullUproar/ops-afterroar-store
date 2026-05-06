// score.test.mjs
// ============================================================================
// Tests for the v0 scorer. Pure-input/pure-output assertions.
// Includes the SILO-required subtle-wrongness assertions for negative-signal
// propagation and constraint respect.
//
// Run with: node --test tests/
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreCandidate,
  sumAffinity,
  weightSimilarity,
  playerCountFit,
  lengthFit,
  qualityPrior,
  computeConfidence,
  WEIGHTS,
} from '../src/score.mjs';
import { computeTasteVector } from '../src/taste-vector.mjs';

// Reuse the test fixture shape from taste-vector tests.
const games = {
  100: {
    id: 100,
    name: 'EngineGame',
    weight: 3.0,
    minPlayers: 2,
    maxPlayers: 4,
    playingTime: 90,
    bggRank: 100,
    mechanics: [{ id: 'm-engine' }, { id: 'm-cards' }],
    categories: [{ id: 'c-strategy' }],
    families: [],
    designers: [{ id: 'd-stegmaier' }],
  },
  101: {
    id: 101,
    name: 'AnotherEngineGame',
    weight: 3.2,
    minPlayers: 1,
    maxPlayers: 5,
    playingTime: 100,
    bggRank: 50,
    mechanics: [{ id: 'm-engine' }, { id: 'm-tile' }],
    categories: [{ id: 'c-strategy' }, { id: 'c-economic' }],
    families: [],
    designers: [{ id: 'd-stegmaier' }],
  },
  200: {
    id: 200,
    name: 'PartyGame',
    weight: 1.2,
    minPlayers: 4,
    maxPlayers: 8,
    playingTime: 20,
    bggRank: 1, // deliberately #1 to test that a noped-mechanic candidate
    // can’t rescue itself with quality prior
    mechanics: [{ id: 'm-party' }, { id: 'm-deduction' }],
    categories: [{ id: 'c-party' }],
    families: [],
    designers: [{ id: 'd-misc' }],
  },
};

// ----------------------------------------------------------------------------
// SUBTLE WRONGNESS: per SILO.md § 7, these tests MUST pass for graduation
// ----------------------------------------------------------------------------

test('SUBTLE WRONGNESS: noped-mechanic candidate scores below positive-mechanic candidate even with much better BGG rank', () => {
  const taste = computeTasteVector([100], [200], games);
  // partyCandidate: shares m-party (which is in noped axis) and has BGG #1
  const engineScored = scoreCandidate(games[101], taste, {});
  const partyScored = scoreCandidate(games[200], taste, {});
  assert.ok(
    engineScored.score > partyScored.score,
    `Engine candidate score ${engineScored.score} should beat party candidate ${partyScored.score} despite party having BGG rank 1 vs engine rank 50`
  );
});

test('SUBTLE WRONGNESS: explicitly noped game gets hard veto via nopedIds', () => {
  const taste = computeTasteVector([100], [], games);
  const result = scoreCandidate(games[200], taste, { nopedIds: [200] });
  assert.ok(result.score < -5, `Expected hard veto score, got ${result.score}`);
  assert.ok(result.reasonCodes.includes('noped_explicitly'));
});

test('SUBTLE WRONGNESS: player count out of range scores 0 on that term', () => {
  const taste = computeTasteVector([100], [], games);
  // games[100] supports 2-4 players; ask for 8
  const result = scoreCandidate(games[100], taste, { desiredPlayerCount: 8 });
  assert.equal(result.breakdown.playerCountFit, 0);
  assert.ok(result.reasonCodes.includes('player_count_violated'));
});

test('SUBTLE WRONGNESS: length way over budget scores 0 on length term', () => {
  const taste = computeTasteVector([100], [], games);
  // games[101] is 100 minutes; ask for 30 minutes
  const result = scoreCandidate(games[101], taste, { minutesAvailable: 30 });
  assert.equal(result.breakdown.lengthFit, 0);
  assert.ok(result.reasonCodes.includes('length_violated'));
});

// ----------------------------------------------------------------------------
// scoreCandidate happy paths
// ----------------------------------------------------------------------------

test('scoreCandidate: returns score, confidence, reasonCodes, breakdown', () => {
  const taste = computeTasteVector([100], [], games);
  const result = scoreCandidate(games[101], taste, { desiredPlayerCount: 3 });
  assert.equal(typeof result.score, 'number');
  assert.equal(typeof result.confidence, 'number');
  assert.ok(Array.isArray(result.reasonCodes));
  assert.equal(typeof result.breakdown, 'object');
});

test('scoreCandidate: confidence reflects taste vector + context richness', () => {
  const emptyTaste = computeTasteVector([], [], games);
  const result1 = scoreCandidate(games[100], emptyTaste, {});
  const richTaste = computeTasteVector([100, 101], [200], games);
  const result2 = scoreCandidate(games[100], richTaste, {
    desiredPlayerCount: 3,
    minutesAvailable: 90,
  });
  assert.ok(result2.confidence > result1.confidence);
});

test('scoreCandidate: rich taste + matching candidate emits multiple reason codes', () => {
  const taste = computeTasteVector([100, 101], [], games);
  const result = scoreCandidate(games[101], taste, {
    desiredPlayerCount: 3,
    minutesAvailable: 120,
  });
  assert.ok(result.reasonCodes.includes('mechanic_match'));
  assert.ok(result.reasonCodes.includes('player_count_fit'));
  assert.ok(result.reasonCodes.includes('length_fit'));
});

test('scoreCandidate: weight override works', () => {
  const taste = computeTasteVector([100], [], games);
  const def = scoreCandidate(games[101], taste, {});
  const noPrior = scoreCandidate(games[101], taste, {}, {
    weights: { ...WEIGHTS, qualityPrior: 0 },
  });
  // Removing the qualityPrior term should reduce the score by exactly
  // (default qualityPrior contribution).
  const expectedDiff = def.breakdown.qualityPrior;
  assert.ok(Math.abs(def.score - noPrior.score - expectedDiff) < 1e-9);
});

// ----------------------------------------------------------------------------
// sumAffinity
// ----------------------------------------------------------------------------

test('sumAffinity: sums matching axis values', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'unknown' }];
  const axis = { a: 0.5, b: -0.2, c: 0.1 };
  // 0.5 + (-0.2) + 0 (unknown) = 0.3
  assert.ok(Math.abs(sumAffinity(items, axis) - 0.3) < 1e-9);
});

test('sumAffinity: empty inputs return 0', () => {
  assert.equal(sumAffinity(null, { a: 1 }), 0);
  assert.equal(sumAffinity([{ id: 'a' }], null), 0);
  assert.equal(sumAffinity([], {}), 0);
});

// ----------------------------------------------------------------------------
// weightSimilarity
// ----------------------------------------------------------------------------

test('weightSimilarity: exact match returns ~1.0', () => {
  const sim = weightSimilarity(2.5, { mean: 2.5, std: 0.5, count: 5 });
  assert.ok(sim > 0.99);
});

test('weightSimilarity: distant value returns near 0', () => {
  const sim = weightSimilarity(4.5, { mean: 1.5, std: 0.5, count: 5 });
  assert.ok(sim < 0.01);
});

test('weightSimilarity: unknown candidate weight returns NEUTRAL_SCORE 0.5', () => {
  assert.equal(weightSimilarity(null, { mean: 2.5, std: 0.5, count: 5 }), 0.5);
});

test('weightSimilarity: no preference data returns NEUTRAL_SCORE 0.5', () => {
  assert.equal(weightSimilarity(2.5, { mean: null, std: null, count: 0 }), 0.5);
});

// ----------------------------------------------------------------------------
// playerCountFit
// ----------------------------------------------------------------------------

test('playerCountFit: in range returns 1.0', () => {
  assert.equal(playerCountFit({ minPlayers: 2, maxPlayers: 4 }, 3), 1.0);
  assert.equal(playerCountFit({ minPlayers: 2, maxPlayers: 4 }, 2), 1.0);
  assert.equal(playerCountFit({ minPlayers: 2, maxPlayers: 4 }, 4), 1.0);
});

test('playerCountFit: within ±1 returns 0.3', () => {
  assert.equal(playerCountFit({ minPlayers: 2, maxPlayers: 4 }, 5), 0.3);
  assert.equal(playerCountFit({ minPlayers: 2, maxPlayers: 4 }, 1), 0.3);
});

test('playerCountFit: out of range returns 0', () => {
  assert.equal(playerCountFit({ minPlayers: 2, maxPlayers: 4 }, 8), 0);
  assert.equal(playerCountFit({ minPlayers: 2, maxPlayers: 4 }, 0), 0);
});

test('playerCountFit: missing data returns NEUTRAL_SCORE 0.5', () => {
  assert.equal(playerCountFit({ minPlayers: 2, maxPlayers: 4 }, null), 0.5);
  assert.equal(playerCountFit({ minPlayers: null, maxPlayers: null }, 4), 0.5);
});

// ----------------------------------------------------------------------------
// lengthFit
// ----------------------------------------------------------------------------

test('lengthFit: under budget returns 1.0', () => {
  assert.equal(lengthFit({ playingTime: 60 }, 90), 1.0);
});

test('lengthFit: way over budget returns 0', () => {
  assert.equal(lengthFit({ playingTime: 200 }, 60), 0);
});

test('lengthFit: linear interpolation between 1x and 1.5x', () => {
  // 90 mins available, candidate is 90+22.5=112.5 → halfway → 0.5
  const fit = lengthFit({ playingTime: 112.5 }, 90);
  assert.ok(Math.abs(fit - 0.5) < 1e-9);
});

test('lengthFit: missing data returns NEUTRAL_SCORE 0.5', () => {
  assert.equal(lengthFit({ playingTime: null }, 90), 0.5);
  assert.equal(lengthFit({ playingTime: 60 }, null), 0.5);
});

// ----------------------------------------------------------------------------
// qualityPrior
// ----------------------------------------------------------------------------

test('qualityPrior: rank 1 returns ~1.0', () => {
  assert.ok(qualityPrior(1) > 0.99);
});

test('qualityPrior: rank 1000 returns 0.5', () => {
  assert.ok(Math.abs(qualityPrior(1000) - 0.5) < 1e-9);
});

test('qualityPrior: rank 10000 returns ~0.09', () => {
  assert.ok(Math.abs(qualityPrior(10000) - 1 / 11) < 1e-9);
});

test('qualityPrior: null returns NEUTRAL_SCORE 0.5', () => {
  assert.equal(qualityPrior(null), 0.5);
  assert.equal(qualityPrior(0), 0.5);
});

// ----------------------------------------------------------------------------
// computeConfidence
// ----------------------------------------------------------------------------

test('computeConfidence: empty inputs return 0', () => {
  const empty = computeTasteVector([], [], {});
  assert.equal(computeConfidence(empty, {}), 0);
});

test('computeConfidence: rich inputs cap at 1.0', () => {
  const rich = computeTasteVector([100, 101], [200], games);
  const c = computeConfidence(rich, {
    desiredPlayerCount: 3,
    minutesAvailable: 90,
  });
  assert.ok(c > 0.7 && c <= 1.0);
});
