# Huginn — Algorithmic Design Notes

Notes specific to the Personalized PageRank engine. The architectural design doc that applies to ALL engines lives at `../mimir/docs/recommendation-engine-design.md`.

---

## What PPR is and why it fits here

Personalized PageRank (PPR) is a random walk with restart over a graph, where the restart distribution is biased toward a personalization vector representing the user’s positively-weighted nodes. Iterate the linear update

```
  r = (1 - α) · M · r + α · p
```

until `r` converges (typically ~20 iterations for our scale). `α` is the teleport probability (0.15 is a reasonable default), `M` is the column-normalized graph adjacency matrix, `p` is the personalization vector.

For the rec_engines use case:
- Nodes: games, players, mechanics, themes, designers, groups, nights, stores
- Edges: typed (per design doc § 3.4), signed, timestamped
- Personalization vector: caller’s positively-weighted nodes (loved games, group members’ recent plays, owned games, etc.) — determined by surface
- Output: PPR scores for every Game node; top-K with diversification + designer cap is the recommendation

Why PPR fits:
- **No training required.** Compute on demand from the live graph.
- **Cold-game handles itself.** A new game with only a few `designed-by` and `has-mechanic` edges still gets a PPR score from neighbors; no special cold-start logic.
- **Path-based explanation.** The walk paths ARE the reasoning: "reached this game via mechanic-overlap with what you loved."
- **Negative edges damp naturally.** A negative-weight edge to a noped node propagates damping through neighbors. No special-case logic.
- **Decay applied at query time.** Per design doc § 3.6, edge weights decay by type-specific half-lives at query time (not stored). PPR consumes the decayed weights directly.

## When to use huginn vs. mimir

A caller is appropriate for huginn when:

- Caller has ≥5 real edges (loved/noped/played/voted/etc.). Below that, the personalization vector is too thin and PPR effectively guesses.
- The candidate pool size is moderate (≤1000). PPR over 100K games converges fast (~20 iterations); the graph traversal cost is in the matrix-vector product, which scales linearly with edges.
- Logged outcomes show huginn beats mimir on this caller’s historical interactions in offline eval.

A caller stays on mimir when:

- Edge count <5 (cold start)
- Caller has unusual taste (very few loved edges, lots of nopes) — PPR may amplify the negative signal in counterintuitive ways. Mimir’s simpler scoring is more predictable.
- The pool is filtered to a tiny subset (e.g. "only games stocked at this store") — mimir’s direct scoring is more efficient than building a subgraph.

The rec router (production-side, future) makes this routing decision per request based on caller properties + A/B configuration.

## Personalization vector construction

For a player p, the personalization vector is built from:

```
  positive contributors:
    - p’s loved games (weighted by recency-decayed edge weight)
    - p’s group’s recently-played games (weighted by recency)
    - p’s owned games (weak weight)
    - p’s wishlisted games (weak weight)
  
  negative contributors (subtracted from p):
    - p’s noped games (strong)
    - p’s traded-in games (strongest)
```

L1-normalize so |p| = 1 (matches mimir’s taste vector convention for consistency).

For a group g (rather than a single player), aggregate over members’ personalization vectors with attention-weighted recency.

## Negative edge handling

Simplest approach: `traded-in` and `voted-nope` edges enter the graph with **negative weights**. The teleport vector includes a small negative component on these nodes. This naturally propagates damping through the random walk.

Caveat: if not careful, large negative weights can produce non-convergent or non-physical (negative) PPR scores. Mitigation:
- Clamp negative weights to a floor (e.g., −0.5)
- Apply a final softmax-shift on rank scores to ensure non-negative output
- Or: run two PPR passes (positive and negative) and subtract

Open design question: which mitigation works best on real data? Sprint 0.1 of huginn will validate empirically.

## Decay handling

Per design doc § 3.6, edge weights decay at query time:

```
  effective_weight(edge) = edge.weight * exp(-λ * (now - edge.ts) / half_life_for_edge_type)
```

Huginn computes effective weights JIT for each PPR call. Per-edge-type half-lives:

- `played`: 6 months
- `voted-love` / `voted-nope` / `voted-bring`: 12 months
- `traded-in`: 18 months
- `bought`: 24 months
- `seed-loved` / `seed-noped`: never decay (these are explicit player statements)
- factual edges (`designed-by`, `has-mechanic`, etc.): no decay (they’re facts)

## Convergence criteria

Iterate until L1 norm of `r_new - r_old` < tolerance (typically 1e-6) OR max iterations reached (typically 20–50).

For most calls, ~20 iterations is sufficient. The math literature has results on PPR convergence rate; for our graph (millions of edges, not billions), this is fast.

If convergence fails (e.g., due to negative-weight edge cycles), return a low-confidence response with reason code `ppr_convergence_warning` so the caller can fall back to mimir.

## Path-based explanation

Unique value vs. mimir: huginn can produce explanations of the form

  “Reached Cascadia via: 
     Wingspan (you loved) → Engine Building (mechanic) → Cascadia”

Implementation: during PPR power iteration, track the top-K incoming-mass paths to each game node. After convergence, the top-mass path for the top recommendations becomes the explanation substrate. The explanation generator produces natural language from the typed path.

This is qualitatively different from mimir’s rule-based templates ("shares X mechanics with games you loved"). It ties the recommendation to specific entities the player has interacted with, which builds trust.

## What’s NOT in scope for huginn

- Learned embeddings: that’s muninn (Odin’s raven of memory)
- Forward simulation of game-night outcomes: that’s saga
- Emergent dimensionality / gene-graph: that’s norns
- Federated cross-store learning: that’s yggdrasil

Huginn stays focused on PPR over the typed multi-relational graph. Each future engine is a sibling silo subdirectory.

## Open questions

1. **Negative-weight handling.** Which mitigation (clamping, softmax-shift, two-pass subtraction) works best on real data?
2. **Personalization scope.** How wide should the positive contribution set be? Just the player’s edges, or include their group’s edges with reduced weight, or also their store’s recently-stocked games?
3. **Caching.** Phase 1 huginn computes PPR per request. At what scale does we need a precomputation cache (`rec_huginn_pagerank_cache` table)? Premature optimization until proven.
4. **Subgraph filtering.** When candidate_pool is restricted (e.g. "only games this group owns"), is it cheaper to filter pre-PPR or post-PPR?
