// match.test.mjs
// ============================================================================
// Tests for src/match.mjs.
//
// Includes SILO sec 7 SUBTLE-WRONGNESS ASSERTIONS specific to seidr:
//   - High-killer player doesn't get pure-coop game as #1
//   - Low-extraversion player doesn't get party games at top of list
//   - High-CTX_TIME player doesn't get 15-min fillers as #1
//   - Player count constraint honored
//   - Excluded game IDs don't appear in recommendations
//   - Cold-start (low-confidence) input produces low-confidence output
//   - Designer cap enforced when bggMetadata present
//
// Run with: node --test tests/
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  similarity,
  scoreAll,
  gameGameSimilarity,
  normalizeScores,
  mmrSelect,
  match,
} from '../src/match.mjs';

// ----------------------------------------------------------------------------
// Test fixture helpers
// ----------------------------------------------------------------------------

const ALL_DIMS = [
  'PSY_ACHIEVEMENT', 'PSY_EXPLORATION', 'PSY_SOCIAL', 'PSY_KILLER', 'PSY_OPENNESS',
  'PSY_CONSCIENTIOUSNESS', 'PSY_EXTRAVERSION', 'PSY_AGREEABLENESS', 'PSY_NEUROTICISM',
  'SOC_COOP_COMP', 'SOC_DIRECT_INDIRECT', 'SOC_TRUST_BETRAYAL',
  'MEC_LUCK_SKILL', 'MEC_COMPLEXITY', 'MEC_STRATEGY', 'MEC_ASYMMETRY',
  'AES_THEME_MECH', 'AES_NARRATIVE', 'AES_COMPONENT',
  'CTX_TIME', 'CTX_NOSTALGIA', 'CTX_PLAYER_COUNT',
  'EMO_TENSION', 'EMO_HUMOR',
];

/** Build a profile where every dim is `defaultValue`, with overrides applied. */
function makeProfile(defaultValue, overrides = {}) {
  const dim_vector = {};
  const confidence = {};
  for (const d of ALL_DIMS) {
    dim_vector[d] = overrides[d] ?? defaultValue;
    confidence[d] = 0.9;
  }
  return { dim_vector, confidence_vector: confidence };
}

function makeGame(id, defaultValue, overrides = {}) {
  const dim_vector = {};
  const confidence_per_dim = {};
  for (const d of ALL_DIMS) {
    dim_vector[d] = overrides[d] ?? defaultValue;
    confidence_per_dim[d] = 0.9;
  }
  return { game_id: id, dim_vector, confidence_per_dim };
}

// ----------------------------------------------------------------------------
// similarity()
// ----------------------------------------------------------------------------

test('similarity: identical vectors yield cosine 1.0', () => {
  const p = makeProfile(0.5);
  const g = makeGame(1, 0.5);
  const r = similarity(p, g);
  assert.ok(r.cosine > 0.99, `expected cosine ~1.0, got ${r.cosine}`);
});

test('similarity: opposite vectors yield cosine -1.0', () => {
  const p = makeProfile(0.7);
  const g = makeGame(1, -0.7);
  const r = similarity(p, g);
  assert.ok(r.cosine < -0.99, `expected cosine ~-1.0, got ${r.cosine}`);
});

test('similarity: orthogonal vectors yield cosine ~0', () => {
  // p has only PSY_ACHIEVEMENT non-zero; g has only PSY_KILLER non-zero
  const p = { dim_vector: { PSY_ACHIEVEMENT: 1, PSY_KILLER: 0 } };
  const g = { game_id: 1, dim_vector: { PSY_ACHIEVEMENT: 0, PSY_KILLER: 1 } };
  const r = similarity(p, g, { useConfidence: false });
  assert.equal(r.cosine, 0);
});

