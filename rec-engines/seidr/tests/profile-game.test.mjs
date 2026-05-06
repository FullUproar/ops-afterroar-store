// profile-game.test.mjs
// ============================================================================
// Tests for src/profile-game.mjs.
//
// End-to-end pipeline tests with an in-memory mock LLM. No network, no DB.
// Verifies that:
//   - generateProfile threads metadata through correctly
//   - validation failures abort with diagnostics
//   - generateBatch isolates per-game failures (one bad game doesn't fail the run)
//   - createMockLLMClient produces a usable client
//
// Run with: node --test tests/
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateProfile,
  generateBatch,
  createMockLLMClient,
} from '../src/profile-game.mjs';

const FAKE_GAME = {
  id: 99,
  name: 'Test Game',
  year: 2024,
  weight: 2.5,
  minPlayers: 2,
  maxPlayers: 4,
  minPlayTime: 60,
  maxPlayTime: 90,
  designers: [{ id: 1, value: 'Test Designer' }],
  mechanics: [{ id: 100, value: 'Worker Placement' }],
  categories: [{ id: 1, value: 'Strategy' }],
};

const TWO_DIMS = {
  version: '1.0.0',
  dimensions: [
    { id: 'DIM_X', cluster: 'PSY', low: 'low', high: 'high' },
    { id: 'DIM_Y', cluster: 'MEC', low: 'low', high: 'high' },
  ],
};

function buildGoodResponse(gameId, overrides = {}) {
  return JSON.stringify({
    game_id: gameId,
    dim_vector: { DIM_X: 0.4, DIM_Y: -0.3, ...overrides.dim_vector },
    confidence_per_dim: { DIM_X: 0.9, DIM_Y: 0.7, ...overrides.confidence_per_dim },
    source_provenance: 'llm_generated',
    model_version: 'mock-test',
    prompt_version: '1.0.0',
    narrative: 'A test game.',
    ...overrides,
  });
}

// ----------------------------------------------------------------------------
// generateProfile: happy path
// ----------------------------------------------------------------------------

test('generateProfile: pipes through mock LLM and returns validated profile', async () => {
  const client = createMockLLMClient(({ gameId }) => buildGoodResponse(gameId));
  const profile = await generateProfile(FAKE_GAME, TWO_DIMS, client);
  assert.equal(profile.game_id, 99);
  assert.equal(profile.dim_vector.DIM_X, 0.4);
  assert.equal(profile.source_provenance, 'llm_generated');
});

test('generateProfile: stamps source_provenance if LLM omits it', async () => {
  const client = createMockLLMClient(({ gameId }) => {
    const obj = JSON.parse(buildGoodResponse(gameId));
    delete obj.source_provenance;
    return JSON.stringify(obj);
  });
  const profile = await generateProfile(FAKE_GAME, TWO_DIMS, client);
  assert.equal(profile.source_provenance, 'llm_generated');
});

test('generateProfile: stamps prompt_version if LLM omits it', async () => {
  const client = createMockLLMClient(({ gameId }) => {
    const obj = JSON.parse(buildGoodResponse(gameId));
    delete obj.prompt_version;
    return JSON.stringify(obj);
  });
  const profile = await generateProfile(FAKE_GAME, TWO_DIMS, client);
  assert.equal(profile.prompt_version, '1.0.0');
});

test('generateProfile: applies modelVersionTag when LLM omits model_version', async () => {
  const client = createMockLLMClient(({ gameId }) => {
    const obj = JSON.parse(buildGoodResponse(gameId));
    delete obj.model_version;
    return JSON.stringify(obj);
  });
  const profile = await generateProfile(FAKE_GAME, TWO_DIMS, client, { modelVersionTag: 'override-tag' });
  assert.equal(profile.model_version, 'override-tag');
});

// ----------------------------------------------------------------------------
// generateProfile: validation failures
// ----------------------------------------------------------------------------

test('generateProfile: rejects out-of-range dim values', async () => {
  const client = createMockLLMClient(({ gameId }) =>
    buildGoodResponse(gameId, { dim_vector: { DIM_X: 1.5, DIM_Y: 0 } })
  );
  await assert.rejects(
    () => generateProfile(FAKE_GAME, TWO_DIMS, client),
    /out of range/
  );
});

test('generateProfile: rejects missing dimension', async () => {
  const client = createMockLLMClient(({ gameId }) => {
    const obj = JSON.parse(buildGoodResponse(gameId));
    delete obj.dim_vector.DIM_Y;
    return JSON.stringify(obj);
  });
  await assert.rejects(
    () => generateProfile(FAKE_GAME, TWO_DIMS, client),
    /DIM_Y/
  );
});

test('generateProfile: rejects malformed JSON from LLM', async () => {
  const client = createMockLLMClient(() => 'not valid json at all{{');
  await assert.rejects(
    () => generateProfile(FAKE_GAME, TWO_DIMS, client),
    /JSON\.parse failed/
  );
});

test('generateProfile: rejects wrong game_id from LLM', async () => {
  const client = createMockLLMClient(({ gameId }) => buildGoodResponse(99999)); // wrong
  await assert.rejects(
    () => generateProfile(FAKE_GAME, TWO_DIMS, client),
    /game_id/
  );
});

// ----------------------------------------------------------------------------
// generateProfile: argument validation
// ----------------------------------------------------------------------------

