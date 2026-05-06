# Rec Engine Silo Rules

This directory contains experimental recommendation engines under construction. Each subdirectory (`mimir/`, `huginn/`, future `muninn/`, `saga/`, `norns/`, `yggdrasil/`, etc.) is a single engine implementation in isolation.

## Why silos exist

Recommendation engines are a "subtly wrong is worse than absent" class of feature. A recommender that's right 70% of the time damages trust more than no recommender at all. The silo discipline ensures:

1. New engines are built and proven in isolation before any production code depends on them.
2. Multiple engine implementations can coexist for A/B testing without crosstalk.
3. Production code paths are insulated from in-progress work.
4. Reverting an experiment is mechanical (delete the engine directory).

## The rules

### 1. No production code imports from `rec-engines/`

Production apps (`apps/me`, `apps/ops`, future `apps/hq`) MUST NOT import from this directory. Period. The compiler should enforce this via tsconfig path restrictions when type checking is added.

### 2. The integration boundary is the API, not code

Rec engines expose HTTP endpoints. Production code calls those endpoints. There is no shared library, no shared types beyond what travels over the wire, no direct function call across the boundary. **The HTTP API is the silo enforcer.**

### 3. Schema is namespaced

All database tables created by rec engines use the `rec_*` prefix. Production code may not write to these tables. Engines may read from production tables (via canonical sources or a read replica) but never write.

### 4. All endpoints are feature-flagged

Engine HTTP routes are namespaced (`/api/recs/<engine-name>/...` when wired up) and gated by feature flags that default to off in production. No customer hits an engine without an explicit flag flip.

### 5. Engines compete; production picks winners

A graduation criterion (defined per engine in its README) determines when an engine is ready to leave silo. Graduation means: a portion of production traffic is routed to it via flag, observed in shadow mode, then gradually promoted as evidence accumulates.

### 6. No engine is the canonical engine

Even after graduation, multiple engines can run in parallel. Production calls a "rec router" (lives in production code, not in `rec-engines/`) that distributes traffic per A/B configuration. The router belongs to production; engines remain in silo.

### 7. Subtle-wrongness assertions are required

Every engine's test suite must include assertions that catch the recommendation-specific failure modes:

- **Negative-signal propagation:** if a player has a `voted-nope` or `traded-in` edge to game X, X must not appear in their next 10 recs.
- **Constraint respect:** player count, length, exclusion lists are honored.
- **Diversity:** no single designer dominates the top-K (cap at 2 of any single designer in top 10).
- **Cold-start safety:** insufficient-data inputs produce a low-confidence response, not nonsense.
- **Stale-cache safety:** results carry a `computed_at` and respect invalidation when underlying signals change.

These are required, not aspirational. An engine cannot graduate without them passing.

### 8. Engines do not import from each other

Mimir does not import from huginn. Huginn does not import from mimir. Future engines (muninn, saga, norns, yggdrasil) do not import from any sibling. **Engines are independent.** They share the `rec_*` schema namespace; nothing else.

This rule is what lets us add and remove engines without coordinating builds. The architectural design doc applies to all engines (it lives in `mimir/docs/` because mimir is the foundation that authored it), but runtime code does not cross engine boundaries.

## Naming convention

Engines in this directory are named after figures in Norse / Aesir mythology, matching the existing platform pattern (Garmr the watchdog, Afterroar the post-roar). The mythological role hints at the engine's function:

- **`mimir`** — god of wisdom; well of all knowledge. Foundation engine, knowledge-graph based content similarity.
- **`huginn`** (Phase 1+) — Odin's raven of *thought*. Graph-traversal engine (Personalized PageRank). **Scaffold landed in Mimir Sprint 1.0.12.**
- **`seidr`** — Old Norse magic / divination. Profile-driven engine: a quiz extracts a 21–24-dim player vector, cosine-matched against game profiles. **Scaffold + research artifacts + deployable quiz UI landed in Sprint 1.0.16.**
- **`saga`** — goddess of stories. Forward-simulator engine: Monte Carlo + per-player fun model trained on recap data. **Phase 0 scaffold + architecture/simulator/training-data docs landed in Sprint 1.0.17.** Implementation deferred until ≥3000 recap records accumulated (estimate 12–18 months post-launch).
- **`muninn`** (future) — Odin's raven of *memory*. Learned-representation engine (embeddings).
- **`norns`** (future) — fates who weave destiny. Emergent-dimensionality gene-graph engine.
- **`yggdrasil`** (future) — the world tree. Federated cross-store learning engine.

