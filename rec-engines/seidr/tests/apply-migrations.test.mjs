// apply-migrations.test.mjs
// ============================================================================
// Tests for the Seidr migration runner.
//
// The runner code itself is a duplicate of mimir's runner per SILO.md § 8
// (engines do not import from each other). Mimir has exhaustive tests for
// the parser + safety harness; here we focus on seidr-specific assertions:
//   - seidr's 0001 migration is parseable and passes the safety harness
//   - it contains exactly the expected number of CREATE statements
//   - listMigrationFiles finds it
//   - it is additive only (no DROP/ALTER/DELETE/TRUNCATE/INSERT)
//
// Run with: node --test tests/
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseMigrationOps,
  validateMigrationSafety,
  isProductionDb,
  listMigrationFiles,
} from '../scripts/apply-migrations.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

// ----------------------------------------------------------------------------
// Smoke: runner exports work
// ----------------------------------------------------------------------------

test('runner exports parseMigrationOps + validateMigrationSafety + isProductionDb + listMigrationFiles', () => {
  assert.equal(typeof parseMigrationOps, 'function');
  assert.equal(typeof validateMigrationSafety, 'function');
  assert.equal(typeof isProductionDb, 'function');
  assert.equal(typeof listMigrationFiles, 'function');
});

// ----------------------------------------------------------------------------
// 0001_seidr_tables.sql: discoverable, parseable, safe
// ----------------------------------------------------------------------------

test('listMigrationFiles finds 0001_seidr_tables.sql', () => {
  const files = listMigrationFiles(MIGRATIONS_DIR);
  assert.ok(files.includes('0001_seidr_tables.sql'),
    `expected 0001_seidr_tables.sql in listMigrationFiles output, got: ${files.join(', ')}`);
});

test('listMigrationFiles returns files in lex order', () => {
  const files = listMigrationFiles(MIGRATIONS_DIR);
  const sorted = [...files].sort();
  assert.deepEqual(files, sorted);
});

test('0001_seidr_tables.sql parses cleanly', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '0001_seidr_tables.sql'), 'utf8');
  const ops = parseMigrationOps(sql);
  assert.ok(ops.length > 0);
});

test('0001_seidr_tables.sql passes safety harness (all rec_* targets)', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '0001_seidr_tables.sql'), 'utf8');
  // Should not throw
  validateMigrationSafety(sql);
});

test('0001_seidr_tables.sql creates exactly 3 tables + 3 indexes', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '0001_seidr_tables.sql'), 'utf8');
  const ops = parseMigrationOps(sql);
  const creates = ops.filter(o => o.op === 'create');
  // 3 CREATE TABLE + 3 CREATE INDEX = 6 total
  assert.equal(creates.length, 6, `expected 6 CREATE ops, got ${creates.length}: ${JSON.stringify(creates)}`);
});

test('0001_seidr_tables.sql creates the 3 expected tables by name', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '0001_seidr_tables.sql'), 'utf8');
  const ops = parseMigrationOps(sql);
  const tableNames = ops.filter(o => o.op === 'create').map(o => o.target);
  assert.ok(tableNames.includes('rec_seidr_player_profile'));
  assert.ok(tableNames.includes('rec_seidr_game_profile'));
  assert.ok(tableNames.includes('rec_seidr_response'));
});

test('0001_seidr_tables.sql is additive only (zero destructive ops)', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '0001_seidr_tables.sql'), 'utf8');
  const ops = parseMigrationOps(sql);
  const destructive = ops.filter(o => ['drop', 'truncate', 'alter'].includes(o.op));
  assert.equal(destructive.length, 0, `unexpected destructive ops: ${JSON.stringify(destructive)}`);
});

test('0001_seidr_tables.sql every target is rec_*-prefixed', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '0001_seidr_tables.sql'), 'utf8');
  const ops = parseMigrationOps(sql);
  for (const { target } of ops) {
    assert.match(target, /^rec_/i, `expected rec_*-prefixed target, got: ${target}`);
  }
});

test('0001_seidr_tables.sql every target is engine-prefixed (rec_seidr_*)', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '0001_seidr_tables.sql'), 'utf8');
  const ops = parseMigrationOps(sql);
  for (const { target } of ops) {
    assert.match(target, /^rec_seidr_/i, `expected rec_seidr_*-prefixed target (engine namespace), got: ${target}`);
  }
});

// ----------------------------------------------------------------------------
// Production DB guard: same as mimir; smoke-test that seidr inherits it
// ----------------------------------------------------------------------------

test('isProductionDb: rejects "prod" in db name', () => {
  assert.equal(isProductionDb('postgres://user:pass@host:5432/myprod-db'), true);
});

test('isProductionDb: rejects "production"', () => {
  assert.equal(isProductionDb('postgres://user@host:5432/production'), true);
});

test('isProductionDb: rejects "-live"', () => {
  assert.equal(isProductionDb('postgres://user@host:5432/app-live'), true);
});

test('isProductionDb: accepts dev/staging/sandbox', () => {
  assert.equal(isProductionDb('postgres://user@host:5432/dev'), false);
  assert.equal(isProductionDb('postgres://user@host:5432/staging'), false);
  assert.equal(isProductionDb('postgres://user@host:5432/seidr_sandbox'), false);
});

// ----------------------------------------------------------------------------
// Hostile-migration rejection: defense in depth
// ----------------------------------------------------------------------------

test('safety harness rejects DROP TABLE users', () => {
  assert.throws(
    () => validateMigrationSafety('drop table users;'),
    /Safety check failed/
  );
});

test('safety harness rejects ALTER on non-rec table', () => {
  assert.throws(
    () => validateMigrationSafety('alter table accounts add column foo int;'),
    /Safety check failed/
  );
});

test('safety harness rejects mixed: rec_* allowed but non-rec_ also present', () => {
  const sql = `
    create table rec_seidr_legit (id int);
    drop table user_secrets;
  `;
  assert.throws(() => validateMigrationSafety(sql), /Safety check failed/);
});
