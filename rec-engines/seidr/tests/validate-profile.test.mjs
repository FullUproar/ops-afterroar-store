// validate-profile.test.mjs
// ============================================================================
// Tests for src/validate-profile.mjs.
//
// The validator is a pure function -- no I/O. These tests construct profile
// objects in-line and assert the validator's verdict + diagnostic messages.
//
// Run with: node --test tests/
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateProfile,
  validateProfiles,
  extractDimIds,
} from '../src/validate-profile.mjs';

// A small synthetic dimension list keeps these tests independent of the real
// 24-dim taxonomy (so changes to dimensions.json don't break the unit test).
const SYNTH_DIMS = ['DIM_A', 'DIM_B', 'DIM_C'];

function buildValidProfile(overrides = {}) {
  return {
    game_id: 100,
    dim_vector: { DIM_A: 0.3, DIM_B: -0.5, DIM_C: 0.0 },
    confidence_per_dim: { DIM_A: 0.9, DIM_B: 0.7, DIM_C: 0.5 },
    source_provenance: 'llm_generated',
    model_version: 'claude-test',
    prompt_version: '1.0.0',
    ...overrides,
  };
}

// ----------------------------------------------------------------------------
// Happy path
// ----------------------------------------------------------------------------

test('validateProfile: well-formed profile passes', () => {
  const r = validateProfile(buildValidProfile(), SYNTH_DIMS);
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
});

test('validateProfile: optional fields absent is fine', () => {
  const profile = buildValidProfile();
  delete profile.model_version;
  delete profile.prompt_version;
  const r = validateProfile(profile, SYNTH_DIMS);
  assert.equal(r.ok, true);
});

test('validateProfile: edge values exactly at boundaries pass', () => {
  const profile = buildValidProfile({
    dim_vector: { DIM_A: -1, DIM_B: 1, DIM_C: 0 },
    confidence_per_dim: { DIM_A: 0, DIM_B: 1, DIM_C: 0.5 },
  });
  const r = validateProfile(profile, SYNTH_DIMS);
  assert.equal(r.ok, true);
});

// ----------------------------------------------------------------------------
// Top-level shape errors
// ----------------------------------------------------------------------------

test('validateProfile: null profile rejected', () => {
  const r = validateProfile(null, SYNTH_DIMS);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /not an object/);
});

test('validateProfile: non-object profile rejected', () => {
  const r = validateProfile('not a profile', SYNTH_DIMS);
  assert.equal(r.ok, false);
});

test('validateProfile: non-array dimIds rejected', () => {
  const r = validateProfile(buildValidProfile(), 'not array');
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /requiredDimIds/);
});

test('validateProfile: empty dimIds rejected', () => {
  const r = validateProfile(buildValidProfile(), []);
  assert.equal(r.ok, false);
});

// ----------------------------------------------------------------------------
// game_id rules
// ----------------------------------------------------------------------------

test('validateProfile: game_id non-integer rejected', () => {
  const r = validateProfile(buildValidProfile({ game_id: 'abc' }), SYNTH_DIMS);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('game_id')));
});

test('validateProfile: game_id zero rejected', () => {
  const r = validateProfile(buildValidProfile({ game_id: 0 }), SYNTH_DIMS);
  assert.equal(r.ok, false);
});

test('validateProfile: game_id negative rejected', () => {
  const r = validateProfile(buildValidProfile({ game_id: -5 }), SYNTH_DIMS);
  assert.equal(r.ok, false);
});

test('validateProfile: game_id float rejected', () => {
  const r = validateProfile(buildValidProfile({ game_id: 1.5 }), SYNTH_DIMS);
  assert.equal(r.ok, false);
});

// ----------------------------------------------------------------------------
// dim_vector rules
// ----------------------------------------------------------------------------

test('validateProfile: dim_vector missing rejected', () => {
  const profile = buildValidProfile();
  delete profile.dim_vector;
  const r = validateProfile(profile, SYNTH_DIMS);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('dim_vector')));
});

test('validateProfile: dim_vector array (not object) rejected', () => {
  const r = validateProfile(buildValidProfile({ dim_vector: [0, 0, 0] }), SYNTH_DIMS);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('plain object')));
});

test('validateProfile: dim_vector missing a required dim rejected', () => {
  const r = validateProfile(buildValidProfile({
    dim_vector: { DIM_A: 0, DIM_B: 0 }, // missing DIM_C
  }), SYNTH_DIMS);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('DIM_C')));
});

test('validateProfile: dim_vector extra unexpected key rejected', () => {
  const r = validateProfile(buildValidProfile({
    dim_vector: { DIM_A: 0, DIM_B: 0, DIM_C: 0, DIM_EXTRA: 0.5 },
  }), SYNTH_DIMS);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('unexpected key')));
});

test('validateProfile: dim_vector value out of [-1,1] rejected', () => {
  const r = validateProfile(buildValidProfile({
    dim_vector: { DIM_A: 1.5, DIM_B: 0, DIM_C: 0 },
  }), SYNTH_DIMS);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('out of range')));
});

test('validateProfile: dim_vector non-numeric rejected', () => {
  const r = validateProfile(buildValidProfile({
    dim_vector: { DIM_A: 'high', DIM_B: 0, DIM_C: 0 },
  }), SYNTH_DIMS);
  assert.equal(r.ok, false);
});

test('validateProfile: dim_vector NaN rejected', () => {
  const r = validateProfile(buildValidProfile({
    dim_vector: { DIM_A: NaN, DIM_B: 0, DIM_C: 0 },
  }), SYNTH_DIMS);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('finite')));
});

// ----------------------------------------------------------------------------
// confidence_per_dim rules
// ----------------------------------------------------------------------------

