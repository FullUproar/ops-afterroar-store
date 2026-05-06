# Full Uproar Recommendation Engine — Design Doc

> **Source:** Architecture discussion, May 2026.
> **Status:** Design proposal, pre-implementation. Phase 0 scaffolding committed.
> **Caveat:** This doc was written from a strategic conversation, not by reading the live codebase. Where it references existing models/tables (e.g. `BoardGameMetadata`, `pos_catalog_products`), verify against the current schema before wiring up — the platform is a moving target. Flag inconsistencies as you encounter them.

---

## 0. TL;DR

We're building a recommendation engine that:

1. **Ships a useful v0 in days** using only BGG metadata and a 30-second onboarding flow. No internal data required.
2. **Grows into a genuinely differentiated system** as game-night plays, votes, trades, and store data accumulate — without re-architecting.
3. **Powers three distinct surfaces** off a shared core: HQ game-night picker, Passport personal library/next-game suggestions, POS store-inventory buy-side intelligence.
4. **Eventually beats BGG** not through cleverer ML, but by having data BGG structurally cannot collect: real attributed plays with group context, willingness votes, trade-in events (negative signal!), and cross-store velocity.

The architectural commitment: **the graph schema and the recommendation API contract are stable from day one. The ranker behind the API is swappable.** That's what lets us ship the dumbest possible thing first and evolve into a Monte Carlo social simulator without changing the surfaces or the data layer.

---

## 1. Strategic Framing

### 1.1 Domain split (already settled in platform architecture)

- **BGG** is the canonical source of game *metadata* (designer, mechanics, weight, year, etc.). External, untrusted dependency. Risk profile similar to the TCGPlayer rug-pull.
- **Passport** is the canonical source of player *identity and library*. Internal, critical. Hosts the BGG cache.
- **HQ** is the coordination tool for game *nights and rituals*. Generates play events; consumes player/library data via Passport.
- There is **no direct HQ ↔ BGG seam.** All BGG data flows through Passport. HQ may keep a thin local cache for render performance only.

### 1.2 Why a recommender is the right differentiator

BGG's own recommendation engine is famously weak. Their data is sparse self-selected ratings and lightly logged plays. Most discovery happens via geeklists, podcasts, BGA, and word of mouth.

Our network will produce data BGG cannot:

| Signal | BGG | Us |
|---|---|---|
| Game ratings | Sparse, self-selected, decontextualized | Per-night per-player ratings tied to real outcomes |
| Plays | Optional manual log, sparse | Auto-captured via game-night creation; group composition known |
| Group composition | None | Full ritual membership, attendance patterns, co-play graph |
| Negative signal | None (or buried in low ratings) | **Explicit trade-ins** — gold standard for "I'm done with this" |
| Willingness | None | "Bring / love / nope" votes per night |
| Commercial signal | None | POS sales velocity, regional demand, store inventory patterns |
| Player reputation | Anonymized | Passport identity, cross-store trust |

The asset is the data, not the algorithm. The algorithm just has to be good enough not to waste the data.

### 1.3 Three recommendation products from one engine

| Surface | Question | Primary feature signals |
|---|---|---|
| **HQ game-night picker** | "What should we play tonight, given this group, this time, this vibe, what we own?" | Group composition, willingness votes, recent plays, recap outcomes |
| **Passport library / next-game** | "What game should this player buy/wishlist next?" | Personal library, plays, ratings, group-derived taste |
| **POS buy-side intelligence** | "What should this store stock to maximize sell-through and margin?" | Regional velocity, customer demographics, similar-store outcomes, trade-in patterns |

All three implement the same `recommend(context) → ranked list` contract. They differ only in which features dominate scoring and which candidate pools they search over.

---

## 2. Architecture Overview

The two stable layers are the **API contract** and the **knowledge graph schema**. Everything else is implementation that evolves.

Layered top-down: surfaces (HQ picker, Passport library, POS buy-side) call a stable `recommend(context) → [{game, score, explanation, ...}]` API; the API routes to a swappable ranker layer (v0 content similarity, future v1 PPR, v2 embeddings, v3 simulator, v4 gene-graph); the ranker queries a knowledge graph (Postgres property graph with typed/signed/timestamped edges, later vector-valued for gene-overlap); the graph is fed by sources (BGG metadata today, plays/votes from HQ, trades/sales from POS, structured recap outcomes); a logging layer captures every request, candidate, score, outcome, and interaction — always on from day one.

