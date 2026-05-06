// fetch-bgg.mjs
// ============================================================================
// Mimir BGG metadata fetcher.
//
// Fetches game metadata from the BoardGameGeek XML API v2 for a list of
// BGG IDs and writes per-game JSON files to tmp/bgg/<id>.json (gitignored).
//
// This script does NOT write to any database. Sprint 1.1 will add a writer
// that takes the JSON output and inserts into rec_* tables.
//
// Usage:
//   node scripts/fetch-bgg.mjs --ids 1,30549,167791
//   node scripts/fetch-bgg.mjs --file ids.txt
//   node scripts/fetch-bgg.mjs --ids 167791 --dry-run
//
// BGG API:
//   - Endpoint: https://boardgamegeek.com/xmlapi2/thing?id=<id>&stats=1
//   - Supports comma-separated IDs (we batch 20 at a time)
//   - Sometimes returns 202 or 200 with a 'still processing' message;
//     we retry with exponential backoff in those cases.
//   - Polite rate: 1 req/sec sustained.
//   - Identify ourselves with a User-Agent per BGG TOS.
// ============================================================================

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BGG_API_BASE = 'https://boardgamegeek.com/xmlapi2/thing';
const OUTPUT_DIR = join(__dirname, '..', 'tmp', 'bgg');
const USER_AGENT =
  'AfterroarRecEngine/0.1 (+https://afterroar.me; mimir@afterroar.store)';
const BATCH_SIZE = 20;
const REQ_INTERVAL_MS = 1000; // 1 req/sec
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 2000;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseAttributeValue: false, // we coerce types ourselves where it matters
  isArray: name => {
    // BGG returns lists as repeated <link> / <name> elements.
    // Force them to arrays so single-element cases don't degrade to object.
    return ['link', 'name'].includes(name);
  },
});

// ----------------------------------------------------------------------------
// XML → internal schema
// ----------------------------------------------------------------------------

/**
 * Parse a BGG <items> response into structured game data.
 * Returns array of game objects with the shape Mimir's rec_* schema expects.
 */
export function parseBggResponse(xml) {
  const parsed = xmlParser.parse(xml);
  const items = parsed?.items?.item;
  if (!items) return [];

  const itemArray = Array.isArray(items) ? items : [items];
  return itemArray.map(extractGame);
}

function toIntOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function toFloatOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function extractGame(item) {
  const id = toIntOrNull(item['@_id']);
  const itemType = item['@_type']; // 'boardgame' | 'boardgameexpansion' | 'boardgameaccessory'

  // Name: primary one is the type='primary' name; fallback to first.
  const names = item.name || [];
  const primary = names.find(n => n['@_type'] === 'primary') || names[0];
  const name = primary?.['@_value'] || `BGG-${id}`;

  // Links: <link type="boardgamemechanic" id=".." value=".."/>
  const links = item.link || [];
  const linksByType = {};
  for (const link of links) {
    const type = link['@_type'];
    if (!linksByType[type]) linksByType[type] = [];
    linksByType[type].push({
      id: toIntOrNull(link['@_id']),
      value: link['@_value'],
    });
  }

  // Statistics (only present when ?stats=1)
  const stats = item.statistics?.ratings;
  const weight = toFloatOrNull(stats?.averageweight?.['@_value']);

  // Rank: ranks/rank, find the overall (name='boardgame').
  let bggRank = null;
  const ranks = stats?.ranks?.rank;
  if (ranks) {
    const rankArr = Array.isArray(ranks) ? ranks : [ranks];
    const overall = rankArr.find(r => r['@_name'] === 'boardgame');
    if (overall && overall['@_value'] !== 'Not Ranked') {
      bggRank = toIntOrNull(overall['@_value']);
    }
  }

  return {
    id,
    source: 'bgg',
    type: itemType,
    name,
    year: toIntOrNull(item.yearpublished?.['@_value']),
    weight,
    minPlayers: toIntOrNull(item.minplayers?.['@_value']),
    maxPlayers: toIntOrNull(item.maxplayers?.['@_value']),
    playingTime: toIntOrNull(item.playingtime?.['@_value']),
    minPlayTime: toIntOrNull(item.minplaytime?.['@_value']),
    maxPlayTime: toIntOrNull(item.maxplaytime?.['@_value']),
    minAge: toIntOrNull(item.minage?.['@_value']),
    bggRank,
    designers: linksByType.boardgamedesigner || [],
    artists: linksByType.boardgameartist || [],
    publishers: linksByType.boardgamepublisher || [],
    mechanics: linksByType.boardgamemechanic || [],
    categories: linksByType.boardgamecategory || [],
    families: linksByType.boardgamefamily || [],
    expansions: linksByType.boardgameexpansion || [],
    fetchedAt: new Date().toISOString(),
  };
}

