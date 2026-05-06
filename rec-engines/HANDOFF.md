# Rec Engines — Handoff Document

**Purpose:** Cross-session context restoration. When you sit down at a laptop after working on mobile (or vice versa), read this + the active engine's `SPRINT_LOG.md` to restore full context.

**Last updated:** 2026-05-06 (post Sprint 1.0.20, seidr explanation generator + offline CLI runner; end-to-end flow works)

---

## What `rec-engines/` is

The siloed home for experimental recommendation engines. Each engine is a subdirectory with its own README, sprint log, schema, code, and tests. Production code never imports from here — integration is via HTTP only. See [`SILO.md`](./SILO.md) for the rules.

## Why this exists

The platform's long-term differentiator is recommendation quality across three surfaces (HQ game-night picker, Passport library, POS buy-side). Multiple algorithmic approaches will be implemented as separate engines and A/B tested against each other in production. This directory is the development sandbox.

Full architectural rationale: [`mimir/docs/recommendation-engine-design.md`](./mimir/docs/recommendation-engine-design.md).

## Current state (high level)

| Engine | Phase | Status | Last sprint |
|---|---|---|---|
| `mimir` | Phase 0 | **End-to-end validated against local Postgres + real fixture data.** 168/168 tests pass. Code-side Sprint 0.3 done in sandbox; user-side Sprint 0.3 (apply against own Neon) is the only remaining blocker. | Sprint 1.0.15 — schema extension for dimension framework |
| `huginn` | Phase 0 | Scaffold-only. Implementation deferred to Phase 1+ (≥50 active users with real edges). | Sprint 1.0.12 |
| `seidr` | Phase 0 | Research + quiz UI + LLM pipeline + 7 reference profiles + schema + cosine matcher + explanation generator + offline CLI runner. **154/154 seidr tests pass.** End-to-end flow works (player profile → match → explanations); CLI runnable today (`scripts/run-rec.mjs --archetype heavy-strategist --bgg-dir ../mimir/tests/fixtures/bgg`). Awaiting top-500 LLM run for full corpus. | Sprint 1.0.20 |
| `saga` | Phase 0 | Scaffold + architecture locked in 3 design docs. Implementation deferred until graduation thresholds met (≥3000 recap records, ≥200 active players with ≥10 recaps each, ≥6mo corpus). Estimate 12–18 months post-launch. | Sprint 1.0.17 (current) |

## What’s in mimir/ right now

A full Phase 0 v0 content-similarity recommender, all in plain Node ES modules, zero build step. **168/168 tests pass on Node 22.22.2** (verified via `git clone` → `npm install` → `npm test` in a fresh sandbox; Sprint 1.0.15 added 4 new tests for the dimension-framework schema extension).

**Schema layer:**
- `migrations/0001_create_rec_tables.sql` — 14 tables + 4 indexes (per design doc § 3.5 + § 7.1). **Empirically applied to a local Postgres 16 in Sprint 1.0.10; verified idempotent + safety harness rejects bad migrations + prod-name guard refuses prod-shaped URLs.** Not yet applied to YOUR Neon DB.
- `migrations/0002_extend_rec_tables.sql` — 4 new node tables for the dimension framework (`rec_personality_profile`, `rec_emotion`, `rec_cognitive_profile`, `rec_context_type`). Pure additive; sandbox-validated against Postgres 16 in Sprint 1.0.15. Total schema after 0002: 19 rec_* tables.
- `scripts/apply-migrations.mjs` — migration runner with multi-layer safety harness.

**BGG ingestion:**
- `scripts/fetch-bgg.mjs` — BGG XML API metadata fetcher with polite rate limiting. **Note:** this datacenter’s IP is 403’d by BGG; works fine from a residential / cloud IP that BGG accepts.
- `data/seed-bgg-ids.txt` — 60 hand-curated BGG IDs across weight tiers + mechanics.

**Pipeline (pure functions):**
- `src/taste-vector.mjs` — `computeTasteVector(loved, noped, gameMetadata)`
- `src/score.mjs` — `scoreCandidate(candidate, taste, context)`
- `src/rank.mjs` — `rankCandidates(...)` with MMR + hard designer cap
- `src/explain.mjs` — `explain(scored, candidate, taste)`
- `src/recommend.mjs` — `recommend(request, gameMetadata)` per design doc § 4 contract
- `src/logging.mjs` — row builders for rec_*_log tables

**Offline driver:**
- `scripts/run-rec.mjs` — CLI for human-in-loop eval. **Smoke-tested in Sprint 1.0.10 with the engine-lover scenario; output is sensible.**

