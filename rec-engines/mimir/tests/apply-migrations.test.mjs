// apply-migrations.test.mjs
// ============================================================================
// Tests for the Mimir migration runner. Uses node:test (built-in).
// No live DB required — these are pure parsing/safety tests.
//
// Run with: node --test tests/
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseMigrationOps,
  validateMigrationSafety,
  isProductionDb,
  listMigrationFiles,
} from '../scripts/apply-migrations.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ----------------------------------------------------------------------------
// parseMigrationOps
// ----------------------------------------------------------------------------

test('parseMigrationOps: detects CREATE TABLE', () => {
  const ops = parseMigrationOps('create table if not exists rec_foo (id int);');
  assert.deepEqual(ops, [{ op: 'create', target: 'rec_foo' }]);
});

test('parseMigrationOps: detects DROP TABLE', () => {
  const ops = parseMigrationOps('drop table users;');
  assert.deepEqual(ops, [{ op: 'drop', target: 'users' }]);
});

test('parseMigrationOps: detects ALTER TABLE', () => {
  const ops = parseMigrationOps('alter table accounts add column foo int;');
  assert.deepEqual(ops, [{ op: 'alter', target: 'accounts' }]);
});

test('parseMigrationOps: detects TRUNCATE', () => {
  const ops = parseMigrationOps('truncate users;');
  assert.deepEqual(ops, [{ op: 'truncate', target: 'users' }]);
});

test('parseMigrationOps: detects INSERT INTO', () => {
  const ops = parseMigrationOps("insert into rec_taxonomy (id, name) values (1, 'foo');");
  assert.deepEqual(ops, [{ op: 'insert', target: 'rec_taxonomy' }]);
});

test('parseMigrationOps: detects DELETE FROM', () => {
  const ops = parseMigrationOps('delete from users where id = 5;');
  assert.deepEqual(ops, [{ op: 'delete', target: 'users' }]);
});

test('parseMigrationOps: detects UPDATE ... SET', () => {
  const ops = parseMigrationOps('update users set name = \'foo\' where id = 1;');
  assert.deepEqual(ops, [{ op: 'update', target: 'users' }]);
});

test('parseMigrationOps: detects INSERT with ONLY keyword', () => {
  const ops = parseMigrationOps('insert into only rec_foo values (1);');
  assert.deepEqual(ops, [{ op: 'insert', target: 'rec_foo' }]);
});

test('validateMigrationSafety: rejects INSERT into non-rec_ table', () => {
  assert.throws(
    () => validateMigrationSafety("insert into users (id) values (1);"),
    /Safety check failed.*insert.*users/
  );
});

test('validateMigrationSafety: accepts INSERT into rec_* table', () => {
  // Should not throw
  validateMigrationSafety("insert into rec_taxonomy (id, name) values (1, 'foo');");
});

test('validateMigrationSafety: rejects DELETE FROM non-rec_ table', () => {
  assert.throws(
    () => validateMigrationSafety('delete from accounts where id = 1;'),
    /Safety check failed.*delete.*accounts/
  );
});

test('validateMigrationSafety: rejects UPDATE on non-rec_ table', () => {
  assert.throws(
    () => validateMigrationSafety("update users set name = 'x' where id = 1;"),
    /Safety check failed.*update.*users/
  );
});

test('parseMigrationOps: ignores SQL in line comments', () => {
  const ops = parseMigrationOps('-- drop table users;\ncreate table rec_foo (id int);');
  assert.deepEqual(ops, [{ op: 'create', target: 'rec_foo' }]);
});

test('parseMigrationOps: detects CREATE INDEX', () => {
  const ops = parseMigrationOps('create index if not exists rec_foo_idx on rec_foo (id);');
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, 'create');
  assert.equal(ops[0].target, 'rec_foo_idx');
});

test('parseMigrationOps: detects multiple statements', () => {
  const sql = `
    create table if not exists rec_a (id int);
    create table if not exists rec_b (id int);
    create index if not exists rec_a_idx on rec_a (id);
  `;
  const ops = parseMigrationOps(sql);
  assert.equal(ops.length, 3);
  assert.deepEqual(
    ops.map(o => o.target).sort(),
    ['rec_a', 'rec_a_idx', 'rec_b'].sort()
  );
});

// ----------------------------------------------------------------------------
// validateMigrationSafety
// ----------------------------------------------------------------------------

test('validateMigrationSafety: passes valid rec_ migration', () => {
  assert.doesNotThrow(() =>
    validateMigrationSafety('create table rec_foo (id int);')
  );
});

test('validateMigrationSafety: rejects DROP on non-rec_ table', () => {
  assert.throws(
    () => validateMigrationSafety('drop table users;'),
    /Safety check failed/
  );
});

