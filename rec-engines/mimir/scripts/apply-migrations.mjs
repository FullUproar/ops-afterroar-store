// apply-migrations.mjs
// ============================================================================
// Mimir migration runner. Plain Node ES module (no build step).
//
// Per SILO.md § 3 (rec_* schema namespace), this runner ENFORCES the rule
// that migrations may only touch rec_*-prefixed tables/indexes/schemas.
// Multi-layer safety:
//   1. Static SQL parse: every CREATE/ALTER/DROP/TRUNCATE target is checked
//      against /^rec_/i. Non-rec_ targets cause an abort BEFORE any DB call.
//   2. Production DB guard: refuses to run if DATABASE_URL's db name matches
//      /prod|production|-live/i unless --allow-prod is passed (Phase 0
//      should NEVER use --allow-prod).
//   3. Migration tracking: rec_migrations table records what's been applied;
//      re-running is idempotent.
//
// Usage:
//   DATABASE_URL=postgres://... node scripts/apply-migrations.mjs --dry-run
//   DATABASE_URL=postgres://... node scripts/apply-migrations.mjs
//
// Tests live in mimir/tests/apply-migrations.test.mjs and exercise the
// safety logic without requiring a live DB.
// ============================================================================

import { readdirSync, readFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');
const REC_TABLE_PATTERN = /^rec_/i;
const PROD_DB_PATTERNS = [/prod/i, /production/i, /-live/i];

// ----------------------------------------------------------------------------
// SQL parsing (approximate — sufficient for safety check, not a full parser)
// ----------------------------------------------------------------------------

/**
 * Strip line comments and find every CREATE/ALTER/DROP/TRUNCATE op + its
 * target table/index/schema name. Returns array of { op, target }.
 */
export function parseMigrationOps(sql) {
  const ops = [];
  const cleaned = sql
    .split('\n')
    .map(line => {
      // strip from -- to end of line, but preserve quoted strings (rough)
      const idx = line.indexOf('--');
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join('\n');

  const patterns = [
    {
      // create [unique] {index|table|schema} [if not exists] <name>
      re: /create\s+(?:unique\s+)?(?:index|table|schema)(?:\s+if\s+not\s+exists)?\s+([a-zA-Z_][\w]*)/gi,
      op: 'create',
    },
    {
      re: /alter\s+(?:table|schema|index)\s+(?:if\s+exists\s+)?([a-zA-Z_][\w]*)/gi,
      op: 'alter',
    },
    {
      re: /drop\s+(?:table|schema|index|column)\s+(?:if\s+exists\s+)?([a-zA-Z_][\w]*)/gi,
      op: 'drop',
    },
    {
      re: /truncate\s+(?:table\s+)?(?:only\s+)?([a-zA-Z_][\w]*)/gi,
      op: 'truncate',
    },
    {
      // insert into <table> ...
      // Detect INSERT targets so seed-data migrations can't sneak past the
      // rec_* namespace check. Without this rule a migration containing
      // `INSERT INTO users (...) VALUES (...)` would silently pass.
      re: /insert\s+into\s+(?:only\s+)?([a-zA-Z_][\w]*)/gi,
      op: 'insert',
    },
    {
      // delete from <table>
      re: /delete\s+from\s+(?:only\s+)?([a-zA-Z_][\w]*)/gi,
      op: 'delete',
    },
    {
      // update <table> set ...
      re: /update\s+(?:only\s+)?([a-zA-Z_][\w]*)\s+set\s/gi,
      op: 'update',
    },
  ];

  for (const { re, op } of patterns) {
    let m;
    while ((m = re.exec(cleaned)) !== null) {
      ops.push({ op, target: m[1] });
    }
  }

  return ops;
}

/**
 * Throw if any operation in the SQL targets a non-rec_* object.
 * This is the safety rail that protects the rest of the platform DB
 * from accidental Mimir blast radius.
 */
export function validateMigrationSafety(sql) {
  const ops = parseMigrationOps(sql);
  for (const { op, target } of ops) {
    if (!REC_TABLE_PATTERN.test(target)) {
      throw new Error(
        `Safety check failed: migration attempts to ${op} non-rec_ object "${target}". ` +
          `Mimir migrations may only touch rec_* names per SILO.md § 3 (schema namespace).`
      );
    }
  }
}

/**
 * Detect production-like DB names by URL inspection.
 * Errs on the side of false positives — better to refuse and force
 * --allow-prod than to accidentally apply migrations to prod.
 */
export function isProductionDb(connectionString) {
  // pull the db name from the URL: postgresql://user:pass@host:port/<dbname>?...
  const m = connectionString.match(/\/([^/?]+)(?:\?|$)/);
  const dbName = (m && m[1]) || '';
  return PROD_DB_PATTERNS.some(re => re.test(dbName));
}

export function listMigrationFiles(dir = MIGRATIONS_DIR) {
  return readdirSync(dir)
    .filter(f => extname(f) === '.sql')
    .sort();
}

// ----------------------------------------------------------------------------
// Main runner
// ----------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const allowProd = args.includes('--allow-prod');

  const connStr = process.env.DATABASE_URL;
  if (!connStr) {
    throw new Error('DATABASE_URL env var required');
  }

  if (isProductionDb(connStr) && !allowProd) {
    throw new Error(
      `Refusing to run against production-like database (URL contains prod/production/-live). ` +
        `Pass --allow-prod to override (NOT recommended for Mimir Phase 0).`
    );
  }

  const files = listMigrationFiles();
  console.log(`Found ${files.length} migration file(s): ${files.join(', ')}`);

  // SAFETY PASS: validate every migration BEFORE touching the DB.
  // If any single file fails, abort the whole run — don't apply some-but-not-all.
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    try {
      validateMigrationSafety(sql);
      console.log(`  ✓ ${file} passes safety check`);
    } catch (err) {
      throw new Error(`${file} failed safety check: ${err.message}`);
    }
  }

  if (dryRun) {
    console.log('Dry run complete. No DB changes made.');
    return;
  }

  // pg is imported lazily so dry-run + tests don't require the dependency
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: connStr });
  await client.connect();

  try {
    // Self-create the migration tracking table (also rec_* prefixed).
    await client.query(`
      create table if not exists rec_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    for (const file of files) {
      const { rows } = await client.query(
        'select 1 from rec_migrations where filename = $1',
        [file]
      );
      if (rows.length > 0) {
        console.log(`  - ${file} already applied; skipping`);
        continue;
      }

      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`  → applying ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('insert into rec_migrations (filename) values ($1)', [file]);
        await client.query('COMMIT');
        console.log(`    ✓ committed`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    console.log('All migrations applied successfully.');
  } finally {
    await client.end();
  }
}

// Only invoke main() when run directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Migration runner failed:', err.message);
    process.exit(1);
  });
}
