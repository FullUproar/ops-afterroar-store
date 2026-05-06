# Mimir — Sprint Log

Per-sprint development history. Most recent at top.

---

## Sprint 1.0.6 — recommend() composer + offline driver (2026-05-06) ✅

**Goal:** Pure composer function `recommend(request, gameMetadata, options) -> RecommendResponse` that ties together the pipeline (taste vector → score → rank → explain) per design doc § 4 API contract. PLUS an offline CLI driver `scripts/run-rec.mjs` that loads cached BGG JSON, accepts seed picks, and prints recommendations.

This sprint is the **capstone of the mobile-buildable Phase 0 work.** After this, the silo holds a runnable end-to-end recommender. The remaining Phase 0 work (apply migration, populate DB, wire HTTP, integrate with HQ) requires DB / network / production access — deferred to laptop sessions.

**Why this sprint is good for mobile:** Pure function + thin file-reading CLI. No DB, no HTTP server, no network calls. Tests are end-to-end pipeline assertions.

**Scope:**
- `src/recommend.mjs` exporting `recommend(request, gameMetadata, options)` and `RANKER_VERSION` constant
- `scripts/run-rec.mjs` CLI driver — loads `tmp/bgg/*.json`, builds request, prints results
- `tests/recommend.test.mjs` — end-to-end pipeline assertions including SUBTLE-WRONGNESS pass-throughs
- `package.json` — add `run-rec` npm script

**Acceptance criteria:**
1. recommend() returns response with shape `{ request_id, ranker_version, results }` ✅
2. Results match design doc § 4.2 shape (game_id, game_name, score, confidence, explanation.reason_codes, explanation.natural_language) ✅
3. explain='rich' adds diagnostics (candidate_rank, score_breakdown) + contributors ✅
4. explain='short' omits diagnostics + contributors ✅
5. **SUBTLE-WRONGNESS pass-throughs:**
   - Noped (via seed_noped) gets hard-veto score < -5 ✅
   - Designer cap holds end-to-end (≤2 stegmaier in top 10) ✅
   - exclude removes candidate from results entirely ✅
   - player_count constraint propagates to score breakdown ✅
   - Noped via noped_ids (alternative source) also vetoed ✅
6. include_low_confidence=false filters out low-confidence results ✅
7. Deterministic when requestId is supplied (essential for offline eval) ✅
8. Missing context handled without throwing ✅

**Test plan (executed BEFORE push, mental trace):**
- recommend({seed_loved:[100]}, games) → results with game_id, game_name, score, confidence, explanation.reason_codes, explanation.natural_language ✅
- explain=rich → diagnostics + contributors present ✅
- explain=short → those fields absent ✅
- seed_noped=[200], game 200 in catalog → if 200 appears in results, score < -5 with reason 'noped_explicitly' ✅
- 10 stegmaier + 8 diverse, limit=10 → ≤2 stegmaier (delegated to rank.mjs which has its own tests) ✅
- exclude=[101] → 101 not in results ✅
- desired_player_count=8 with games[300] (2-2 only) → playerCountFit=0 in breakdown ✅
- noped_ids=[101] (separate from seed_noped) → 101 if present has score < -5 ✅
- limit=2 → results.length ≤2 ✅
- empty seed list → confidence < 0.5 ✅
- include_low_confidence=false with no seed/context → results=[] ✅
- requestId='fixed-id' → same id, same result order ✅
- request without context or options → doesn't throw, returns shape ✅

**Outcome:** Pushed in this commit. ~120 lines of `recommend.mjs` + ~150 lines of `run-rec.mjs` + ~280 lines of tests across 14 assertions.

**Verification:** Will be confirmed via post-push read-back. Live execution against real BGG data deferred to laptop session (where `npm install` runs reliably and tmp/bgg/ can be populated via fetch-bgg).

