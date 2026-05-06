// explain.test.mjs
// ============================================================================
// Tests for the explanation generator. String-shape assertions on the
// produced sentences.
//
// Run with: node --test tests/
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  explain,
  buildContributors,
  formatList,
  composeLong,
} from '../src/explain.mjs';

const engineGame = {
  id: 100,
  name: 'EngineGame',
  weight: 3.0,
  minPlayers: 2,
  maxPlayers: 4,
  playingTime: 90,
  bggRank: 100,
  mechanics: [
    { id: 'm-engine', value: 'Engine Building' },
    { id: 'm-cards', value: 'Card Drafting' },
  ],
  categories: [{ id: 'c-strategy', value: 'Strategy' }],
  families: [],
  designers: [{ id: 'd-stegmaier', value: 'Jamey Stegmaier' }],
};

const tasteVectorEngineLover = {
  mechanics: { 'm-engine': 0.5, 'm-cards': 0.3, 'm-party': -0.2 },
  categories: { 'c-strategy': 0.6 },
  families: {},
  designers: { 'd-stegmaier': 1.0 },
  weightPreference: { mean: 3.0, std: 0.3, count: 3 },
};

// ----------------------------------------------------------------------------
// explain happy paths
// ----------------------------------------------------------------------------

test('explain: mechanic_match renders shared mechanic names', () => {
  const scored = {
    score: 5,
    reasonCodes: ['mechanic_match'],
    breakdown: { mechanicOverlap: 1.5 },
  };
  const result = explain(scored, engineGame, tasteVectorEngineLover);
  assert.match(result.short, /Engine Building/);
  assert.match(result.short, /Card Drafting/);
  assert.match(result.short, /you loved/);
});