**Tests:**
- 168 assertions across 9+ test files (`tests/*.test.mjs`)
- 12+ SUBTLE-WRONGNESS guards per SILO.md § 7
- 6 integration tests against `tests/fixtures/bgg/` (7 hand-crafted game fixtures)
- 4 migration tests for 0002 (parses cleanly, 4 CREATE statements, zero destructive ops, listMigrationFiles finds both 0001+0002 in lex order)
- All tests run with `npm test` (no DB or network required)

## When you sit at the laptop next, do this

The code-side validation is done. What’s left is just applying against your real Neon branch.

```bash
cd rec-engines/mimir

# 1. Install deps
npm install

# 2. Run the test suite. EXPECT 168/168 PASS.
#    If anything fails, that’s the first thing to debug — means something
#    drifted between sandbox and your machine.
npm test

# 3. Apply the migration to a Neon branch DB.
#    Set DATABASE_URL to your dev/staging branch (NOT prod-named).
#    The runner refuses prod/production/-live names anyway.
DATABASE_URL=postgres://... npm run migrate:dry-run   # safety check first
DATABASE_URL=postgres://... npm run migrate           # apply 0001

# 4. Verify schema lands as expected:
#    SELECT count(*) FROM information_schema.tables WHERE table_name LIKE 'rec_%';
#       → 19 (14 from 0001 + 4 from 0002 + rec_migrations from runner)
#    SELECT indexname FROM pg_indexes WHERE tablename = 'rec_edge';
#       → 6 indexes (pkey, the unique constraint, _src, _dst, _type_ts, _context_gin)
#    SELECT * FROM rec_migrations;
#       → two rows: 0001_create_rec_tables.sql AND 0002_extend_rec_tables.sql

# 5. Confirm idempotency:
DATABASE_URL=postgres://... npm run migrate            # should print "already applied; skipping" for both

# 6. (Optional) Fetch BGG metadata + run an offline rec
#    BGG should work from your laptop’s IP; it 403’d the sandbox.
npm run fetch-bgg -- --file data/seed-bgg-ids.txt
npm run run-rec -- --loved 167791,266192 --noped 178900 --players 4 --minutes 90 --explain rich
```

## Sandbox validation evidence (for trust)

In case you want to know what was actually proven before you run against your Neon, Sprint 1.0.10 validated against a fresh Postgres 16 in this session’s sandbox:

- 0001 migration applies cleanly, all 14 expected tables + 4 indexes present
- rec_migrations gets a row for the applied migration
- Re-running migrate is a no-op (“already applied; skipping”)
- Adding a malicious migration (`drop table users;`) is rejected by the safety harness BEFORE any DB call
- DATABASE_URL containing “prod” / “production” / “-live” is rejected by the prod-name guard (must pass `--allow-prod` to override, which is documented as never appropriate for Phase 0)
- Offline driver `run-rec.mjs` produces sensible recommendations for the engine-lover scenario

Full details in `mimir/SPRINT_LOG.md` § Sprint 1.0.10.

## Working agreement (sprint discipline)

Every sprint follows this cadence:

1. **Pre-flight** in chat AND committed to the engine's `SPRINT_LOG.md`: goal, scope, acceptance criteria, test plan, rollback recipe.
2. **Test plan written BEFORE implementation.**
3. **Build.**
4. **Verify** by executing the test plan. **“Executed” ≠ “verified” — verification means actually running the code (npm test, smoke test, etc.), not just rereading it.**
5. **Push** with full-context commit message.
6. **Post-state verification** — read back from the repo to confirm.
7. **Post-mortem** in `SPRINT_LOG.md`.

Details in [`SILO.md`](./SILO.md) § "Sprint discipline".

## How to resume work

1. Read this file for high-level state.
2. Read [`SILO.md`](./SILO.md) for the rules.
3. Read `mimir/SPRINT_LOG.md` for detailed history.
4. Read `mimir/README.md` for engine-specific context.
5. Run `npm test` first thing — expect 168/168 pass. If not, debug before proceeding.

## Active engines

- **`mimir/`** — foundation; mostly complete, blocked on user-side Sprint 0.3 (apply migrations to Neon)
- **`huginn/`** — scaffold-only, deferred until Phase 1+
- **`seidr/`** — research + deployable quiz UI, awaiting first round of real-user testing
- **`saga/`** — architecture locked, deferred until ≥3000 recap records + ≥6mo corpus

The next mimir-side sprint planned is **1.0.18 — Game-profiling v0** (LLM-generated 24-dim profiles for top 500 BGG games). This is the dependency seidr needs before it can produce recommendations, AND a useful upstream for saga's eventual game-side feature inputs.

## Branch & repo

