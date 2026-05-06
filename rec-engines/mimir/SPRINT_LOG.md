# Mimir — Sprint Log

Per-sprint development history. Most recent at top.

---

## Sprint 1.0.16 — Seidr engine scaffold + research artifacts + deployable quiz UI (2026-05-06) ✅

Pushed in three parts: `c60771e` (research + scaffold), `2e70d795` (question bank + structural files), `19390742` (quiz UI), plus this sprint's `f77d18c` (quiz-ui question-bank copy) and the SILO/README/SPRINT_LOG updates.

**Why:** Manus AI delivered a 4-page algorithm doc and a 118-question bank for a "this vs that" tabletop profiler. User direction was explicit: "I trust you to make the editorial pass necessary on the questions and the algorithm — what he gave us was just a start. I'm not ready to launch Afterroar to users but we could put this into a test UI and I might get real users to try it." That maps cleanly onto a third engine in the silo — a profile-driven recommender complementary to mimir's metadata-based scoring.

**Goal:** Land the seidr engine scaffold under silo discipline. Real research artifacts (algorithm spec, dimension taxonomy, game-profiling strategy, source critique). Curated 50-question bank from Manus's 118. Self-contained deployable quiz UI for pre-launch real-user testing. **No production code, no DB writes, no recommendations** — quiz emits a 24-dim profile JSON and stops.

**Why this sprint is good for mobile:** Pure documentation, JSON data files, and a static HTML/CSS/JS app. No production imports, no DB migrations applied, no test changes to mimir. Mimir's 168/168 stays unchanged.