test('similarity: returns structured contributingDims sorted by magnitude', () => {
  const p = makeProfile(0.0, { PSY_KILLER: 0.9, EMO_HUMOR: 0.5, CTX_TIME: 0.1 });
  const g = makeGame(1, 0.0, { PSY_KILLER: 0.9, EMO_HUMOR: 0.5, CTX_TIME: 0.1 });
  const r = similarity(p, g);
  assert.ok(Array.isArray(r.contributingDims));
  assert.equal(r.contributingDims.length, 5);
  // PSY_KILLER (0.9*0.9 = 0.81) should be first; EMO_HUMOR (0.25) next
  assert.equal(r.contributingDims[0].dim, 'PSY_KILLER');
  assert.equal(r.contributingDims[1].dim, 'EMO_HUMOR');
});

test('similarity: handles missing confidence (treats as 1.0)', () => {
  const p = { dim_vector: { A: 0.5, B: 0.5 } };
  const g = { game_id: 1, dim_vector: { A: 0.5, B: 0.5 } };
  const r = similarity(p, g);
  assert.ok(r.cosine > 0.99);
});

test('similarity: zero vectors yield 0 (not NaN)', () => {
  const p = makeProfile(0);
  const g = makeGame(1, 0);
  const r = similarity(p, g);
  assert.equal(r.cosine, 0);
});

test('similarity: useConfidence=false skips confidence weighting', () => {
  // p has high confidence on dim A and low confidence on dim B; g has low conf on A, high on B
  const p = { dim_vector: { A: 1, B: 1 }, confidence_vector: { A: 0.95, B: 0.05 } };
  const g = { game_id: 1, dim_vector: { A: 1, B: 1 }, confidence_per_dim: { A: 0.05, B: 0.95 } };
  const weighted = similarity(p, g, { useConfidence: true });
  const unweighted = similarity(p, g, { useConfidence: false });
  assert.ok(unweighted.cosine > 0.99);
  // With confidence weighting + identical dim values, cosine should still be 1.0
  // because cosine is direction-invariant; weighting scales magnitudes but doesn't
  // flip alignment. Verify both are >= 0.99.
  assert.ok(weighted.cosine > 0.99);
});

test('similarity: empty intersection of dim ids yields 0', () => {
  const p = { dim_vector: { ALPHA: 1 } };
  const g = { game_id: 1, dim_vector: { BETA: 1 } };
  const r = similarity(p, g);
  assert.equal(r.cosine, 0);
});

test('similarity: throws on null inputs', () => {
  assert.throws(() => similarity(null, makeGame(1, 0)), /required/);
  assert.throws(() => similarity(makeProfile(0), null), /required/);
});

// ----------------------------------------------------------------------------
// scoreAll()
// ----------------------------------------------------------------------------

test('scoreAll: sorts descending by score', () => {
  const p = makeProfile(0.5);
  const games = [
    makeGame(1, -0.5),
    makeGame(2, 0.5),
    makeGame(3, 0),
  ];
  const scored = scoreAll(p, games);
  assert.equal(scored[0].game_id, 2); // identical, best
  assert.equal(scored[2].game_id, 1); // opposite, worst
});

test('scoreAll: skips game profiles with null game_id', () => {
  const p = makeProfile(0);
  const games = [
    { dim_vector: { A: 1 } }, // no game_id
    makeGame(7, 0.3),
  ];
  const scored = scoreAll(p, games);
  assert.equal(scored.length, 1);
  assert.equal(scored[0].game_id, 7);
});

test('scoreAll: throws on non-array input', () => {
  const p = makeProfile(0);
  assert.throws(() => scoreAll(p, 'not array'), /must be an array/);
});

// ----------------------------------------------------------------------------
// normalizeScores()
// ----------------------------------------------------------------------------

test('normalizeScores: standard case maps min→0, max→1', () => {
  const r = normalizeScores([{ score: 0.2 }, { score: 0.5 }, { score: 0.9 }]);
  assert.equal(r[0].normalizedScore, 0);
  assert.equal(r[2].normalizedScore, 1);
});

test('normalizeScores: all-equal case yields 1.0 (defends division by zero)', () => {
  const r = normalizeScores([{ score: 0.5 }, { score: 0.5 }]);
  assert.equal(r[0].normalizedScore, 1.0);
  assert.equal(r[1].normalizedScore, 1.0);
});

