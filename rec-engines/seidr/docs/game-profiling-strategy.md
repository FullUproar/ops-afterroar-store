# Game Profiling Strategy

*The missing piece in Manus's original algorithm design.*

## The problem

Seidr's algorithm matches a player's 24-dim profile against game 24-dim profiles via cosine similarity. Manus's algorithm doc says "Games in the database are profiled using the exact same 24-dimension vector space" but doesn't specify HOW games get those vectors.

Without game profiles, the algorithm can't actually produce recommendations. This is load-bearing infrastructure.

## Five candidate strategies (with our pick)

### Strategy A: Hand curation

**How:** A board game expert (or three) sits down and assigns each game a 24-dim vector by intuition.

**Pros:** High quality at the curated set. Defensible as expert opinion.

**Cons:** Doesn't scale. ~15 minutes per game means 500 games = 125 hours. ~10 hours per expert per week is realistic; takes 3 months. And expert disagreement on subjective dimensions (what's PSY_OPENNESS for Pandemic?) would require averaging or arguing.

**Verdict:** Reasonable for a tiny seed set (~20 reference games) but not for the full corpus.

### Strategy B: Heuristic mapping from BGG metadata

**How:** Write rules that translate BGG mechanics/themes/categories/weight to dimension scores. "Has cooperative mechanic = +SOC_COOP_COMP-1.0; has tile-placement mechanic = +0.3 PSY_CONSCIENTIOUSNESS; weight = 4.5 → MEC_COMPLEXITY = +0.8."

**Pros:** Fully automatable. Reproducible. Cheap.

**Cons:** Captures only a fraction of what makes a game feel a certain way. A heavy-rules game can still be socially light; an abstract game can have deep narrative through emergent play. The mapping is fragile and can produce embarrassing miscategorizations.

**Verdict:** A useful baseline for ~5–7 of the 24 dimensions (mostly MEC_*, some CTX_*, some AES_*) but inadequate for the psychological/social/aesthetic dimensions that drive real preferences.

### Strategy C: Crowd-sourcing via FLGS owners and BGG community

**How:** A web form where stores or community members rate games. Aggregate.

**Pros:** Scales (eventually). Captures diverse opinions.

**Cons:** Cold-start problem (need users to bootstrap). Volunteer bias. Slow ramp. Quality control hard.

**Verdict:** Excellent long-term layer but useless for v0 launch.

### Strategy D: Inferred from play outcomes

**How:** Once Afterroar has plays, votes, ratings, and recap data, train a model that predicts game profiles from observed play patterns. "Players who score high on PSY_KILLER tend to like Game X → Game X is high on PSY_KILLER affordance."

**Pros:** Empirically grounded. Improves with data.

**Cons:** Requires lots of data. Doesn't exist at launch.

**Verdict:** Phase 1+ refinement layer, not v0.

### Strategy E (chosen): LLM-generated profiles, validated

**How:** Prompt Claude (Anthropic API) to profile each game in the corpus against the 24 dimensions. Use a structured prompt with the dimension definitions, a few examples (gold standard reference profiles for ~20 games hand-curated by Shawn), and ask for the 24-dim vector + confidence per dimension + brief reasoning.

```
Given these dimension definitions and these reference games, profile [Wingspan] across all 24 dimensions.
For each dimension, give a score from -1.0 to +1.0 and a one-sentence justification.
```

**Pros:**
- Scales to 5000 games for ~$50 in API costs at current pricing
- Captures nuance Strategy B can't ("Wingspan's ranking on PSY_OPENNESS is moderate-low because while it's modern, the gameplay is conventional engine-building")
- Produces consistent output via prompt engineering
- Easy to refresh as dimensions evolve
- Per-dim reasoning is auditable

**Cons:**
- LLM hallucination risk (Claude might confidently misjudge a niche game)
- Requires manual validation pass for accuracy
- Per-dim accuracy varies (Claude is great on AES_* and PSY_*, weaker on emotion/cognitive without examples)
- Cost scales with corpus size (manageable at current pricing)

**Verdict:** Best v0 strategy. Combine with Strategy A (~20 hand-curated reference games) as in-context examples + ground truth for validation.

## v0 Implementation plan

### Step 1: Seed reference set (Strategy A subset)

Shawn (or a delegated expert) hand-curates 20 reference games drawn from the seed pool (Sprint 1.0.1's 60 games). Cover all weight tiers + all major mechanic families. Each gets a 24-dim profile + brief per-dim justification.

This takes maybe 5 hours. Output: `data/reference-game-profiles.json`.

### Step 2: LLM prompt + structured output

Using the Anthropic API + structured outputs, generate profiles for the next 480 games. Prompt template:

```
You are a board game expert profiling games for a recommendation system.

The profile uses 24 dimensions with these definitions:
[paste dimension-taxonomy.md content]

Reference profiles for calibration:
[paste 20 reference game profiles]

Profile this game: [game name + BGG metadata + ~200 word description]

Return JSON:
{
  "dimensions": {
    "PSY_ACHIEVEMENT": { "score": 0.0..1.0, "reasoning": "..." },
    ...
  },
  "overall_confidence": 0.0..1.0
}
```

### Step 3: Validation pass

Manually review 50 randomly-selected LLM-generated profiles. Check for:
- Outliers (a game scored at -1.0 or +1.0 on a dimension where the truth is more nuanced)
- Hallucinations (confidently wrong claims about gameplay)
- Internal consistency (Wingspan and Cascadia should be similar; if they're not, why?)

Editing tools: a simple web UI or just a JSON editor.

### Step 4: Iterate

If >5% of validations fail, refine the prompt with additional reference examples or stricter dimension definitions. Re-run for the failed games + adjacent unrun ones. Iterate until validation rate is stable.

### Step 5: Commit and version

Commit `data/game-profiles.json` to the repo. Version it (`v1.0.0`). Future regenerations bump version. Production seidr loads the latest version.

## Cost estimate

Claude Sonnet at current pricing (~$3/million input tokens, $15/million output):
- Input per game: ~5K tokens (prompt + dimension defs + reference examples)
- Output per game: ~500 tokens (24-dim JSON + reasoning)
- 500 games × 5500 tokens = 2.75M tokens ≈ $20–40 total

## Continuous refinement (Phase 1+)

Once Afterroar has actual play / vote / trade data:

1. **Compare LLM profiles against play-inferred profiles.** Where they differ, investigate. Often the LLM was right and the heuristic was wrong; sometimes vice versa.
2. **Per-game refinement.** When 100+ players have played a game and rated it, the empirical signal becomes strong enough to override the LLM profile. Migrate that game to `provenance: 'play_inferred'`.
3. **Batch regenerate** when dimensions change or new games release.

## Open questions

- **Cold-start for new games (post-launch).** A game just released has no plays yet. LLM profile is the only signal. Confidence: medium. Mark profiles `provenance: 'llm_generated_fresh'` so the matcher knows.
- **Edge cases: highly asymmetric games.** Games like Root or Vast have wildly different play experiences depending on faction. A single 24-dim vector averages across factions, losing detail. Future v2 may model per-faction profiles. v0 accepts the simplification.
- **Cultural specificity.** A game popular in Germany may have different psychological resonance than the same game in the US. v0 ignores this; future work may add culture-specific profile variants.
- **Edition/expansion handling.** Wingspan + European Expansion + Asia Expansion have different game profiles. v0 profiles base game; future v2 handles expansions as deltas.
