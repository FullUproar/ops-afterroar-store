# Seidr — Sprint Log

Per-sprint development history.

---

## Initial scaffold (2026-05-06) — landed via Mimir Sprint 1.0.16

Seidr engine scaffolded with full design-doc set, curated question bank (50 questions, edited from Manus's 118), and a deployable static-HTML quiz UI for pre-launch real-user testing.

See `mimir/SPRINT_LOG.md` Sprint 1.0.16 for the full provenance.

---

## Future sprints (drafts)

### Sprint 0.1 — Quiz UI deployment + first user testing

**Trigger:** Now — the UI is deployable as soon as Shawn drops `quiz-ui/` onto a static host.

**Scope:** Deploy quiz-ui to a public URL (Vercel/Netlify/GitHub Pages). Share with ~10–30 friendly testers. Collect their exported result JSONs for offline analysis.

**What to learn:** Which questions discriminate well? Which feel clunky? Where do users drop off? Do their profiles cluster sensibly?

**Acceptance:** ≥10 completed quizzes; manual review of profiles + qualitative feedback; question bank refinement based on findings.

### Sprint 0.2 — Game profiling pipeline (LLM-generated)

**Trigger:** After Sprint 0.1 confirms the questionnaire is producing useful profiles.

**Scope:** Use Claude (Anthropic API) to profile the top 500 BGG games against the 24 dimensions. Manual validation pass on ~50 reference games (Catan, Pandemic, Gloomhaven, etc — our seed pool). Iterate prompt until reference profiles match expert intuition.

**Output:** `data/game-profiles.json` with 500 entries, each a 24-dim vector + provenance metadata.

### Sprint 0.3 — Schema additions (rec_seidr_*)

**Trigger:** Question bank stable + game profiling complete.

**Scope:** Migration `0003_add_seidr_tables.sql` adding:
- `rec_seidr_player_profile` — a player's 24-dim profile vector + confidence vector + completion timestamp + question-set-version
- `rec_seidr_game_profile` — a game's 24-dim profile vector + provenance (`llm_generated`, `manually_curated`, `play_inferred`)
- `rec_seidr_response` — every quiz answer for forensics + question-quality analysis

### Sprint 0.4 — Cosine similarity matcher (pure function)

**Trigger:** Schema applied + first profiles loaded.

**Scope:** `src/match.mjs` with `matchProfiles(playerVector, gameProfiles, options) → ranked list`. Pure function, like mimir's score.mjs. Cosine similarity + confidence weighting + per-dimension importance overrides.

### Sprint 0.5+ — HTTP API surface, integration with rec router, A/B vs mimir.

---

## Cross-engine notes

- Seidr shares the `rec_*` schema namespace with mimir per SILO.md.
- Seidr does NOT import from mimir. Independent engines.
- The 24-dim profile produced by seidr is also consumed by saga (future) as a feature in the per-player fun model. Seidr's data is reusable infrastructure.
