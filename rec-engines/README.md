# Rec Engines

Experimental recommendation engines built under silo discipline. The platform's long-term recommendation strategy is multiple engines running in parallel with A/B-tested traffic distribution; this directory is where they live during development.

## Read first

- [`SILO.md`](./SILO.md) — the constitution. Rules every engine here must follow, naming convention, sprint discipline.
- [`HANDOFF.md`](./HANDOFF.md) — cross-engine context. Read this when resuming a session (especially laptop pickup from a mobile session).
- [`mimir/docs/recommendation-engine-design.md`](./mimir/docs/recommendation-engine-design.md) — the architectural design doc that informs all engines in this directory. Lives under `mimir/` because that's the foundation engine all others build on, but applies to the whole roadmap.

## Engines

- [`mimir/`](./mimir/) — Norse god of wisdom. **Foundation engine, mobile-buildable Phase 0 work complete.** Pure BGG metadata-based scoring. 168 tests green; migration runner + safety harness empirically validated against local Postgres.
- [`huginn/`](./huginn/) — Odin's raven of *thought*. **Phase 0 scaffold only.** Personalized PageRank over the typed multi-relational graph. Implementation begins when the platform has ≅50 active users with real edges (Phase 1+ of the platform roadmap).
- [`seidr/`](./seidr/) — Old Norse magic and divination. **Phase 0 complete pipeline + matcher.** Profile-driven engine: 18-question quiz emits a 24-dim player vector, cosine-matched against game profiles. Includes deployable HTML quiz, 50 curated questions, 24 dimensions, schema (`rec_seidr_*`), LLM pipeline (`scripts/profile-game.mjs`), profile validator, 7 hand-authored reference profiles, and the cosine matcher (`src/match.mjs`) with confidence-weighting + MMR diversification + designer cap + 8 subtle-wrongness assertions. 131/131 seidr tests pass. Awaiting only the top-500 LLM run (laptop, requires API key) for full activation.
- [`saga/`](./saga/) — Norse goddess of stories. **Phase 0 scaffold + locked architecture.** The breakthrough engine: Monte Carlo simulator + per-player fun model trained on recap data. Returns probability distributions over fun outcomes, not point estimates. The competitive moat — the engine that nothing else (BGG, Geek Buddy, etc.) can replicate without our recap data. Implementation deferred until ≥3000 recap records accumulate (estimated 12–18 months post-launch).

## Adding a new engine

See [`SILO.md`](./SILO.md) § "Adding a new engine" and § "Naming convention".

## Integration with production

Production code never imports from this directory. Integration happens via HTTP only (the rec engines expose endpoints under `/api/recs/<engine-name>/...`). A production-side "rec router" (not yet built; lives in `apps/me` or a dedicated package) is responsible for:

- Routing recommendation requests to the appropriate engine(s) based on A/B configuration (mimir for cold callers, huginn for callers with sufficient edges, future engines for richer scenarios)
- Aggregating results when running shadow mode (multiple engines on same request, log all, return one)
- Feature-flag enforcement
- Caller authentication (which production app is asking)

The rec router is a Phase 1+ concern. During Phase 0, engines are accessed only via internal admin tooling.