---

## 3. The Knowledge Graph Layer

### 3.1 Why a property graph (and increasingly, a knowledge graph)

Game-night recommendations are an inherently relational problem. A player's taste is a function of their plays, their group's plays, the games they've voted to bring or skip, and games they've traded away. Mechanics, designers, and themes are bridge nodes that handle cold start.

Forcing this into a flat user-item matrix loses the structure that makes the recommendations interesting. A property graph keeps the structure first-class and makes it trivial to add new node/edge types as new signals come online.

Later engines (gene-graph, simulator) treat this as a full knowledge graph with vector-valued edges and multi-hop queries. The schema is forward-compatible with that — Phase 0 just doesn't exploit it yet.

### 3.2 Why Postgres, not Neo4j

For our scale (anticipated millions of edges, not billions), Postgres handles a property graph fine with two tables and good indexes. We get ACID, the existing operational stack, joins to relational data when needed, and no new infrastructure. When/if we outgrow it (later phases at network scale), we can introduce a graph DB or a vector store *behind the same ranker interface* without touching the API.

If KG-native query patterns become hot paths, the AGE Postgres extension provides Cypher syntax over the same tables. That's a Phase 1+ decision, not a Phase 0 one.

### 3.3 Node types

| Type | Source | Notes |
|---|---|---|
| `Game` | BGG | Canonical key = `(source, source_id)`. `source = 'bgg'` for BGG-known games; `source = 'internal'` for Game Kit custom games and prototypes. Future verticals can register new sources (`'discogs'`, `'isbn'`, `'gci'`). |
| `Designer` | BGG | |
| `Mechanic` | BGG | |
| `Theme` | BGG (`boardgamefamily`, `boardgamecategory`) | |
| `Category` | BGG | |
| `Player` | Passport | Empty at launch; grows with users. |
| `Group` | HQ | Empty at launch; grows with game-night creation. |
| `Night` | HQ | One node per game-night event. |
| `Store` | POS | Empty until store onboarding. |
| `Ritual` | HQ | Recurring game-night templates. |

### 3.4 Edge types (typed, signed, timestamped, weighted)

| Edge | Direction | Sign | Source | Phase available |
|---|---|---|---|---|
| `designed-by` | Game → Designer | factual | BGG | Phase 0 |
| `has-mechanic` | Game → Mechanic | factual | BGG | Phase 0 |
| `has-theme` | Game → Theme | factual | BGG | Phase 0 |
| `in-category` | Game → Category | factual | BGG | Phase 0 |
| `expansion-of` | Game → Game | factual | BGG | Phase 0 |
| `family-of` | Game → Family | factual | BGG | Phase 0 |
| `seed-loved` | Player → Game | + | Onboarding | Phase 0 |
| `seed-noped` | Player → Game | − | Onboarding | Phase 0 |
| `owns` | Player → Game | + | Passport library | Phase 1 |
| `wishlists` | Player → Game | + | Passport | Phase 1 |
| `member-of` | Player → Group | factual | HQ | Phase 1 |
| `attended` | Player → Night | factual | HQ | Phase 1 |
| `played` | Night → Game | factual | HQ | Phase 1 |
| `brought` | Player → Night, Game | factual | HQ | Phase 1 |
| `voted-bring` | Player → Game (per Night) | + | HQ | Phase 1 |
| `voted-love` | Player → Game | + | HQ | Phase 1 |
| `voted-nope` | Player → Game | − | HQ | Phase 1 |
| `won-with` | Player → Game | + (mild) | HQ recap | Phase 2 |
| `rated` | Player → Game (per Night) | signed (1–5) | HQ recap | Phase 2 |
| `traded-in` | Player → Game | **−−** (strong) | POS | Phase 2 |
| `bought` | Player → Game (at Store) | + | POS | Phase 2 |
| `stocked` | Store → Game | factual | POS | Phase 2 |
| `demoed` | Store → Game | + (mild) | POS | Phase 2 |
| `co-played` | Player ↔ Player | + | Derived from shared Nights | Phase 2 |