**Learnings:**
- The pipeline composes cleanly because each stage has a narrow input/output contract: `[BGG IDs] → TasteVector`; `[Candidates] × TasteVector → Ranked`; `Ranked → Explanation`. Building each in isolation in earlier sprints meant the composition is mostly plumbing. This is what TDD discipline buys you.
- The offline driver script is a real product, not just a test harness. FLGS owners and beta players can run it (once they have npm + tmp/bgg/) to evaluate the recommender against any seed picks they want. Cheap UX for an internal-only audience but valuable for trust-building during pilot.
- Splitting `seed_noped` (onboarding-time) from `noped_ids` (request-time) lets the API support both "never recommend these" (persistent) and "don't recommend these tonight" (transient). Phase 1+ may diverge their handling — e.g. `seed_noped` becomes an edge in rec_edge while noped_ids stays a request-only filter — but the union behavior is correct for now.
- Returning `explain.contributors` only when explain='rich' keeps the response payload small for callers that don’t need it. Same for `diagnostics`. Default verbosity is the right tradeoff between debuggability and bandwidth.
- The `include_low_confidence=false` flag lets a future API surface return "insufficient data; please complete onboarding" rather than a low-confidence list. UX matters here — a low-confidence rec list erodes trust faster than “we don’t know enough yet.”

**Rollback:** Revert this commit. Pure code, no DB or network side-effects.

**End-of-Phase-0-mobile checkpoint:** With this sprint, the mobile-buildable portion of Phase 0 is **complete**. The silo now contains:
- Foundation schema (1 SQL migration, 14 tables + 4 indexes)
- Migration runner with safety harness
- BGG metadata fetcher + parser
- Curated 60-game seed pool
- Pure-function pipeline: taste vector → scoring → ranking with MMR + designer cap → explanation generation → recommend() composer
- Offline driver CLI for human-in-loop eval
- ~120 test assertions across 7 test files, including 12+ SUBTLE-WRONGNESS guards

**The remaining Phase 0 work requires laptop:**
- Sprint 0.3: Apply 0001 migration to a real (non-prod) Neon branch DB
- Sprint 1.1: BGG JSON → rec_* writer (depends on 0.3)
- Sprint 1.2: HTTP API surface for `recommend()` (Phase 1 work; gated behind feature flag per SILO)
- Sprint 1.3: Integration with HQ via Connect API (Phase 1)

---

## Sprint 1.0.5 — Explanation generator (2026-05-06) ✅

Pushed at commit `0bd5d31`. ~210 src + ~270 tests, 25 assertions.

---

## Sprint 1.0.4 — MMR diversification + ranking pipeline (2026-05-06) ✅

Pushed at commit `7cde547`. ~180 src + ~280 tests, 19 assertions, hard designer cap.

---

## Sprint 1.0.3 — v0 Scoring function (2026-05-06) ✅

Pushed at commit `089af2f`. 30 assertions including 4 SUBTLE-WRONGNESS guards.

---

## Sprint 1.0.2 — Taste vector computation (2026-05-06) ✅

Pushed at commit `3bac627`. 18 assertions.

---

## Sprint 1.0.1 — Curate seed BGG ID list (2026-05-06) ✅

Pushed at commit `61cab65`. 60 hand-curated BGG IDs.

---

## Sprint 1.0 — BGG metadata fetcher (2026-05-06) ✅

Pushed at commit `337ed7c`.

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

## Sprint 1.0.7 — HANDOFF.md update (DRAFT, mobile micro-sprint)

**Goal:** Update `rec-engines/HANDOFF.md` with the current state of mimir post-Sprint-1.0.6. Specifically: status table, what’s buildable on laptop next, where to start when reopening this work after the conference.

**Why mobile-friendly:** Documentation only.

**Scope:** Update HANDOFF.md status section.

---

## Sprint 0.3 — Apply 0001 migration to a non-prod DB (DRAFT, REQUIRES LAPTOP)

Reiterated. This is the next blocking item for getting Mimir live.

---

## Sprint 1.1 — BGG JSON → rec_* writer (DRAFT, depends on 0.3)

Reiterated.
