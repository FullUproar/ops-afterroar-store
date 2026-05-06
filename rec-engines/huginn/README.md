# Huginn — Personalized PageRank Recommendation Engine

*Huginn ("thought"), one of Odin's two ravens. Flies the world each day to gather what is, then returns to whisper it in Odin's ear. Where Mimir is wisdom from accumulated knowledge, Huginn is thought — the active traversal of what's known to find what's relevant.*

---

The second rec engine for the Afterroar platform. **Personalized PageRank over the rec_* knowledge graph.** Once players have real edges (`played`, `voted-love`, `voted-nope`, `traded-in`), huginn dramatically out-recommends mimir for any caller with a meaningful interaction history.

## Why this engine exists

Mimir (the foundation engine) scores candidates by content similarity to a small seed taste vector. That works at cold-start but plateaus quickly: as soon as a player has real plays, votes, and trades, those signals dwarf the value of any taste vector you could compute from 5 onboarding picks.

Huginn picks up where mimir tops out: random walk with restart over the typed multi-relational graph, biased toward the player’s positive edges, with negative edges (`voted-nope`, `traded-in`) damping nearby nodes. The path through the graph IS the explanation — a key Credo-aligned property (no black-box rankings).

## Phase activation

Huginn does not activate until **≅50 active users with at least 5 real edges each**. Before that:
- The graph is too sparse for PPR to converge to anything meaningful
- Mimir’s content similarity is dominant
- The rec router (production-side, future) keeps 100% traffic on mimir

When the threshold is reached, the rec router can route traffic between mimir and huginn for A/B comparison. Huginn graduates from silo only when it consistently beats mimir on observed-outcome metrics over a defined evaluation window.

## What's inside

- `docs/design-notes.md` — Algorithm specifics: random walk parameters, edge weight integration, decay handling, convergence criteria
- `migrations/` — (empty) Any huginn-specific tables go here, e.g. `rec_huginn_pagerank_cache` if precomputation becomes needed
- `src/` — (empty) Implementation goes here when sprint 0.0 of huginn fires
- `tests/` — (empty) Tests will follow the same TDD discipline as mimir
- `SPRINT_LOG.md` — Sprint history starts when development begins
- `package.json` — Independent package; **no imports from mimir** (per SILO.md § 1)

## What's NOT yet built

Everything. This is a Phase 0 scaffold to validate the silo pattern with a second engine. Actual implementation begins when:

1. Sprint 0.3 of mimir is complete (schema applied to a real DB)
2. Sprint 1.1 of mimir is complete (BGG metadata loaded)
3. The platform has ≅50 active users with real edges (estimate: Phase 1 of the platform roadmap; possibly months out)

Until then, this directory is structure-only. Trying to `import` from huginn from production code or from mimir will return nothing useful.

## Graduation criteria (out of silo)

Huginn graduates from silo when ALL of these are true:

1. **End-to-end execution works.** PPR computation completes within ranker latency budget for typical group sizes.
2. **Performance.** Latency P99 < 500ms for `limit=10` requests against the live graph.
3. **Subtle-wrongness suite passes** (per SILO.md § 7) — the same assertions mimir already enforces, adapted for the PPR substrate.
4. **A/B beats mimir.** Over a defined eval window with sufficient traffic, huginn produces measurably higher acceptance / play-through rates than mimir for callers with ≥5 real edges.
5. **Logging is complete.** Same `rec_request_log` / `rec_candidate_log` / `rec_feedback_log` discipline as mimir.

## Reading order for new contributors / future Claudes

1. [`../HANDOFF.md`](../HANDOFF.md) — cross-engine context
2. [`../SILO.md`](../SILO.md) — silo rules, naming convention, sprint discipline
3. [`../mimir/docs/recommendation-engine-design.md`](../mimir/docs/recommendation-engine-design.md) — architectural spec for ALL engines (mimir authored it; huginn complies)
4. [`./docs/design-notes.md`](./docs/design-notes.md) — huginn-specific algorithmic notes
5. This README — engine context
6. `migrations/`, `src/`, `tests/` — implementation (when it exists)

## Why "huginn"?

Platform naming convention is Norse mythology (per SILO.md § "Naming convention"). Mimir is wisdom-as-stored-knowledge; huginn is thought-as-active-traversal — a perfect mapping for content-similarity vs. graph-traversal recommendation.

Future engines: muninn (memory → learned embeddings), saga (story → simulator), norns (fates → emergent gene-graph), yggdrasil (world tree → federated cross-store).