test('generateProfile: throws on null game', async () => {
  const client = createMockLLMClient(() => '{}');
  await assert.rejects(
    () => generateProfile(null, TWO_DIMS, client),
    /game must be an object/
  );
});

test('generateProfile: throws on null dimensionsJson', async () => {
  const client = createMockLLMClient(() => '{}');
  await assert.rejects(
    () => generateProfile(FAKE_GAME, null, client),
    /dimensionsJson/
  );
});

test('generateProfile: throws on bad llmClient', async () => {
  await assert.rejects(
    () => generateProfile(FAKE_GAME, TWO_DIMS, {}),
    /llmClient/
  );
});

// ----------------------------------------------------------------------------
// generateBatch: isolation of failures
// ----------------------------------------------------------------------------

test('generateBatch: all-success returns clean result', async () => {
  const games = [
    { ...FAKE_GAME, id: 1, name: 'A' },
    { ...FAKE_GAME, id: 2, name: 'B' },
    { ...FAKE_GAME, id: 3, name: 'C' },
  ];
  const client = createMockLLMClient(({ gameId }) => buildGoodResponse(gameId));
  const r = await generateBatch(games, TWO_DIMS, client);
  assert.equal(r.ok.length, 3);
  assert.equal(r.failed.length, 0);
});

test('generateBatch: per-game failures isolated; the rest succeed', async () => {
  const games = [
    { ...FAKE_GAME, id: 1, name: 'A' },
    { ...FAKE_GAME, id: 2, name: 'B' },
    { ...FAKE_GAME, id: 3, name: 'C' },
  ];
  const client = createMockLLMClient(({ gameId }) => {
    if (gameId === 2) return 'invalid json';
    return buildGoodResponse(gameId);
  });
  const r = await generateBatch(games, TWO_DIMS, client);
  assert.equal(r.ok.length, 2);
  assert.equal(r.failed.length, 1);
  assert.equal(r.failed[0].game_id, 2);
  assert.match(r.failed[0].error, /JSON\.parse/);
});

test('generateBatch: empty input returns empty batches', async () => {
  const client = createMockLLMClient(() => '');
  const r = await generateBatch([], TWO_DIMS, client);
  assert.equal(r.ok.length, 0);
  assert.equal(r.failed.length, 0);
});

test('generateBatch: throws on non-array input', async () => {
  const client = createMockLLMClient(() => '');
  await assert.rejects(
    () => generateBatch('not array', TWO_DIMS, client),
    /must be an array/
  );
});

// ----------------------------------------------------------------------------
// createMockLLMClient
// ----------------------------------------------------------------------------

test('createMockLLMClient: throws if responseFor is not a function', () => {
  assert.throws(() => createMockLLMClient('not a fn'), /must be a function/);
  assert.throws(() => createMockLLMClient(null), /must be a function/);
});

test('createMockLLMClient: returned client has .generate method', () => {
  const c = createMockLLMClient(() => '{}');
  assert.equal(typeof c.generate, 'function');
});

test('createMockLLMClient: passes options to responseFor', async () => {
  let capturedOptions = null;
  const c = createMockLLMClient(opts => {
    capturedOptions = opts;
    return '{}';
  });
  await c.generate('the prompt', { gameId: 42, gameName: 'X' });
  assert.equal(capturedOptions.gameId, 42);
  assert.equal(capturedOptions.gameName, 'X');
});

test('createMockLLMClient: rejects non-string return from responseFor', async () => {
  const c = createMockLLMClient(() => ({ not: 'a string' }));
  await assert.rejects(
    () => c.generate('p', { gameId: 1 }),
    /non-string/
  );
});

// ----------------------------------------------------------------------------
// Integration: real reference profiles drive the pipeline end-to-end
// ----------------------------------------------------------------------------

test('integration: pipeline accepts the reference profiles for fixture games', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const __dirname = dirname(fileURLToPath(import.meta.url));

  const dims = JSON.parse(readFileSync(resolve(__dirname, '..', 'data', 'dimensions.json'), 'utf8'));
  const ref = JSON.parse(readFileSync(resolve(__dirname, '..', 'data', 'reference-profiles.json'), 'utf8'));

  // Build a mock LLM that returns the reference profile for the requested game_id
  const byId = new Map(ref.profiles.map(p => [p.game_id, p]));
  const client = createMockLLMClient(({ gameId }) => {
    const p = byId.get(gameId);
    if (!p) return 'no such game';
    return JSON.stringify({
      game_id: p.game_id,
      dim_vector: p.dim_vector,
      confidence_per_dim: p.confidence_per_dim,
      source_provenance: 'llm_generated',
      model_version: 'reference-mock',
      prompt_version: '1.0.0',
      narrative: p.narrative,
    });
  });

  // Read the 7 fixture games
  const fixturesDir = resolve(__dirname, '..', '..', 'mimir', 'tests', 'fixtures', 'bgg');
  const { readdirSync } = await import('node:fs');
  const games = readdirSync(fixturesDir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(resolve(fixturesDir, f), 'utf8')));

  assert.equal(games.length, 7);
  const r = await generateBatch(games, dims, client);
  assert.equal(r.failed.length, 0, `unexpected failures: ${JSON.stringify(r.failed)}`);
  assert.equal(r.ok.length, 7);

  // Each profile should round-trip with all 24 dims
  for (const p of r.ok) {
    assert.equal(Object.keys(p.dim_vector).length, 24);
    assert.equal(Object.keys(p.confidence_per_dim).length, 24);
  }
});
