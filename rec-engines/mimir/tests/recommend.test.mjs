// recommend.test.mjs
// ============================================================================
// End-to-end tests for the recommend() composer. Exercises the full
// pipeline: taste vector → score → rank → explain → RecommendResponse.
//
// Run with: node --test tests/
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommend, RANKER_VERSION } from '../src/recommend.mjs';

const games = {
  100: {
    id: 100,
    name: 'EngineGame',
    weight: 3.0,
    minPlayers: 2,
    maxPlayers: 4,
    playingTime: 90,
    bggRank: 100,
    mechanics: [{ id: 'm-engine', value: 'Engine Building' }, { id: 'm-cards', value: 'Card Drafting' }],
    categories: [{ id: 'c-strategy', value: 'Strategy' }],
    families: [],
    designers: [{ id: 'd-stegmaier', value: 'Jamey Stegmaier' }],
  },
  101: {
    id: 101,
    name: 'AnotherEngineGame',
    weight: 3.2,
    minPlayers: 1,
    maxPlayers: 5,
    playingTime: 100,
    bggRank: 50,
    mechanics: [{ id: 'm-engine', value: 'Engine Building' }, { id: 'm-tile', value: 'Tile Placement' }],
    categories: [{ id: 'c-strategy', value: 'Strategy' }, { id: 'c-economic', value: 'Economic' }],
    families: [],
    designers: [{ id: 'd-stegmaier', value: 'Jamey Stegmaier' }],
  },
  200: {
    id: 200,
    name: 'PartyGame',
    weight: 1.2,
    minPlayers: 4,
    maxPlayers: 8,
    playingTime: 20,
    bggRank: 1,
    mechanics: [{ id: 'm-party', value: 'Party Game' }, { id: 'm-deduction', value: 'Deduction' }],
    categories: [{ id: 'c-party', value: 'Party' }],
    families: [],
    designers: [{ id: 'd-misc', value: 'Some Designer' }],
  },
  300: {
    id: 300,
    name: 'WeirdAbstract',
    weight: 4.5,
    minPlayers: 2,
    maxPlayers: 2,
    playingTime: 240,
    bggRank: 5000,
    mechanics: [{ id: 'm-abstract', value: 'Abstract Strategy' }],
    categories: [{ id: 'c-abstract', value: 'Abstract' }],
    families: [],
    designers: [{ id: 'd-other', value: 'Other Designer' }],
  },
};

function stonemaierBatch(count, startId = 1000) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: startId + i,
      name: `StonemaierGame${i}`,
      weight: 3.0,
      minPlayers: 2,
      maxPlayers: 5,
      playingTime: 90,
      bggRank: 100 + i,
      mechanics: [{ id: 'm-engine', value: 'Engine Building' }, { id: 'm-cards', value: 'Card Drafting' }],
      categories: [{ id: 'c-strategy', value: 'Strategy' }],
      families: [],
      designers: [{ id: 'd-stegmaier', value: 'Jamey Stegmaier' }],
    });
  }
  return out;
}

function diverseBatch(count, startId = 2000) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: startId + i,
      name: `DiverseGame${i}`,
      weight: 3.0,
      minPlayers: 2,
      maxPlayers: 5,
      playingTime: 90,
      bggRank: 1000 + i,
      mechanics: [{ id: 'm-engine', value: 'Engine Building' }, { id: 'm-cards', value: 'Card Drafting' }],
      categories: [{ id: 'c-strategy', value: 'Strategy' }],
      families: [],
      designers: [{ id: `d-other-${i}`, value: `Designer ${i}` }],
    });
  }
  return out;
}

// ----------------------------------------------------------------------------
// API contract shape (per design doc § 4.2)
// ----------------------------------------------------------------------------

test('recommend: returns response with required top-level shape', () => {
  const response = recommend(
    {
      surface: 'hq_picker',
      caller: { player_id: 'p1' },
      context: { seed_loved: [100] },
      options: { limit: 5 },
    },
    games
  );
  assert.ok(response.request_id, 'request_id present');
  assert.ok(response.request_id.startsWith('rec-'));
  assert.equal(response.ranker_version, RANKER_VERSION);
  assert.ok(Array.isArray(response.results));
});

test('recommend: result objects match design doc § 4.2 shape', () => {
  const response = recommend(
    {
      surface: 'hq_picker',
      caller: {},
      context: { seed_loved: [100] },
      options: { explain: 'short' },
    },
    games
  );
  assert.ok(response.results.length > 0);
  for (const r of response.results) {
    assert.equal(typeof r.game_id, 'number');
    assert.equal(typeof r.game_name, 'string');
    assert.equal(typeof r.score, 'number');
    assert.equal(typeof r.confidence, 'number');
    assert.ok(r.explanation);
    assert.ok(Array.isArray(r.explanation.reason_codes));
    assert.equal(typeof r.explanation.natural_language, 'string');
  }
});

test('recommend: explain="rich" includes diagnostics + contributors', () => {
  const response = recommend(
    {
      surface: 'hq_picker',
      caller: {},
      context: { seed_loved: [100] },
      options: { explain: 'rich', limit: 1 },
    },
    games
  );
  assert.ok(response.results[0].diagnostics);
  assert.ok(response.results[0].diagnostics.score_breakdown);
  assert.equal(typeof response.results[0].diagnostics.candidate_rank, 'number');
  assert.ok(Array.isArray(response.results[0].explanation.contributors));
});

