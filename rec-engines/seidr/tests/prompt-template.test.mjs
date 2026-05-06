// prompt-template.test.mjs
// ============================================================================
// Tests for src/prompt-template.mjs.
//
// The prompt-template module is pure-string-rendering. These tests assert
// that the rendered prompt contains the expected anchors (game metadata,
// dimension list, output schema instructions) and that parseLLMResponse
// is robust to common formatting deviations.
//
// Run with: node --test tests/
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPrompt, parseLLMResponse, PROMPT_VERSION } from '../src/prompt-template.mjs';

const FAKE_GAME = {
  id: 42,
  name: 'Test Game',
  year: 2024,
  weight: 2.5,
  minPlayers: 2,
  maxPlayers: 4,
  minPlayTime: 60,
  maxPlayTime: 90,
  bggRank: 100,
  designers: [{ id: 1, value: 'Test Designer' }],
  mechanics: [{ id: 100, value: 'Worker Placement' }, { id: 101, value: 'Drafting' }],
  categories: [{ id: 1, value: 'Strategy' }],
};

const FAKE_DIMS = {
  version: '1.0.0',
  dimensions: [
    { id: 'DIM_X', cluster: 'PSY', low: 'low side', high: 'high side' },
    { id: 'DIM_Y', cluster: 'MEC', low: 'shallow', high: 'deep' },
  ],
};

// ----------------------------------------------------------------------------
// renderPrompt: includes expected anchors
// ----------------------------------------------------------------------------

test('renderPrompt: includes the game name', () => {
  const p = renderPrompt(FAKE_GAME, FAKE_DIMS);
  assert.match(p, /Test Game/);
});

test('renderPrompt: includes the game id', () => {
  const p = renderPrompt(FAKE_GAME, FAKE_DIMS);
  assert.match(p, /game_id must equal 42/);
});

test('renderPrompt: includes mechanics list', () => {
  const p = renderPrompt(FAKE_GAME, FAKE_DIMS);
  assert.match(p, /Worker Placement/);
  assert.match(p, /Drafting/);
});

test('renderPrompt: includes categories', () => {
  const p = renderPrompt(FAKE_GAME, FAKE_DIMS);
  assert.match(p, /Strategy/);
});

test('renderPrompt: includes designers', () => {
  const p = renderPrompt(FAKE_GAME, FAKE_DIMS);
  assert.match(p, /Test Designer/);
});

test('renderPrompt: includes weight', () => {
  const p = renderPrompt(FAKE_GAME, FAKE_DIMS);
  assert.match(p, /Weight: 2\.5/);
});

test('renderPrompt: includes player count and time', () => {
  const p = renderPrompt(FAKE_GAME, FAKE_DIMS);
  assert.match(p, /2–4/);
  assert.match(p, /60–90/);
});

test('renderPrompt: includes every dimension id from dimensions input', () => {
  const p = renderPrompt(FAKE_GAME, FAKE_DIMS);
  for (const d of FAKE_DIMS.dimensions) {
    assert.match(p, new RegExp(d.id));
  }
});

test('renderPrompt: includes dimension low/high pole descriptors', () => {
  const p = renderPrompt(FAKE_GAME, FAKE_DIMS);
  assert.match(p, /low side/);
  assert.match(p, /high side/);
});

test('renderPrompt: includes the prompt version literal', () => {
  const p = renderPrompt(FAKE_GAME, FAKE_DIMS);
  assert.match(p, new RegExp(`prompt_version must be the literal string "${PROMPT_VERSION.replace(/\./g, '\\.')}"`));
});

test('renderPrompt: instructs JSON-only output', () => {
  const p = renderPrompt(FAKE_GAME, FAKE_DIMS);
  assert.match(p, /JSON only/);
});

test('renderPrompt: missing optional fields renders gracefully', () => {
  const sparse = { id: 99, name: 'Sparse Game' };
  const p = renderPrompt(sparse, FAKE_DIMS);
  assert.match(p, /Sparse Game/);
  assert.match(p, /unknown/); // year, weight should be "unknown"
  assert.match(p, /\(none listed\)/); // mechanics, categories, designers
});

// ----------------------------------------------------------------------------
// renderPrompt: input validation
// ----------------------------------------------------------------------------

test('renderPrompt: throws on null game', () => {
  assert.throws(() => renderPrompt(null, FAKE_DIMS), /game must be an object/);
});

test('renderPrompt: throws on missing dimensions array', () => {
  assert.throws(() => renderPrompt(FAKE_GAME, {}), /\.dimensions array/);
});

test('renderPrompt: throws on null dimensions', () => {
  assert.throws(() => renderPrompt(FAKE_GAME, null), /\.dimensions array/);
});

// ----------------------------------------------------------------------------
// parseLLMResponse: JSON-only happy path
// ----------------------------------------------------------------------------

test('parseLLMResponse: bare JSON parses', () => {
  const json = '{"foo": 1, "bar": "baz"}';
  assert.deepEqual(parseLLMResponse(json), { foo: 1, bar: 'baz' });
});

// ----------------------------------------------------------------------------
// parseLLMResponse: tolerates common LLM formatting deviations
// ----------------------------------------------------------------------------

test('parseLLMResponse: strips ```json fenced blocks', () => {
  const fenced = '```json\n{"foo": 1}\n```';
  assert.deepEqual(parseLLMResponse(fenced), { foo: 1 });
});

test('parseLLMResponse: strips bare ``` fenced blocks', () => {
  const fenced = '```\n{"foo": 2}\n```';
  assert.deepEqual(parseLLMResponse(fenced), { foo: 2 });
});

test('parseLLMResponse: extracts JSON from leading prose', () => {
  const noisy = 'Here is the profile:\n{"foo": 3}\nHope this helps!';
  assert.deepEqual(parseLLMResponse(noisy), { foo: 3 });
});

test('parseLLMResponse: handles nested objects', () => {
  const json = '{"dim": {"a": 0.1, "b": -0.5}}';
  const r = parseLLMResponse(json);
  assert.equal(r.dim.a, 0.1);
  assert.equal(r.dim.b, -0.5);
});

// ----------------------------------------------------------------------------
// parseLLMResponse: error paths
// ----------------------------------------------------------------------------

test('parseLLMResponse: throws on empty string', () => {
  assert.throws(() => parseLLMResponse(''), /non-empty string/);
});

test('parseLLMResponse: throws on non-string', () => {
  assert.throws(() => parseLLMResponse(null), /non-empty string/);
  assert.throws(() => parseLLMResponse(42), /non-empty string/);
});

test('parseLLMResponse: throws with diagnostic on malformed JSON', () => {
  assert.throws(() => parseLLMResponse('{not valid json'), /JSON\.parse failed/);
});

// ----------------------------------------------------------------------------
// PROMPT_VERSION is a stable contract
// ----------------------------------------------------------------------------

test('PROMPT_VERSION is a non-empty semver-like string', () => {
  assert.equal(typeof PROMPT_VERSION, 'string');
  assert.match(PROMPT_VERSION, /^\d+\.\d+\.\d+$/);
});