test('validateProfile: confidence_per_dim missing rejected', () => {
  const profile = buildValidProfile();
  delete profile.confidence_per_dim;
  const r = validateProfile(profile, SYNTH_DIMS);
  assert.equal(r.ok, false);
});

test('validateProfile: confidence value > 1 rejected', () => {
  const r = validateProfile(buildValidProfile({
    confidence_per_dim: { DIM_A: 1.2, DIM_B: 0.5, DIM_C: 0.5 },
  }), SYNTH_DIMS);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('out of range')));
});

test('validateProfile: confidence value negative rejected', () => {
  const r = validateProfile(buildValidProfile({
    confidence_per_dim: { DIM_A: -0.1, DIM_B: 0.5, DIM_C: 0.5 },
  }), SYNTH_DIMS);
  assert.equal(r.ok, false);
});

// ----------------------------------------------------------------------------
// source_provenance rules
// ----------------------------------------------------------------------------

test('validateProfile: source_provenance llm_generated accepted', () => {
  const r = validateProfile(buildValidProfile({ source_provenance: 'llm_generated' }), SYNTH_DIMS);
  assert.equal(r.ok, true);
});

test('validateProfile: source_provenance manually_curated accepted', () => {
  const r = validateProfile(buildValidProfile({ source_provenance: 'manually_curated' }), SYNTH_DIMS);
  assert.equal(r.ok, true);
});

test('validateProfile: source_provenance play_inferred accepted', () => {
  const r = validateProfile(buildValidProfile({ source_provenance: 'play_inferred' }), SYNTH_DIMS);
  assert.equal(r.ok, true);
});

test('validateProfile: source_provenance hybrid accepted', () => {
  const r = validateProfile(buildValidProfile({ source_provenance: 'hybrid' }), SYNTH_DIMS);
  assert.equal(r.ok, true);
});

test('validateProfile: source_provenance invalid rejected', () => {
  const r = validateProfile(buildValidProfile({ source_provenance: 'made_up_value' }), SYNTH_DIMS);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('source_provenance')));
});

test('validateProfile: source_provenance missing rejected', () => {
  const profile = buildValidProfile();
  delete profile.source_provenance;
  const r = validateProfile(profile, SYNTH_DIMS);
  assert.equal(r.ok, false);
});

// ----------------------------------------------------------------------------
// Optional metadata
// ----------------------------------------------------------------------------

test('validateProfile: empty model_version string rejected', () => {
  const r = validateProfile(buildValidProfile({ model_version: '' }), SYNTH_DIMS);
  assert.equal(r.ok, false);
});

test('validateProfile: model_version null is ok (treated as absent)', () => {
  const r = validateProfile(buildValidProfile({ model_version: null }), SYNTH_DIMS);
  assert.equal(r.ok, true);
});

// ----------------------------------------------------------------------------
// validateProfiles (batch)
// ----------------------------------------------------------------------------

test('validateProfiles: all-valid batch returns ok', () => {
  const r = validateProfiles([buildValidProfile(), buildValidProfile({ game_id: 200 })], SYNTH_DIMS);
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
});

test('validateProfiles: failures isolated to per-profile entries', () => {
  const r = validateProfiles([
    buildValidProfile(),
    buildValidProfile({ game_id: 0 }), // bad
    buildValidProfile({ game_id: 200 }),
  ], SYNTH_DIMS);
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].game_id, 0);
});

test('validateProfiles: non-array input rejected', () => {
  const r = validateProfiles('not array', SYNTH_DIMS);
  assert.equal(r.ok, false);
});

// ----------------------------------------------------------------------------
// extractDimIds
// ----------------------------------------------------------------------------

test('extractDimIds: pulls .id from each entry', () => {
  const dims = { dimensions: [{ id: 'A' }, { id: 'B' }, { id: 'C' }] };
  assert.deepEqual(extractDimIds(dims), ['A', 'B', 'C']);
});

test('extractDimIds: throws on malformed input', () => {
  assert.throws(() => extractDimIds({}), /\.dimensions array/);
  assert.throws(() => extractDimIds({ dimensions: 'not array' }), /\.dimensions array/);
  assert.throws(() => extractDimIds(null), /\.dimensions array/);
});

// ----------------------------------------------------------------------------
// Integration: real reference profiles validate against real dim taxonomy
// ----------------------------------------------------------------------------

test('reference-profiles.json: all 7 entries validate against the real 24 dimensions', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const __dirname = dirname(fileURLToPath(import.meta.url));

  const dims = JSON.parse(readFileSync(resolve(__dirname, '..', 'data', 'dimensions.json'), 'utf8'));
  const ref = JSON.parse(readFileSync(resolve(__dirname, '..', 'data', 'reference-profiles.json'), 'utf8'));
  const dimIds = extractDimIds(dims);

  // dimensions.json must have 24 dims
  assert.equal(dimIds.length, 24);
  // there must be 7 reference profiles
  assert.equal(ref.profiles.length, 7);

  // each reference profile must validate. We adapt the ref shape to the
  // validator's expected shape (the file carries source_provenance at the
  // top level; copy it to each profile for the validator).
  for (const p of ref.profiles) {
    const profileForValidator = {
      game_id: p.game_id,
      dim_vector: p.dim_vector,
      confidence_per_dim: p.confidence_per_dim,
      source_provenance: ref.source_provenance,
      model_version: ref.model_version,
      prompt_version: ref.prompt_version,
    };
    const r = validateProfile(profileForValidator, dimIds);
    assert.equal(r.ok, true, `reference profile for ${p.game_name} failed: ${r.errors.join('; ')}`);
  }
});