### 3.5 Postgres schema

```sql
-- Node tables (one per type, lean — most attributes live in JSONB)
create table rec_game (
  id           bigint primary key,         -- BGG ID where applicable, or internal
  source       text not null,              -- 'bgg' | 'internal'
  name         text not null,
  year         int,
  weight       numeric(3,2),               -- BGG weight 1-5
  min_players  int,
  max_players  int,
  min_minutes  int,
  max_minutes  int,
  min_age      int,
  bgg_rank     int,
  attributes   jsonb not null default '{}',
  cached_at    timestamptz not null default now()
);

create table rec_designer (id bigint primary key, name text not null, source text);
create table rec_mechanic (id bigint primary key, name text not null, source text);
create table rec_theme    (id bigint primary key, name text not null, source text);
create table rec_category (id bigint primary key, name text not null, source text);

create table rec_player (id bigint primary key, passport_id text unique not null);
create table rec_group  (id bigint primary key, hq_group_id text unique not null);
create table rec_night  (id bigint primary key, hq_night_id text unique not null, group_id bigint, occurred_at timestamptz);
create table rec_store  (id bigint primary key, pos_store_id text unique not null);

create table rec_edge (
  id          bigserial primary key,
  src_type    text not null,
  src_id      bigint not null,
  dst_type    text not null,
  dst_id      bigint not null,
  edge_type   text not null,
  weight      numeric not null default 1.0,
  ts          timestamptz not null default now(),
  context     jsonb not null default '{}',
  unique (src_type, src_id, dst_type, dst_id, edge_type, ts)
);

create index rec_edge_src on rec_edge (src_type, src_id, edge_type);
create index rec_edge_dst on rec_edge (dst_type, dst_id, edge_type);
create index rec_edge_type_ts on rec_edge (edge_type, ts desc);
create index rec_edge_context_gin on rec_edge using gin (context);
```

### 3.6 Edge weight & decay

Every edge has a weight that the ranker interprets. A `played` edge from 2 years ago should not influence recommendations as strongly as one from last month. Don't bake decay into the stored weight — keep raw weight stable and apply decay at query time:

```
effective_weight(edge) = edge.weight * exp(-λ * (now - edge.ts) / half_life)
```

Different edge types may want different half-lives (`played`: 6 months; `traded-in`: 18 months; `seed-loved`: never decays).

### 3.7 Game ID namespace reconciliation

BGG IDs as canonical key for BGG-known games. Internal IDs (with `source = 'internal'` discriminator) for Game Kit custom games and prototypes. Passport is the source of truth for the mapping. The graph just stores `(source, id)` and treats them uniformly.

This also makes future migrations to other catalogs (gci-db, Discogs for vinyl, ISBN for books in non-FLGS verticals) a swap of `source` values rather than a schema change.

---

## 4. The Recommendation API

### 4.1 Request

```typescript
type RecommendRequest = {
  surface: 'hq_picker' | 'passport_library' | 'pos_buy_side';
  caller: { player_id?: string; group_id?: string; store_id?: string };
  context: {
    players?: string[];
    minutes_available?: number;
    desired_weight?: [number, number];
    desired_player_count?: number;
    vibe?: string[];
    time_of_day?: 'lunch' | 'evening' | 'late_night';
    seed_games?: number[];
    must_own?: string[];
  };
  options: {
    limit?: number;
    candidate_pool?: 'all' | 'owned' | 'in_store' | 'wishlist';
    diversify?: boolean;
    explain?: 'none' | 'short' | 'rich';
    exclude?: number[];
    include_low_confidence?: boolean;
  };
};
```

### 4.2 Response

```typescript
type RecommendResponse = {
  request_id: string;
  ranker_version: string;
  results: Array<{
    game_id: number;
    game_name: string;
    score: number;
    confidence: number;
    explanation: {
      reason_codes: string[];
      natural_language: string;
      contributors?: Array<{ feature: string; weight: number; source: string }>;
    };
    diagnostics?: {
      candidate_rank: number;
      score_breakdown: Record<string, number>;
    };
  }>;
};
```

### 4.3 Feedback endpoint

