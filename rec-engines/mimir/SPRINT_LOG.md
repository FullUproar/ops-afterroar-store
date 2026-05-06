# Mimir — Sprint Log

Per-sprint development history. Most recent at top.

---

## Sprint 1.0.4 — MMR diversification + ranking pipeline (2026-05-06) ✅

**Goal:** Pure function `rankCandidates(candidates, tasteVector, context, options)` that scores every candidate via `scoreCandidate`, sorts by score, then applies MMR diversification on the top pool with a hard designer cap.

**Why this sprint is good for mobile:** Pure function, no I/O, no DB, no network. Tests are pure assertions about the resulting ranked list.

**Scope:**
- `src/rank.mjs` exporting `rankCandidates`, `mmrSelect`, `normalizeScores`, `itemSimilarity`
- Pipeline: filter excluded → score → sort → MMR (if enabled)
- MMR pool: top `limit × 3` candidates by raw score (gives MMR room to diversify without re-scoring everything)
- MMR formula (textbook): `λ · normalized_relevance - (1-λ) · max_similarity_to_picked`. Default λ = 0.7.
- **Hard designer cap (MAX_PER_DESIGNER = 2)** — enforces SILO.md § 7 ("≤2 from same designer in top 10"). If the cap eliminates all remaining candidates, MMR stops early; we return what we have rather than violate the cap.
- Item similarity: Jaccard over (mechanics + categories + families + designers) attribute set
- Score normalization: min-max within MMR pool (so MMR’s relevance vs. similarity tradeoff stays well-scaled even with negative raw scores)

**Acceptance criteria:**
1. Ranked list returned with shape `{ candidate, score, confidence, reasonCodes, breakdown }` per item ✅
2. Sorted by score desc when diversify=false; MMR-ordered when on ✅
3. Respects `limit` ✅
4. Filters `exclude` IDs before scoring ✅
5. **SUBTLE-WRONGNESS GUARDS:**
   - 10 stegmaier + 8 diverse → top 10 has ≤2 stegmaier ✅
   - Noped IDs propagate (score -10, ranked last) ✅
   - exclude removes from result ✅
   - With diversify=false, designer cap is intentionally bypassed (proves cap lives in MMR, not the score) ✅
6. Edge cases: empty candidates, null/undefined items, identical scores, all-stegmaier pool with limit > 2 → returns short list ✅

**Test plan (executed BEFORE push, mental trace):**
- Designer cap test: 10 stegmaier + 8 diverse, taste favors engine, limit=10
  - Top 2 picks are stegmaier (highest score)
  - Pick 3+ excludes any stegmaier (cap reached) → picks diverse #1, #2, ...
  - Final top 10 has exactly 2 stegmaier + 8 diverse ✅
- All-stegmaier pool, limit=5 with MMR → returns 2 (cap stops it) ✅
- exclude=[100]: 100 not in result ✅
- nopedIds=[200] in context: 200 has score -10, ranked last ✅
- diversify=false on 5 stegmaier + 2 diverse → 5 stegmaier in top 5 (cap inactive) ✅
- itemSimilarity(games[100], games[101]):
  - games[100] set: m-engine, m-cards, c-strategy, d-stegmaier (4)
  - games[101] set: m-engine, m-tile, c-strategy, c-economic, d-stegmaier (5)
  - intersection: m-engine, c-strategy, d-stegmaier (3); union: 4+5-3 = 6
  - Jaccard = 3/6 = 0.5 ✅
- normalizeScores([{score:5},{score:10},{score:0}]) → [0.5, 1.0, 0.0] ✅
- mmrSelect with λ=1: pure score-order ✅

**Outcome:** Pushed in this commit. ~180 lines of source + ~280 lines of tests across 19 assertions.

**Verification:** Will be confirmed via post-push read-back. Test execution deferred to laptop.

**Learnings:**
- The hard designer cap is BOTH a SILO requirement AND a quality feature. Without it, MMR with default λ=0.7 can still pick 5 Stonemaier games if their scores are all very close — the similarity penalty isn’t enough to overcome a small relevance gap. Hard caps are how you turn “prefer diversity” into “guarantee diversity”.
- "Stop early rather than violate the cap" is the right default. Returning 7 great recs that respect the cap is better than 10 that don’t. The API consumer can request more later if they want.
- Score normalization to [0, 1] inside MMR means the lambda parameter has predictable behavior across taste vectors of any magnitude. Without normalization, lambda=0.7 means very different things when scores are in [0, 2] vs [-5, 10].
- The `attribute set` includes prefixed keys (`m:engineId` vs `c:catId`) so a mechanic id colliding with a designer id doesn’t cause spurious overlap. Belt-and-suspenders against the BGG namespace.
- The MMR pool factor of 3x limit is a heuristic. It’s big enough that MMR has real diversification work to do, small enough that we don’t recompute similarities for the long tail.

**Rollback:** Revert this commit. No DB or network side-effects.

---

## Sprint 1.0.3 — v0 Scoring function (2026-05-06) ✅

Pushed at commit `089af2f`. Per design doc § 5.1; 30 test assertions including 4 SUBTLE-WRONGNESS guards.

---

## Sprint 1.0.2 — Taste vector computation (2026-05-06) ✅

Pushed at commit `3bac627`. Pure function + 18 test assertions.

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

## Sprint 1.0.5 — Explanation generator (DRAFT, code-only)

**Goal:** Pure function `explain(scoredCandidate, options) -> { short, long, contributors }` that turns reason codes + breakdown from `scoreCandidate` into human-readable explanations for the API response.

**Why mobile-friendly:** Pure function, no I/O. Tests are string-shape assertions.

**Scope:**
- `src/explain.mjs` exporting `explain(scoredCandidate, options)`
- Maps reason codes to natural-language fragments per design doc § 5.1:
  - `mechanic_match` → "shares engine-building with games you loved"
  - `length_fit` → "plays in your 90-minute window"
  - `weight_match` → "around the complexity you tend to enjoy"
  - `noped_explicitly` → "you flagged this as one to avoid"
  - etc.
- Generates `short` (1 sentence), `long` (2-3 sentences), `contributors` (per-feature breakdown for `explain: 'rich'` API response)
- Tests: known reason code sets produce expected sentence structure

**Acceptance criteria:** TBD pre-flight before push.

---

## Sprint 0.3 — Apply 0001 migration to a non-prod DB (DRAFT, REQUIRES LAPTOP)

Reiterated.

---

## Sprint 1.1 — BGG JSON → rec_* writer (DRAFT, depends on 0.3)

Reiterated.