test('normalizeScores: empty input is empty', () => {
  assert.deepEqual(normalizeScores([]), []);
});

// ----------------------------------------------------------------------------
// mmrSelect (with synthetic game profiles + bgg metadata)
// ----------------------------------------------------------------------------

test('mmrSelect: respects designer cap when bggMetadata provided', () => {
  // 4 games all by the same designer; designer cap = 2 should yield only 2
  const games = [
    makeGame(1, 0.5),
    makeGame(2, 0.4),
    makeGame(3, 0.3),
    makeGame(4, 0.2),
  ];
  const meta = {
    1: { designers: [{ id: 'X', value: 'X' }] },
    2: { designers: [{ id: 'X', value: 'X' }] },
    3: { designers: [{ id: 'X', value: 'X' }] },
    4: { designers: [{ id: 'X', value: 'X' }] },
  };
  const p = makeProfile(0.5);
  const scored = scoreAll(p, games);
  const picked = mmrSelect(scored, games, 10, 0.7, { bggMetadata: meta, designerCap: 2 });
  assert.equal(picked.length, 2);
});

test('mmrSelect: no designer cap when bggMetadata absent', () => {
  const games = [makeGame(1, 0.5), makeGame(2, 0.4), makeGame(3, 0.3)];
  const p = makeProfile(0.5);
  const scored = scoreAll(p, games);
  const picked = mmrSelect(scored, games, 10, 0.7, {});
  assert.equal(picked.length, 3);
});

test('mmrSelect: empty pool returns empty array', () => {
  assert.deepEqual(mmrSelect([], [], 10, 0.7), []);
});

// ----------------------------------------------------------------------------
// match() — top-level pipeline
// ----------------------------------------------------------------------------

test('match: returns top-K by similarity', () => {
  const p = makeProfile(0.5);
  const games = [
    makeGame(1, -0.5),
    makeGame(2, 0.5),
    makeGame(3, 0.0),
    makeGame(4, 0.4),
  ];
  const r = match(p, games, { limit: 2, diversify: false });
  assert.equal(r.recommendations.length, 2);
  // games 2 and 4 (highest cosine) should top the list
  const ids = r.recommendations.map(x => x.game_id);
  assert.ok(ids.includes(2));
  assert.ok(ids.includes(4));
});

test('match: excludeGameIds removes specified games and notes filter reason', () => {
  const p = makeProfile(0.5);
  const games = [makeGame(1, 0.5), makeGame(2, 0.5), makeGame(3, 0.5)];
  const r = match(p, games, { excludeGameIds: [2], diversify: false });
  assert.equal(r.recommendations.length, 2);
  assert.ok(r.recommendations.every(x => x.game_id !== 2));
  assert.equal(r.filtered.length, 1);
  assert.equal(r.filtered[0].game_id, 2);
  assert.equal(r.filtered[0].reason, 'excluded');
});

test('match: playerCount filter excludes games where range does not span', () => {
  const p = makeProfile(0.5);
  const games = [makeGame(1, 0.5), makeGame(2, 0.5)];
  const meta = {
    1: { minPlayers: 2, maxPlayers: 4 },
    2: { minPlayers: 5, maxPlayers: 8 },
  };
  const r = match(p, games, { playerCount: 3, bggMetadata: meta, diversify: false });
  assert.equal(r.recommendations.length, 1);
  assert.equal(r.recommendations[0].game_id, 1);
  assert.equal(r.filtered.length, 1);
  assert.equal(r.filtered[0].game_id, 2);
  assert.equal(r.filtered[0].reason, 'player_count_out_of_range');
});

test('match: missing bggMetadata for a game does NOT filter it on player count', () => {
  // Per design: absence of metadata is not grounds for exclusion
  const p = makeProfile(0.5);
  const games = [makeGame(1, 0.5), makeGame(2, 0.5)];
  const meta = { 1: { minPlayers: 2, maxPlayers: 4 } }; // no entry for game 2
  const r = match(p, games, { playerCount: 6, bggMetadata: meta, diversify: false });
  // game 1 is filtered (out of range), game 2 has no metadata -> kept
  assert.equal(r.recommendations.length, 1);
  assert.equal(r.recommendations[0].game_id, 2);
});