// ----------------------------------------------------------------------------
// HTTP fetcher with backoff
// ----------------------------------------------------------------------------

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchBatch(ids) {
  const url = `${BGG_API_BASE}?id=${ids.join(',')}&stats=1`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
      });
    } catch (err) {
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      console.warn(
        `  ! network error (${err.message}), backing off ${backoff}ms (attempt ${attempt}/${MAX_RETRIES})`
      );
      await sleep(backoff);
      continue;
    }

    // 202 = BGG queued the request, hasn't processed yet
    if (res.status === 202) {
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      console.warn(
        `  ! BGG queued (202), backing off ${backoff}ms (attempt ${attempt}/${MAX_RETRIES})`
      );
      await sleep(backoff);
      continue;
    }

    // 429 / 5xx: retryable
    if (res.status === 429 || res.status >= 500) {
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      console.warn(
        `  ! got ${res.status}, backing off ${backoff}ms (attempt ${attempt}/${MAX_RETRIES})`
      );
      await sleep(backoff);
      continue;
    }

    if (!res.ok) {
      throw new Error(`BGG returned ${res.status}: ${res.statusText}`);
    }

    const xml = await res.text();

    // BGG sometimes returns 200 with a <message> body when still processing.
    // Detect: response has no <item> elements but DOES have an <items> wrapper.
    if (!xml.includes('<item ')) {
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      console.warn(
        `  ! BGG returned 200 but no items, backing off ${backoff}ms (attempt ${attempt}/${MAX_RETRIES})`
      );
      await sleep(backoff);
      continue;
    }

    return xml;
  }

  throw new Error(
    `BGG fetch failed after ${MAX_RETRIES} attempts for ids: ${ids.join(',')}`
  );
}

// ----------------------------------------------------------------------------
// CLI / main
// ----------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { ids: null, file: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ids') args.ids = argv[++i];
    else if (a === '--file') args.file = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function printUsage() {
  console.log(`Usage:
  node scripts/fetch-bgg.mjs --ids 1,30549,167791
  node scripts/fetch-bgg.mjs --file ids.txt
  node scripts/fetch-bgg.mjs --ids 167791 --dry-run

Output: tmp/bgg/<id>.json (one file per game, gitignored).
Rate-limited to ~1 req/sec; batches 20 ids per request.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  let ids;
  if (args.ids) {
    ids = args.ids
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => Number.isFinite(n));
  } else if (args.file) {
    const content = readFileSync(args.file, 'utf8');
    ids = content
      .split(/\s+/)
      .map(s => parseInt(s.trim(), 10))
      .filter(n => Number.isFinite(n));
  } else {
    printUsage();
    throw new Error('Specify --ids <list> or --file <path>');
  }

  if (ids.length === 0) {
    throw new Error('No valid BGG IDs provided');
  }

  console.log(
    `Fetching ${ids.length} BGG IDs in batches of ${BATCH_SIZE} at ~1 req/sec...`
  );

  if (!args.dryRun && !existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let totalGames = 0;
  let totalErrors = 0;

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(ids.length / BATCH_SIZE);
    console.log(`Batch ${batchNum}/${totalBatches}: ${batch.length} ids`);

    if (args.dryRun) {
      console.log(`  (dry-run; would fetch ${batch.join(',')})`);
      continue;
    }

    try {
      const xml = await fetchBatch(batch);
      const games = parseBggResponse(xml);
      console.log(`  ✓ parsed ${games.length} games`);

      for (const game of games) {
        if (!game.id) {
          console.warn(`  ! skipping game with no id`);
          continue;
        }
        const path = join(OUTPUT_DIR, `${game.id}.json`);
        writeFileSync(path, JSON.stringify(game, null, 2));
        totalGames++;
      }
    } catch (err) {
      console.error(`  ✗ batch failed: ${err.message}`);
      totalErrors++;
    }

    // Rate limit: don't sleep after the last batch
    if (i + BATCH_SIZE < ids.length) {
      await sleep(REQ_INTERVAL_MS);
    }
  }

  console.log(
    `Done. ${totalGames} games written to ${OUTPUT_DIR}, ${totalErrors} batch errors.`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('BGG fetcher failed:', err.message);
    process.exit(1);
  });
}
