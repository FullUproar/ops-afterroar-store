// run-rec.mjs
// ============================================================================
// Offline driver for the Mimir recommender.
//
// Loads BGG metadata from tmp/bgg/*.json (populated by fetch-bgg.mjs),
// constructs a recommendation request from CLI flags, calls recommend(),
// and prints a human-readable list of results.
//
// Use this for offline eval: ship a few requests, eyeball the output,
// flag any subtle wrongness before going near a real surface.
//
// Usage:
//   node scripts/run-rec.mjs --loved 167791,266192 --noped 178900
//   node scripts/run-rec.mjs --loved 100,101 --players 4 --minutes 90 --limit 5
//   node scripts/run-rec.mjs --loved 100 --explain rich
//
// Prereq: tmp/bgg/ must contain JSON files. Run scripts/fetch-bgg.mjs first.
// ============================================================================

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recommend } from '../src/recommend.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BGG_JSON_DIR = join(__dirname, '..', 'tmp', 'bgg');

function parseArgs(argv) {
  const args = {
    loved: [],
    noped: [],
    players: null,
    minutes: null,
    limit: 10,
    explain: 'long',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--loved') args.loved = parseInts(argv[++i]);
    else if (a === '--noped') args.noped = parseInts(argv[++i]);
    else if (a === '--players') args.players = parseInt(argv[++i], 10);
    else if (a === '--minutes') args.minutes = parseInt(argv[++i], 10);
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10);
    else if (a === '--explain') args.explain = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function parseInts(s) {
  return (s || '')
    .split(',')
    .map(x => parseInt(x.trim(), 10))
    .filter(n => Number.isFinite(n));
}

function loadGames() {
  if (!existsSync(BGG_JSON_DIR)) {
    throw new Error(
      `Game metadata directory not found: ${BGG_JSON_DIR}\n` +
        `Run scripts/fetch-bgg.mjs --file data/seed-bgg-ids.txt first.`
    );
  }
  const map = new Map();
  const files = readdirSync(BGG_JSON_DIR).filter(f => f.endsWith('.json'));
  for (const f of files) {
    try {
      const game = JSON.parse(readFileSync(join(BGG_JSON_DIR, f), 'utf8'));
      if (game.id) map.set(game.id, game);
    } catch (err) {
      console.warn(`  ! Failed to load ${f}: ${err.message}`);
    }
  }
  return map;
}

function printUsage() {
  console.log(`Usage:
  node scripts/run-rec.mjs --loved <ids> [--noped <ids>] [options]

Options:
  --loved 100,101,200      Comma-separated BGG IDs the player loves
  --noped 300,400          Comma-separated BGG IDs to avoid
  --players N              Desired player count
  --minutes M              Available minutes
  --limit N                Max results (default 10)
  --explain short|long|rich
                           Explanation verbosity (default long)

Prereq: tmp/bgg/ must be populated. Run:
  node scripts/fetch-bgg.mjs --file data/seed-bgg-ids.txt
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  if (args.loved.length === 0 && args.noped.length === 0) {
    printUsage();
    process.exit(1);
  }

  console.log(`Loading games from ${BGG_JSON_DIR}...`);
  let gameMetadata;
  try {
    gameMetadata = loadGames();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  if (gameMetadata.size === 0) {
    console.error(`No game metadata found. Run fetch-bgg.mjs first.`);
    process.exit(1);
  }
  console.log(`Loaded ${gameMetadata.size} games.\n`);

  // Verify seed games are present in metadata
  for (const id of [...args.loved, ...args.noped]) {
    if (!gameMetadata.has(id)) {
      console.warn(`  ! Seed id ${id} not found in metadata; skipping.`);
    }
  }

  const request = {
    surface: 'hq_picker',
    caller: { player_id: 'offline-test' },
    context: {
      seed_loved: args.loved,
      seed_noped: args.noped,
      ...(args.players != null ? { desired_player_count: args.players } : {}),
      ...(args.minutes != null ? { minutes_available: args.minutes } : {}),
    },
    options: {
      limit: args.limit,
      explain: args.explain,
    },
  };

  const response = recommend(request, gameMetadata);

  console.log('=== Recommendation Response ===');
  console.log(`request_id:      ${response.request_id}`);
  console.log(`ranker_version:  ${response.ranker_version}`);
  console.log(`results count:   ${response.results.length}\n`);

  if (response.results.length === 0) {
    console.log('(No recommendations to show.)');
    return;
  }

  for (const [i, r] of response.results.entries()) {
    console.log(`${i + 1}. ${r.game_name} (id=${r.game_id})`);
    console.log(
      `   score=${r.score.toFixed(3)}   confidence=${r.confidence.toFixed(2)}`
    );
    console.log(`   ${r.explanation.natural_language}`);
    if (r.explanation.contributors) {
      const top3 = r.explanation.contributors.slice(0, 3);
      console.log(
        `   contributors: ${top3
          .map(c => `${c.feature}=${c.weight.toFixed(2)}`)
          .join(', ')}`
      );
    }
    console.log();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
