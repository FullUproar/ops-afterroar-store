# Seidr — Sprint Log

Per-sprint development history.

---

## Sprint 1.0.18 — Game-profiling pipeline + 7 reference profiles + schema (2026-05-06) ✅

**Why:** Seidr's previous sprints landed the questionnaire side (24-dim taxonomy + 50-question bank + deployable quiz UI). The matching side requires game profiles in the same 24-dim space — without them, the player profile has nothing to cosine-match against. Sprint 1.0.18 lands the schema (rec_seidr_game_profile etc.) and the pipeline that fills it (LLM prompt + validation + DB write), plus 7 hand-authored reference profiles that serve as the validation gold-standard for the eventual top-500 LLM run.

**Goal:** Pipeline that takes BGG metadata + a language-model client → 24-dim profile + per-dim confidence + provenance → DB row in rec_seidr_game_profile. Plus 3 supporting tables (rec_seidr_player_profile, rec_seidr_response). Plus the 7 reference profiles. All sandbox-validated.

**What landed:**
- `migrations/0001_seidr_tables.sql` — 3 CREATE TABLE + 3 CREATE INDEX. Sandbox-validated against Postgres 16.
- `scripts/apply-migrations.mjs` — duplicate of mimir's runner per SILO § 8 (no cross-engine imports). Header rewritten to reflect seidr ownership; safety harness identical.
- `scripts/profile-game.mjs` — CLI for the pipeline. Two LLM client modes: `--mock` uses reference profiles (no token burn); without `--mock`, lazy-imports `@anthropic-ai/sdk` and calls Claude.
- `src/validate-profile.mjs` — pure-function profile validator. Shape + value-range checks for game_id, dim_vector (24 keys, [-1,1]), confidence_per_dim (24 keys, [0,1]), source_provenance (4-value enum), optional metadata.
- `src/prompt-template.mjs` — version-tagged LLM prompt template (`PROMPT_VERSION = '1.0.0'`). Renders BGG metadata + dimension taxonomy into a JSON-output instruction. Includes `parseLLMResponse` helper that tolerates ```json fences and minor prose noise.
- `src/profile-game.mjs` — pure pipeline core. `generateProfile()` and `generateBatch()` accept an injectable LLM client. `createMockLLMClient()` factory for tests.
- `data/reference-profiles.json` — 7 hand-authored profiles for the fixture games (Terraforming Mars, Codenames, Twilight Imperium 4, Wingspan, Cascadia, Pandemic, Ark Nova). Each has all 24 dim values, per-dim confidence, narrative description. Spans the dimensional space: 15-min party games to 8-hour epics, pure-coop to wargame, low-conflict puzzle to negotiation/betrayal.
- `tests/validate-profile.test.mjs` — 33 tests: shape rules, value ranges, edge cases, batch validation, real reference profiles validate against real 24-dim taxonomy.
- `tests/prompt-template.test.mjs` — 22 tests: prompt anchors, dimension list inclusion, output-schema instructions, JSON parsing tolerance.
- `tests/profile-game.test.mjs` — 18 tests: pipeline happy path, metadata stamping, validation failures, game_id contract enforcement, batch isolation, mock client semantics, end-to-end with reference profiles.
- `tests/apply-migrations.test.mjs` — 14 tests: 0001_seidr_tables.sql parses cleanly, has 6 CREATE statements (3 tables + 3 indexes), is additive only, every target is rec_seidr_*-prefixed, safety harness rejects malicious migrations.
- `package.json` — version bumped to 0.1.0; added `migrate`, `migrate:dry-run`, real `test` script; added `pg` dep.

**Why this sprint is good for mobile:** Pipeline is testable with mocks + sandbox Postgres; no real LLM calls or network needed. `npm test` runs without a DB. Sandbox migration application validates schema + idempotency.

**Acceptance criteria:**
1. Migration 0001_seidr_tables.sql is additive only — no DROP/ALTER/DELETE/TRUNCATE/INSERT ✅
2. All 3 CREATE TABLE statements use IF NOT EXISTS for idempotency ✅
3. New tables follow `rec_seidr_*` namespace per SILO.md § 3 ✅
4. **Empirical validation:** migration applied to local sandbox Postgres 16 in this sprint; all 3 tables created; rec_migrations records 0001_seidr_tables.sql alongside mimir's 0001 + 0002 ✅
5. Re-running migrate after 0001 applied is a no-op ("already applied; skipping") ✅
6. Test suite: 96/96 pass after a real `npm test` run (NOT a mental trace — actually executed) ✅
7. End-to-end CLI smoke: `node scripts/profile-game.mjs --bgg-dir ../mimir/tests/fixtures/bgg --mock --apply` writes 7 rows to rec_seidr_game_profile ✅
8. Idempotent re-apply: running the same CLI command twice produces no duplicate rows (UPSERT-by-(game_id, profile_version)) ✅
9. **Mimir regression check:** mimir's 168/168 still pass ✅ (no mimir code changed; verified via `cd ../mimir && npm test`)

**Test plan (executed BEFORE push):**
- `npm install` in seidr (fresh, since we added pg dep)
- `npm test` in seidr → expect 96/96 pass. Result: 96/96 ✅ (after fixing one test failure: `generateProfile: rejects wrong game_id from LLM` — initial implementation didn't enforce the LLM-must-echo-game_id contract; added the check to profile-game.mjs and re-ran)
- `DATABASE_URL=... npm run migrate:dry-run` → safety check passes ✅
- `DATABASE_URL=... npm run migrate` → applies cleanly ✅
- Re-running migrate is no-op ✅
- SQL verification:
  - `SELECT count(*) FROM information_schema.tables WHERE table_name LIKE 'rec_%'` → 22 (15 from mimir 0001 + 4 from mimir 0002 + 3 from seidr 0001) ✅
  - 3 new tables exist by name ✅
  - rec_migrations contains both engines' migration filenames ✅
- CLI smoke: `node scripts/profile-game.mjs --bgg-dir ../mimir/tests/fixtures/bgg --mock --apply` writes 7 profiles ✅
- Re-running apply is idempotent (still 7 rows) ✅
- `cd ../mimir && npm test` → 168/168 (no regression) ✅

**Outcome:** Pushed in this commit. Pipeline is production-ready for the laptop run with real ANTHROPIC_API_KEY. The 7 reference profiles serve as the validation gold-standard: when the top-500 LLM run produces profiles for these 7 games, cosine similarity to the reference profiles must exceed 0.85 — anything below that flags a prompt-iteration need.

**Learnings:**
- **Test-driven discipline caught a real contract violation.** The test `generateProfile: rejects wrong game_id from LLM` was written speculatively (we expect the pipeline to refuse a profile whose game_id doesn't match the requested game), and it FAILED on the first run because the validator only checks shape, not contract. Added the explicit check to `generateProfile` after validation. Without that test, this would have been a silent class of bug — the pipeline would happily write a profile for game A under game B's row in the DB.
- **Hand-authored reference profiles are surprisingly hard.** Some dimensions (mechanical complexity, time, player count) are nearly direct from BGG metadata. Others (PSY_NEUROTICISM — "anxious vs. resilient"?) require interpretation that varies between authors. The confidence_per_dim field is the honest accommodation: 0.95 for what's directly observable, 0.5–0.7 for what requires inference. The eventual LLM should be instructed to follow the same calibration, AND the validator could in a future sprint enforce "no confidence above 0.95 unless dim has a directly-observable mechanic match" as a sanity rule.
- **The decision to put seidr-specific migrations in `seidr/migrations/` (not in mimir's) honors silo § "Cross-engine coordination" cleanly.** Each engine carries its own migration directory + runner. Filenames are unique because the prefix differs (`0001_seidr_*` vs. mimir's `0001_create_*`). The shared `rec_migrations` bookkeeping table accommodates both. Trade-off: there's now a duplicate ~210-line runner in seidr/scripts/. Acceptable cost for silo enforcement; the duplication is mechanical, not conceptual.
- **The mock LLM pattern (createMockLLMClient + reference-profiles.json) is the lever for offline development.** I can ship + test the entire pipeline without burning a single token. When the user is at laptop with an API key, the same code paths run unchanged — the only difference is which `.generate()` implementation is bound at runtime.
- **Sprint 1.0.18 closed the loop on the seidr "missing piece" identified in 1.0.16.** Seidr's `docs/game-profiling-strategy.md` flagged that the algorithm was useless without game profiles; this sprint produced the schema, pipeline, and 7 reference profiles. Sprint 1.0.19 (cosine matcher) can now be implemented and tested against these 7 profiles.

**Rollback:** Revert this sprint's commits. Remove the engine-specific tables via `DROP TABLE rec_seidr_player_profile, rec_seidr_game_profile, rec_seidr_response;` and remove the row from `rec_migrations`. All other engines are unaffected (silo isolation worked).

---

## Initial scaffold (2026-05-06) — landed via Mimir Sprint 1.0.16

Seidr engine scaffolded with full design-doc set, curated question bank (50 questions, edited from Manus's 118), and a deployable static-HTML quiz UI for pre-launch real-user testing.

See `mimir/SPRINT_LOG.md` Sprint 1.0.16 for the full provenance.

---

## Future sprints (drafts)

### Sprint 0.1 — Quiz UI deployment + first user testing

**Trigger:** Now — the UI is deployable as soon as Shawn drops `quiz-ui/` onto a static host.

**Scope:** Deploy quiz-ui to a public URL (Vercel/Netlify/GitHub Pages). Share with ~10–30 friendly testers. Collect their exported result JSONs for offline analysis.

**What to learn:** Which questions discriminate well? Which feel clunky? Where do users drop off? Do their profiles cluster sensibly?

**Acceptance:** ≥10 completed quizzes; manual review of profiles + qualitative feedback; question bank refinement based on findings.

### Sprint 0.2 — Game profiling pipeline (LLM-generated)

**Trigger:** After Sprint 0.1 confirms the questionnaire is producing useful profiles.

**Scope:** Use Claude (Anthropic API) to profile the top 500 BGG games against the 24 dimensions. Manual validation pass on ~50 reference games (Catan, Pandemic, Gloomhaven, etc — our seed pool). Iterate prompt until reference profiles match expert intuition.

**Output:** `data/game-profiles.json` with 500 entries, each a 24-dim vector + provenance metadata.

### Sprint 0.3 — Schema additions (rec_seidr_*)

**Trigger:** Question bank stable + game profiling complete.

**Scope:** Migration `0003_add_seidr_tables.sql` adding:
- `rec_seidr_player_profile` — a player's 24-dim profile vector + confidence vector + completion timestamp + question-set-version
- `rec_seidr_game_profile` — a game's 24-dim profile vector + provenance (`llm_generated`, `manually_curated`, `play_inferred`)
- `rec_seidr_response` — every quiz answer for forensics + question-quality analysis

### Sprint 0.4 — Cosine similarity matcher (pure function)

**Trigger:** Schema applied + first profiles loaded.

**Scope:** `src/match.mjs` with `matchProfiles(playerVector, gameProfiles, options) → ranked list`. Pure function, like mimir's score.mjs. Cosine similarity + confidence weighting + per-dimension importance overrides.

### Sprint 0.5+ — HTTP API surface, integration with rec router, A/B vs mimir.

---

## Cross-engine notes

- Seidr shares the `rec_*` schema namespace with mimir per SILO.md.
- Seidr does NOT import from mimir. Independent engines.
- The 24-dim profile produced by seidr is also consumed by saga (future) as a feature in the per-player fun model. Seidr's data is reusable infrastructure.