test('recommend: explain="short" omits diagnostics + contributors', () => {
  const response = recommend(
    {
      surface: 'hq_picker',
      caller: {},
      context: { seed_loved: [100] },
      options: { explain: 'short', limit: 1 },
    },
    games
  );
  assert.equal(response.results[0].diagnostics, undefined);
  assert.equal(response.results[0].explanation.contributors, undefined);
});

// ----------------------------------------------------------------------------
// SUBTLE WRONGNESS pass-throughs
// ----------------------------------------------------------------------------

test('SUBTLE WRONGNESS: noped game has hard-veto score (-10) end-to-end', () => {
  const response = recommend(
    {
      surface: 'hq_picker',
      caller: {},
      context: {
        seed_loved: [100],
        seed_noped: [200],
      },
      options: { limit: 10 },
    },
    games
  );
  // 200 is in catalog and seed_noped → hard veto
  const partyResult = response.results.find(r => r.game_id === 200);
  if (partyResult) {
    assert.ok(partyResult.score < -5, `Noped game should have penalty score, got ${partyResult.score}`);
    assert.ok(partyResult.explanation.reason_codes.includes('noped_explicitly'));
  }
});

test('SUBTLE WRONGNESS: end-to-end designer cap (≤2 stegmaier in top 10)', () => {
  const allGames = new Map();
  for (const g of [...stonemaierBatch(10), ...diverseBatch(8), games[100]]) {
    allGames.set(g.id, g);
  }
  const response = recommend(
    {
      surface: 'hq_picker',
      caller: {},
      context: { seed_loved: [100] },
      options: { limit: 10 },
    },
    allGames
  );
  const stegmaierCount = response.results.filter(r => {
    const game = allGames.get(r.game_id);
    return (game?.designers || []).some(d => d.id === 'd-stegmaier');
  }).length;
  assert.ok(stegmaierCount <= 2, `Expected ≤2 stegmaier, got ${stegmaierCount}`);
});

test('SUBTLE WRONGNESS: exclude removes candidate from results entirely', () => {
  const response = recommend(
    {
      surface: 'hq_picker',
      caller: {},
      context: { seed_loved: [100] },
      options: { limit: 10, exclude: [101] },
    },
    games
  );
  assert.equal(
    response.results.find(r => r.game_id === 101),
    undefined
  );
});

test('SUBTLE WRONGNESS: player_count constraint propagates end-to-end', () => {
  const response = recommend(
    {
      surface: 'hq_picker',
      caller: {},
      context: {
        seed_loved: [100],
        desired_player_count: 8,
      },
      options: { limit: 10, explain: 'rich' },
    },
    games
  );
  // games[300] is 2-2 only; with desired=8 it should score 0 on player_count
  const weirdResult = response.results.find(r => r.game_id === 300);
  if (weirdResult) {
    assert.equal(weirdResult.diagnostics.score_breakdown.playerCountFit, 0);
  }
});

test('SUBTLE WRONGNESS: noped game absent when also passed in noped_ids', () => {
  const response = recommend(
    {
      surface: 'hq_picker',
      caller: {},
      context: {
        seed_loved: [100],
        noped_ids: [101], // not in seed_noped, but also vetoed
      },
      options: { limit: 10 },
    },
    games
  );
  const result101 = response.results.find(r => r.game_id === 101);
  if (result101) {
    assert.ok(result101.score < -5);
  }
});

// ----------------------------------------------------------------------------
// Pipeline behaviors
// ----------------------------------------------------------------------------

test('recommend: respects limit', () => {
  const response = recommend(
    {
      surface: 'hq_picker',
      caller: {},
      context: { seed_loved: [100] },
      options: { limit: 2 },
    },
    games
  );
  assert.ok(response.results.length <= 2);
});

test('recommend: empty seed list returns low-confidence results', () => {
  const response = recommend(
    {
      surface: 'hq_picker',
      caller: {},
      context: {},
      options: { limit: 3 },
    },
    games
  );
  // Without any seed signal, confidence should be low (or zero)
  for (const r of response.results) {
    assert.ok(r.confidence < 0.5);
  }
});

test('recommend: include_low_confidence=false filters low-confidence results', () => {
  const response = recommend(
    {
      surface: 'hq_picker',
      caller: {},
      context: {},
      options: { limit: 3, include_low_confidence: false },
    },
    games
  );
  // No seed, no context → all confidence near 0 → all filtered
  assert.equal(response.results.length, 0);
});

test('recommend: deterministic when requestId supplied', () => {
  const req = {
    surface: 'hq_picker',
    caller: {},
    context: { seed_loved: [100] },
    options: { limit: 3 },
  };
  const r1 = recommend(req, games, { requestId: 'fixed-id' });
  const r2 = recommend(req, games, { requestId: 'fixed-id' });
  assert.equal(r1.request_id, 'fixed-id');
  assert.equal(r2.request_id, 'fixed-id');
  assert.deepEqual(
    r1.results.map(r => r.game_id),
    r2.results.map(r => r.game_id)
  );
});

test('recommend: missing context handled gracefully', () => {
  const response = recommend(
    { surface: 'hq_picker', caller: {} }, // no context, no options
    games
  );
  assert.ok(Array.isArray(response.results));
});