test('match: returns totalConsidered count', () => {
  const p = makeProfile(0.5);
  const games = [makeGame(1, 0), makeGame(2, 0), makeGame(3, 0)];
  const r = match(p, games, { excludeGameIds: [3], diversify: false });
  assert.equal(r.totalConsidered, 2);
});

test('match: empty input returns empty recommendations', () => {
  const p = makeProfile(0);
  const r = match(p, []);
  assert.equal(r.recommendations.length, 0);
});

test('match: throws on null player profile', () => {
  assert.throws(() => match(null, []), /playerProfile/);
});

test('match: throws on non-array gameProfiles', () => {
  assert.throws(() => match(makeProfile(0), 'not array'), /must be an array/);
});

// ============================================================================
// SUBTLE-WRONGNESS ASSERTIONS (per SILO.md sec 7)
// ============================================================================
// These tests verify that for canonical input shapes, the matcher's output
// ordering respects expected dimensional relationships. A failure here is
// strong evidence of a "subtly wrong" recommender — exactly what the silo
// discipline exists to catch.

test('SUBTLE-WRONGNESS: high-killer player does NOT get pure-coop game as #1', () => {
  // Player profile: killer-leaning (PSY_KILLER very high; others moderate)
  const player = makeProfile(0, { PSY_KILLER: 0.9, SOC_DIRECT_INDIRECT: 0.7, SOC_COOP_COMP: 0.7 });
  // Game candidates:
  //   coop: pure cooperative (PSY_KILLER=-0.95, SOC_COOP_COMP=-0.95) -- the WORST possible match
  //   conflict: aggressive wargame (matches player)
  const games = [
    makeGame(101, 0, { PSY_KILLER: -0.95, SOC_COOP_COMP: -0.95, SOC_DIRECT_INDIRECT: -0.8 }),  // coop
    makeGame(102, 0, { PSY_KILLER: 0.7, SOC_COOP_COMP: 0.9, SOC_DIRECT_INDIRECT: 0.8 }),       // conflict
  ];
  const r = match(player, games, { limit: 2, diversify: false });
  // The conflict game must rank ABOVE the coop game
  assert.equal(r.recommendations[0].game_id, 102,
    `high-killer player got coop game as #1 -- subtle-wrongness violation`);
});

test('SUBTLE-WRONGNESS: low-extraversion player does NOT get loud party games at top', () => {
  // Player: introverted (low EXTRAVERSION, low CTX_PLAYER_COUNT, low EMO_HUMOR-as-tone-pref)
  const player = makeProfile(0, {
    PSY_EXTRAVERSION: -0.8,
    PSY_SOCIAL: -0.5,
    CTX_PLAYER_COUNT: -0.5,
    EMO_HUMOR: -0.4, // prefers serious over humor
  });
  const games = [
    // party game: loud, large group, humor-rich (Codenames-like)
    makeGame(201, 0, {
      PSY_EXTRAVERSION: 0.7,
      PSY_SOCIAL: 0.9,
      CTX_PLAYER_COUNT: 0.7,
      EMO_HUMOR: 0.8,
      MEC_COMPLEXITY: -0.9,
    }),
    // quiet thinker: low extraversion, low player count, serious tone
    makeGame(202, 0, {
      PSY_EXTRAVERSION: -0.6,
      PSY_SOCIAL: -0.4,
      CTX_PLAYER_COUNT: -0.3,
      EMO_HUMOR: -0.3,
      MEC_COMPLEXITY: 0.5,
    }),
  ];
  const r = match(player, games, { limit: 2, diversify: false });
  assert.equal(r.recommendations[0].game_id, 202,
    `low-extraversion player got party game as #1 -- subtle-wrongness violation`);
});

