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

### Schema
- `migrations/0001_create_rec_tables.sql` — 14 tables + 4 indexes per design doc § 3.5 + § 7.1
- `scripts/apply-migrations.mjs` — migration runner with multi-layer safety harness (refuses non-rec_* operations; refuses prod-named DBs)

### BGG ingestion
- `scripts/fetch-bgg.mjs` — fetches BGG XML API metadata, writes per-game JSON to gitignored `tmp/bgg/`
- `data/seed-bgg-ids.txt` — 60 hand-curated BGG IDs spanning weight tiers + mechanic families for cold-start onboarding

### Pipeline (pure functions)
- `src/taste-vector.mjs` — `computeTasteVector(loved, noped, gameMetadata)` → multidimensional taste vector
- `src/score.mjs` — `scoreCandidate(candidate, taste, context)` → score + confidence + reason codes + breakdown
- `src/rank.mjs` — `rankCandidates(...)` → MMR-diversified ranking with hard designer cap
- `src/explain.mjs` — `explain(scored, candidate, taste)` → short + long natural-language explanations
- `src/recommend.mjs` — `recommend(request, gameMetadata)` → RecommendResponse per design doc § 4

### Offline driver
- `scripts/run-rec.mjs` — CLI that loads `tmp/bgg/`, accepts seed picks, prints recommendations. Use for human-in-loop eval.

### Tests
- `tests/*.test.mjs` — ~120 assertions across 7 test files, including 12+ SUBTLE-WRONGNESS guards (per SILO.md § 7)

## Running it

```bash
# Install deps (first time only)
npm install

# Run the test suite (no DB or network required)
npm test

# Fetch BGG metadata for the seed pool (one-time, ~1 minute)
npm run fetch-bgg -- --file data/seed-bgg-ids.txt

# Run an offline recommendation against the cached BGG data
npm run run-rec -- --loved 167791,266192 --noped 178900 --players 4 --minutes 90

# Try with rich explanations
npm run run-rec -- --loved 167791 --explain rich

# Database operations (require DATABASE_URL)
DATABASE_URL=postgres://... npm run migrate:dry-run
DATABASE_URL=postgres://... npm run migrate
```

**Safety rails (per SILO.md § 3 and the runner's own checks):**
- The migration runner refuses to apply any migration that creates/alters/drops/truncates a non-`rec_*` table or index.
- The runner refuses to run against a database whose URL contains `prod`, `production`, or `-live` unless `--allow-prod` is passed (do not pass that flag during Mimir Phase 0).
- Migration progress is tracked in a self-managed `rec_migrations` table; re-running is idempotent.

**BGG fetcher etiquette:**
- Identifies via `User-Agent: AfterroarRecEngine/0.1 (...)`.
- Rate limits to ~1 req/sec; batches 20 ids/req.
- Exponential backoff on 429, 5xx, 202 (queued), and 200-without-items.
- Output goes to `tmp/bgg/` (gitignored).

## Current phase

**Phase 0 — Mobile-buildable portion COMPLETE as of Sprint 1.0.6.** Silo holds a runnable end-to-end recommender:

```
seed picks → taste vector → score every candidate → rank with MMR + designer cap → explain → RecommendResponse
```

Next: laptop session for Sprint 0.3 (apply migration to Neon branch) → Sprint 1.1 (BGG → rec_* writer).

## Graduation criteria (out of silo)

Mimir graduates from silo when ALL of these are true:

1. **End-to-end execution works.** `recommend(seed_game_id) → ranked list with explanations` returns sensible results for at least 30 distinct seed games.
2. **Performance.** Latency P99 < 500ms for `limit=10` requests against the full 5000-game dataset.
3. **Subtle-wrongness suite passes** (per SILO.md § 7) — unit tests are in place; needs validation against real BGG data.
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
- Seed game pool curation — needs a human-in-loop pass to validate IDs and adjust based on real-world FLGS feedback
- Hand-tuned weight values for the scoring function (`WEIGHTS` in `src/score.mjs`) — starting heuristics; offline eval will refine
- Confidence score calibration — what threshold below which we return "insufficient data" instead of a list (currently `LOW_CONFIDENCE_THRESHOLD = 0.3`)