```typescript
POST /recommend/feedback
{
  request_id: string;
  game_id: number;
  outcome: 'shown' | 'clicked' | 'accepted' | 'played' | 'rated' | 'bought' | 'dismissed' | 'ignored';
  outcome_value?: number;
  outcome_context?: object;
}
```

Every interaction with a recommendation is feedback. **This endpoint exists from day one.** Without it, future engines have nothing to learn from.

---

## 5. The Ranker Layer (swappable)

### 5.1 v0 — Content similarity (Mimir, this engine)

Pure metadata-based scoring. No internal data needed.

```
score(candidate, context) = 
    w1 * mechanic_overlap(candidate, seed_or_taste_vector)
  + w2 * theme_overlap(candidate, seed_or_taste_vector)
  + w3 * weight_similarity(candidate.weight, desired_weight)
  + w4 * player_count_fit(candidate, context.desired_player_count)
  + w5 * length_fit(candidate, context.minutes_available)
  + w6 * designer_match(candidate, taste_vector)
  + w7 * quality_prior(candidate.bgg_rank)
  - w8 * already_played_recently_penalty
  - w9 * seed_noped_penalty(candidate, taste_vector)
```

**Hand-tune the weights initially.** Don't reach for ML. With ~7 onboarding signals and rich BGG metadata, hand-tuned weights give surprisingly good recommendations and are completely interpretable.

**Diversification:** Maximal Marginal Relevance (MMR) on top-K to prevent monocultures.

**Explanation generation:** rule-based templates mapping reason codes to natural-language fragments.

### 5.2–5.6 Future engines

- v1 PPR (`huginn`) — Personalized PageRank over typed edges, with a `played`-weighted personalization vector and decay applied at query time.
- v2 Learned embeddings (`muninn`) — sparse-coded embeddings learned from co-play / co-trade / co-vote signals, with `traded-in` as explicit negative samples.
- v3 Simulator (`saga`) — Monte Carlo forward simulation of game-night outcomes; per-player fun model, soft-min aggregator, stochastic events, narrative explanations.
- v4 Gene-graph (`norns`) — emergent dimensionality with speciation; vector-valued edges encoding multidimensional similarity.
- v5 Federated (`yggdrasil`) — cross-store learning with consent-gated aggregations.

Each future engine is a separate silo subdirectory.

---

## 6. The Phased Build

### 6.1 Phase 0 — Mimir, foundation

**Build (in this engine):**
- Postgres schema (§ 3.5)
- BGG metadata import script for top ~5,000 games
- Ranker v0 (§ 5.1)
- API endpoints: `POST /recommend`, `POST /recommend/feedback`
- Logging tables (§ 7)
- Onboarding flow seed-edge ingestion endpoint
- Wire to one HQ surface as the v0 game picker via the federation API

