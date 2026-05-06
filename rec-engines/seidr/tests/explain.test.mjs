// explain.test.mjs
// ============================================================================
// Tests for src/explain.mjs.
//
// Pure-string-rendering tests. Assert that explanations contain expected
// anchors (dimension IDs, score values, pole descriptors) for canonical
// inputs, and that input validation is correct.
//
// Run with: node --test tests/
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explain, explainAll } from '../src/explain.mjs';

const FAKE_DIMS = {
  version: '1.0.0',
  dimensions: [
    { id: 'PSY_KILLER', cluster: 'PSY', low: 'Pacifist/Builder', high: 'Aggressive/Dominant' },
    { id: 'CTX_TIME', cluster: 'CTX', low: 'Micro/Filler', high: 'Epic/All-Day' },
    { id: 'MEC_COMPLEXITY', cluster: 'MEC', low: 'Very Light/Gateway', high: 'Extremely Heavy/Opaque' },
    { id: 'EMO_HUMOR', cluster: 'EMO', low: 'Serious-tone-seeking', high: 'Humor/Levity-seeking' },
  ],
};

function buildRec(overrides = {}) {
  return {
    game_id: 100,
    score: 0.7,
    cosineSimilarity: 0.7,
    contributingDims: [
      { dim: 'PSY_KILLER', contribution: 0.5 },
      { dim: 'CTX_TIME', contribution: 0.4 },
      { dim: 'MEC_COMPLEXITY', contribution: 0.2 },
    ],
    dimsConsidered: 24,
    ...overrides,
  };
}

// ----------------------------------------------------------------------------
// Happy path
// ----------------------------------------------------------------------------

test('explain: rich detail returns multi-sentence explanation with dimension IDs', () => {
  const r = buildRec();
  const out = explain(r, FAKE_DIMS);
  assert.ok(out.includes('PSY_KILLER'));
  assert.ok(out.includes('CTX_TIME'));
  assert.ok(out.includes('cosine'));
});

test('explain: short detail returns one-sentence summary', () => {
  const r = buildRec();
  const out = explain(r, FAKE_DIMS, { detail: 'short' });
  assert.ok(out.length < 200, `short explanation longer than expected: ${out.length} chars`);
  assert.ok(out.includes('PSY_KILLER'));
  // short form should NOT include the multi-sentence narrative framing
  assert.ok(!out.includes('Note:'));
});

test('explain: short with gameName mentions the game name', () => {
  const r = buildRec();
  const out = explain(r, FAKE_DIMS, { detail: 'short', gameName: 'Tabletop X' });
  assert.match(out, /Tabletop X/);
});

// ----------------------------------------------------------------------------
// Negative contributions surface as misalignment notes
// ----------------------------------------------------------------------------

test('explain: rich detail surfaces negative contributions as "Note:" line', () => {
  const r = buildRec({
    contributingDims: [
      { dim: 'PSY_KILLER', contribution: 0.4 },
      { dim: 'CTX_TIME', contribution: -0.3 },
    ],
  });
  const out = explain(r, FAKE_DIMS);
  assert.match(out, /Note:/);
});

test('explain: rich detail with NO negative contributions has no "Note:" line', () => {
  const r = buildRec({
    contributingDims: [
      { dim: 'PSY_KILLER', contribution: 0.4 },
      { dim: 'CTX_TIME', contribution: 0.3 },
    ],
  });
  const out = explain(r, FAKE_DIMS);
  assert.ok(!out.includes('Note:'));
});

// ----------------------------------------------------------------------------
// Player + game profile context produces "you both lean X" framing
// ----------------------------------------------------------------------------

test('explain: with playerProfile + gameProfile, surfaces pole descriptors for matching dimensions', () => {
  const r = buildRec({
    contributingDims: [{ dim: 'PSY_KILLER', contribution: 0.5 }],
  });
  const playerProfile = { dim_vector: { PSY_KILLER: 0.7 } };
  const gameProfile = { dim_vector: { PSY_KILLER: 0.7 } };
  const out = explain(r, FAKE_DIMS, { playerProfile, gameProfile });
  // Should describe BOTH leaning toward the high pole for PSY_KILLER
  assert.match(out, /aggressive\/dominant/i);
});