test('explain: designer_match renders designer name', () => {
  const scored = {
    score: 5,
    reasonCodes: ['designer_match'],
    breakdown: { designerMatch: 1.0 },
  };
  const result = explain(scored, engineGame, tasteVectorEngineLover);
  assert.match(result.short, /Jamey Stegmaier/);
  assert.match(result.short, /you've enjoyed/);
});

test('explain: noped_explicitly returns veto immediately', () => {
  const scored = {
    score: -10,
    reasonCodes: ['noped_explicitly', 'mechanic_match'],
    breakdown: { nopedPenalty: -10 },
  };
  const result = explain(scored, engineGame, tasteVectorEngineLover);
  assert.match(result.short, /avoid/i);
  assert.match(result.long, /no-list/i);
  assert.deepEqual(result.contributors, []);
});

test('explain: empty reason codes returns fallback message', () => {
  const scored = { score: 0.5, reasonCodes: [], breakdown: {} };
  const result = explain(scored, engineGame, tasteVectorEngineLover);
  assert.match(result.short, /general recommendation/i);
  assert.match(result.long, /strong personal signal/i);
});

test('explain: multiple reasons compose into long sentence', () => {
  const scored = {
    score: 5,
    reasonCodes: ['mechanic_match', 'designer_match', 'length_fit'],
    breakdown: {
      mechanicOverlap: 1.5,
      designerMatch: 1.0,
      lengthFit: 1.0,
    },
  };
  const result = explain(scored, engineGame, tasteVectorEngineLover, {
    context: { minutesAvailable: 90 },
  });
  assert.match(result.long, /Engine Building/);
  assert.match(result.long, /Stegmaier/);
  assert.match(result.long, /90/);
  // Long should contain commas connecting fragments
  assert.ok(result.long.includes(','));
});

test('explain: length_fit uses time-window from context when available', () => {
  const scored = {
    score: 1,
    reasonCodes: ['length_fit'],
    breakdown: { lengthFit: 1.0 },
  };
  const result = explain(scored, engineGame, tasteVectorEngineLover, {
    context: { minutesAvailable: 120 },
  });
  assert.match(result.short, /90/);
  assert.match(result.short, /120/);
});

test('explain: player_count_violated names the mismatch', () => {
  const scored = {
    score: -1,
    reasonCodes: ['player_count_violated'],
    breakdown: { playerCountFit: 0 },
  };
  const result = explain(scored, engineGame, tasteVectorEngineLover, {
    context: { desiredPlayerCount: 8 },
  });
  assert.match(result.short, /8-player/);
  assert.match(result.short, /2.*4|2–4/); // "2-4" or "2–4" (unicode dash)
});

test('explain: mechanic_mismatch names the offending mechanics', () => {
  const partyGame = {
    id: 200,
    mechanics: [{ id: 'm-party', value: 'Party Game' }],
    categories: [],
    families: [],
    designers: [],
  };
  const scored = {
    score: -1,
    reasonCodes: ['mechanic_mismatch'],
    breakdown: { mechanicOverlap: -0.5 },
  };
  const result = explain(scored, partyGame, tasteVectorEngineLover);
  assert.match(result.short, /Party Game/);
  assert.match(result.short, /avoid/i);
});

test('explain: priority ordering puts positive matches before mismatches in long', () => {
  const scored = {
    score: 1,
    reasonCodes: ['mechanic_mismatch', 'designer_match'],
    breakdown: { mechanicOverlap: -0.3, designerMatch: 0.5 },
  };
  const result = explain(scored, engineGame, tasteVectorEngineLover);
  // designer_match should appear earlier in the long sentence than the mismatch
  const designerIdx = result.long.indexOf('Stegmaier');
  const mismatchIdx = result.long.toLowerCase().indexOf('avoid');
  assert.ok(designerIdx >= 0);
  // If both appear, designer comes first
  if (mismatchIdx >= 0) {
    assert.ok(designerIdx < mismatchIdx);
  }
});

// ----------------------------------------------------------------------------
// buildContributors
// ----------------------------------------------------------------------------

test('buildContributors: filters out small contributions', () => {
  const breakdown = {
    mechanicOverlap: 1.5,
    weightSimilarity: 0.01, // below threshold
    qualityPrior: 0.3,
  };
  const contribs = buildContributors(breakdown);
  assert.equal(contribs.length, 2);
  assert.equal(contribs.find(c => c.feature === 'weightSimilarity'), undefined);
});

test('buildContributors: sorts by absolute weight descending', () => {
  const breakdown = {
    a: 0.2,
    b: 1.5,
    c: -2.0,
    d: 0.8,
  };
  const contribs = buildContributors(breakdown);
  assert.deepEqual(
    contribs.map(c => c.feature),
    ['c', 'b', 'd', 'a']
  );
});

test('buildContributors: assigns source tags correctly', () => {
  const breakdown = {
    mechanicOverlap: 1.0,
    designerMatch: 0.5,
    weightSimilarity: 0.3,
    qualityPrior: 0.4,
    nopedPenalty: -10,
  };
  const contribs = buildContributors(breakdown);
  const sources = Object.fromEntries(contribs.map(c => [c.feature, c.source]));
  assert.equal(sources.mechanicOverlap, 'bgg_metadata');
  assert.equal(sources.designerMatch, 'bgg_metadata');
  assert.equal(sources.weightSimilarity, 'context_match');
  assert.equal(sources.qualityPrior, 'bgg_rank');
  assert.equal(sources.nopedPenalty, 'user_preference');
});

test('buildContributors: handles empty breakdown', () => {
  assert.deepEqual(buildContributors({}), []);
  assert.deepEqual(buildContributors(undefined), []);
});

// ----------------------------------------------------------------------------
// formatList
// ----------------------------------------------------------------------------

test('formatList: empty array', () => {
  assert.equal(formatList([]), '');
  assert.equal(formatList(null), '');
});

test('formatList: single item', () => {
  assert.equal(formatList(['A']), 'A');
});

test('formatList: two items uses "and"', () => {
  assert.equal(formatList(['A', 'B']), 'A and B');
});

test('formatList: three items uses Oxford comma', () => {
  assert.equal(formatList(['A', 'B', 'C']), 'A, B, and C');
});

test('formatList: four items uses Oxford comma', () => {
  assert.equal(formatList(['A', 'B', 'C', 'D']), 'A, B, C, and D');
});

// ----------------------------------------------------------------------------
// composeLong
// ----------------------------------------------------------------------------

test('composeLong: empty', () => {
  assert.equal(composeLong([]), '');
});

test('composeLong: single fragment', () => {
  assert.equal(composeLong(['shares X with you']), 'Shares X with you.');
});

test('composeLong: two fragments uses comma + and', () => {
  assert.equal(
    composeLong(['shares X', 'fits your time']),
    'Shares X, and fits your time.'
  );
});

test('composeLong: three fragments uses Oxford comma', () => {
  assert.equal(
    composeLong(['shares X', 'by Y', 'fits your time']),
    'Shares X, by Y, and fits your time.'
  );
});
