#!/usr/bin/env node
// scripts/run-rec.mjs
// ============================================================================
// Offline CLI runner for seidr recommendations.
//
// Loads a player profile (from quiz UI export) + reference profiles +
// optional BGG metadata for player-count filtering and designer cap;
// runs match() and prints ranked recommendations with natural-language
// explanations.
//
// Pure offline tool. No DB, no LLM, no network. Useful for:
//   - Validating the player profile from a quiz session before launching
//   - Smoke-testing the match() pipeline against the 7 reference profiles
//   - Demoing the recommender at game nights without needing accounts
//
// Usage:
//   # Use a saved player profile JSON, match against reference profiles
//   node scripts/run-rec.mjs --player-profile path/to/player-profile.json
//
//   # Specify a custom corpus of game profiles
//   node scripts/run-rec.mjs \
//     --player-profile player.json \
//     --game-profiles path/to/profiles.json
//
//   # Add BGG metadata for designer cap + player-count filter
//   node scripts/run-rec.mjs \
//     --player-profile player.json \
//     --bgg-dir ../mimir/tests/fixtures/bgg \
//     --player-count 4 \
//     --limit 5
//
//   # Custom example player (built-in archetype)
//   node scripts/run-rec.mjs --archetype heavy-strategist
//   node scripts/run-rec.mjs --archetype party-extravert
//   node scripts/run-rec.mjs --archetype coop-puzzler
//
// CLI flags:
//   --player-profile <path>  load player profile JSON (overrides --archetype)
//   --archetype <name>       use a built-in archetype as the player
//   --game-profiles <path>   path to game profiles JSON (default: data/reference-profiles.json)
//   --dimensions <path>      dimensions JSON (default: data/dimensions.json)
//   --bgg-dir <path>         optional BGG metadata directory (one .json per game)
//   --player-count <n>       optional hard filter
//   --exclude <id,id,...>    optional comma-separated game IDs to exclude
//   --limit <n>              top-K (default 10)
//   --no-diversify           skip MMR diversification
//   --detail short|rich      explanation detail (default rich)
//   --json                   output JSON instead of human-formatted text
// ============================================================================

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { match } from '../src/match.mjs';
import { explainAll } from '../src/explain.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ----------------------------------------------------------------------------
// Built-in player archetypes (handy for smoke-testing without a quiz file)
// ----------------------------------------------------------------------------

const ARCHETYPES = {
  'heavy-strategist': {
    label: 'Heavy strategist (long sessions, optimization-heavy, low conflict)',
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
  },
  'party-extravert': {
    label: 'Party extravert (large groups, light, humorous, fast)',
    dim_vector: {
      PSY_ACHIEVEMENT: -0.3, PSY_EXPLORATION: 0.0, PSY_SOCIAL: 0.9, PSY_KILLER: -0.2,
      PSY_OPENNESS: 0.4, PSY_CONSCIENTIOUSNESS: -0.4, PSY_EXTRAVERSION: 0.9,
      PSY_AGREEABLENESS: 0.5, PSY_NEUROTICISM: -0.3,
      SOC_COOP_COMP: -0.2, SOC_DIRECT_INDIRECT: 0.0, SOC_TRUST_BETRAYAL: -0.2,
      MEC_LUCK_SKILL: -0.3, MEC_COMPLEXITY: -0.8, MEC_STRATEGY: -0.5, MEC_ASYMMETRY: 0.2,
      AES_THEME_MECH: -0.2, AES_NARRATIVE: -0.6, AES_COMPONENT: -0.3,
      CTX_TIME: -0.7, CTX_NOSTALGIA: 0.0, CTX_PLAYER_COUNT: 0.7,
      EMO_TENSION: 0.0, EMO_HUMOR: 0.8,
    },
  },
  'coop-puzzler': {
    label: 'Cooperative puzzler (low conflict, peaceful, medium-light)',
    dim_vector: {
      PSY_ACHIEVEMENT: 0.3, PSY_EXPLORATION: 0.1, PSY_SOCIAL: 0.4, PSY_KILLER: -0.9,
      PSY_OPENNESS: 0.2, PSY_CONSCIENTIOUSNESS: 0.5, PSY_EXTRAVERSION: -0.2,
      PSY_AGREEABLENESS: 0.8, PSY_NEUROTICISM: 0.0,
      SOC_COOP_COMP: -0.7, SOC_DIRECT_INDIRECT: -0.7, SOC_TRUST_BETRAYAL: -0.7,
      MEC_LUCK_SKILL: 0.0, MEC_COMPLEXITY: -0.2, MEC_STRATEGY: 0.3, MEC_ASYMMETRY: 0.2,
      AES_THEME_MECH: 0.3, AES_NARRATIVE: -0.2, AES_COMPONENT: 0.3,
      CTX_TIME: -0.3, CTX_NOSTALGIA: 0.2, CTX_PLAYER_COUNT: -0.2,
      EMO_TENSION: 0.3, EMO_HUMOR: -0.2,
    },
  },
};

function buildArchetypeProfile(name) {
  const arch = ARCHETYPES[name];
  if (!arch) {
    throw new Error(`Unknown archetype: ${name}. Known: ${Object.keys(ARCHETYPES).join(', ')}`);
  }
  // Stamp confidence_vector at 0.85 across dims (typical post-quiz confidence)
  const confidence = {};
  for (const id of Object.keys(arch.dim_vector)) confidence[id] = 0.85;
  return {
    label: arch.label,
    dim_vector: arch.dim_vector,
    confidence_vector: confidence,
  };
}