**Scope:**
- `rec-engines/seidr/` directory created per SILO.md § "Adding a new engine"
- `seidr/README.md` — engine context, phase activation criteria, how seidr complements mimir
- `seidr/SPRINT_LOG.md` — own sprint log seeded with this scaffold sprint
- `seidr/docs/algorithm.md` — Manus's 5-step deterministic algorithm with my critiques + improvements
- `seidr/docs/dimension-taxonomy.md` — 24 dimensions explained
- `seidr/docs/game-profiling-strategy.md` — the missing piece in Manus's design (how games get vectors): LLM-generated profiles for top ~500 games, validated, refined via play outcomes
- `seidr/docs/manus-source-critique.md` — honest editorial pass of Manus's deliverables
- `seidr/data/dimensions.json` — 24 dimensions with descriptions, ranges, source citations
- `seidr/data/question-bank.json` — 50 curated questions (38 from Manus edited; 12 new) covering this-or-that, Likert, multiple-choice, and game-vs-game forced choices
- `seidr/quiz-ui/index.html` — self-contained static quiz app (~580 lines, embedded CSS+JS, mobile-first, dark theme, #FF8200 accent)
- `seidr/quiz-ui/dimensions.json` + `seidr/quiz-ui/question-bank.json` — copies the static HTML loads at runtime
- `seidr/quiz-ui/README.md` — deployment instructions
- `seidr/package.json`, `seidr/.gitignore`, `seidr/{migrations,src,tests}/.gitkeep` — independent package scaffolding per silo rule § 8
- `rec-engines/SILO.md` — engines table updated with seidr row; naming-convention list updated
- `rec-engines/README.md` — engines list updated with seidr entry; mimir test count corrected to 168

**Editorial pass over Manus's deliverables (per user mandate):**
- Cut 80 redundant tournament-style questions from Manus's 118 → 38 retained
- Tuned several Likert weight assignments where the inference was a stretch (e.g., Q06 had MEC_COMPLEXITY weight removed; Q11 PSY_ACHIEVEMENT weakened)
- Added 12 new questions: 5 game-vs-game forced choices using BGG IDs from the seed pool, 2 emotion preference questions, 2 cognitive comfort questions, 3 covering player count / party-vs-hobby / rules-lawyer
- Expanded Manus's 21 dimensions to 24: added EMO_TENSION, EMO_HUMOR, CTX_PLAYER_COUNT
- Specified the missing piece in Manus's design — how games get their dimension vectors. Strategy: LLM-generated profiles for top 500 BGG games, manually validated for ~50 reference games, refined via post-play outcomes. Documented in `docs/game-profiling-strategy.md`.

**Quiz UI design choices:**
- Loads `./question-bank.json` and `./dimensions.json` from the same directory (works on Vercel, Netlify, GitHub Pages, or `python -m http.server`)
- Samples 18 of 50 questions per session with cluster constraints (≥2 each from PSY/SOC/MEC/AES/CTX/EMO) and format constraints (≥1 game-vs-game, ≥2 this-or-that, ≥2 Likert, ≥1 multiple-choice)
- Implements Manus's algorithm exactly: `Profile[d] = V_user[d] / max(1, sum(|weights|))`, `Confidence[d] = min(1, count/3)`
- Generates a plain-English narrative from the top 5 most salient dimensions
- Renders dimensional bars grouped by cluster; low-confidence dims at reduced opacity
- Exports profile JSON via copy-to-clipboard or download
- **No recommendations.** Quiz emits the profile and stops. Per user discipline: "let's not pivot on anything to serve my impatience... proper steps despite my poking."

**Acceptance criteria:**
1. Seidr directory exists with required structure per SILO.md § "Adding a new engine" ✅
2. No imports from any sibling engine (mimir, huginn) per SILO.md § 8 ✅ (no source code yet)
3. No new rec_* tables or migrations — seidr is research+UI only this sprint ✅
4. Mimir tests still 168/168 — seidr changes don't touch mimir code ✅ (verified post-state)
5. SILO.md and README.md updated to register seidr in engines tables ✅
6. Quiz UI is genuinely deployable (works opening index.html locally, works on a static host) ✅ (manually verified by walking through 18-question flow)

**Outcome:** Five commits land the engine. Mimir's 168/168 unchanged (seidr added no test files affecting mimir). The quiz UI is deployable to any static host today. Question bank and dimension taxonomy are the durable artifacts — even if the algorithm or UI is rewritten later, the curated questions and the 24-dim framework remain valuable.

**Learnings:**
- "Editorial authority over Manus, treat as suggestion" was the right call. Manus's question bank had ~70% redundancy in tournament-style "out of these 4, which is your favorite" questions that produced no new dimensional signal beyond a single this-or-that. Cut ratio was steep (118 → 50) but every retained question pulls weight on at least one dimension.
- Manus's algorithm is fine; the missing piece was **how games get vectors**. Without that, a player profile has nothing to match against. Solving the player half is comparatively easy (15 minutes of quiz); solving the game half requires either domain experts OR LLM generation OR play-outcome inference. The strategy doc commits to LLM generation as v0 because it's the only path that works pre-launch.
- Discipline win: caught myself proposing to wire mimir into the quiz UI for "real recommendations now" and pushed back per user direction. The quiz UI shipped as profile-only. Recommendations come AFTER the game-profiling sprint, when there's something coherent to match against. "Subtly wrong is worse than absent" applies here.
- Splitting into 3 commits (research, data, UI) made the diffs reviewable. The HTML quiz-ui commit alone was ~580 lines; bundling it with everything else would have buried the editorial-pass logic.
- Self-contained static HTML is the right shape for "I might get real users to try it." Drop-in deployable, no auth, no DB, profile JSON copy/download. Real users can take the quiz on their phones during a game night and send Shawn the JSON.

**Rollback:** Revert the 5 commits. Seidr leaves no schema, no production wiring, no cross-engine references. Pure additive, mechanical to remove.

---

## Sprint 1.0.15 — Schema extension for dimension framework (4 new node types) (2026-05-06) ✅

**Why:** Manus AI delivered a 24-page research synthesis on tabletop recommendation graph dimensions — well-grounded, well-cited, largely complementary to our work. Surfaces four real gaps in our current schema: Personality Profile, Emotion, Cognitive Profile, and Context Type as first-class node types.

Additionally, Manus is in parallel developing a "this vs that" player questionnaire that will produce edges into these node types. **Sprint 1.0.15 is the prerequisite schema for absorbing the questionnaire output.** Without it, the questionnaire has nowhere to write player profile data.

**Goal:** Add four new node tables via migration `0002_extend_rec_tables.sql`. Pure additive schema. No existing tables changed. No existing behavior changed. Forward-compatible with Manus’s questionnaire output.

**Why this sprint is good for mobile:** Schema-only. No code changes. Verifiable end-to-end via local Postgres.

**Scope:**
- `mimir/migrations/0002_extend_rec_tables.sql` — 4 CREATE TABLE statements:
  - `rec_personality_profile` (Bartle, OCEAN, SDT, Yee — archetype/trait nodes)
  - `rec_emotion` (MDA aesthetics + emotional palette)
  - `rec_cognitive_profile` (working memory, attention, processing speed, spatial, verbal, social cognition)
  - `rec_context_type` (party-night, family-night, hobby-group, couples, etc.)
- `mimir/tests/apply-migrations.test.mjs` — 4 new integration tests: 0002 parses cleanly, has 4 CREATE statements, has zero destructive ops, listMigrationFiles finds both 0001 and 0002 in lex order
- `mimir/docs/dimension-framework-integration.md` — substantive doc explaining how Manus’s framework integrates with our schema, what each new node type is for, what each future engine (mimir, huginn, muninn, saga, norns) gains, what we explicitly DON’T absorb (biometric, longitudinal cognitive load, inferred moral state)

**Acceptance criteria:**
1. Migration 0002 exists and is additive only — no DROP/ALTER/DELETE/TRUNCATE/INSERT ✅
2. All 4 CREATE statements use IF NOT EXISTS for idempotency ✅
3. New tables follow `rec_*` namespace per SILO.md § 3 ✅
4. Test suite includes integration tests for 0002 ✅ (168/168 pass post-add)
5. **Empirical validation:** migration applied to local sandbox Postgres 16; all 4 tables created; rec_migrations records both 0001 and 0002 ✅
6. Re-running migrate after 0002 applied is a no-op (skipping both) ✅ (verified)
7. Integration doc explains the framework absorption + questionnaire roadmap ✅

**Test plan (executed BEFORE push):**
- Local sandbox clone, npm install
- Add migration + tests + integration doc
- `npm test` → expect 164 → 168 (4 new tests). Result: 168/168 pass ✅
- `npm run migrate:dry-run` → both migrations pass safety check ✅
- `npm run migrate` → 0001 skipped (already applied), 0002 applied successfully ✅
- SQL verification:
  - `select count(*) from information_schema.tables where table_name like 'rec_%'` → 19 (15 from before + 4 new) ✅
  - 4 new tables exist by name ✅
  - rec_migrations contains both 0001 and 0002 rows ✅

**Outcome:** Pushed in this commit. ~110-line migration + ~80 lines of new tests + ~200-line integration doc.

**Verification:** Will be confirmed via post-push fresh-clone + npm test (expect 168/168 pass).

**Learnings:**
- The schema as designed in Sprint 0.1 anticipated this case correctly. `rec_edge` doesn’t need any changes — it accepts `(src_type, dst_type, edge_type)` of any combination, so new node types just slot into existing edge mechanics. The early architectural choice to make edges first-class records (not foreign-key tangles) paid off here.
- Adding 4 nearly-identical node tables is a sign that perhaps a more abstract design (single "taxonomy" table with discriminator) could replace them. But: each table has slightly different shape (rec_context_type has min/max player count + duration; rec_emotion has category; rec_personality_profile has framework + archetype). The cost of premature abstraction here exceeds the cost of the four small tables. We can refactor later if the asymmetry causes friction.
- Schema migrations are the cheapest possible Phase 0 forward-compatibility move. We bought significant capability (saga acceleration, questionnaire integration, huginn cold-start solution, norns gene-graph seeding) for one ~110-line SQL migration.
- The integration doc is more important than the migration. Future contributors (and future Claude instances) need to understand WHY the four tables exist and what they unlock. ~200 lines of careful documentation makes the schema decision self-justifying.
- **Mimir engine list goes from 19 to 19 — wait, that’s 15 + 4 = 19.** Yes, the schema now has 19 rec_* tables. Schema is forward-compatible with the breakthrough engine roadmap.

**Rollback:** Revert this commit. The migration is additive; reverting drops the 4 new tables but leaves nothing else affected. If the migration was already applied to a real DB, manually `DROP TABLE rec_personality_profile, rec_emotion, rec_cognitive_profile, rec_context_type;` and remove the row from `rec_migrations`. Both restorations are clean.

---

## Sprint 1.0.14 — Saga scaffold (DEFERRED — see notes)

Deferred until after the dimension framework integration. The reason: saga’s design-notes draft would have been written without knowledge of Manus’s research; rewriting after the fact wastes effort. With Sprint 1.0.15 done, saga’s scaffold can incorporate the new node types from day one.

---

## Sprint 1.0.13 — Recap data spec for HQ recap UI v1 (2026-05-06) ✅

Pushed at commit `610eb35`. Formal contract for HQ recap UI v1 — the structured fields HQ must capture so saga has training data when it activates.

---

## Sprint 1.0.12 — Scaffold huginn (second engine, validates silo pattern) (2026-05-06) ✅

Pushed at commit `524e774`.

---

## Sprint 1.0.11 — exclude_seeds option (UX fix from smoke test) (2026-05-06) ✅

`790426c`.

---

## Sprint 1.0.10 — Sandbox e2e validation + fixtures + integration tests (2026-05-06) ✅

`45b584a`.

---

## Sprint 1.0.9 — HOTFIX: explain.mjs + npm test glob (2026-05-06) ✅ (`7b3e85e`)

---

## Sprint 1.0.8 — Logging helpers (2026-05-06) ✅ (`dacc20b`)
## Sprint 1.0.7 — HANDOFF.md update (2026-05-06) ✅ (`5690d21`)
## Sprint 1.0.6 — recommend() composer + offline driver (2026-05-06) ✅ (`f6e60db`)
## Sprint 1.0.5 — Explanation generator (2026-05-06) ✅ (`0bd5d31`)
## Sprint 1.0.4 — MMR + designer cap (2026-05-06) ✅ (`7cde547`)
## Sprint 1.0.3 — v0 Scoring function (2026-05-06) ✅ (`089af2f`)
## Sprint 1.0.2 — Taste vector computation (2026-05-06) ✅ (`3bac627`)
## Sprint 1.0.1 — Curate seed BGG ID list (2026-05-06) ✅ (`61cab65`)
## Sprint 1.0 — BGG metadata fetcher (2026-05-06) ✅ (`337ed7c`)
## Sprint 0.2 — Migration runner script (2026-05-06) ✅ (`df30ac0`)
## Sprint 0.1 — First migration file (2026-05-06) ✅ (`9b1b383`)
## Sprint 0.0.2 — Design doc re-inline (2026-05-06) ✅ (`1d32f9e`)
## Sprint 0.0.1 — Rename + Norse convention + handoff docs (2026-05-06) ✅ (`8c155ff` + 6 deletes)
## Sprint 0.0 — Silo scaffold (2026-05-06) ✅ (`f5d54ef`)

---

## Next sprint planned

## Sprint 1.0.17 — Saga scaffold (incorporating dimension framework) (DRAFT)

Sprint 1.0.16 took the slot originally pencilled for saga (seidr's research + quiz UI was the higher-value next step given Manus's deliverables landing). Saga's scaffold is the next planned sprint. Will mirror huginn (Sprint 1.0.12) but with substantively richer design notes given saga is the breakthrough engine, and will incorporate the four new node types from Sprint 1.0.15.

## Sprint 1.0.18 — Game-profiling v0 (LLM-generated profiles for top 500 games) (DRAFT)

The missing piece in seidr's design (per `seidr/docs/game-profiling-strategy.md`). Generate 24-dim vectors for the top ~500 BGG games via LLM, validate manually for ~50 reference games, store in a new `rec_seidr_game_profile` table. Required before seidr can produce any recommendation.

## Sprint 0.3 — Apply 0001 + 0002 migrations to user’s Neon branch (REQUIRES LAPTOP)

Note: 0002 added in this sprint. When applying to real Neon, both 0001 and 0002 will run cleanly. Sandbox-validated.

## Sprint 1.1 — BGG JSON → rec_* writer (DRAFT, depends on 0.3)

## Sprint 1.2 — HTTP API surface for recommend() (Phase 1, depends on 0.3 + 1.1)

## Sprint 1.3 — Seed taxonomies for personality/emotion/cognitive/context (DRAFT)

When Manus’s questionnaire output stabilizes, write a seed migration that populates the four new node tables with the canonical taxonomy entries (Bartle’s 4, OCEAN’s 5, MDA’s 8, Manus’s 6 cognitive dimensions, ~10 named contexts). Pure data migration; no schema changes.
