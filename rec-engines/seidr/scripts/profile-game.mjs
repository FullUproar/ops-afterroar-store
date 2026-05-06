#!/usr/bin/env node
// scripts/profile-game.mjs
// ============================================================================
// CLI wrapper for the game-profile generation pipeline.
//
// Reads BGG metadata JSON from disk, calls the LLM (via Anthropic SDK or a
// mock for offline runs), validates the response, and (when --apply is set)
// writes to rec_seidr_game_profile.
//
// The pipeline core (src/profile-game.mjs) is pure and testable; this script
// is the I/O layer that wires file reads + LLM client + DB writes together.
//
// Usage:
//   # Dry run with mock LLM (ships canned reference profiles -- useful for
//   # smoke-testing the pipeline glue without burning tokens)
//   node scripts/profile-game.mjs \
//     --bgg-dir ../mimir/tests/fixtures/bgg \
//     --mock
//
//   # Real run against Anthropic API for one game
//   ANTHROPIC_API_KEY=... node scripts/profile-game.mjs \
//     --bgg-file ../mimir/tests/fixtures/bgg/167791.json \
//     --model claude-sonnet-4-6
//
//   # Real run, write to DB
//   ANTHROPIC_API_KEY=... DATABASE_URL=postgres://... node scripts/profile-game.mjs \
//     --bgg-dir path/to/bgg/files \
//     --model claude-sonnet-4-6 \
//     --apply
//
// CLI flags:
//   --bgg-file <path>       single BGG JSON file
//   --bgg-dir <path>        directory of BGG JSON files (one game per file)
//   --dimensions <path>     dimensions.json path (default: ../data/dimensions.json)
//   --model <name>          model identifier (default: claude-sonnet-4-6)
//   --mock                  use the mock LLM that returns reference profiles
//   --apply                 write validated profiles to DB (otherwise prints)
//   --max-concurrent <n>    not yet implemented; currently always sequential
// ============================================================================

import { readdirSync, readFileSync } from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  generateProfile,
  generateBatch,
  createMockLLMClient,
} from '../src/profile-game.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ----------------------------------------------------------------------------
// Argument parsing (lightweight; full arg parser is overkill for this script)
// ----------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {
    bggFile: null,
    bggDir: null,
    dimensions: resolve(__dirname, '..', 'data', 'dimensions.json'),
    model: 'claude-sonnet-4-6',
    mock: false,
    apply: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--bgg-file': args.bggFile = argv[++i]; break;
      case '--bgg-dir': args.bggDir = argv[++i]; break;
      case '--dimensions': args.dimensions = argv[++i]; break;
      case '--model': args.model = argv[++i]; break;
      case '--mock': args.mock = true; break;
      case '--apply': args.apply = true; break;
      default:
        throw new Error(`Unrecognized argument: ${a}`);
    }
  }
  return args;
}

// ----------------------------------------------------------------------------
// LLM clients
// ----------------------------------------------------------------------------

/**
 * Mock LLM client backed by data/reference-profiles.json. Looks up the
 * profile for the requested game_id and returns it as a JSON string.
 * Used for smoke-testing the pipeline without burning tokens.
 */
function buildReferenceMockClient() {
  const refPath = resolve(__dirname, '..', 'data', 'reference-profiles.json');
  const ref = JSON.parse(readFileSync(refPath, 'utf8'));
  const byId = new Map();
  for (const p of ref.profiles) {
    byId.set(p.game_id, p);
  }
  return createMockLLMClient(({ gameId }) => {
    const p = byId.get(gameId);
    if (!p) {
      throw new Error(`reference mock has no profile for game_id=${gameId}`);
    }
    // Reshape to the LLM-output contract (drop extra metadata, add stamps)
    return JSON.stringify({
      game_id: p.game_id,
      dim_vector: p.dim_vector,
      confidence_per_dim: p.confidence_per_dim,
      source_provenance: 'llm_generated',
      model_version: 'mock-reference',
      prompt_version: '1.0.0',
      narrative: p.narrative,
    });
  });
}

