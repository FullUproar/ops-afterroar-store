// rank.test.mjs
// ============================================================================
// Tests for the ranking pipeline. Pure-input/pure-output.
// Includes the SILO-required diversity assertion (≤2 from same designer
// in top 10).
//
// Run with: node --test tests/
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rankCandidates,
  mmrSelect,
  normalizeScores,
  itemSimilarity,
} from '../src/rank.mjs';
import { computeTasteVector } from '../src/taste-vector.mjs';

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
    bggRank: 1,
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
    bggRank: 200,
    mechanics: [{ id: 'm-party' }],
    categories: [{ id: 'c-party' }],
    families: [],
    designers: [{ id: 'd-misc2' }],
  },
};

// Helper to manufacture N near-duplicate Stonemaier games and M diverse games.
function stonemaierBatch(count, startId = 1000) {
  const games = [];
  for (let i = 0; i < count; i++) {
    games.push({
      id: startId + i,
      name: `StonemaierGame${i}`,
      weight: 3.0,
      minPlayers: 2,
      maxPlayers: 5,
      playingTime: 90,
      bggRank: 100 + i,
      mechanics: [{ id: 'm-engine' }, { id: 'm-cards' }],
      categories: [{ id: 'c-strategy' }],
      families: [],
      designers: [{ id: 'd-stegmaier' }],
    });
  }
  return games;
}

function diverseBatch(count, startId = 2000) {
  const games = [];
  for (let i = 0; i < count; i++) {
    games.push({
      id: startId + i,
      name: `DiverseGame${i}`,
      weight: 3.0,
      minPlayers: 2,
      maxPlayers: 5,
      playingTime: 90,
      bggRank: 1000 + i,
      mechanics: [{ id: 'm-engine' }, { id: 'm-cards' }],
      categories: [{ id: 'c-strategy' }],
      families: [],
      designers: [{ id: `d-other-${i}` }],
    });
  }
  return games;
}

// ----------------------------------------------------------------------------
// SUBTLE WRONGNESS guards (per SILO.md § 7)
// ----------------------------------------------------------------------------

test('SUBTLE WRONGNESS: top 10 has ≤2 from same designer (designer cap)', () => {
  const candidates = [...stonemaierBatch(10), ...diverseBatch(8)];
  const taste = computeTasteVector([100], [], games);
  const ranked = rankCandidates(candidates, taste, {}, { limit: 10 });

  const stegmaierCount = ranked.filter(r =>
    r.candidate.designers.some(d => d.id === 'd-stegmaier')
  ).length;

  assert.ok(
    stegmaierCount <= 2,
    `Expected ≤2 stegmaier games in top 10, got ${stegmaierCount}`
  );
});

test('SUBTLE WRONGNESS: explicitly noped IDs propagate to ranking (last position)', () => {
  const candidates = [games[100], games[101], games[200]];
  const taste = computeTasteVector([100], [], games);
  const ranked = rankCandidates(candidates, taste, { nopedIds: [200] });
  // 200 has score -10; should be last
  assert.equal(ranked[ranked.length - 1].candidate.id, 200);
});

test('SUBTLE WRONGNESS: exclude removes candidate before scoring', () => {
  const candidates = [games[100], games[101], games[200]];
  const taste = computeTasteVector([100], [], games);
  const ranked = rankCandidates(candidates, taste, {}, { exclude: [100] });
  assert.equal(
    ranked.find(r => r.candidate.id === 100),
    undefined
  );
});

// ----------------------------------------------------------------------------
// rankCandidates happy paths
// ----------------------------------------------------------------------------

test('rankCandidates: returns scored objects with expected shape', () => {
  const taste = computeTasteVector([100], [], games);
  const ranked = rankCandidates([games[100], games[101]], taste, {});
  assert.equal(ranked.length, 2);
  for (const r of ranked) {
    assert.ok(r.candidate);
    assert.equal(typeof r.score, 'number');
    assert.equal(typeof r.confidence, 'number');
    assert.ok(Array.isArray(r.reasonCodes));
  }
});

test('rankCandidates: respects limit', () => {
  const taste = computeTasteVector([100], [], games);
  const candidates = [games[100], games[101], games[200], games[201]];
  const ranked = rankCandidates(candidates, taste, {}, { limit: 2 });
  assert.equal(ranked.length, 2);
});

