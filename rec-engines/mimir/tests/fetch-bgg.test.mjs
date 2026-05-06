// fetch-bgg.test.mjs
// ============================================================================
// Tests for the BGG metadata fetcher's parsing logic. Pure parsing tests —
// no network calls. Run with: node --test tests/
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBggResponse } from '../scripts/fetch-bgg.mjs';

// Sample XML mirroring BGG's actual response shape for ?id=167791&stats=1
// (Terraforming Mars). Trimmed for size; keeps every field types we care about.
const SAMPLE_XML = `<?xml version="1.0" encoding="utf-8"?>
<items termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
  <item type="boardgame" id="167791">
    <thumbnail>https://example.com/thumb.png</thumbnail>
    <name type="primary" sortindex="1" value="Terraforming Mars"/>
    <name type="alternate" sortindex="1" value="Marte: La terraformazione"/>
    <yearpublished value="2016"/>
    <minplayers value="1"/>
    <maxplayers value="5"/>
    <playingtime value="120"/>
    <minplaytime value="120"/>
    <maxplaytime value="120"/>
    <minage value="12"/>
    <link type="boardgamecategory" id="1015" value="Economic"/>
    <link type="boardgamecategory" id="1016" value="Environmental"/>
    <link type="boardgamemechanic" id="2041" value="Drafting"/>
    <link type="boardgamemechanic" id="2664" value="Tile Placement"/>
    <link type="boardgamefamily" id="65191" value="Series: Terraforming Mars"/>
    <link type="boardgamedesigner" id="9220" value="Jacob Fryxelius"/>
    <link type="boardgameartist" id="54168" value="Isaac Fryxelius"/>
    <statistics page="1">
      <ratings>
        <averageweight value="3.2356"/>
        <ranks>
          <rank type="subtype" id="1" name="boardgame" friendlyname="Board Game Rank" value="4" bayesaverage="8.13289"/>
          <rank type="family" id="5497" name="strategygames" friendlyname="Strategy Game Rank" value="3"/>
        </ranks>
      </ratings>
    </statistics>
  </item>
</items>`;

// ----------------------------------------------------------------------------
// Single-item happy path
// ----------------------------------------------------------------------------

test('parseBggResponse: extracts core fields from sample XML', () => {
  const games = parseBggResponse(SAMPLE_XML);
  assert.equal(games.length, 1);

  const g = games[0];
  assert.equal(g.id, 167791);
  assert.equal(g.source, 'bgg');
  assert.equal(g.type, 'boardgame');
  assert.equal(g.name, 'Terraforming Mars');
  assert.equal(g.year, 2016);
  assert.equal(g.minPlayers, 1);
  assert.equal(g.maxPlayers, 5);
  assert.equal(g.playingTime, 120);
  assert.equal(g.minPlayTime, 120);
  assert.equal(g.maxPlayTime, 120);
  assert.equal(g.minAge, 12);
  assert.equal(g.weight, 3.2356);
  assert.equal(g.bggRank, 4);
  assert.ok(g.fetchedAt); // ISO timestamp
});

test('parseBggResponse: extracts mechanics with id+value', () => {
  const games = parseBggResponse(SAMPLE_XML);
  assert.equal(games[0].mechanics.length, 2);
  assert.deepEqual(games[0].mechanics, [
    { id: 2041, value: 'Drafting' },
    { id: 2664, value: 'Tile Placement' },
  ]);
});

test('parseBggResponse: extracts categories', () => {
  const games = parseBggResponse(SAMPLE_XML);
  assert.equal(games[0].categories.length, 2);
  assert.equal(games[0].categories[0].value, 'Economic');
  assert.equal(games[0].categories[1].value, 'Environmental');
});

test('parseBggResponse: extracts designers', () => {
  const games = parseBggResponse(SAMPLE_XML);
  assert.equal(games[0].designers.length, 1);
  assert.equal(games[0].designers[0].id, 9220);
  assert.equal(games[0].designers[0].value, 'Jacob Fryxelius');
});

test('parseBggResponse: extracts families', () => {
  const games = parseBggResponse(SAMPLE_XML);
  assert.equal(games[0].families.length, 1);
});

test('parseBggResponse: extracts artists', () => {
  const games = parseBggResponse(SAMPLE_XML);
  assert.equal(games[0].artists.length, 1);
});

// ----------------------------------------------------------------------------
// Edge cases
// ----------------------------------------------------------------------------

test('parseBggResponse: handles "Not Ranked" gracefully', () => {
  const xml = SAMPLE_XML.replace('value="4" bayesaverage', 'value="Not Ranked" bayesaverage');
  const games = parseBggResponse(xml);
  assert.equal(games[0].bggRank, null);
});

test('parseBggResponse: handles multi-item response', () => {
  const multi = `<?xml version="1.0" encoding="utf-8"?>
<items>
  <item type="boardgame" id="1">
    <name type="primary" value="A"/>
    <yearpublished value="2020"/>
  </item>
  <item type="boardgame" id="2">
    <name type="primary" value="B"/>
    <yearpublished value="2021"/>
  </item>
</items>`;
  const games = parseBggResponse(multi);
  assert.equal(games.length, 2);
  assert.equal(games[0].id, 1);
  assert.equal(games[0].name, 'A');
  assert.equal(games[1].id, 2);
  assert.equal(games[1].name, 'B');
});

test('parseBggResponse: handles minimal item without optional fields', () => {
  const minimal = `<?xml version="1.0"?>
<items>
  <item type="boardgame" id="42">
    <name type="primary" value="Minimal Game"/>
  </item>
</items>`;
  const games = parseBggResponse(minimal);
  assert.equal(games.length, 1);
  const g = games[0];
  assert.equal(g.id, 42);
  assert.equal(g.name, 'Minimal Game');
  assert.equal(g.year, null);
  assert.equal(g.weight, null);
  assert.equal(g.bggRank, null);
  assert.equal(g.minPlayers, null);
  assert.deepEqual(g.mechanics, []);
  assert.deepEqual(g.categories, []);
  assert.deepEqual(g.designers, []);
});

test('parseBggResponse: returns [] for empty/no-item response', () => {
  assert.deepEqual(parseBggResponse('<?xml version="1.0"?><items></items>'), []);
});

test('parseBggResponse: returns [] for unrelated XML', () => {
  assert.deepEqual(parseBggResponse('<?xml version="1.0"?><foo/>'), []);
});

test('parseBggResponse: handles single mechanic (single-element link)', () => {
  const xml = `<?xml version="1.0"?>
<items>
  <item type="boardgame" id="99">
    <name type="primary" value="Solo Mechanic Game"/>
    <link type="boardgamemechanic" id="1234" value="Roll/Spin and Move"/>
  </item>
</items>`;
  const games = parseBggResponse(xml);
  assert.equal(games.length, 1);
  assert.equal(games[0].mechanics.length, 1);
  assert.equal(games[0].mechanics[0].value, 'Roll/Spin and Move');
});