- **Branch:** `claude/review-uoroar-platform-CuLMi` (in `fulluproar/afterroar`)
- **Branch tip after Sprint 1.0.10:** see latest commit on the branch
- **No PR open yet.** When ready to merge, the silo can graduate selectively per SILO.md § 5.

## Cross-engine notes

- **Schema sharing:** `rec_*` tables defined in `mimir/migrations/` are shared by all engines. Engine-specific tables get the engine name prefixed (e.g., `rec_huginn_pageranks`).
- **Naming convention:** Norse mythology. Engines on disk: `mimir`, `huginn`, `seidr`, `saga`. Future engines: `muninn` (embeddings), `norns` (gene-graph), `yggdrasil` (federated cross-store).
- **Sprint discipline applies to all engines.** Each engine maintains its own `SPRINT_LOG.md`.

## Pending decisions / questions

- **Where does the rec router live?** Probably `apps/me` (Passport) or a new `packages/rec-router/`. Not built yet, not needed until Phase 1.
- **Who curates the seed game pool?** Currently 60 IDs hand-curated by Claude during Sprint 1.0.1. Needs a human-in-loop pass to validate IDs and adjust based on real FLGS feedback.
- **BGG API rate limit posture.** Need to confirm published limits and our backoff strategy before scaling the metadata fetcher beyond ~5,000 games. Worth doing the first real BGG fetch from your laptop to confirm the User-Agent + rate limiting behave correctly.
- **Recap structured field set.** The simulator engine (`saga`, future) trains on per-night per-player fun ratings + outcomes. HQ’s recap UI needs structured-with-optional-freeform fields, decided BEFORE the recap UI v1 ships.
- **UX consideration noted in Sprint 1.0.10 smoke test:** the recommender currently returns seed-loved games in results. The wrapping surface (HQ picker, etc.) probably wants to filter them out — you don’t recommend a game the player just told you they love. Trivial filter on the consumer side.

## Cumulative session footprint (mobile session ending 2026-05-06)

16 sprints under TDD discipline:

- Sprint 0.0: silo scaffold (`f5d54ef`)
- Sprint 0.0.1: rename + Norse convention + handoff docs (`8c155ff` + 6 deletes → tip `a0f6c69`)
- Sprint 0.0.2: design doc re-inline (`1d32f9e`)
- Sprint 0.1: first migration file (`9b1b383`)
- Sprint 0.2: migration runner with safety harness (`df30ac0`)
- Sprint 1.0: BGG metadata fetcher (`337ed7c`)
- Sprint 1.0.1: curated seed BGG ID list (`61cab65`)
- Sprint 1.0.2: taste vector computation (`3bac627`)
- Sprint 1.0.3: v0 scoring function (`089af2f`)
- Sprint 1.0.4: MMR + designer cap ranking (`7cde547`)
- Sprint 1.0.5: explanation generator (`0bd5d31`)
- Sprint 1.0.6: recommend() composer + offline driver (`f6e60db`)
- Sprint 1.0.7: HANDOFF.md update (`5690d21`)
- Sprint 1.0.8: logging helpers (`dacc20b`)
- Sprint 1.0.9: HOTFIX explain.mjs + npm test glob (`7b3e85e`) — caught by real test run
- Sprint 1.0.10: sandbox end-to-end validation + fixtures + integration tests
- Sprint 1.0.11: exclude_seeds option (UX fix from smoke test) (`790426c`)
- Sprint 1.0.12: huginn scaffold — second engine validates silo pattern (`524e774`)
- Sprint 1.0.13: recap data spec for HQ recap UI v1 (`610eb35`)
- Sprint 1.0.14: saga scaffold — DEFERRED (rolled into 1.0.17 with full architectural context)
- Sprint 1.0.15: schema extension — 4 dimension-framework node tables (`b6cb0b6`); 168/168 tests
- Sprint 1.0.16: seidr scaffold + research artifacts + deployable quiz UI (5 commits, `c60771e` → `62f0279`)
- Sprint 1.0.17: saga scaffold + 3 architecture docs (`4b4520a`)
- Sprint 1.0.18: seidr game-profiling pipeline + 7 reference profiles + schema (`45ec173`)
- Sprint 1.0.19: seidr cosine matcher + 8 subtle-wrongness assertions + 2 integration tests (`b745c5a`)
- Sprint 1.0.20: seidr explanation generator + offline CLI runner (current)

~5k lines of source code, ~9k+ lines of tests + docs. End-state: mimir 168/168, seidr 154/154; migration runners validated against real Postgres; four engines registered (mimir running, huginn scaffold, seidr end-to-end, saga architecture-locked); 22 rec_* tables in schema (sandbox-validated, not yet on user's Neon). **Seidr is fully runnable end-to-end via `scripts/run-rec.mjs`.**