test('rankCandidates: engine candidate ranks above party candidate for engine taste', () => {
  const taste = computeTasteVector([100], [200], games);
  const ranked = rankCandidates(
    [games[101], games[201]],
    taste,
    {}
  );
  // 101 = engine, 201 = party
  assert.equal(ranked[0].candidate.id, 101);
});

test('rankCandidates: handles empty candidate list', () => {
  const taste = computeTasteVector([100], [], games);
  const ranked = rankCandidates([], taste, {});
  assert.deepEqual(ranked, []);
});

test('rankCandidates: handles null/undefined items in candidate list', () => {
  const taste = computeTasteVector([100], [], games);
  const ranked = rankCandidates(
    [null, undefined, games[100]],
    taste,
    {}
  );
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].candidate.id, 100);
});

test('rankCandidates: diversify=false produces pure score-order', () => {
  const candidates = [...stonemaierBatch(5), ...diverseBatch(2)];
  const taste = computeTasteVector([100], [], games);
  const ranked = rankCandidates(candidates, taste, {}, {
    diversify: false,
    limit: 10,
  });
  // With diversify off, designer cap is also bypassed (it lives in MMR)
  const stegmaierCount = ranked.filter(r =>
    r.candidate.designers.some(d => d.id === 'd-stegmaier')
  ).length;
  assert.ok(stegmaierCount > 2, `Expected >2 stegmaier without diversification, got ${stegmaierCount}`);
});

// ----------------------------------------------------------------------------
// itemSimilarity
// ----------------------------------------------------------------------------

test('itemSimilarity: identical attributes → 1.0', () => {
  assert.equal(itemSimilarity(games[100], games[100]), 1.0);
});

test('itemSimilarity: disjoint attributes → 0', () => {
  // Engine and party share neither mechanic, category, nor designer
  assert.equal(itemSimilarity(games[100], games[200]), 0);
});

test('itemSimilarity: partial overlap = Jaccard', () => {
  // games[100] attributes: m-engine, m-cards, c-strategy, d-stegmaier (4 items)
  // games[101] attributes: m-engine, m-tile, c-strategy, c-economic, d-stegmaier (5 items)
  // intersection: m-engine, c-strategy, d-stegmaier (3)
  // union: 4 + 5 - 3 = 6
  // Jaccard = 3/6 = 0.5
  assert.equal(itemSimilarity(games[100], games[101]), 0.5);
});

test('itemSimilarity: empty attributes → 0 (no NaN)', () => {
  const empty = { id: 999, mechanics: [], categories: [], families: [], designers: [] };
  assert.equal(itemSimilarity(empty, empty), 0);
});

// ----------------------------------------------------------------------------
// normalizeScores
// ----------------------------------------------------------------------------

test('normalizeScores: maps min → 0 and max → 1', () => {
  const input = [{ score: 5 }, { score: 10 }, { score: 0 }];
  const out = normalizeScores(input);
  assert.equal(out[0].normalizedScore, 0.5);
  assert.equal(out[1].normalizedScore, 1.0);
  assert.equal(out[2].normalizedScore, 0.0);
});

test('normalizeScores: empty input returns empty', () => {
  assert.deepEqual(normalizeScores([]), []);
});

test('normalizeScores: all-equal scores → all 1.0', () => {
  const input = [{ score: 3 }, { score: 3 }];
  const out = normalizeScores(input);
  assert.equal(out[0].normalizedScore, 1.0);
  assert.equal(out[1].normalizedScore, 1.0);
});

// ----------------------------------------------------------------------------
// mmrSelect lambda behavior
// ----------------------------------------------------------------------------

test('mmrSelect: lambda=1 picks pure score-order', () => {
  const items = [
    { score: 10, candidate: games[100] },
    { score: 5, candidate: games[200] },
    { score: 3, candidate: games[201] },
  ];
  const out = mmrSelect(items, 3, 1.0);
  assert.equal(out[0].candidate.id, 100);
  assert.equal(out[1].candidate.id, 200);
  assert.equal(out[2].candidate.id, 201);
});

test('mmrSelect: stops early if designer cap eliminates all remaining', () => {
  const stonemaier = stonemaierBatch(5).map(c => ({ score: 10, candidate: c }));
  const out = mmrSelect(stonemaier, 5, 0.7);
  // All candidates are stegmaier; cap allows 2 max.
  assert.equal(out.length, 2);
});
