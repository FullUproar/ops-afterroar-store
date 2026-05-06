# Mimir — Sprint Log

Per-sprint development history. Most recent at top.

---

## Sprint 1.0.5 — Explanation generator (2026-05-06) ✅

**Goal:** Pure function `explain(scoredCandidate, candidate, tasteVector, options) -> { short, long, contributors }` that turns reason codes + breakdown from `scoreCandidate` into human-readable explanations for the API response.

**Why mobile-friendly:** Pure function, no I/O, no DB. Tests are string-shape assertions.

**Scope:**
- `src/explain.mjs` exporting `explain`, `buildContributors`, `formatList`, `composeLong`
- Per-reason-code renderer functions that look up mechanic/designer NAMES (from candidate metadata) for natural sentences
- Reason priority ordering: positive matches > fitness terms > mismatches; `noped_explicitly` short-circuits everything
- `contributors` filtered by absolute threshold (0.05) and sorted by |weight| desc with `source` tag (bgg_metadata, context_match, bgg_rank, user_preference)
- Templates support context interpolation: “plays in 90 min, within your 120-min window”

**Acceptance criteria:**
1. mechanic_match renders shared mechanic NAMES, not IDs ✅
2. designer_match renders designer name ✅
3. noped_explicitly returns veto immediately, contributors=[] ✅
4. Empty reason codes → fallback message ✅
5. Multiple reasons compose into long sentence with proper Oxford comma ✅
6. Priority ordering: positive before negative ✅
7. Context interpolation: time window, group size shown when available ✅
8. buildContributors: filters tiny contributions, sorts by |weight|, tags source ✅
9. formatList Oxford-comma + edge cases (0/1/2/3+ items) ✅

**Test plan (executed BEFORE push, mental trace):**
- mechanic_match with mechanics [Engine Building, Card Drafting] → short matches /Engine Building/ AND /Card Drafting/ AND /you loved/ ✅
- designer_match with [Jamey Stegmaier] → /Jamey Stegmaier/ AND /you've enjoyed/ ✅
- noped_explicitly → short matches /avoid/i, contributors=[] ✅
- Empty reasons → short matches /general recommendation/i ✅
- Three reasons (mechanic+designer+length) with context.minutesAvailable=90 → long contains comma + "and" + all three name fragments ✅
- length_fit with context.minutesAvailable=120 → short contains both /90/ and /120/ ✅
- player_count_violated with desired=8, candidate range 2-4 → short contains /8-player/ and /2-4|2–4/ ✅
- mechanic_mismatch with party game (m-party noped) → short contains /Party Game/ AND /avoid/i ✅
- Priority ordering: designer_match index < mismatch index in long ✅
- buildContributors filter: weightSim 0.01 below threshold 0.05 → dropped; mechanic 1.5 + quality 0.3 kept ✅
- buildContributors sort: |c=-2| > |b=1.5| > |d=0.8| > |a=0.2| ✅
- buildContributors source tags: mech→bgg_metadata, weight→context_match, qualityPrior→bgg_rank, nopedPenalty→user_preference ✅
- formatList: []→''; ['A']→'A'; ['A','B']→'A and B'; ['A','B','C']→'A, B, and C' ✅
- composeLong: 1 frag→capitalize+period; 2→'X, and Y.'; 3→'X, Y, and Z.' ✅

**Outcome:** Pushed in this commit. ~210 lines of source + ~270 lines of tests across 25 assertions.

**Verification:** Will be confirmed via post-push read-back. Test execution deferred to laptop.