test('explain: with mismatched player/game on a NEGATIVE-contribution dim, frames as misalignment', () => {
  const r = buildRec({
    contributingDims: [{ dim: 'PSY_KILLER', contribution: -0.5 }],
  });
  const playerProfile = { dim_vector: { PSY_KILLER: 0.7 } };
  const gameProfile = { dim_vector: { PSY_KILLER: -0.7 } };
  const out = explain(r, FAKE_DIMS, { playerProfile, gameProfile });
  // Player prefers Aggressive; game leans Pacifist
  assert.match(out, /aggressive\/dominant/i);
  assert.match(out, /pacifist\/builder/i);
});

// ----------------------------------------------------------------------------
// Score buckets produce different framings
// ----------------------------------------------------------------------------

test('explain: high cosine produces "solid dimensional fit"', () => {
  const r = buildRec({ cosineSimilarity: 0.8 });
  const out = explain(r, FAKE_DIMS);
  assert.match(out, /solid/i);
});

test('explain: medium cosine produces "moderate fit"', () => {
  const r = buildRec({ cosineSimilarity: 0.3 });
  const out = explain(r, FAKE_DIMS);
  assert.match(out, /moderate/i);
});

test('explain: low cosine produces "weak overall fit"', () => {
  const r = buildRec({ cosineSimilarity: 0.1 });
  const out = explain(r, FAKE_DIMS);
  assert.match(out, /weak overall/i);
});

test('explain: negative cosine produces "poor fit"', () => {
  const r = buildRec({ cosineSimilarity: -0.2 });
  const out = explain(r, FAKE_DIMS);
  assert.match(out, /poor fit/i);
});

// ----------------------------------------------------------------------------
// Edge cases
// ----------------------------------------------------------------------------

test('explain: filters out dims whose contribution magnitude < 0.05', () => {
  const r = buildRec({
    contributingDims: [
      { dim: 'PSY_KILLER', contribution: 0.4 },
      { dim: 'CTX_TIME', contribution: 0.01 }, // below threshold
      { dim: 'MEC_COMPLEXITY', contribution: 0.005 }, // below threshold
    ],
  });
  const out = explain(r, FAKE_DIMS);
  assert.ok(out.includes('PSY_KILLER'));
  assert.ok(!out.includes('CTX_TIME'));
  assert.ok(!out.includes('MEC_COMPLEXITY'));
});

test('explain: empty contributingDims with low cosine produces low-confidence message', () => {
  const r = buildRec({
    contributingDims: [],
    cosineSimilarity: 0.01,
  });
  const out = explain(r, FAKE_DIMS);
  assert.match(out, /low confidence/i);
});

test('explain: empty contributingDims with mid cosine notes no standout drivers', () => {
  const r = buildRec({
    contributingDims: [],
    cosineSimilarity: 0.5,
  });
  const out = explain(r, FAKE_DIMS);
  assert.match(out, /no standout/i);
});

// ----------------------------------------------------------------------------
// Input validation
// ----------------------------------------------------------------------------

test('explain: throws on null recommendation', () => {
  assert.throws(() => explain(null, FAKE_DIMS), /recommendation required/);
});

test('explain: throws on missing dimensions', () => {
  assert.throws(() => explain(buildRec(), null), /\.dimensions array required/);
});

test('explain: throws on dimensions without .dimensions array', () => {
  assert.throws(() => explain(buildRec(), { foo: 'bar' }), /\.dimensions array required/);
});

// ----------------------------------------------------------------------------
// explainAll
// ----------------------------------------------------------------------------

test('explainAll: returns one explanation per recommendation', () => {
  const matchResult = {
    recommendations: [
      buildRec({ game_id: 100 }),
      buildRec({ game_id: 200 }),
      buildRec({ game_id: 300 }),
    ],
  };
  const out = explainAll(matchResult, FAKE_DIMS);
  assert.equal(out.length, 3);
  assert.equal(out[0].game_id, 100);
  assert.equal(out[2].game_id, 300);
  for (const e of out) {
    assert.equal(typeof e.explanation, 'string');
    assert.ok(e.explanation.length > 0);
  }
});

