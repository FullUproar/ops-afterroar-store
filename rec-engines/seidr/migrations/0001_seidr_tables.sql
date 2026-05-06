-- 0001_seidr_tables.sql
-- ========================================================================
-- Seidr engine schema -- Sprint 1.0.18
-- ========================================================================
-- Adds three engine-specific tables for the profile-driven recommender:
--   - rec_seidr_player_profile  (a player's 24-dim profile vector + confidence)
--   - rec_seidr_game_profile    (a game's 24-dim profile vector + provenance)
--   - rec_seidr_response        (every quiz answer for forensics + question-quality analysis)
--
-- Per SILO.md § 3, all tables remain rec_* prefixed; engine-specific tables
-- additionally carry the engine name (rec_seidr_*).
-- Per SILO.md § "Cross-engine coordination", engine-specific migrations live
-- in the engine's own migrations/ directory, sharing the rec_migrations
-- bookkeeping table created by mimir's runner.
--
-- All CREATE statements use IF NOT EXISTS for idempotency.
-- Additive only -- no DROP/ALTER/DELETE/TRUNCATE/INSERT.
--
-- Status: COMMITTED but NOT YET APPLIED to any production database.
-- Applied to a sandbox local Postgres in Sprint 1.0.18 to validate.
-- ========================================================================


-- ========================================================================
-- PLAYER PROFILE
-- ========================================================================
-- One row per (player_id, profile_version). A player may retake the quiz;
-- old profiles are kept for audit/calibration. The active profile is the
-- newest non-null row for that player_id.
--
-- dim_vector: jsonb of 24 keys (the dimension ids) with float values in [-1,1]
-- confidence_vector: jsonb of 24 keys with float values in [0,1] reflecting
-- how many quiz responses contributed to that dimension's value
-- question_set_version: which question-bank.json version produced this profile
-- (so we can re-score profiles if the question bank evolves)
create table if not exists rec_seidr_player_profile (
  id                    bigint primary key,
  player_id             text not null,
  profile_version       int  not null default 1,
  dim_vector            jsonb not null,
  confidence_vector     jsonb not null,
  question_set_version  text  not null,
  questions_answered    int   not null,
  completed_at          timestamptz not null default now(),
  source                text  not null default 'quiz',
  notes                 text,
  unique (player_id, profile_version)
);


-- ========================================================================
-- GAME PROFILE
-- ========================================================================
-- One row per (game_id, profile_version). Profiles can be regenerated as
-- the LLM prompt iterates or as we collect play-outcome data; old versions
-- are retained for audit. The active profile is the newest non-superseded
-- row for that game_id.
--
-- source_provenance: 'llm_generated' | 'manually_curated' | 'play_inferred' | 'hybrid'
-- model_version: identifier of the model that generated this profile
-- (e.g. 'claude-sonnet-4-6', 'manual', 'gpt-5')
-- prompt_version: identifier of the prompt template version used
-- validated_by: text identifier of the human reviewer (null if not validated)
-- validated_at: timestamp of the human validation pass (null if not validated)
-- validation_notes: free-text reviewer notes (null if not validated)
create table if not exists rec_seidr_game_profile (
  id                    bigint primary key,
  game_id               bigint not null,
  profile_version       int    not null default 1,
  dim_vector            jsonb  not null,
  confidence_per_dim    jsonb  not null,
  source_provenance     text   not null,
  model_version         text,
  prompt_version        text,
  generated_at          timestamptz not null default now(),
  validated_by          text,
  validated_at          timestamptz,
  validation_notes      text,
  superseded            boolean not null default false,
  unique (game_id, profile_version)
);


-- ========================================================================
-- QUIZ RESPONSE
-- ========================================================================
-- One row per question answered by a player. Stored at quiz-completion
-- time alongside the player profile insert. Used for:
--   - Question-quality analysis (which questions discriminate well?)
--   - Reproducibility (re-deriving a profile from raw responses if the
--     algorithm or weights change)
--   - Forensics ("why did this player end up with this profile?")
--
-- response_value: jsonb to accommodate different question types
--   this_or_that: { "choice": "left" | "right" }
--   likert: { "value": int }            -- typically 1..5
--   multiple_choice: { "choice": "A"|"B"|... }
--   game_vs_game: { "choice": int }     -- BGG ID of the picked game
create table if not exists rec_seidr_response (
  id                    bigint primary key,
  player_id             text   not null,
  profile_id            bigint not null references rec_seidr_player_profile(id),
  question_id           text   not null,
  question_set_version  text   not null,
  response_value        jsonb  not null,
  response_time_ms      int,
  answered_at           timestamptz not null default now(),
  unique (profile_id, question_id)
);


-- ========================================================================
-- INDEXES
-- ========================================================================
-- Player profile lookups by player_id are the dominant query.
create index if not exists rec_seidr_player_profile_player_id_idx
  on rec_seidr_player_profile (player_id);

-- Game profile lookups by game_id are the dominant query.
-- Also: filtering on superseded=false to find the active profile.
create index if not exists rec_seidr_game_profile_game_id_active_idx
  on rec_seidr_game_profile (game_id) where superseded = false;

-- Response lookups by profile_id (when reconstructing a profile's responses).
create index if not exists rec_seidr_response_profile_id_idx
  on rec_seidr_response (profile_id);


-- ========================================================================
-- END OF MIGRATION 0001 (seidr)
-- ========================================================================
-- Summary:
--   3 new engine-specific tables: rec_seidr_player_profile,
--     rec_seidr_game_profile, rec_seidr_response
--   3 new indexes
--   0 changes to mimir-owned tables
--
-- Total: 3 CREATE TABLE + 3 CREATE INDEX = 6 CREATE statements
-- ========================================================================