// ----------------------------------------------------------------------------
// Argument parsing
// ----------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    playerProfile: null,
    archetype: null,
    gameProfiles: resolve(__dirname, '..', 'data', 'reference-profiles.json'),
    dimensions: resolve(__dirname, '..', 'data', 'dimensions.json'),
    bggDir: null,
    playerCount: null,
    exclude: [],
    limit: 10,
    diversify: true,
    detail: 'rich',
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--player-profile': args.playerProfile = argv[++i]; break;
      case '--archetype': args.archetype = argv[++i]; break;
      case '--game-profiles': args.gameProfiles = argv[++i]; break;
      case '--dimensions': args.dimensions = argv[++i]; break;
      case '--bgg-dir': args.bggDir = argv[++i]; break;
      case '--player-count': args.playerCount = parseInt(argv[++i], 10); break;
      case '--exclude':
        args.exclude = argv[++i].split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n));
        break;
      case '--limit': args.limit = parseInt(argv[++i], 10); break;
      case '--no-diversify': args.diversify = false; break;
      case '--detail': args.detail = argv[++i]; break;
      case '--json': args.json = true; break;
      default:
        throw new Error(`Unrecognized argument: ${a}`);
    }
  }
  return args;
}

// ----------------------------------------------------------------------------
// BGG metadata loader (for designer cap + player-count filter)
// ----------------------------------------------------------------------------

function loadBggMetadata(dir) {
  if (!dir || !existsSync(dir)) return null;
  const meta = {};
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const game = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    meta[game.id] = {
      designers: game.designers || [],
      minPlayers: game.minPlayers,
      maxPlayers: game.maxPlayers,
      name: game.name,
    };
  }
  return meta;
}

function buildGameNamesMap(bggMetadata) {
  if (!bggMetadata) return null;
  const m = new Map();
  for (const [id, meta] of Object.entries(bggMetadata)) {
    m.set(parseInt(id, 10), meta.name);
  }
  return m;
}

// ----------------------------------------------------------------------------
// Game-profile corpus loader. Accepts either:
//   - data/reference-profiles.json shape (top-level .profiles array)
//   - flat array of profiles
// ----------------------------------------------------------------------------

function loadGameProfiles(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.profiles)) return raw.profiles;
  throw new Error(`Game profiles file ${path} is neither a flat array nor has a .profiles array`);
}

// ----------------------------------------------------------------------------
// Output formatters
// ----------------------------------------------------------------------------

function formatHumanOutput(playerLabel, recsWithExplanations, gameNamesById, filtered) {
  const lines = [];
  lines.push(``);
  lines.push(`=== Seidr Recommendations ===`);
  if (playerLabel) lines.push(`Player: ${playerLabel}`);
  lines.push(``);
  recsWithExplanations.forEach((rec, idx) => {
    const name = gameNamesById?.get(rec.game_id) || `(BGG ${rec.game_id})`;
    lines.push(`${idx + 1}. ${name} [BGG ${rec.game_id}]   score=${rec.cosineSimilarity?.toFixed(3) ?? rec.score.toFixed(3)}`);
    lines.push(`   ${rec.explanation}`);
    lines.push(``);
  });
  if (filtered && filtered.length > 0) {
    lines.push(`Filtered out:`);
    for (const f of filtered) {
      const name = gameNamesById?.get(f.game_id) || `(BGG ${f.game_id})`;
      lines.push(`   ✗ ${name}: ${f.reason}${f.range ? ` ${JSON.stringify(f.range)}` : ''}`);
    }
  }
  return lines.join('\n');
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.playerProfile && !args.archetype) {
    args.archetype = 'heavy-strategist';
    console.error(`(no --player-profile or --archetype given; defaulting to archetype "heavy-strategist")`);
  }

  // Load player profile
  let playerProfile;
  let playerLabel = null;
  if (args.playerProfile) {
    playerProfile = JSON.parse(readFileSync(args.playerProfile, 'utf8'));
    playerLabel = playerProfile.label || `(loaded from ${args.playerProfile})`;
    // Quiz UI exports may not have confidence_vector under that exact name -- accommodate both
    if (!playerProfile.confidence_vector && playerProfile.confidence_per_dim) {
      playerProfile.confidence_vector = playerProfile.confidence_per_dim;
    }
  } else {
    playerProfile = buildArchetypeProfile(args.archetype);
    playerLabel = playerProfile.label;
  }

  // Load dimensions
  const dimensions = JSON.parse(readFileSync(args.dimensions, 'utf8'));

  // Load game profiles
  const gameProfiles = loadGameProfiles(args.gameProfiles);

  // Load optional BGG metadata
  const bggMetadata = loadBggMetadata(args.bggDir);
  const gameNamesById = buildGameNamesMap(bggMetadata);

  // Run the matcher
  const result = match(playerProfile, gameProfiles, {
    limit: args.limit,
    excludeGameIds: args.exclude,
    playerCount: args.playerCount,
    bggMetadata,
    diversify: args.diversify,
  });

  // Build explanations
  const gameProfilesById = new Map(gameProfiles.map(g => [g.game_id, g]));
  const explained = explainAll(result, dimensions, {
    detail: args.detail,
    playerProfile,
    gameProfilesById,
    gameNamesById,
  });

  if (args.json) {
    console.log(JSON.stringify({
      player_label: playerLabel,
      recommendations: explained,
      filtered: result.filtered,
      total_considered: result.totalConsidered,
    }, null, 2));
  } else {
    console.log(formatHumanOutput(playerLabel, explained, gameNamesById, result.filtered));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (err) {
    console.error('run-rec.mjs failed:', err.message);
    process.exit(1);
  }
}
