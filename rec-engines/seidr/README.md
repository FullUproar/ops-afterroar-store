# Seidr — Profile-Driven Recommendation Engine

*Seidr ("sayder"): Old Norse magic and divination. The seer uses limited but pointed signal — questions, omens, intuitions — to foresee. A quiz-driven recommender works the same way: 15–20 carefully chosen questions, then prediction.*

---

This engine consumes the output of a player questionnaire and matches it against game profiles in the same vector space to produce recommendations. Distinct from mimir (which uses BGG metadata + content similarity over `seed-loved`/`seed-noped` edges). Distinct from saga (the breakthrough simulator that needs months of recap data). **Seidr's job is to fill the gap between mimir's cold-start floor and saga's eventual ceiling, by absorbing the rich profile a quiz can extract in 5 minutes.**

## Why this engine exists

Mimir scores candidates by overlap of mechanic/category/family/designer attributes against a player's seed-loved/seed-noped pool. That works at cold start with 5–7 onboarding picks but plateaus quickly — the player's actual preferences span dimensions BGG metadata doesn't directly capture (achievement motivation, conflict tolerance, narrative appetite, etc).

A well-designed quiz extracts those dimensions in minutes. The output is a multi-dimensional player profile that **both seidr and saga can consume.** Seidr does the immediate match; saga (when it activates) treats the profile as a feature in its richer per-player fun model.

## Source research

Seidr's algorithmic foundation comes from the Manus AI Tabletop Recommendation Profiler (May 2026). Manus delivered a 4-page algorithm doc and a 118-question bank covering 21 dimensions across 5 clusters (PSY, SOC, MEC, AES, CTX).

**The Mimir engineering team applied editorial authority over Manus's deliverables**, per explicit user direction:
- Cut 80 redundant tournament-rearranged questions (118 → 38 from Manus)
- Tuned some Likert weight assignments where the inference was a stretch
- Added 12 new questions including 5 game-vs-game forced choices and coverage for emotion / cognitive / context dimensions Manus's bank didn't cover
- Expanded Manus's 21 dimensions to 24 by adding `EMO_TENSION`, `EMO_HUMOR`, `CTX_PLAYER_COUNT` (Manus's framework didn't cover these directly)
- Specified the missing piece in Manus's design — **how games get their 21–24-dim vectors** (see `docs/game-profiling-strategy.md`)

The full editorial critique is in `docs/manus-source-critique.md`.

## What's inside

- `data/dimensions.json` — 24 dimensions with descriptions, ranges, source citations
- `data/question-bank.json` — 50 curated questions (38 from Manus, edited; 12 new)
- `docs/algorithm.md` — 5-step deterministic algorithm (vector init → sample → weighted update → normalize → cosine match), with my critiques and improvements
- `docs/dimension-taxonomy.md` — each dimension explained with examples and edge mappings
- `docs/game-profiling-strategy.md` — the missing piece: how games get profile vectors. v0 strategy: LLM-generated profiles for top ~500 games, validated, refined via play outcomes
- `docs/manus-source-critique.md` — honest editorial pass of what Manus delivered
- `quiz-ui/` — deployable static HTML quiz. Loads `data/question-bank.json`, samples 18 questions, computes 21–24-dim profile client-side, displays results. **Drop-in deployable to Vercel/Netlify/GitHub Pages, or just open `index.html` in a browser.** Designed for pre-launch real-user testing.
- `migrations/` — (empty) seidr-specific tables (rec_seidr_player_profile, rec_seidr_game_profile) come in a future sprint when seidr starts writing to the DB.
- `src/`, `tests/` — (empty) implementation lands when seidr graduates from research to production.

## Phase activation

Seidr graduates from silo when:

1. Quiz UI is deployed and at least 30 real users have completed the questionnaire
2. Game profiling is complete for the top 500 BGG games (LLM-generated, manually validated for ~50 reference games)
3. Cosine-similarity matching produces sensible recommendations (manually verified by Shawn against 20+ test profiles)
4. The matching latency is < 100ms for limit=10 queries against 5000-game corpus
5. Subtle-wrongness assertions pass:
   - A player profiled as high-killer doesn't get cooperative-only recommendations
   - A player profiled as low-extraversion doesn't get party games as top picks
   - A player profiled with high CTX_TIME doesn't get 15-min fillers
6. Logging captures every quiz response and every recommendation outcome

Until all six are met, seidr stays in silo.

## How seidr complements mimir

Mimir and seidr are complementary recommenders that should run in parallel for any cold-start player:

| Engine | Signal source | Strongest at | Weakness |
|---|---|---|---|
| **mimir** | BGG metadata + seed-loved/noped edges | Cold start with 5–7 onboarding picks; players who know what they like | Limited dimensional coverage; can't read motivation or social style |
| **seidr** | Quiz-derived 21–24-dim profile | Players who took the quiz; rich personality/social/aesthetic signal | Requires quiz; profile may drift over time without retake |

**The rec router (production-side, future) blends them** based on which signals are available for a given caller. A player with both seed picks AND a quiz profile gets a richer combined ranking than either engine alone.

Later (saga, norns), the same quiz profile becomes priors that accelerate convergence — saga's per-player fun model uses the 24-dim profile as features alongside recap outcomes, so it produces useful recommendations months earlier than recap-data-only.

## Reading order

1. [`../HANDOFF.md`](../HANDOFF.md) — cross-engine context
2. [`../SILO.md`](../SILO.md) — silo rules, naming convention, sprint discipline
3. [`docs/manus-source-critique.md`](./docs/manus-source-critique.md) — what Manus delivered + editorial pass
4. [`docs/algorithm.md`](./docs/algorithm.md) — the deterministic scoring algorithm
5. [`docs/dimension-taxonomy.md`](./docs/dimension-taxonomy.md) — what each dimension means
6. [`docs/game-profiling-strategy.md`](./docs/game-profiling-strategy.md) — the missing piece in Manus's design
7. [`quiz-ui/`](./quiz-ui/) — deployable test UI
8. This README — engine context
9. `migrations/`, `src/`, `tests/` — implementation (when it lands)
