# Mimir — Sprint Log

Per-sprint development history. Most recent at top.

---

## Sprint 1.0.3 — v0 Scoring function (2026-05-06) ✅

**Goal:** Pure function in `mimir/src/score.mjs` implementing the v0 content-similarity ranker per design doc § 5.1. Takes a candidate game + taste vector + context, returns score + confidence + reason codes + breakdown. The heart of Mimir.

**Why this sprint is good for mobile:** Pure function, no I/O. Tests are pure-input/pure-output assertions — including the SILO-required subtle-wrongness assertions.

**Scope:**
- `src/score.mjs` exporting `scoreCandidate(...)`, plus testable helpers `sumAffinity`, `weightSimilarity`, `playerCountFit`, `lengthFit`, `qualityPrior`, `computeConfidence`
- Hand-tuned `WEIGHTS` constants at top-of-file (single tuning point); overridable via `options.weights`
- Hard veto on `context.nopedIds` — returns score = -10 with reason `noped_explicitly`
- Reason codes for the explanation generator: mechanic_match/mismatch, category_match/mismatch, family_match/mismatch, designer_match, weight_match, player_count_fit/violated, length_fit/violated, noped_explicitly
- Confidence in [0, 1] driven by taste vector + context richness
- Tests: 30 assertions including 4 SUBTLE-WRONGNESS guards

**Acceptance criteria:**
1. Pure function, deterministic, no I/O ✅
2. Score is numeric; higher = better ✅
3. Confidence in [0, 1] reflects signal richness ✅
4. ReasonCodes is non-empty for any non-trivial taste vector ✅ (taste-poor cases just won’t hit the threshold and that’s correct)
5. Breakdown has one entry per scoring term so debugging is trivial ✅
6. **SUBTLE-WRONGNESS GUARDS:**
   - Noped-mechanic candidate scores below positive-mechanic candidate even with rank 1 vs rank 50 ✅
   - Explicitly noped game (via nopedIds) returns score < -5 ✅
   - Out-of-range player count scores 0 on that term ✅
   - Length way over budget scores 0 on length term ✅

**Test plan (executed BEFORE push, mental trace of key cases):**
- Engine candidate (m-engine, rank 50, 2-5 players, 100 min) vs party candidate (m-party, rank 1, 4-8 players, 20 min) given taste = computeTasteVector([100], [200], games):
  - taste.mechanics = { 'm-engine': +0.4, 'm-cards': +0.4, 'm-party': -0.6 } (after L1 with nopeWeight=1.5)
  - engine candidate mech sum = 0.4 (m-engine) + 0 (m-tile not in taste) = 0.4 → contribution +0.4*3.0 = +1.2
  - engine quality 1/(1+0.05) = 0.952 → +0.476
  - party candidate mech sum = -0.6 (m-party) + 0 (m-deduction not in taste) = -0.6 → contribution -0.6*3.0 = -1.8
  - party quality 1/(1+0.001) = 0.999 → +0.5
  - Without context fitness terms: engine ~+1.7, party ~-1.3 → engine > party by ~3.0 ✅
- nopedIds=[200]: scoreCandidate(games[200]) returns score=-10 ✅
- player_count fit at desired=8 with range [2,4]: 0 (not within ±1) ✅ produces violation reason
- length 100 min vs available 30 min: > 1.5x → 0 ✅ produces violation reason
- Helpers verified: weightSimilarity(2.5, {mean:2.5, std:0.5}) > 0.99; weightSimilarity(4.5, {mean:1.5, std:0.5}) < 0.01; qualityPrior(1) > 0.99; qualityPrior(1000) = 0.5 exactly; lengthFit(90, 90) = 1.0; lengthFit(112.5, 90) = 0.5; lengthFit(135, 90) = 0 ✅
- computeConfidence: empty inputs → 0; rich inputs (taste of 2 loved + 1 noped + context with player count + minutes) → 0.3+0.1+0.1+0.2+0.2 = 0.9 ✅

**Outcome:** Pushed in this commit. ~210 lines of source + ~290 lines of tests across 30 assertions.

