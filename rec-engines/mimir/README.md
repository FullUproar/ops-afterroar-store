# Mimir — Foundation Recommendation Engine

*Mimir, Norse god of wisdom and knowledge, guardian of the well of all knowledge. Odin gave an eye to drink from it. Engines that come after stand on what this one knows.*

---

The foundation rec engine for the Afterroar platform. Scores games by metadata similarity (mechanics, themes, designers, weight, length, player count). No internal play data required — runs entirely on BGG metadata + per-player onboarding seed input.

## Why this engine exists

Phase 0 of the platform recommendation roadmap. This engine ships before the network has any plays, votes, or trades. It's the cold-start baseline that:

1. Provides a working recommendation surface from day 1.
2. Establishes the API contract that future engines (`huginn`, `muninn`, `saga`, `norns`) will implement.
3. Captures logging signal that future engines train on.
4. Serves as the always-available fallback when richer engines have insufficient data for a specific caller.

It's deliberately the dumbest possible reasonable engine. **It is not the differentiator. Future engines are.** Mimir's job is to be present, correct, and observable while better engines are being built around it.

## What's inside

- `migrations/` — SQL DDL for `rec_*` tables (foundation schema). Currently: `0001_create_rec_tables.sql`.
- `scripts/apply-migrations.mjs` — Migration runner with multi-layer safety harness. Refuses non-`rec_*` operations. Refuses production-named DBs.
- `scripts/fetch-bgg.mjs` — BGG metadata fetcher (writes per-game JSON to gitignored `tmp/bgg/`).
- `tests/` — Test suites (runner safety + BGG parser).
- `docs/recommendation-engine-design.md` — The architectural design doc (full spec for all engines in the roadmap).
- `SPRINT_LOG.md` — Sprint history for this engine. Read this when resuming work.
- `package.json` — Node ES module package. Deps: `pg`, `fast-xml-parser`.
- `.gitignore` — excludes `tmp/`, `node_modules/`, `.env`.

## Running it

```bash
# Install deps (first time only)
npm install

# Run the test suite (no DB or network required)
npm test

# Dry-run migrations (parses + safety-checks all migration files; no DB writes)
DATABASE_URL=postgres://user:pass@host:5432/your-dev-db npm run migrate:dry-run

# Apply migrations to a non-prod DB
DATABASE_URL=postgres://user:pass@host:5432/your-dev-db npm run migrate

# Fetch BGG metadata for a list of game IDs
npm run fetch-bgg -- --ids 167791,30549,1

# Or fetch from a file (one ID per line, comments allowed)
npm run fetch-bgg -- --file data/seed-bgg-ids.txt

# Dry-run the BGG fetcher (lists batches without making network calls)
npm run fetch-bgg -- --ids 167791 --dry-run
```

**Safety rails (per SILO.md § 3 and the runner's own checks):**
- The runner refuses to apply any migration that creates/alters/drops/truncates a non-`rec_*` table or index.
- The runner refuses to run against a database whose URL contains `prod`, `production`, or `-live` unless `--allow-prod` is passed (do not pass that flag during Mimir Phase 0).
- Migration progress is tracked in a self-managed `rec_migrations` table; re-running is idempotent.

**BGG fetcher etiquette:**
- Identifies via `User-Agent: AfterroarRecEngine/0.1 (...)`.
- Rate limits to ~1 req/sec; batches 20 ids/req.
- Exponential backoff on 429, 5xx, 202 (queued), and 200-without-items (still processing).
- Output goes to `tmp/bgg/` (gitignored). Re-fetchable; no need to ever commit fetched data.

## Current phase

**Phase 0 — Scaffolding + foundation schema + BGG fetcher.** Schema committed, migration runner ready, BGG fetcher ready. Schema not yet applied to any database (Sprint 0.3 will do that against a Neon branch DB on a laptop session).

Next: see `SPRINT_LOG.md` § "Next sprint planned".

## Graduation criteria (out of silo)

Mimir graduates from silo when ALL of these are true:

1. **End-to-end execution works.** `recommend(seed_game_id) → ranked list with explanations` returns sensible results for at least 30 distinct seed games.
2. **Performance.** Latency P99 < 500ms for `limit=10` requests against the full 5000-game dataset.
3. **Subtle-wrongness suite passes** (per SILO.md § 7).
4. **Logging is complete.** Every request, candidate, score, and outcome captured.
5. **One canary store has used it for ≥1 week** with feature flag enabled, recommendation acceptance rate ≥60%, no reported quality issues.

Until all five are met, Mimir stays in silo.

## Reading order for new contributors / future Claudes

1. [`../HANDOFF.md`](../HANDOFF.md) — cross-engine context
2. [`../SILO.md`](../SILO.md) — silo rules + sprint discipline + naming convention
3. [`./SPRINT_LOG.md`](./SPRINT_LOG.md) — sprint history (the "what has happened, what is queued" log)
4. [`./docs/recommendation-engine-design.md`](./docs/recommendation-engine-design.md) — full architectural spec
5. This README — engine-specific context + how to run
6. `migrations/`, `scripts/`, `src/`, `tests/` — implementation

## Open questions specific to Mimir

- BGG API rate limit posture — 1 req/sec is conservative; can scale up if BGG’s actual limit is more permissive
- Seed game pool curation (the ~50–100 games shown to new players in onboarding) — Sprint 1.0.1 drafts the list; needs human-in-loop pass
- Hand-tuned weight values for the scoring function (`w1` through `w9` in design doc § 5.1) — to be set in implementation, refined via offline eval
- Confidence score calibration — what threshold below which we return "insufficient data" instead of a list