test('validateMigrationSafety: rejects CREATE on non-rec_ table', () => {
  assert.throws(
    () => validateMigrationSafety('create table users (id int);'),
    /Safety check failed/
  );
});

test('validateMigrationSafety: rejects ALTER on non-rec_ table', () => {
  assert.throws(
    () => validateMigrationSafety('alter table accounts add column foo int;'),
    /Safety check failed/
  );
});

test('validateMigrationSafety: rejects TRUNCATE on non-rec_ table', () => {
  assert.throws(
    () => validateMigrationSafety('truncate users;'),
    /Safety check failed/
  );
});

test('validateMigrationSafety: rejects mixed valid+invalid statements', () => {
  assert.throws(
    () => validateMigrationSafety(`
      create table rec_foo (id int);
      drop table users;
    `),
    /Safety check failed/
  );
});

// ----------------------------------------------------------------------------
// isProductionDb
// ----------------------------------------------------------------------------

test('isProductionDb: detects "prod" in db name', () => {
  assert.equal(
    isProductionDb('postgresql://user:pass@host:5432/afterroar-prod'),
    true
  );
});

test('isProductionDb: detects "production" in db name', () => {
  assert.equal(
    isProductionDb('postgresql://user:pass@host:5432/production'),
    true
  );
});

test('isProductionDb: detects "-live" in db name', () => {
  assert.equal(
    isProductionDb('postgresql://user:pass@host:5432/afterroar-live'),
    true
  );
});

test('isProductionDb: allows dev/staging/test names', () => {
  assert.equal(
    isProductionDb('postgresql://user:pass@host:5432/afterroar-dev'),
    false
  );
  assert.equal(
    isProductionDb('postgresql://user:pass@host:5432/afterroar-staging'),
    false
  );
  assert.equal(
    isProductionDb('postgresql://user:pass@host:5432/mimir-test'),
    false
  );
  assert.equal(
    isProductionDb('postgresql://user:pass@host:5432/mimir-branch-pr-42'),
    false
  );
});

// ----------------------------------------------------------------------------
// Integration: 0001 migration
// ----------------------------------------------------------------------------

test('integration: 0001 migration parses cleanly and is safe', () => {
  const sql = readFileSync(
    join(__dirname, '..', 'migrations', '0001_create_rec_tables.sql'),
    'utf8'
  );
  assert.doesNotThrow(() => validateMigrationSafety(sql));
});

test('integration: 0001 migration has expected number of CREATE statements', () => {
  const sql = readFileSync(
    join(__dirname, '..', 'migrations', '0001_create_rec_tables.sql'),
    'utf8'
  );
  const ops = parseMigrationOps(sql);
  const createCount = ops.filter(o => o.op === 'create').length;
  // 9 node tables + 1 edge table + 4 indexes + 4 logging tables = 18
  assert.equal(
    createCount,
    18,
    `Expected 18 CREATE statements in 0001, got ${createCount}`
  );
});

test('integration: 0001 migration has zero destructive ops', () => {
  const sql = readFileSync(
    join(__dirname, '..', 'migrations', '0001_create_rec_tables.sql'),
    'utf8'
  );
  const ops = parseMigrationOps(sql);
  const destructive = ops.filter(o =>
    ['drop', 'truncate', 'alter'].includes(o.op)
  );
  assert.equal(
    destructive.length,
    0,
    `Expected 0 destructive ops in 0001, got ${destructive.length}: ${JSON.stringify(destructive)}`
  );
});

test('listMigrationFiles: finds 0001 migration', () => {
  const files = listMigrationFiles();
  assert.ok(
    files.includes('0001_create_rec_tables.sql'),
    `Expected 0001_create_rec_tables.sql in migrations/, got: ${files.join(', ')}`
  );
});

// ----------------------------------------------------------------------------
// Integration: 0002 migration (Sprint 1.0.15)
// ----------------------------------------------------------------------------

test('integration: 0002 migration parses cleanly and is safe', () => {
  const sql = readFileSync(
    join(__dirname, '..', 'migrations', '0002_extend_rec_tables.sql'),
    'utf8'
  );
  assert.doesNotThrow(() => validateMigrationSafety(sql));
});

test('integration: 0002 migration has expected number of CREATE statements', () => {
  const sql = readFileSync(
    join(__dirname, '..', 'migrations', '0002_extend_rec_tables.sql'),
    'utf8'
  );
  const ops = parseMigrationOps(sql);
  const createCount = ops.filter(o => o.op === 'create').length;
  // 4 node tables: rec_personality_profile, rec_emotion,
  // rec_cognitive_profile, rec_context_type
  assert.equal(
    createCount,
    4,
    `Expected 4 CREATE statements in 0002, got ${createCount}`
  );
});

