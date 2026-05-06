# Mimir — Sprint Log

Per-sprint development history. Most recent at top.

---

## Sprint 1.0.11 — exclude_seeds option (UX fix from smoke test) (2026-05-06) ✅

**Why:** Smoke test in Sprint 1.0.10 revealed a UX defect. When a player sets `seed_loved: [Wingspan, Terraforming Mars]`, the top recommendations were Wingspan and Terraforming Mars themselves — i.e. games the player had just told us they already love. Recommending games-the-player-already-loves is bad UX.

**Goal:** Add an `exclude_seeds` option to the request, defaulting to `true`, that filters seed_loved + seed_noped from the candidate pool BEFORE scoring. Provide an opt-out (`exclude_seeds: false`) for niche use cases (eval harness, debugging, legacy behavior).

**Why this sprint is good for mobile:** Pure additive code change + tests. No I/O, no DB.

**Scope:**
- `src/recommend.mjs` — union seed IDs into the existing `exclude` set when `exclude_seeds !== false`
- `tests/recommend.test.mjs` — 5 new tests covering both default and opt-out paths
- Updated existing `SUBTLE WRONGNESS: noped game has hard-veto score` test to use `exclude_seeds: false` so it actually exercises the hard-veto path (default would now filter the noped seed before scoring, leaving the conditional assertion vacuous)

**Acceptance criteria:**
1. Default behavior (no flag): seed_loved + seed_noped excluded from results ✅
2. `exclude_seeds: false`: legacy behavior preserved (seeds appear) ✅
3. With opt-out, seed_noped still gets hard-veto score (-10) when in results ✅
4. The hard-veto code path is still exercised by tests (via opt-out) ✅
5. Total test count increases from 159 to 164; all pass ✅

**Test plan (executed BEFORE push):**
- Local sandbox clone, npm install
- Apply patch, run npm test
- Verify 164/164 pass
- Run `npm run run-rec --loved 167791,266192 --noped 178900` and confirm seed games no longer appear at top

**Outcome:** 164/164 tests pass. Smoke test now produces UX-correct output:

```
Before Sprint 1.0.11 (engine-lover, loved TM + Wingspan):
  1. Wingspan (loved!)
  2. Terraforming Mars (loved!)
  3. Pandemic
  4. Cascadia
  5. Twilight Imperium
  6. Ark Nova
  7. Codenames (noped, hard-vetoed)

After Sprint 1.0.11 (same input):
  1. Pandemic
  2. Cascadia
  3. Ark Nova
  4. Twilight Imperium: Fourth Edition
```

The seed-loved games are gone from results. Codenames is gone (filtered as seed_noped). Real recommendations only.

**Verification:** Will be confirmed via post-push fresh-clone read-back.

**Learnings:**
- The smoke test in Sprint 1.0.10 was the canary. The unit tests passed because they checked SHAPE, not content; the integration tests passed because their assertions were conditional. **Smoke testing with realistic data revealed what unit + integration tests couldn’t.** Worth running smoke tests as part of every meaningful release.
- The opt-out (`exclude_seeds: false`) is genuinely useful: the `SUBTLE WRONGNESS: noped game has hard-veto score` test now uses it explicitly to exercise the hard-veto code path. Without the opt-out, that test would either be vacuous or have to use `noped_ids` instead of `seed_noped` (different semantic).
- Defaulting to true for new options is the right call when the new behavior is unambiguously better. Backwards compatibility doesn’t matter when no production consumer exists yet.
- Following Sprint 1.0.9’s discipline: this sprint did NOT push until `npm test` ran green locally. **"Verify" means actually running, not mentally tracing.** That habit caught nothing this time, which is itself the result we want.

**Rollback:** Revert this commit. Pure additive change.

---

## Sprint 1.0.10 — Sandbox e2e validation + fixtures + integration tests (2026-05-06) ✅

Pushed at commit `45b584a`. Local Postgres validation + 7 BGG fixtures + 6 integration tests. Migration runner + safety harness empirically proven.

---

## Sprint 1.0.9 — HOTFIX: explain.mjs syntax + npm test glob (2026-05-06) ✅

`7b3e85e`. Caught by real `npm test`.

---

## Sprint 1.0.8 — Logging helpers (2026-05-06) ✅ (`dacc20b`)
## Sprint 1.0.7 — HANDOFF.md update (2026-05-06) ✅ (`5690d21`)
## Sprint 1.0.6 — recommend() composer + offline driver (2026-05-06) ✅ (`f6e60db`)
## Sprint 1.0.5 — Explanation generator (2026-05-06) ✅ (`0bd5d31`)
## Sprint 1.0.4 — MMR diversification + ranking pipeline (2026-05-06) ✅ (`7cde547`)
## Sprint 1.0.3 — v0 Scoring function (2026-05-06) ✅ (`089af2f`)
## Sprint 1.0.2 — Taste vector computation (2026-05-06) ✅ (`3bac627`)
## Sprint 1.0.1 — Curate seed BGG ID list (2026-05-06) ✅ (`61cab65`)
## Sprint 1.0 — BGG metadata fetcher (2026-05-06) ✅ (`337ed7c`)
## Sprint 0.2 — Migration runner script (2026-05-06) ✅ (`df30ac0`)
## Sprint 0.1 — First migration file (2026-05-06) ✅ (`9b1b383`)
## Sprint 0.0.2 — Design doc re-inline (2026-05-06) ✅ (`1d32f9e`)
## Sprint 0.0.1 — Rename + Norse convention + handoff docs (2026-05-06) ✅ (`8c155ff` + 6 deletes → tip `a0f6c69`)
## Sprint 0.0 — Silo scaffold (2026-05-06) ✅ (`f5d54ef`)

---

## Next sprint planned

## Sprint 0.3 — Apply 0001 migration to user’s Neon branch (REQUIRES LAPTOP, but EMPIRICALLY VALIDATED in sandbox)

Reiterated. See HANDOFF.md.

## Sprint 1.1 — BGG JSON → rec_* writer (DRAFT, depends on 0.3)

## Sprint 1.2 — HTTP API surface for recommend() (Phase 1, depends on 0.3 + 1.1)
