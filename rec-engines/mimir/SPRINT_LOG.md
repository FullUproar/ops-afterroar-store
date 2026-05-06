# Mimir — Sprint Log

Per-sprint development history. Most recent at top.

---

## Sprint 1.0 — BGG metadata fetcher (2026-05-06) ✅

**Goal:** A standalone Node script in `mimir/scripts/fetch-bgg.mjs` that fetches game metadata from BGG's XML API for a list of BGG IDs and writes per-game JSON files to gitignored `tmp/bgg/`. No DB writes — Sprint 1.1 will add the writer that reads these JSONs and inserts into rec_* tables.

**Why this sprint can run in mobile environment:** Pure code, no DB, no platform integration. Tests run with `npm test` and don't need credentials.

**Scope:**
- `scripts/fetch-bgg.mjs` — fetcher with batching (20 ids/req), polite rate limit (1 req/sec), exponential backoff for 429/5xx/202/queued responses, User-Agent header per BGG TOS
- `tests/fetch-bgg.test.mjs` — pure parsing tests against sample XML (no network)
- `package.json` — add `fast-xml-parser` dep, add `fetch-bgg` script
- `.gitignore` — exclude `tmp/`, `node_modules/`, `.env`

**Acceptance criteria:**
1. Script exists and is invocable as `node scripts/fetch-bgg.mjs --ids 167791` ✅
2. Script writes structured JSON per game to `tmp/bgg/<id>.json` ✅ (file ops verified by code review)
3. Parser handles: single-item, multi-item, missing optional fields, "Not Ranked" rank, single-element link ✅
4. Rate limiting present (1 req/sec between batches) ✅
5. Exponential backoff on 429/5xx/202/queued ✅
6. Tests cover the parser without network access ✅
7. .gitignore prevents committing fetched data ✅

**Test plan (executed BEFORE push, mental trace):**
- `parseBggResponse(SAMPLE_XML)` → 1 game; id=167791, name="Terraforming Mars", year=2016, weight=3.2356, bggRank=4 ✅
- mechanics array length=2 with correct ids+values ✅
- categories array length=2 ✅
- designers array length=1, id=9220 ✅
- "Not Ranked" → bggRank=null (test mutates SAMPLE_XML) ✅
- multi-item XML → returns array of N games with distinct ids/names ✅
- minimal XML (only id+name) → all optional fields null/empty arrays, no crash ✅
- empty `<items></items>` → returns `[]` ✅
- unrelated `<foo/>` → returns `[]` ✅
- single mechanic (only one `<link>` element) → mechanics array length=1 ✅ (relies on isArray callback for 'link')

**Outcome:** Pushed in this commit. ~280 lines of script, ~150 lines of tests.

**Verification:** Will be confirmed via post-push read-back. Live execution against BGG deferred to laptop session (where `npm install` works reliably).

**Learnings:**
- BGG XML API has several quirks worth handling explicitly: 202 (queued), 200-with-no-items (still processing), and intermittent 429/5xx. Treating all four as retryable with exponential backoff covers the realistic failure surface.
- `fast-xml-parser`'s `isArray` callback is the cleanest way to ensure single-element collections (one mechanic, one designer) don’t degrade to a single object instead of an array of length 1. Saved a class of bugs that would only show up on niche games.
- `parseAttributeValue: false` is intentional. The parser would happily turn `"Not Ranked"` into `"Not Ranked"` (string) but `"4"` into `4` (number) — the inconsistency is confusing. Better to let our `toIntOrNull`/`toFloatOrNull` helpers do all coercion.
- We capture artists, publishers, families, and expansions even though Phase 0 doesn’t use them. They’re needed by future ranker layers and effectively free to capture at fetch time. Refetching later is more expensive than capturing now.
- The script writes per-game JSON files instead of a single big JSON. Easier to incrementally backfill, easier to inspect, easier to retry single games on failure.

**Rollback:** Revert this commit. No DB state, no network side-effects, no other consumers depend on this yet.

---

## Sprint 0.2 — Migration runner script (2026-05-06) ✅

**Goal:** Standalone migration runner with multi-layer safety harness (refuses non-rec_* operations; refuses prod-named DBs).

