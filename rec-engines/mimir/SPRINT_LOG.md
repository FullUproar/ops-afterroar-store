# Mimir — Sprint Log

Per-sprint development history. Most recent at top.

---

## Sprint 1.0.2 — Taste vector computation (2026-05-06) ✅

**Goal:** Pure function in `mimir/src/taste-vector.mjs` that converts a player's seed-loved + seed-noped game IDs (with BGG metadata for those games) into a multi-dimensional taste vector (mechanics, categories, families, designers + weight/players/time preference stats). The scorer (Sprint 1.0.3) consumes this vector to rank candidate games.

**Why this sprint is good for mobile:** Pure function, no I/O, no DB, no network. Tests are pure-input/pure-output assertions.

**Scope:**
- `src/taste-vector.mjs` exporting `computeTasteVector(seedLoved, seedNoped, gameMetadata, options)`, plus utility helpers `l1Normalize` and `stats`
- Loved games contribute +1 per axis; noped games contribute `-nopeWeight` (default 1.5); axis maps are L1-normalized so vectors are comparable across players with different seed counts
- Weight / player count / play time preferences computed as mean+std over loved games only (noped games inform what to avoid but don't shift mean toward an aspiration we don’t hold)
- Tests: 18 assertions covering happy paths, edge cases, normalization invariants, Map vs object inputs, null/undefined inputs

**Acceptance criteria:**
1. Pure function: no I/O, no globals, deterministic given inputs ✅
2. Handles empty seed lists → zero vector ✅
3. Handles one-sided seeds (loved-only or noped-only) ✅
4. nopeWeight parameter amplifies negative signal share ✅
5. L1 normalization invariant: sum-of-abs-values = 1 for non-empty axis ✅
6. Unknown IDs filtered without throwing ✅
7. Both Map and plain-object metadata accepted ✅

**Test plan (executed BEFORE push, mental trace):**
- Empty seeds → mechanics = {}, weightPreference.count = 0 ✅
- Loved [100, 101] only:
  - m-engine appears in both (sum=2), m-cards once (sum=1), m-tile once (sum=1). Total abs=4. After L1: m-engine=0.5, m-cards=0.25, m-tile=0.25. m-engine top. ✅
  - d-stegmaier in both → single designer with weight 1.0 ✅
  - weight mean = (3.0 + 3.2) / 2 = 3.1 ∈ (2.5, 3.5) ✅
- Noped [200, 201] only:
  - m-party in both (sum=-3), m-deduction once (sum=-1.5). After L1: m-party=-2/3, m-deduction=-1/3. m-party most negative. ✅
  - weightPreference.mean = null (no loved games) ✅
- Mixed loved [100], noped [200], nopeWeight=1: m-engine=+1, m-cards=+1, m-party=-1, m-deduction=-1. Sum |x| = 4 → each ±0.25, total |x|/L1 sum = 1.0 ✅
- nopeWeight amplification: with nopeWeight=2 vs 1, |-share of m-party| grows from 0.25 to 1/3 ✅
- Unknown ID 999: lovedFound=1 of 3 ✅
- Empty mechanics array: no contributions, no NaN ✅
- Map input: same result ✅
- null seedLoved/seedNoped: count=0 ✅
- l1Normalize({}) = {} ✅; ({a:0, b:0}) = {} ✅ (no divide by zero)
- l1Normalize({a:2, b:3}) = {a:0.4, b:0.6} ✅
- stats([]) = {mean:null, std:null, count:0} ✅; stats([5]) = {mean:5, std:0, count:1} ✅; stats([1,2,3]).std = √(2/3) ✅

**Outcome:** Pushed in this commit. ~140 lines of source + ~220 lines of tests. 18 assertions across the function and its two exported helpers.

**Verification:** Will be confirmed via post-push read-back. Test execution (`npm test`) deferred to laptop session where `npm install` runs reliably.

**Learnings:**
- The default `nopeWeight = 1.5` is a hand-tuned starting point. Once we have real onboarding data, an offline eval will tell us whether the right value is 1.0, 1.5, 2.0, or even per-mechanic. The constant lives at the top of the file (DEFAULT_NOPE_WEIGHT) precisely to make tuning a one-line change.
- Computing weight/players/time preferences from loved games only is intentional: the noped set is a constraint surface (“don’t go here”), not an aspiration (“go over there”). The scorer can use the mean+std as a Gaussian-like fit and downweight games far from it; that captures the right behavior without conflating “dislike” with “prefer-the-opposite-of”.
- L1 normalization (vs L2) is intentional too. With L1, a player with strong opinions on 10 mechanics has each weight at ~0.1; with L2, the same player’s top mechanic might be 0.4 due to the squared-sum normalization. L1 keeps the interpretation as “share of the player’s attention,” which is what we want for additive scoring.
- Storing keys as strings in the output objects is a small concession to JS’s object key coercion. The scorer will need to coerce candidate game ids the same way; documenting this in the type comment.

**Rollback:** Revert this commit. No DB state, no network side-effects, no other consumers depend on this yet.

---

## Sprint 1.0.1 — Curate seed BGG ID list (2026-05-06) ✅

Pushed at commit `61cab65`. 60 hand-curated BGG IDs spanning 6 weight tiers and 14+ mechanic families.

---

## Sprint 1.0 — BGG metadata fetcher (2026-05-06) ✅

Pushed at commit `337ed7c`. Fetcher + parser tests.

---

## Sprint 0.2 — Migration runner script (2026-05-06) ✅

Pushed at commit `df30ac0`. Multi-layer safety harness + 18 test assertions.

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

## Sprint 1.0.3 — Scoring function (DRAFT, code-only)

**Goal:** Pure function in `mimir/src/score.mjs` that takes a candidate game (BGG metadata shape) + a taste vector + a context (player count, time-available, etc.) and returns a numeric score plus reason codes.

**Why this sprint is good for mobile:** Pure function. No I/O. Tests are pure-input/pure-output.

**Scope:**
- `src/score.mjs` exporting `scoreCandidate(candidate, tasteVector, context, options) -> { score, confidence, reasonCodes, breakdown }`
- Implements the v0 algorithm from design doc § 5.1: weighted sum of mechanic_overlap, theme_overlap, weight_similarity, player_count_fit, length_fit, designer_match, quality_prior — minus already_played_recently_penalty and seed_noped_penalty
- Hand-tuned weights (w1…w9) live at the top of the file as named constants
- Returns reason codes (e.g. ['mechanic_match', 'length_fit', 'designer_match']) for the explanation generator (Sprint 1.0.5)
- Returns score breakdown so debugging can answer "why did this game score what it did?"
- Tests: known taste vectors + known candidates produce expected ranking behavior (engine-loving vector ranks engine games above party games; player count constraint excludes solo-only games when 4 players; etc.)

**Acceptance criteria:**
1. Pure function, deterministic, no I/O ✅ (will verify)
2. Score is a number; higher = better
3. confidence is a number in [0, 1] reflecting how much signal the taste vector carried
4. reasonCodes is a non-empty array for any non-zero score
5. breakdown has one entry per scoring term so debugging is trivial
6. SUBTLE-WRONGNESS test (per SILO.md § 7): a candidate whose mechanics are all in the noped set scores lower than one with positive overlap, even if the candidate has higher BGG rank

**Test plan TBD pre-flight before push.**

---

## Sprint 0.3 — Apply 0001 migration to a non-prod DB (DRAFT, REQUIRES LAPTOP)

Reiterated.

---

## Sprint 1.1 — BGG JSON → rec_* writer (DRAFT, depends on 0.3)

Reiterated.