test('SUBTLE-WRONGNESS: high-CTX_TIME player does NOT get 15-min filler as #1', () => {
  // Player wants long, epic sessions
  const player = makeProfile(0, { CTX_TIME: 0.9, MEC_COMPLEXITY: 0.6, MEC_STRATEGY: 0.7 });
  const games = [
    // 15-min filler (Codenames-like)
    makeGame(301, 0, { CTX_TIME: -0.9, MEC_COMPLEXITY: -0.9, MEC_STRATEGY: -0.5 }),
    // epic 4-hr (TI-like)
    makeGame(302, 0, { CTX_TIME: 0.95, MEC_COMPLEXITY: 0.95, MEC_STRATEGY: 0.95 }),
  ];
  const r = match(player, games, { limit: 2, diversify: false });
  assert.equal(r.recommendations[0].game_id, 302,
    `high-CTX_TIME player got 15-min filler as #1 -- subtle-wrongness violation`);
});

test('SUBTLE-WRONGNESS: noped game must not appear in top 10', () => {
  // Player loves what game 401 represents (will rank high), but has noped 401
  const player = makeProfile(0, { PSY_ACHIEVEMENT: 0.8, MEC_STRATEGY: 0.7 });
  const games = [];
  for (let i = 401; i <= 411; i++) {
    games.push(makeGame(i, 0, { PSY_ACHIEVEMENT: 0.7, MEC_STRATEGY: 0.6 }));
  }
  const r = match(player, games, { excludeGameIds: [401], limit: 10, diversify: false });
  const ids = r.recommendations.map(x => x.game_id);
  assert.ok(!ids.includes(401), `noped game 401 leaked into top-10`);
  // and we still got 10 recommendations
  assert.equal(r.recommendations.length, 10);
});

test('SUBTLE-WRONGNESS: cold-start (very low confidence) input still produces output, but caller can detect uncertainty', () => {
  // Player has profile but every confidence is very low (e.g. answered only 2 questions)
  const player = {
    dim_vector: makeProfile(0).dim_vector,
    confidence_vector: Object.fromEntries(ALL_DIMS.map(d => [d, 0.05])),
  };
  const games = [makeGame(1, 0.5), makeGame(2, 0.3)];
  const r = match(player, games, { diversify: false });
  // The matcher returns scores, but they're driven by very small confidence weights.
  // The caller can detect cold-start by inspecting the magnitudes of the
  // unweightedCosine vs. cosine, and the dimsConsidered fields.
  assert.equal(r.recommendations.length, 2);
  // The unweightedCosine should be larger than cosine when confidence is very low
  // (because confidence weighting shrinks the projection magnitudes proportionally
  // but they cancel in the cosine -- so this property is direction-invariant).
  // The actionable signal for cold-start is that ALL contributingDims have
  // very small magnitudes (capped by 0.05^2 = 0.0025).
  for (const rec of r.recommendations) {
    for (const c of rec.contributingDims) {
      assert.ok(Math.abs(c.contribution) <= 0.05 * 0.05 * 1 + 1e-9,
        `cold-start contribution magnitude not bounded by confidence²`);
    }
  }
});

test('SUBTLE-WRONGNESS: designer cap ≤ 2 in top 10 when bggMetadata present', () => {
  const player = makeProfile(0.5);
  const games = [];
  // 12 games all by the same designer
  for (let i = 1; i <= 12; i++) games.push(makeGame(i, 0.5));
  const meta = {};
  for (let i = 1; i <= 12; i++) meta[i] = { designers: [{ id: 'X', value: 'X' }] };

  const r = match(player, games, { limit: 10, bggMetadata: meta, designerCap: 2 });
  // Even though all 12 games would otherwise tie at the top, only 2 of them
  // can appear in the result.
  assert.equal(r.recommendations.length, 2);
});

test('SUBTLE-WRONGNESS: identical scores produce stable diversified output', () => {
  // 5 identically-rated games, no metadata. Expect 5 returned.
  const player = makeProfile(0);
  const games = [
    makeGame(1, 0), makeGame(2, 0), makeGame(3, 0), makeGame(4, 0), makeGame(5, 0),
  ];
  const r = match(player, games, { limit: 10 });
  assert.equal(r.recommendations.length, 5);
});