test('explainAll: forwards gameNamesById for short detail framing', () => {
  const matchResult = {
    recommendations: [buildRec({ game_id: 100 })],
  };
  const gameNamesById = new Map([[100, 'Tabletop X']]);
  const out = explainAll(matchResult, FAKE_DIMS, { detail: 'short', gameNamesById });
  assert.match(out[0].explanation, /Tabletop X/);
});

test('explainAll: forwards gameProfilesById for pole-descriptor framing', () => {
  const matchResult = {
    recommendations: [buildRec({ game_id: 100 })],
  };
  const playerProfile = { dim_vector: { PSY_KILLER: 0.8 } };
  const gameProfilesById = new Map([[100, { dim_vector: { PSY_KILLER: 0.8 } }]]);
  const out = explainAll(matchResult, FAKE_DIMS, { playerProfile, gameProfilesById });
  // Both leaning Aggressive -- should appear in framing
  assert.match(out[0].explanation, /aggressive/i);
});

test('explainAll: throws on null matchResult', () => {
  assert.throws(() => explainAll(null, FAKE_DIMS), /matchResult\.recommendations/);
});

test('explainAll: throws when recommendations is not an array', () => {
  assert.throws(() => explainAll({ recommendations: 'oops' }, FAKE_DIMS), /matchResult\.recommendations/);
});

// ----------------------------------------------------------------------------
// Integration: real dimensions + matcher output
// ----------------------------------------------------------------------------

test('integration: explainAll runs over real match() output against reference profiles', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { match } = await import('../src/match.mjs');

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const dims = JSON.parse(readFileSync(resolve(__dirname, '..', 'data', 'dimensions.json'), 'utf8'));
  const ref = JSON.parse(readFileSync(resolve(__dirname, '..', 'data', 'reference-profiles.json'), 'utf8'));

  const gameProfiles = ref.profiles.map(p => ({
    game_id: p.game_id,
    dim_vector: p.dim_vector,
    confidence_per_dim: p.confidence_per_dim,
  }));

  // A canonical heavy-strategist player
  const player = {
    dim_vector: {
      PSY_ACHIEVEMENT: 0.8, PSY_EXPLORATION: 0.4, PSY_SOCIAL: -0.3, PSY_KILLER: -0.3,
      PSY_OPENNESS: 0.3, PSY_CONSCIENTIOUSNESS: 0.8, PSY_EXTRAVERSION: -0.4,
      PSY_AGREEABLENESS: 0.0, PSY_NEUROTICISM: 0.0,
      SOC_COOP_COMP: 0.5, SOC_DIRECT_INDIRECT: -0.5, SOC_TRUST_BETRAYAL: -0.5,
      MEC_LUCK_SKILL: 0.3, MEC_COMPLEXITY: 0.7, MEC_STRATEGY: 0.8, MEC_ASYMMETRY: 0.3,
      AES_THEME_MECH: 0.2, AES_NARRATIVE: -0.2, AES_COMPONENT: 0.4,
      CTX_TIME: 0.6, CTX_NOSTALGIA: 0.0, CTX_PLAYER_COUNT: -0.2,
      EMO_TENSION: 0.2, EMO_HUMOR: -0.4,
    },
    confidence_vector: Object.fromEntries(
      Object.keys(ref.profiles[0].dim_vector).map(d => [d, 0.85])
    ),
  };

  const result = match(player, gameProfiles, { limit: 7, diversify: false });
  const gameProfilesById = new Map(gameProfiles.map(g => [g.game_id, g]));
  const out = explainAll(result, dims, { detail: 'rich', playerProfile: player, gameProfilesById });

  assert.equal(out.length, 7);
  for (const e of out) {
    assert.equal(typeof e.explanation, 'string');
    assert.ok(e.explanation.length > 30, `explanation suspiciously short: ${e.explanation}`);
  }
  // top match should mention either MEC_STRATEGY or PSY_ACHIEVEMENT (the dimensions
  // that should drive a heavy-strategist player's top pick)
  const topExplanation = out[0].explanation;
  assert.ok(
    /MEC_STRATEGY|PSY_ACHIEVEMENT|PSY_CONSCIENTIOUSNESS/.test(topExplanation),
    `expected heavy-strategist top pick to cite a strategist dim, got: ${topExplanation}`
  );
});
