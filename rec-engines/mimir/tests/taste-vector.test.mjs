// taste-vector.test.mjs
// ============================================================================
// Tests for the taste vector computation. Pure-input/pure-output assertions.
// Run with: node --test tests/
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTasteVector,
  l1Normalize,
  stats,
} from '../src/taste-vector.mjs';

// Mock game data covering the shape the function consumes.
// Two engine-builder strategy games + two party games.
const games = {
  100: {
    id: 100,
    name: 'EngineGame',
    weight: 3.0,
    minPlayers: 2,
    maxPlayers: 4,
    playingTime: 90,
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
    mechanics: [{ id: 'm-party' }, { id: 'm-deduction' }],
    categories: [{ id: 'c-party' }],
    families: [],
    designers: [{ id: 'd-misc' }],
  },
  201: {
    id: 201,
    name: 'AnotherPartyGame',
    weight: 1.0,
    minPlayers: 4,
    maxPlayers: 10,
    playingTime: 15,
    mechanics: [{ id: 'm-party' }],
    categories: [{ id: 'c-party' }],
    families: [],
    designers: [{ id: 'd-misc2' }],
  },
};

// ----------------------------------------------------------------------------
// computeTasteVector
// ----------------------------------------------------------------------------

test('computeTasteVector: empty seeds returns zero vector', () => {
  const v = computeTasteVector([], [], games);
  assert.deepEqual(v.mechanics, {});
  assert.deepEqual(v.categories, {});
  assert.deepEqual(v.designers, {});
  assert.equal(v.weightPreference.mean, null);
  assert.equal(v.weightPreference.count, 0);
  assert.equal(v.seedCounts.loved, 0);
  assert.equal(v.seedCounts.noped, 0);
});

test('computeTasteVector: loved-only seed produces positive vector', () => {
  const v = computeTasteVector([100, 101], [], games);
  // m-engine appears in BOTH games → highest contribution among mechanics
  assert.ok(v.mechanics['m-engine'] > 0);
  const topMech = Object.entries(v.mechanics).reduce((a, b) =>
    Math.abs(a[1]) >= Math.abs(b[1]) ? a : b
  );
  assert.equal(topMech[0], 'm-engine');
  // Stegmaier appears in both, only designer in loved set
  assert.ok(v.designers['d-stegmaier'] > 0);
  assert.equal(Object.keys(v.designers).length, 1);
  // Weight preference is from loved games
  assert.ok(v.weightPreference.mean > 2.5 && v.weightPreference.mean < 3.5);
  assert.equal(v.weightPreference.count, 2);
  // Seed counts
  assert.equal(v.seedCounts.loved, 2);
  assert.equal(v.seedCounts.lovedFound, 2);
});

test('computeTasteVector: noped-only seed produces negative vector with null preferences', () => {
  const v = computeTasteVector([], [200, 201], games);
  // m-party most negative (in both noped games)
  assert.ok(v.mechanics['m-party'] < 0);
  const topMech = Object.entries(v.mechanics).reduce((a, b) =>
    Math.abs(a[1]) >= Math.abs(b[1]) ? a : b
  );
  assert.equal(topMech[0], 'm-party');
  // No loved games → no positive preference signal
  assert.equal(v.weightPreference.mean, null);
  assert.equal(v.playerCountPreference.mean, null);
  assert.equal(v.playTimePreference.mean, null);
  assert.equal(v.seedCounts.nopedFound, 2);
});

test('computeTasteVector: mixed seed combines positive and negative cleanly', () => {
  const v = computeTasteVector([100], [200], games, { nopeWeight: 1 });
  assert.ok(v.mechanics['m-engine'] > 0);
  assert.ok(v.mechanics['m-party'] < 0);
  // L1 norm: |sum| of all values = 1 exactly
  const totalAbs = Object.values(v.mechanics).reduce(
    (s, x) => s + Math.abs(x),
    0
  );
  assert.ok(
    Math.abs(totalAbs - 1.0) < 1e-9,
    `Expected L1 sum = 1, got ${totalAbs}`
  );
});