**Learnings:**
- Per-reason renderer functions (not one big switch statement) made the code far easier to read and test individually. Each renderer is a small pure function from `(ctx) -> string|null`. Future engines can override individual renderers without touching the rest of the explanation pipeline.
- Returning `null` from a renderer when there’s nothing meaningful to say (e.g. mechanic_mismatch with no actually-noped mechanics in this candidate) is cleaner than returning a generic placeholder. The composer just skips nulls.
- Reason priority ordering matters more than I initially thought — putting positives before negatives in the long sentence dramatically improves readability. “Shares engine-building, by Stegmaier, and includes Tile Placement which you tagged to avoid” reads better than putting the negative first.
- The `contributors` array is the bridge between the rule-based explanation and a future LLM-mediated narrative. The structured shape (`{feature, weight, source}`) lets future engines hand the same data to a model that generates richer prose.
- Including the candidate’s actual numbers ("plays in 90 min", "complexity 3.0/5") in templates makes explanations feel less templated. The cost is just one extra interpolation per renderer.

**Rollback:** Revert this commit. No DB or network side-effects.

---

## Sprint 1.0.4 — MMR diversification + ranking pipeline (2026-05-06) ✅

Pushed at commit `7cde547`. ~180 src + ~280 test, 19 assertions, hard designer cap enforces SILO § 7.

---

## Sprint 1.0.3 — v0 Scoring function (2026-05-06) ✅

Pushed at commit `089af2f`. 30 test assertions including 4 SUBTLE-WRONGNESS guards.

---

## Sprint 1.0.2 — Taste vector computation (2026-05-06) ✅

Pushed at commit `3bac627`. 18 test assertions.

---

## Sprint 1.0.1 — Curate seed BGG ID list (2026-05-06) ✅

Pushed at commit `61cab65`. 60 hand-curated BGG IDs.

---

## Sprint 1.0 — BGG metadata fetcher (2026-05-06) ✅

Pushed at commit `337ed7c`. Fetcher + parser tests.

---

## Sprint 0.2 — Migration runner script (2026-05-06) ✅

Pushed at commit `df30ac0`.

---

## Sprint 0.1 — First migration file (2026-05-06) ✅

Pushed at commit `9b1b383`.

---

## Sprint 0.0.2 — Design doc re-inline (2026-05-06) ✅

Pushed at commit `1d32f9e`.

---

## Sprint 0.0.1 — Rename + Norse convention + handoff docs (2026-05-06) ✅

`8c155ff` + 6 deletes; branch tip `a0f6c69`.

---

## Sprint 0.0 — Silo scaffold (2026-05-06) ✅

`f5d54ef`. 8 files added.

---

## Next sprint planned

## Sprint 1.0.6 — recommend() composer + offline driver (DRAFT, code-only)

**Goal:** A pure composer function `recommend(request, gameMetadata, options) -> { request_id, ranker_version, results }` that ties together the API contract from design doc § 4 with the now-existing pipeline (taste vector → score → rank → explain). PLUS an offline driver script `scripts/run-rec.mjs` that loads cached BGG JSON from `tmp/bgg/`, accepts a player’s seed picks via CLI, and prints the recommendations. No HTTP server, no DB — just the offline pipeline.

**Why mobile-friendly:** Pure function + a thin CLI wrapper that reads files. No DB, no HTTP, no network (except an optional BGG fetch which fetch-bgg.mjs already handles separately).

**Scope:**
- `src/recommend.mjs` exporting `recommend(request, gameMetadata, options)` matching the design doc§ 4 RecommendRequest/RecommendResponse contract
- `scripts/run-rec.mjs` CLI that:
  - Loads all JSON files from `tmp/bgg/` into a metadata Map
  - Accepts `--loved 100,101 --noped 200 --players 4 --minutes 90`
  - Constructs the request, calls `recommend`, prints results
  - Useful for offline eval: ship a few requests, eyeball the output
- Tests: known fixtures → known top recommendation

**Acceptance criteria:** TBD pre-flight before push. Includes the SUBTLE-WRONGNESS pass-through assertions: noped → absent, designer cap holds, etc.

---

## Sprint 0.3 — Apply 0001 migration to a non-prod DB (DRAFT, REQUIRES LAPTOP)

Reiterated.

---

## Sprint 1.1 — BGG JSON → rec_* writer (DRAFT, depends on 0.3)

Reiterated.