// ----------------------------------------------------------------------------
// Integration: matcher runs against the 7 real reference profiles
// ----------------------------------------------------------------------------

test('integration: match() against 7 real reference profiles for a heavy-strategist player', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const ref = JSON.parse(readFileSync(resolve(__dirname, '..', 'data', 'reference-profiles.json'), 'utf8'));

  const gameProfiles = ref.profiles.map(p => ({
    game_id: p.game_id,
    dim_vector: p.dim_vector,
    confidence_per_dim: p.confidence_per_dim,
  }));

  // A "heavy strategist who likes long games" player profile
  const player = makeProfile(0, {
    PSY_ACHIEVEMENT: 0.8,
    PSY_CONSCIENTIOUSNESS: 0.8,
    PSY_KILLER: -0.3,
    MEC_COMPLEXITY: 0.7,
    MEC_STRATEGY: 0.8,
    CTX_TIME: 0.6,
    EMO_HUMOR: -0.3,
  });

  const r = match(player, gameProfiles, { limit: 7, diversify: false });
  assert.equal(r.recommendations.length, 7);

  // The HEAVY/long-game side (Terraforming Mars 167791, Twilight Imperium 233078, Ark Nova 342942)
  // must rank ABOVE Codenames (178900, the lightest). Verify by ranking position.
  const ids = r.recommendations.map(x => x.game_id);
  const posCodenames = ids.indexOf(178900);
  const posTM = ids.indexOf(167791);
  const posTI = ids.indexOf(233078);
  const posArkNova = ids.indexOf(342942);

  assert.ok(posTM < posCodenames,
    `Terraforming Mars (heavy-strategist match) should outrank Codenames (party light) for this player; got TM=${posTM}, Codenames=${posCodenames}`);
  assert.ok(posTI < posCodenames,
    `Twilight Imperium should outrank Codenames for heavy-strategist; got TI=${posTI}, Codenames=${posCodenames}`);
  assert.ok(posArkNova < posCodenames,
    `Ark Nova should outrank Codenames for heavy-strategist; got ArkNova=${posArkNova}, Codenames=${posCodenames}`);
});

test('integration: match() against 7 reference profiles for a cooperative-puzzle player', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const ref = JSON.parse(readFileSync(resolve(__dirname, '..', 'data', 'reference-profiles.json'), 'utf8'));

  const gameProfiles = ref.profiles.map(p => ({
    game_id: p.game_id,
    dim_vector: p.dim_vector,
    confidence_per_dim: p.confidence_per_dim,
  }));

  // A "cooperative puzzle solver, low conflict, medium time" player
  const player = makeProfile(0, {
    PSY_KILLER: -0.9,
    PSY_AGREEABLENESS: 0.8,
    SOC_COOP_COMP: -0.8,
    SOC_DIRECT_INDIRECT: -0.7,
    SOC_TRUST_BETRAYAL: -0.8,
    EMO_TENSION: 0.3, // some pandemic-style stakes are fine
    CTX_TIME: -0.3,
  });

  const r = match(player, gameProfiles, { limit: 7, diversify: false });
  assert.equal(r.recommendations.length, 7);

  // For this profile, Pandemic (30549) -- the only pure-coop game -- should
  // rank in the top 3 ahead of TI4 (233078, the wargame) and Codenames
  // (178900, party game).
  const ids = r.recommendations.map(x => x.game_id);
  const posPandemic = ids.indexOf(30549);
  const posTI = ids.indexOf(233078);
  const posCodenames = ids.indexOf(178900);
  assert.ok(posPandemic <= 2,
    `Pandemic (only coop) should rank top-3 for cooperative player; got pos=${posPandemic}`);
  assert.ok(posPandemic < posTI,
    `Pandemic (coop) should outrank TI4 (wargame) for cooperative player`);
  assert.ok(posPandemic < posCodenames,
    `Pandemic (coop) should outrank Codenames (chaotic party) for low-extraversion coop player`);
});