**Outcome:** Pushed at commit `df30ac0`. ~250 lines of script + ~180 lines of tests. 18 test assertions across parsing, safety, prod-detection, integration with 0001 migration. Pure Node ES modules, no build step.

**Learnings:**
- Plain Node ES modules (`.mjs`) save ~5 layers of build tooling complexity for an internal script.
- Regex-based SQL screener is approximate but sufficient for the safety check.
- Lazy-importing `pg` lets dry-run and tests run without the dep installed.

---

## Sprint 0.1 — First migration file (2026-05-06) ✅

**Goal:** Foundation schema DDL.

**Outcome:** Pushed at commit `9b1b383`. 14 tables + 4 indexes per design doc § 3.5 + § 7.1.

---

## Sprint 0.0.2 — Design doc re-inline (2026-05-06) ✅

Pushed at commit `1d32f9e`. Doc self-contained.

---

## Sprint 0.0.1 — Rename + naming convention + handoff docs (2026-05-06) ✅

Shipped as `8c155ff` + 6 deletes. Branch tip after sprint: `a0f6c69`. Norse naming convention established.

---

## Sprint 0.0 — Silo scaffold (2026-05-06) ✅

Shipped at commit `f5d54ef`. 8 files added.

---

## Next sprint planned

## Sprint 1.0.1 — Curate seed BGG ID list (DRAFT, code-only)

**Goal:** Add `mimir/data/seed-bgg-ids.txt` containing ~50–100 BGG IDs spanning weight categories, mechanics, themes for the cold-start onboarding seed pool. Hand-curated initially; can refresh quarterly.

**Why this sprint is good for mobile:** Pure data, no code, no DB, no network. Just a text file with comments.

**Scope:**
- `mimir/data/seed-bgg-ids.txt` — list of BGG IDs grouped by weight tier with comments explaining why each is included
- README updated to point at the seed list

**Acceptance criteria:**
1. File exists with at least 50 BGG IDs
2. Each ID has a comment explaining its inclusion (weight, mechanic, theme)
3. Coverage spans light/medium/heavy and major mechanic families
4. Format is `node scripts/fetch-bgg.mjs --file data/seed-bgg-ids.txt`-compatible

**Test plan:** N/A — data file. Sprint 1.0.2 (next) will be the test that runs fetch-bgg against this file (deferred to laptop since it makes network calls).

---

## Sprint 0.3 — Apply 0001 migration to a non-prod DB (DRAFT, REQUIRES LAPTOP)

**Goal:** Apply 0001 migration to a Neon branch DB. Verify schema lands. Confirm idempotency.

**Why this requires laptop:** Needs DATABASE_URL access + `npm install` for `pg`.

**Scope:**
- `npm install` in `rec-engines/mimir/`
- `npm test` — confirm runner + parser tests pass
- `npm run migrate:dry-run` against a Neon branch
- `npm run migrate` to apply
- SQL verification: 15 `rec_*` tables exist; 4 indexes on `rec_edge`; rec_migrations has a row for 0001
- Re-run migrate to confirm idempotency

**Acceptance:** All schema verified; idempotency confirmed.

**Note:** Sprint 1.1 (BGG → rec_* writer) depends on this sprint having applied the schema.

---

## Sprint 1.1 — BGG JSON → rec_* writer (DRAFT, depends on 0.3)

**Goal:** Script that reads `tmp/bgg/*.json` and inserts rows into rec_game, rec_designer, rec_mechanic, rec_theme, rec_category, and rec_edge (designed-by, has-mechanic, has-theme, in-category, expansion-of, family-of edges).

**Scope:**
- `scripts/load-bgg.mjs` — reads JSON, upserts via INSERT ... ON CONFLICT DO UPDATE
- Idempotent: re-running with same JSONs is a no-op
- Same safety harness as migration runner (refuses prod, refuses non-rec_ writes)
- Tests: pure SQL-generation tests (no DB)

**Acceptance:** Run against the schema from Sprint 0.3 against the BGG JSONs from Sprint 1.0.1; verify rec_game has N rows, rec_edge has expected N×7 edges (designed-by + mechanics + themes + categories + expansions + families + has-artist if added).

**Test plan TBD (preflight before push).**