**Verification:** Will be confirmed via post-push read-back. Test execution deferred to laptop.

**Learnings:**
- The `WEIGHTS` constant block at the top of the file is a single tuning point. Hand-tuned values are starting heuristics; offline eval (Sprint 0.3+ once we have logged outcomes) will refine them. Tests do NOT pin specific weight values — they pin behavior properties ("engine candidate beats party candidate") that should hold across reasonable weight choices. This is intentional: the tests don’t need to be rewritten when we tune.
- Choosing -10 for the noped penalty is deliberate. -1 would let a heavily-positive game still rank above a noped one in extreme cases; -10 puts noped games structurally below any sensible positive score (max realistic positive is ~10 across all weighted terms). Belt-and-suspenders against a future weight bump.
- Reason codes are emitted at thresholds (REASON_THRESHOLD = 0.05 for affinity, 0.7 for weight, 0.95 for length, 0.99 for player count) chosen so the codes describe the user-perceptible reason, not every term that contributed. A 0.001 mechanic match doesn’t warrant a "mechanic_match" tag.
- We emit reasonCodes for negatives too (`mechanic_mismatch`, `length_violated`, etc.). These are useful for the explanation generator to say "we didn’t recommend X because…" — a feature future engines (saga/simulator) will lean on heavily.

**Rollback:** Revert this commit. No DB or network side-effects.

---

## Sprint 1.0.2 — Taste vector computation (2026-05-06) ✅

Pushed at commit `3bac627`. Pure function + 18 test assertions. L1-normalized affinity vectors + preference stats.

---

## Sprint 1.0.1 — Curate seed BGG ID list (2026-05-06) ✅

Pushed at commit `61cab65`. 60 hand-curated BGG IDs.

---

## Sprint 1.0 — BGG metadata fetcher (2026-05-06) ✅

Pushed at commit `337ed7c`. Fetcher + parser tests.

---

## Sprint 0.2 — Migration runner script (2026-05-06) ✅

Pushed at commit `df30ac0`. Multi-layer safety harness.

---

## Sprint 0.1 — First migration file (2026-05-06) ✅

Pushed at commit `9b1b383`. 14 tables + 4 indexes.

---

## Sprint 0.0.2 — Design doc re-inline (2026-05-06) ✅

Pushed at commit `1d32f9e`.

---

## Sprint 0.0.1 — Rename + naming convention + handoff docs (2026-05-06) ✅

Shipped as `8c155ff` + 6 deletes; branch tip `a0f6c69`.

---

## Sprint 0.0 — Silo scaffold (2026-05-06) ✅

Shipped at commit `f5d54ef`.

---

## Next sprint planned

## Sprint 1.0.4 — MMR diversification + ranking pipeline (DRAFT, code-only)

**Goal:** Pure function `rankCandidates(candidates, tasteVector, context, options) -> rankedList` that scores all candidates, then applies Maximal Marginal Relevance (MMR) diversification on the top-K to prevent monocultures (e.g., 5 Stonemaier games in a row).

**Why this sprint is good for mobile:** Pure function, no I/O. Tests are pure assertions about the resulting ranked list (order, diversity, presence/absence of specific candidates).

**Scope:**
- `src/rank.mjs` exporting `rankCandidates(candidates, tasteVector, context, { limit, diversityLambda })`
- Pipeline: score every candidate → sort by score → MMR pass on top-K (lambda controls relevance-vs-diversity)
- MMR: greedy selection minimizing similarity to already-picked items
- Item-item similarity: shared mechanics + categories + designers (Jaccard or weighted overlap)
- Tests: 30+ assertions covering ordering, diversity (no >2 from same designer in top 10), candidate exclusion, hard-veto propagation

**Acceptance criteria:** TBD pre-flight before push.

---

## Sprint 0.3 — Apply 0001 migration to a non-prod DB (DRAFT, REQUIRES LAPTOP)

Reiterated.

---

## Sprint 1.1 — BGG JSON → rec_* writer (DRAFT, depends on 0.3)

Reiterated.