Cross-vertical engines append a vertical suffix when a single algorithm is reused across verticals: `mimir-books`, `mimir-vinyl`, etc.

Guidelines for new engine names:
- Two syllables when possible, easy to say in conversation
- Distinct from existing platform service names
- Thematic connection to what the engine does
- Norse / Aesir mythology preferred to keep platform brand coherence

## Sprint discipline

Engines under construction follow strict sprint cadence:

1. **Pre-flight** in chat AND committed to the engine's `SPRINT_LOG.md`: goal, scope, acceptance criteria, test plan, rollback recipe.
2. **Test plan written before implementation.** Test or test plan must exist before the implementation push.
3. **Build.**
4. **Verify** by executing the test plan. Failures block the push. **"Executed" ≠ "verified" — verification means actually running the code (npm test, smoke test, etc.), not just rereading it.**
5. **Push** with a commit message that includes context (not just "fix" or "update").
6. **Post-state verification** — read back from the repo to confirm the change actually landed.
7. **Post-mortem** in `SPRINT_LOG.md`: outcome, learnings, what's next.

A sprint is one PR / one observable change / one shippable state. Could be 30 minutes; could be a day. Each engine maintains its own `SPRINT_LOG.md` documenting its history.

Cross-engine context lives in `rec-engines/HANDOFF.md` so any session (especially laptop sessions resuming from mobile) can restore full context from two files: HANDOFF + the active engine's SPRINT_LOG.

## Adding a new engine

1. Create `rec-engines/<descriptive-name>/` with:
   - `README.md` — what this engine is, what makes it different, current phase, graduation criteria
   - `SPRINT_LOG.md` — sprint history, starting with Sprint 0.0 (scaffold)
   - `docs/` — design docs and decisions specific to this engine
   - `migrations/` — SQL files
   - `src/` — implementation
   - `tests/` — test suite (must include the subtle-wrongness assertions above)
   - `package.json` — independent package, no cross-engine imports

2. The first commit only adds scaffolding. Real code follows in subsequent commits per the sprint discipline.

## Removing an engine

1. Disable any feature flags pointing to it.
2. Wait for any in-flight requests to drain (typically <5 min).
3. Delete the directory in a single PR.
4. Run engine-specific table drops in a separate migration if data should not persist (most experimental data should persist for offline analysis).

## Cross-engine coordination

Multiple engines may share the `rec_*` schema namespace. Migrations that affect shared tables go in the foundation engine (`mimir/migrations/`). Migrations specific to one engine go in that engine's own `migrations/`.

## Engines in this directory

| Engine | Phase | Status | Notes |
|---|---|---|---|
| `mimir` | Phase 0 | **End-to-end validated.** 168 tests green. Migration runner + safety harness sandbox-validated against local Postgres 16. Mobile-buildable Phase 0 work complete. | Foundation engine; pure metadata-based scoring; the always-available cold-start baseline |
| `huginn` | Phase 0 (scaffold) | Scaffold-only. Implementation begins when platform has ≅50 active users with real edges. | Personalized PageRank over typed multi-relational graph |
| `seidr` | Phase 0 (pipeline + 7 reference profiles) | Sprint 1.0.18 added schema (3 tables + 3 indexes, sandbox-validated), LLM pipeline (mock + Anthropic), validator, and 7 hand-authored reference profiles for fixture games. 96/96 tests pass. Cosine matcher (1.0.19) and top-500 LLM run (1.0.20) come next. | Profile-driven; quiz → 24-dim vector → cosine match to game profiles. Complementary to mimir, not a replacement |
| `saga` | Phase 0 (scaffold + architecture) | Scaffold + 3 design docs (design-notes, simulator-architecture, recap-as-training-data) shipped Sprint 1.0.17. Architecture locked. Implementation deferred until graduation thresholds met (≥3000 recap records, ≥200 active players with ≥10 recaps each, ≥6mo corpus). | Forward simulator: Monte Carlo over per-player fun model, trained on recap data. The competitive moat — the engine no one else can replicate without recap data |

(Update this table as engines are added, graduated, or removed.)