test('integration: 0002 migration has zero destructive ops', () => {
  const sql = readFileSync(
    join(__dirname, '..', 'migrations', '0002_extend_rec_tables.sql'),
    'utf8'
  );
  const ops = parseMigrationOps(sql);
  const destructive = ops.filter(o =>
    ['drop', 'truncate', 'alter'].includes(o.op)
  );
  assert.equal(destructive.length, 0,
    `Expected 0 destructive ops in 0002, got ${destructive.length}: ${JSON.stringify(destructive)}`);
});

test('integration: listMigrationFiles finds both 0001 and 0002', () => {
  const files = listMigrationFiles();
  assert.ok(files.includes('0001_create_rec_tables.sql'));
  assert.ok(files.includes('0002_extend_rec_tables.sql'));
  assert.deepEqual(
    [...files].sort(),
    files,
    'Migration files should be in lex order'
  );
});

// ----------------------------------------------------------------------------
// Integration: 0003 migration (Sprint 1.0.22 — seed taxonomies)
// ----------------------------------------------------------------------------

test('integration: 0003 migration parses cleanly and is safe', () => {
  const sql = readFileSync(
    join(__dirname, '..', 'migrations', '0003_seed_taxonomies.sql'),
    'utf8'
  );
  assert.doesNotThrow(() => validateMigrationSafety(sql));
});

test('integration: 0003 migration is data-only (zero CREATE/ALTER/DROP)', () => {
  const sql = readFileSync(
    join(__dirname, '..', 'migrations', '0003_seed_taxonomies.sql'),
    'utf8'
  );
  const ops = parseMigrationOps(sql);
  const schemaOps = ops.filter(o => ['create', 'alter', 'drop', 'truncate'].includes(o.op));
  assert.equal(schemaOps.length, 0,
    `Expected 0 schema-modifying ops in 0003 (data-only migration); got ${JSON.stringify(schemaOps)}`);
});

test('integration: 0003 migration has expected number of INSERT statements', () => {
  const sql = readFileSync(
    join(__dirname, '..', 'migrations', '0003_seed_taxonomies.sql'),
    'utf8'
  );
  const ops = parseMigrationOps(sql);
  const inserts = ops.filter(o => o.op === 'insert');
  // Each table is populated by ONE INSERT statement (with multi-row VALUES);
  // 4 tables = 4 INSERTs. BUT: rec_personality_profile is populated by 3 separate
  // INSERTs (Bartle, OCEAN, SDT). And rec_emotion has 2 (MDA, palette).
  // Total: 3 + 2 + 1 + 1 = 7 INSERT statements.
  assert.equal(inserts.length, 7,
    `Expected 7 INSERT statements in 0003, got ${inserts.length}: ${JSON.stringify(inserts)}`);
});

test('integration: 0003 migration every INSERT targets a rec_*-prefixed table', () => {
  const sql = readFileSync(
    join(__dirname, '..', 'migrations', '0003_seed_taxonomies.sql'),
    'utf8'
  );
  const ops = parseMigrationOps(sql);
  const inserts = ops.filter(o => o.op === 'insert');
  for (const i of inserts) {
    assert.match(i.target, /^rec_/, `INSERT target ${i.target} is not rec_*-prefixed`);
  }
});

test('integration: 0003 migration targets exactly 4 tables (one per node type added in 0002)', () => {
  const sql = readFileSync(
    join(__dirname, '..', 'migrations', '0003_seed_taxonomies.sql'),
    'utf8'
  );
  const ops = parseMigrationOps(sql);
  const inserts = ops.filter(o => o.op === 'insert');
  const distinctTargets = new Set(inserts.map(i => i.target));
  assert.equal(distinctTargets.size, 4);
  assert.ok(distinctTargets.has('rec_personality_profile'));
  assert.ok(distinctTargets.has('rec_emotion'));
  assert.ok(distinctTargets.has('rec_cognitive_profile'));
  assert.ok(distinctTargets.has('rec_context_type'));
});

test('integration: listMigrationFiles finds 0001, 0002, and 0003 in lex order', () => {
  const files = listMigrationFiles();
  assert.ok(files.includes('0001_create_rec_tables.sql'));
  assert.ok(files.includes('0002_extend_rec_tables.sql'));
  assert.ok(files.includes('0003_seed_taxonomies.sql'));
  // Adjacent files should be in non-decreasing lex order
  for (let i = 1; i < files.length; i++) {
    assert.ok(files[i - 1] <= files[i], `${files[i - 1]} should sort before ${files[i]}`);
  }
});