**Skip for now:**
- Player/group node sync (the schema exists, the data doesn't)
- PPR (separate engine)
- Embeddings (separate engine)
- Recap structured fields (but spec them — § 9)

### 6.2–6.5 Future phases

Phase 1 (50 active users, real votes/plays → huginn). Phase 2 (~500 users → muninn). Phase 3 (recap data → saga). Phase 4 (multi-store → yggdrasil).

---

## 7. Logging Spec (the most important section)

**This is the part that, if skipped, makes future engines impossible.** Build it day one.

### 7.1 Tables

```sql
create table rec_request_log (
  request_id    uuid primary key,
  ts            timestamptz not null default now(),
  surface       text not null,
  caller        jsonb not null,
  context       jsonb not null,
  options       jsonb not null,
  ranker_version text not null
);

create table rec_candidate_log (
  request_id    uuid not null references rec_request_log,
  game_id       bigint not null,
  rank          int not null,
  score         numeric not null,
  confidence    numeric,
  reason_codes  text[],
  score_breakdown jsonb,
  primary key (request_id, game_id)
);

create table rec_feedback_log (
  id            bigserial primary key,
  request_id    uuid not null,
  game_id       bigint not null,
  ts            timestamptz not null default now(),
  outcome       text not null,
  outcome_value numeric,
  outcome_context jsonb
);

create table rec_recap_outcome (
  id            bigserial primary key,
  night_id      bigint not null,
  game_id       bigint not null,
  player_id     bigint not null,
  fun_rating    int,
  would_play_again boolean,
  finished      boolean,
  won           boolean,
  notes         text,
  created_at    timestamptz not null default now()
);
```

### 7.2 What gets logged

- Every `recommend()` request (full context).
- Every candidate considered (not just top-K returned).
- Every score breakdown.
- Every interaction: `shown`, `clicked`, `accepted`, `played`, `rated`, `dismissed`.
- Every recap outcome with structured fields.

### 7.3 What this enables

- Offline eval, online A/B, future engine training, debug.

---

## 8. Cold-Start Onboarding

### 8.1 The 30-second flow

1. "Pick 5 games you love." Curated grid of ~30 popular games across genres/weights.
2. "Pick 2 you can't stand or won't play." The negative signal is gold.
3. Optional: "Tell us about your favorite game night." Free-form one-liner.

7 edges = enough seed for v0 content similarity to feel useful.

### 8.2 The seed game pool

Curate ~50–100 games spanning weight categories, mechanics, themes; refresh quarterly.

### 8.3 Group onboarding

Derive initial group profile by aggregating member taste vectors with recency-weighting.

---

## 9. Recap Data Schema (decide now, capture from day 1)

Recap UX should solicit per game per night, all optional:

| Field | Type | Why it matters |
|---|---|---|
| `fun_rating` | 1–5 stars per player | Trains per-player fun model |
| `would_play_again` | bool per player | Cleaner signal than rating |
| `finished` | bool | "Game ended in salt" is a real outcome |
| `winner_player_id` | nullable | Future-night dynamics |
| `length_actual_minutes` | int | Calibrate length-fit feature |
| `notes` | text | LLM extraction later |

If recaps stay freeform-text-only, you'll pay LLM extraction tax forever. Structured-with-optional-freeform from day one compounds enormously by Phase 3.

---

## 10. Differentiation: What BGG Can't Do

| BGG | Us |
|---|---|
| "Games similar to X" by community curation | Recommendations conditioned on *your specific group, on this specific night* |
| Static rec lists | Counterfactuals: "if you wait 3 weeks, this becomes a 0.91 rec" |
| No negative signal | Trade-ins as first-class negative edges |
| Anonymous ratings | Plays attributed to identified players in identified groups |
| No commercial signal | "This will sell in your region" for FLGS owners |
| One-shot recommendations | Group health diagnostics |
| Generic | Federated learning across the FLGS network |

---

## 11. Credo-Aligned Constraints

The Afterroar Credo imposes structural requirements on the rec engine that aren't optional features:

1. **Data transparency surface.** Every player must be able to see what's known about them, what edges they have in the graph, and what's feeding their recommendations. They must be able to delete any of it.
2. **Audit-by-construction.** Recommendations are explainable through the path that produced them. No black-box explanations.
3. **No preferential access.** Full Uproar Games does not get preferential placement.
4. **Consent-gated cross-app reads.** The federation API enforces consent at the query layer.

These are launch requirements, not future features.

---

## 12. Open Decisions

1. Recap structured field set — confirm before HQ ships its recap UI v1.
2. Seed game pool curation — BGG top 200 with diversity heuristics initially, human pass would be better.
3. BGG cache TTL strategy — static fields cache months; volatile fields hours-days.
4. Hand-tuned weight values for v0 ranker — set in implementation, refined via offline eval.
5. Confidence score calibration.
6. Rec router (production-side) design — separate from this engine.

---

## 13. Reference: subtle-wrongness assertions every engine must pass

(Per `../SILO.md` § 7.)

- Negative-signal propagation
- Constraint respect (player count, length, exclusion)
- Diversity (≤2 from same designer in top 10)
- Cold-start safety
- Stale-cache safety

---

## 14. Glossary

- **PPR** — Personalized PageRank.
- **Soft-min aggregator** — Group fun aggregation weighting the unhappiest player most.
- **MMR** — Maximal Marginal Relevance, greedy diversification.
- **Outbox pattern** — Async cross-service writes via durable event log.
- **Gene** — Emergent learned dimension (used in `norns`/v4 engine).
- **Speciation** — Splitting of a gene capturing multiple sub-concepts.