test('computeTasteVector: nopeWeight amplifies negative signal share', () => {
  const v1 = computeTasteVector([100], [200], games, { nopeWeight: 1.0 });
  const v2 = computeTasteVector([100], [200], games, { nopeWeight: 2.0 });
  const v1NegPartyShare = Math.abs(v1.mechanics['m-party'] || 0);
  const v2NegPartyShare = Math.abs(v2.mechanics['m-party'] || 0);
  assert.ok(
    v2NegPartyShare > v1NegPartyShare,
    `Higher nopeWeight should give larger relative |negative| share. v1=${v1NegPartyShare}, v2=${v2NegPartyShare}`
  );
});

test('computeTasteVector: ignores unknown game IDs gracefully', () => {
  const v = computeTasteVector([100, 999, 9999], [], games);
  // Only 100 found in metadata
  assert.equal(v.seedCounts.loved, 3);
  assert.equal(v.seedCounts.lovedFound, 1);
  // Vector reflects only game 100
  assert.ok(v.mechanics['m-engine'] > 0);
  assert.ok(v.mechanics['m-cards'] > 0);
});

test('computeTasteVector: handles game with empty mechanics list', () => {
  const minimalGames = {
    1: {
      id: 1,
      name: 'NoData',
      mechanics: [],
      categories: [],
      families: [],
      designers: [],
      weight: null,
      minPlayers: null,
      maxPlayers: null,
      playingTime: null,
    },
  };
  const v = computeTasteVector([1], [], minimalGames);
  assert.deepEqual(v.mechanics, {});
  assert.equal(v.weightPreference.count, 0);
});

test('computeTasteVector: accepts Map for gameMetadata', () => {
  const map = new Map();
  map.set(100, games[100]);
  const v = computeTasteVector([100], [], map);
  assert.ok(v.mechanics['m-engine'] > 0);
});

test('computeTasteVector: handles null/undefined seed inputs', () => {
  const v1 = computeTasteVector(null, null, games);
  assert.equal(v1.seedCounts.loved, 0);
  const v2 = computeTasteVector(undefined, undefined, games);
  assert.equal(v2.seedCounts.loved, 0);
});

// ----------------------------------------------------------------------------
// l1Normalize
// ----------------------------------------------------------------------------

test('l1Normalize: empty map returns empty', () => {
  assert.deepEqual(l1Normalize({}), {});
});

test('l1Normalize: all-zero map returns empty (no NaN)', () => {
  assert.deepEqual(l1Normalize({ a: 0, b: 0 }), {});
});

test('l1Normalize: positive values sum to 1', () => {
  const result = l1Normalize({ a: 2, b: 3 });
  assert.ok(Math.abs(result.a + result.b - 1) < 1e-9);
  assert.equal(result.a, 0.4);
  assert.equal(result.b, 0.6);
});

test('l1Normalize: mixed-sign values, |sum| equals 1', () => {
  const result = l1Normalize({ a: 1, b: -1 });
  assert.equal(result.a, 0.5);
  assert.equal(result.b, -0.5);
  const absSum = Math.abs(result.a) + Math.abs(result.b);
  assert.ok(Math.abs(absSum - 1) < 1e-9);
});

// ----------------------------------------------------------------------------
// stats
// ----------------------------------------------------------------------------

test('stats: empty array', () => {
  assert.deepEqual(stats([]), { mean: null, std: null, count: 0 });
});

test('stats: null/undefined input', () => {
  assert.deepEqual(stats(null), { mean: null, std: null, count: 0 });
  assert.deepEqual(stats(undefined), { mean: null, std: null, count: 0 });
});

test('stats: single value', () => {
  assert.deepEqual(stats([5]), { mean: 5, std: 0, count: 1 });
});

test('stats: known mean and std for [1,2,3]', () => {
  // mean=2, variance=2/3, std=sqrt(2/3)
  const r = stats([1, 2, 3]);
  assert.equal(r.mean, 2);
  assert.equal(r.count, 3);
  assert.ok(
    Math.abs(r.std - Math.sqrt(2 / 3)) < 1e-9,
    `Expected std=sqrt(2/3), got ${r.std}`
  );
});
