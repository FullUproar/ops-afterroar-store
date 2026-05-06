# Huginn — Sprint Log

Per-sprint development history. Most recent at top.

---

## (no sprints shipped yet)

Huginn is a Phase 0 scaffold (validates the silo pattern with a second engine). Actual development begins at the trigger described in README.md § "Phase activation":

1. Mimir Sprint 0.3 complete (schema applied to real DB)
2. Mimir Sprint 1.1 complete (BGG metadata loaded)
3. Platform has ≅50 active users with ≥5 real edges each

When huginn development begins, the first sprint will follow mimir’s pattern:

## Sprint 0.0 — Huginn scaffold scaffold (FUTURE, DRAFT)

N/A — the engine directory was scaffolded as part of Mimir’s Sprint 1.0.12 to validate the silo pattern. When real implementation work begins, sprint 0.0 of huginn will be the first SPRINT_LOG entry.

## Sprint 0.1 — PPR computation core (FUTURE, DRAFT)

Pure function `personalizedPageRank(graph, personalizationVector, options) -> { nodeId -> rank }`. Power iteration over the rec_edge graph; converges in ~20 iterations for our scale. Decay applied at query time per design doc § 3.6. Tests cover convergence, personalization vector handling, negative-edge damping.

## Sprint 0.2 — Edge ingestion (FUTURE, DRAFT)

Functions to assemble the in-memory graph from `rec_edge` rows for a given personalization scope (player’s edges + their group’s recent edges + ancestor seed edges).

## Sprint 0.3 — Recommend integration (FUTURE, DRAFT)

`recommend(request, gameMetadata, options) -> RecommendResponse` matching mimir’s API contract exactly so the rec router can swap engines transparently. Same logging, same explanation surface.

## Sprint 0.4 — Path-based explanations (FUTURE, DRAFT)

Unique to huginn: the path through the graph IS the explanation. "Suggested because: Cascadia → (gene-similar) → Wingspan → (loved-by) → YourGroup." This is a key differentiator vs. mimir’s rule-based templates.

---

## Cross-engine notes

- Huginn shares the `rec_*` schema namespace with mimir per SILO.md § "Cross-engine coordination". Schema migrations affecting shared tables go in `mimir/migrations/`. Huginn-specific tables (e.g. `rec_huginn_pagerank_cache` if precomputation is added later) live in `huginn/migrations/`.
- Huginn does NOT import from mimir (per SILO.md § 1). Each engine is independent; the rec router (future, production-side) is the only thing that knows about both.