/**
 * Real Anthropic SDK client. Lazy-imports @anthropic-ai/sdk so the rest of
 * the pipeline runs without it installed.
 */
async function buildAnthropicClient(modelName) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY env var required for non-mock runs');
  }
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  return {
    generate: async (prompt) => {
      const response = await client.messages.create({
        model: modelName,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      });
      // pull text from the first text block
      const block = response.content.find(b => b.type === 'text');
      if (!block) {
        throw new Error('Anthropic response had no text block');
      }
      return block.text;
    },
  };
}

// ----------------------------------------------------------------------------
// Apply-to-DB layer (only invoked when --apply is set)
// ----------------------------------------------------------------------------

async function writeProfilesToDb(profiles, connStr) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: connStr });
  await client.connect();
  let written = 0;
  try {
    for (const p of profiles) {
      // Best-effort upsert by (game_id, profile_version=1). The schema
      // permits multiple versions; for v0 of this script we always write
      // version 1 and supersede manually if needed.
      await client.query(
        `INSERT INTO rec_seidr_game_profile
          (id, game_id, profile_version, dim_vector, confidence_per_dim,
           source_provenance, model_version, prompt_version)
         VALUES ($1, $2, 1, $3, $4, $5, $6, $7)
         ON CONFLICT (game_id, profile_version) DO UPDATE SET
           dim_vector = EXCLUDED.dim_vector,
           confidence_per_dim = EXCLUDED.confidence_per_dim,
           source_provenance = EXCLUDED.source_provenance,
           model_version = EXCLUDED.model_version,
           prompt_version = EXCLUDED.prompt_version`,
        [
          // id: synthesize from game_id (game_id * 1000 + version) so two
          // versions of the same game don't collide on PK
          p.game_id * 1000 + 1,
          p.game_id,
          p.dim_vector,
          p.confidence_per_dim,
          p.source_provenance,
          p.model_version || null,
          p.prompt_version || null,
        ]
      );
      written++;
    }
  } finally {
    await client.end();
  }
  return written;
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.bggFile && !args.bggDir) {
    throw new Error('Either --bgg-file <path> or --bgg-dir <path> is required');
  }

  // Load dimensions
  const dimensions = JSON.parse(readFileSync(args.dimensions, 'utf8'));

  // Load BGG metadata into an array of game objects
  const games = [];
  if (args.bggFile) {
    games.push(JSON.parse(readFileSync(args.bggFile, 'utf8')));
  } else {
    const files = readdirSync(args.bggDir).filter(f => f.endsWith('.json'));
    for (const f of files) {
      games.push(JSON.parse(readFileSync(join(args.bggDir, f), 'utf8')));
    }
  }
  console.log(`Loaded ${games.length} game(s) for profiling.`);

  // Build LLM client
  const llmClient = args.mock
    ? buildReferenceMockClient()
    : await buildAnthropicClient(args.model);
  console.log(args.mock ? 'Using mock LLM (reference profiles).' : `Using Anthropic ${args.model}.`);

  // Generate
  const { ok, failed } = await generateBatch(games, dimensions, llmClient, {
    modelVersionTag: args.mock ? 'mock-reference' : args.model,
  });

  console.log(`Generated ${ok.length} valid profile(s); ${failed.length} failure(s).`);
  for (const f of failed) {
    console.log(`  ✗ ${f.game_id} (${f.name}): ${f.error}`);
  }

  // Apply or print
  if (args.apply) {
    const connStr = process.env.DATABASE_URL;
    if (!connStr) {
      throw new Error('DATABASE_URL env var required for --apply');
    }
    const written = await writeProfilesToDb(ok, connStr);
    console.log(`Wrote ${written} profile(s) to rec_seidr_game_profile.`);
  } else {
    for (const p of ok) {
      console.log(`\n--- profile for game_id=${p.game_id} ---`);
      console.log(JSON.stringify(p, null, 2));
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('profile-game.mjs failed:', err.message);
    process.exit(1);
  });
}
