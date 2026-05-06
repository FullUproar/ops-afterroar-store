# Seidr Algorithm — Deterministic Profile-Driven Recommendation

## Overview

The algorithm has two phases: **profile extraction** (from quiz responses) and **game matching** (cosine similarity). Both are pure functions; deterministic given inputs.

Foundation comes from the Manus AI Tabletop Recommendation Profiler. Editorial improvements documented inline.

## Phase 1: Profile Extraction

### Step 1: Vector initialization

For every dimension `d` in the 24-dimension space:

```
V_user[d] = 0.0
C_user[d] = 0.0      # confidence: cumulative |weight| applied
N_user[d] = 0        # count: questions that hit this dimension
```

*(Editorial improvement vs Manus: explicit count tracking lets us compute confidence intervals later. Manus's algorithm only tracked C_user.)*

### Step 2: Question sampling

Sample 15–20 questions from `data/question-bank.json` (50 total). Sampling rules:

- **Each cluster (PSY, SOC, MEC, AES, CTX, EMO) hit ≥2 times.** This guarantees minimum dimensional coverage.
- **Mix formats**: at least 1 game-vs-game forced choice, at least 2 Likert, at least 2 "this-or-that" curated, at least 1 multiple choice.
- **Random within constraints** — deterministic per session via a seed (sessionId or random) but varies between sessions to avoid response fatigue if the same user retakes.

### Step 3: Answer processing

For each answer the user selects, retrieve `weights` dict. Update:

```
for (dim, weight) in answer.weights:
  V_user[dim] += weight
  C_user[dim] += abs(weight)
  N_user[dim] += 1
```

### Step 4: Normalization

Manus's formula (kept):

```
Profile[d] = V_user[d] / max(1.0, C_user[d])
```

This bounds Profile in [-1.0, +1.0] and prevents single-question-extreme outliers from dominating.

*Editorial note: This formula is approximate. A player who answered 1 question on dim X with weight +1.0 gets Profile[X] = 1.0 (max confidence). A player who answered 10 questions with average weight +0.5 gets Profile[X] = 0.5 (lower despite more data). This is fine for ordinal use (matching) but loses calibration. We document this as a known limitation; if matching quality plateaus, we revisit with a Bayesian approach (broad prior + iterative update).*

### Step 5: Confidence computation

*Editorial addition vs Manus: explicit confidence reporting.*

```
Confidence[d] = min(1.0, N_user[d] / 3.0)
```

A dimension hit by ≥3 questions is full-confidence (1.0). 1 question = 0.33. 0 questions = 0.0. The matcher (Phase 2) downweights low-confidence dimensions.

## Phase 2: Game Matching

### Step 6: Game profile retrieval

Load game profiles from `data/game-profiles.json` (or future `rec_seidr_game_profile` table). Each game has the same 24-dim vector.

*See `game-profiling-strategy.md` for HOW games get their profiles. This is the missing piece in Manus's original algorithm — the algorithm matches user vectors to game vectors but doesn't say where game vectors come from.*

### Step 7: Confidence-weighted cosine similarity

Manus's algorithm uses raw cosine similarity. Editorial improvement: weight each dimension by the user's confidence on that dimension.

```
similarity(user, game) = 
  sum_d (Confidence_user[d] * V_user[d] * V_game[d])
  / sqrt( sum_d (Confidence_user[d] * V_user[d])^2 )
  / sqrt( sum_d V_game[d]^2 )
```

Dimensions the user wasn't profiled on (Confidence = 0) drop out of the calculation entirely. This prevents the algorithm from confidently matching on a dimension we have no signal for.

### Step 8: Constraint application + ranking

Apply hard filters from request context (player count, time available, exclude_ids, etc — same shape as mimir's recommend()). Then rank remaining candidates by similarity descending. Apply MMR diversification + designer cap (same convention as mimir's rank.mjs).

### Step 9: Confidence-aware response

If the user's overall confidence (mean Confidence across dims) is below 0.4, return results with a `low_confidence: true` flag. Surface a UX prompt suggesting they answer more questions for better recommendations.

## Implementation notes

- **Pure function.** No I/O. Deterministic given inputs.
- **Same recommend() API contract as mimir.** Drop-in compatible with the future rec router.
- **Logged per the Sprint 1.0.8 logging helpers.** Every request, every candidate considered, every score breakdown.
- **Graduation criteria** include subtle-wrongness assertions (see README § "Phase activation"). High-killer player must not get cooperative recommendations; etc.

## What this algorithm is NOT

- Not a machine learning model. No training, no gradient descent, no fine-tuning. Pure deterministic.
- Not a replacement for mimir. Complementary.
- Not the breakthrough engine — saga is. This is the pre-saga acceleration.
- Not a personality test in the diagnostic sense. The 24-dim profile is a recommendation tool, not a personality assessment.

## Open questions

- **Bayesian refinement of normalization formula** when we have data to inform priors. Phase 1+ work.
- **Profile drift over time.** A player's profile may shift; should we encourage retake? Or auto-blend with play outcomes?
- **Multi-quiz profiles.** A player who takes the quiz multiple times — should each retake replace, or blend with the prior?
- **Group profile aggregation.** When a group plays together, can we aggregate individual profiles to a group profile? Mean? Soft-min? See saga's design notes for parallel discussion.
