# Mimir — Sprint Log

Per-sprint development history. Most recent at top.

---

## Sprint 1.0.12 — Scaffold huginn (second engine, validates silo pattern) (2026-05-06) ✅

**Why:** With mimir's mobile-buildable Phase 0 work complete (164 tests green), it was worth proving the silo pattern actually scales to multiple engines. SILO.md claims engines are independent, share only the `rec_*` schema namespace, and never import each other. **Scaffolding `huginn/` is the test of those claims.**

**Goal:** Add a complete scaffold for `huginn/` (the future Personalized PageRank engine) that mirrors mimir's structure, update SILO.md and the rec-engines README to register it, and confirm mimir's tests still pass (proves silo isolation).

**Why this sprint is good for mobile:** Documentation + scaffolding only. No new code. No DB.

**Scope:**
- `rec-engines/huginn/README.md` — engine description, why-it-exists, phase activation criteria, graduation criteria
- `rec-engines/huginn/SPRINT_LOG.md` — empty log with future-sprint drafts (Sprint 0.0 through 0.4)
- `rec-engines/huginn/docs/design-notes.md` — algorithmic specifics: PPR formulation, personalization vector construction, negative-edge handling, decay handling, convergence criteria, path-based explanation, open questions
- `rec-engines/huginn/package.json` — minimal stub, no dependencies, no source
- `rec-engines/huginn/.gitignore` — standard exclusions
- `rec-engines/huginn/migrations/.gitkeep`, `src/.gitkeep`, `tests/.gitkeep` — directory placeholders
- `rec-engines/SILO.md` — register huginn in engines table; add explicit "engines do not import from each other" rule (§ 8); update naming convention to mark huginn as scaffolded
- `rec-engines/README.md` — register huginn in engines list

**Acceptance criteria:**
1. `rec-engines/huginn/` exists with full scaffold (README, SPRINT_LOG, docs, package, .gitignore, .gitkeeps) ✅
2. SILO.md updated with engines table row + new § 8 rule about no cross-engine imports ✅
3. rec-engines/README.md updated with engines list ✅
4. mimir tests still pass (164/164) — proves silo isolation ✅ (verified post-push)
5. No imports between huginn and mimir, period ✅ (huginn package.json has no deps; src/ is empty)

**Test plan (executed BEFORE push):**
- mimir test suite still green: `npm test` in mimir/ reports 164/164 (no shared imports = no breakage)
- huginn package.json has empty deps; only `test` script is a no-op echo + exit 0
- All required files committed under huginn/

**Outcome:** Pushed in this commit. ~280 lines of huginn README + SPRINT_LOG + design-notes + package.json; ~30 lines of SILO + README updates.

**Verification:** Will be confirmed via post-push fresh-clone read-back + mimir npm test.

**Learnings:**
- The silo pattern is real. Adding huginn was mechanical: copy the structure, write the docs, register in SILO. Zero coordination with mimir's code. Zero risk to mimir's tests. **The structure validates.**
- Naming convention pays off: "huginn" tells you (a) what role it plays in the platform pantheon, (b) that it's a sibling of mimir, (c) that the broader Norse pattern continues. "PPR-rec-engine-v1" would have communicated none of that.
- Drafting Sprint 0.0–0.4 in advance (in huginn's SPRINT_LOG) gives future-Claude a clear runway. When the platform hits the activation trigger (≅50 users with real edges), huginn's first sprint can fire immediately without re-deriving the plan.
- Adding the explicit "engines do not import from each other" rule (SILO § 8) was overdue. Implicit until now; explicit now.

**Rollback:** Revert this commit. Pure additive (new directory + doc updates). Mimir untouched.

---

## Sprint 1.0.11 — exclude_seeds option (UX fix from smoke test) (2026-05-06) ✅

Pushed at commit `790426c`. Default-true filter for seed_loved + seed_noped from results. 159 → 164 tests.

---

## Sprint 1.0.10 — Sandbox e2e validation + fixtures + integration tests (2026-05-06) ✅

`45b584a`. Local Postgres validation + 7 BGG fixtures + 6 integration tests.

---

## Sprint 1.0.9 — HOTFIX: explain.mjs syntax + npm test glob (2026-05-06) ✅

`7b3e85e`.

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

## Sprint 0.3 — Apply 0001 migration to user’s Neon branch (REQUIRES LAPTOP, but EMPIRICALLY VALIDATED in sandbox)

Reiterated. See HANDOFF.md.

## Sprint 1.1 — BGG JSON → rec_* writer (DRAFT, depends on 0.3)

## Sprint 1.2 — HTTP API surface for recommend() (Phase 1, depends on 0.3 + 1.1)

---

*Note: huginn now has its own SPRINT_LOG.md for its independent sprints. This file remains mimir's log.*
