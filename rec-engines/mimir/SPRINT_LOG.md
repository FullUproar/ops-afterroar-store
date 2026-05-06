# Mimir — Sprint Log

Per-sprint development history. Most recent at top.

---

## Sprint 1.0.13 — Recap data spec for HQ recap UI v1 (2026-05-06) ✅

**Why:** The saga engine (the recommendation breakthrough; Monte Carlo simulator with per-player fun model) trains on structured recap data. Without that data captured AT THE TIME each game-night happens, saga has nothing to learn from when it activates 18–30 months from now. **Retrofitting structured fields onto recaps that already happened is impossible** — players don’t accurately remember whether they had fun three months ago.

The trade-off:
1. Spend ~2 weeks of HQ engineering now to ship the recap UI with structured fields per this spec.
2. Or accept that saga can’t ship until 12+ months AFTER the recap UI is rebuilt later — and the data captured before the rebuild is unusable for training.

Option 1 dominates. This sprint authors the contract for option 1.

**Goal:** Formal spec for HQ’s recap UI v1 — the structured fields, schema mapping, validation rules, API shape, privacy boundaries, edge cases, and UI guidance. The contract between mimir (recommender) and HQ (data producer).

**Why this sprint is good for mobile:** Pure docs.

**Scope:**
- `mimir/docs/recap-data-spec.md` — ~370-line spec covering:
  - Hard requirements + MUST-NOTs for the UI
  - Per-game fields (8) and per-player-per-game fields (8)
  - Schema mapping to existing `rec_recap_outcome` + proposed `rec_recap_game` table for follow-up migration
  - Suggested API endpoint signature with TypeScript request shape
  - Validation rules (warn-not-block discipline)
  - Privacy boundaries per Credo § 1
  - Edit-after-publish (30-day window + history table)
  - Late-arriving recap data handling
  - Multi-game-night handling
  - What NOT to capture (and why)
  - UI guidance (non-prescriptive)
  - Open questions for HQ team to resolve
  - Versioning + backwards compatibility plan
- SPRINT_LOG entry capturing the rationale and contract

**Acceptance criteria:**
1. Spec is self-contained — HQ team can implement v1 from this doc alone, no follow-up needed ✅
2. Every field in design doc § 9 is covered + extended with saga-driven additions (engagement_level, learned_today, taught_today) ✅
3. Schema mapping is concrete (which existing column, which proposed-new column) ✅
4. Privacy boundaries match Credo § 1 (player owns own data; aggregation requires k≥5 + cell\_size≥3) ✅
5. Validation discipline articulated: warn, don’t block, accept incomplete data ✅
6. Versioned (v1.0.0) with explicit upgrade path ✅

**Test plan:**
- N/A (pure docs)
- Cross-reference against Mimir design doc § 9: extends + operationalizes, no contradictions ✅
- Verify all fields have type, required-status, semantics, and "why it matters" ✅
- Spot-check that the spec is HQ-actionable (no "TBD" on any required behavior) ✅

**Outcome:** Pushed in this commit. Single ~370-line spec doc.

**Verification:** Will be confirmed via post-push fresh-clone + visual read.

**Learnings:**
- The spec went from "6 fields per design doc § 9" to **16 fields total (8 per-game + 8 per-player-per-game)** when stress-tested against saga’s actual modeling needs. Two of the new fields (`learned_today`, `taught_today`) come directly from saga’s group-dynamics simulator (rules-teacher fatigue, learning-game pattern).
- Authoring the spec surfaces operational details that the design doc skipped: edit-after-publish window, late-arriving recap weighting, multi-game-night handling, validation discipline. These are HQ-team-facing details that don’t belong in an architectural doc but very much belong in an implementation contract.
- Privacy boundaries needed an explicit aggregation floor (k≥5 attributing players + cell-size≥3) for the data co-op model to be honest. Per Credo § 1, players own their data; aggregation that could re-identify is therefore prohibited.
- The "warn, don’t block" validation discipline is critical and underappreciated. A recap UI that refuses to submit because `fun_rating` is missing collapses capture rate to near-zero. A recap UI that accepts everything and validates after gets 5–10x more data, with imperfections that the rec engine can accommodate.

**Rollback:** Revert this commit. Pure additive doc.

---

## Sprint 1.0.12 — Scaffold huginn (second engine, validates silo pattern) (2026-05-06) ✅

Pushed at commit `524e774`. Huginn engine scaffolded with full README + SPRINT_LOG + design notes + .gitignore + package.json. SILO.md § 8 added ("engines do not import from each other"). Mimir tests still pass (164/164) — silo isolation confirmed.

---

## Sprint 1.0.11 — exclude_seeds option (UX fix from smoke test) (2026-05-06) ✅

`790426c`. 159 → 164 tests.

---

## Sprint 1.0.10 — Sandbox e2e validation + fixtures + integration tests (2026-05-06) ✅

`45b584a`.

---

## Sprint 1.0.9 — HOTFIX: explain.mjs + npm test glob (2026-05-06) ✅

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

## Sprint 1.0.14 — Scaffold saga (the breakthrough engine) (DRAFT)

**Goal:** Like huginn (Sprint 1.0.12), scaffold `saga/` with README + SPRINT_LOG + design-notes for the Monte Carlo simulator engine. Pure docs + structure.

**Why mobile-friendly:** Documentation only.

**Scope:** Same shape as huginn scaffold. Saga’s design notes are richer because saga IS the breakthrough — should cover the per-player fun model (training data shape, target loss), the soft-min aggregator (CES form, learned variant), stochastic events, Monte Carlo convergence, narrative generation, counterfactual evaluation, federated learning Phase 4 path.

## Sprint 0.3 — Apply 0001 migration to user’s Neon branch (REQUIRES LAPTOP, but EMPIRICALLY VALIDATED in sandbox)

Reiterated.

## Sprint 1.1 — BGG JSON → rec_* writer (DRAFT, depends on 0.3)

## Sprint 1.2 — HTTP API surface for recommend() (Phase 1, depends on 0.3 + 1.1)
