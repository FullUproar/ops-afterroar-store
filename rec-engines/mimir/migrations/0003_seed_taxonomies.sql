-- 0003_seed_taxonomies.sql
-- ========================================================================
-- Mimir seed taxonomy data -- Sprint 1.0.22
-- ========================================================================
-- Populates the four dimension-framework node tables created by 0002 with
-- canonical taxonomy entries from established psychology + game-design
-- research:
--
--   rec_personality_profile:
--     - Bartle's player archetypes (4)
--     - Big Five OCEAN traits (5)
--     - Self-Determination Theory needs (3)
--   rec_emotion:
--     - MDA aesthetic categories (8)
--     - Emotional palette (6)
--   rec_cognitive_profile:
--     - 6 cognitive dimensions (per Manus § 1.4)
--   rec_context_type:
--     - 10 named recurring contexts
--
-- Idempotent via ON CONFLICT DO NOTHING. Re-running is safe.
-- All targets are rec_*-prefixed per SILO.md § 3.
-- All operations are detected + safety-checked by the migration runner's
-- INSERT-detection rules (added in this sprint).
--
-- Status: COMMITTED but NOT YET APPLIED to any production database.
-- Applied to a sandbox local Postgres in Sprint 1.0.22 to validate.
-- ========================================================================


-- ========================================================================
-- PERSONALITY PROFILE: Bartle archetypes
-- ========================================================================
INSERT INTO rec_personality_profile (id, framework, archetype, description, source)
VALUES
  (1001, 'bartle', 'achiever',   'Driven by status, leveling, and clearing-the-board completion. Plays to win; cares about scoring optimization.', 'Bartle 1996'),
  (1002, 'bartle', 'explorer',   'Driven by discovery: how the system works, what edges exist, what novel combinations are possible. Plays to map.', 'Bartle 1996'),
  (1003, 'bartle', 'socializer', 'Driven by relationships: the conversation, the rivalries, the in-jokes. Plays to be with people.', 'Bartle 1996'),
  (1004, 'bartle', 'killer',     'Driven by dominance: direct conflict, taking from others, asserting power. Plays to impose will.', 'Bartle 1996')
ON CONFLICT (framework, archetype) DO NOTHING;


-- ========================================================================
-- PERSONALITY PROFILE: Big Five OCEAN
-- ========================================================================
INSERT INTO rec_personality_profile (id, framework, archetype, description, source)
VALUES
  (2001, 'ocean', 'openness',          'Openness to experience: curiosity, novelty-seeking, willingness to engage with abstract or unfamiliar concepts.', 'Costa & McCrae 1992'),
  (2002, 'ocean', 'conscientiousness', 'Conscientiousness: planner-vs-spontaneous, methodical execution, deliberation, self-discipline.', 'Costa & McCrae 1992'),
  (2003, 'ocean', 'extraversion',      'Extraversion: assertiveness, energy from social interaction, talkativeness, sociability.', 'Costa & McCrae 1992'),
  (2004, 'ocean', 'agreeableness',     'Agreeableness: cooperativeness vs. competitiveness, empathy, trust, willingness to compromise.', 'Costa & McCrae 1992'),
  (2005, 'ocean', 'neuroticism',       'Neuroticism: anxiety, frustration sensitivity, response to loss or setback, emotional volatility.', 'Costa & McCrae 1992')
ON CONFLICT (framework, archetype) DO NOTHING;


-- ========================================================================
-- PERSONALITY PROFILE: Self-Determination Theory needs
-- ========================================================================
INSERT INTO rec_personality_profile (id, framework, archetype, description, source)
VALUES
  (3001, 'sdt', 'competence',  'Need for competence: feeling effective, mastering challenges, growing skill over time.', 'Deci & Ryan 2000'),
  (3002, 'sdt', 'autonomy',    'Need for autonomy: making meaningful choices, expressing agency, owning one''s strategy.', 'Deci & Ryan 2000'),
  (3003, 'sdt', 'relatedness', 'Need for relatedness: meaningful connection with others through the activity.', 'Deci & Ryan 2000')
ON CONFLICT (framework, archetype) DO NOTHING;


-- ========================================================================
-- EMOTION: MDA aesthetic categories (Hunicke, LeBlanc, Zubek 2004)
-- ========================================================================
INSERT INTO rec_emotion (id, name, category, description, source)
VALUES
  (4001, 'sensation',  'mda', 'Game as sense-pleasure -- the satisfaction of components, art, sound, tactile elements.', 'Hunicke et al. 2004'),
  (4002, 'fantasy',    'mda', 'Game as make-believe -- inhabiting a role, world, or context outside everyday life.', 'Hunicke et al. 2004'),
  (4003, 'narrative',  'mda', 'Game as drama -- emergent or scripted story, character arcs, memorable scenes.', 'Hunicke et al. 2004'),
  (4004, 'challenge',  'mda', 'Game as obstacle course -- the satisfaction of mastering a difficult problem.', 'Hunicke et al. 2004'),
  (4005, 'fellowship', 'mda', 'Game as social framework -- shared experience, table dynamics, in-group bonding.', 'Hunicke et al. 2004'),
  (4006, 'discovery',  'mda', 'Game as uncharted territory -- exploring rules, content, possibilities.', 'Hunicke et al. 2004'),
  (4007, 'expression', 'mda', 'Game as self-expression -- creative output, identity reflection through play decisions.', 'Hunicke et al. 2004'),
  (4008, 'submission', 'mda', 'Game as pastime -- relaxation, low-stakes engagement, comfortable routine.', 'Hunicke et al. 2004')
ON CONFLICT (name) DO NOTHING;


-- ========================================================================
-- EMOTION: Emotional palette (per dimension framework integration doc)
-- ========================================================================
INSERT INTO rec_emotion (id, name, category, description, source)
VALUES
  (5001, 'tension',   'palette', 'High-stakes anticipation; the moment-to-moment "will this work?" feeling.', 'mimir-engineering 2026'),
  (5002, 'humor',     'palette', 'Levity, laughter, comic mishaps; tone of jokes and pratfalls.', 'mimir-engineering 2026'),
  (5003, 'triumph',   'palette', 'Hard-earned victory; the "we did it" cathartic release.', 'mimir-engineering 2026'),
  (5004, 'wonder',    'palette', 'Awe, expansiveness, encountering something larger than oneself.', 'mimir-engineering 2026'),
  (5005, 'nostalgia', 'palette', 'Familiar comfort; emotional resonance with past play experiences.', 'mimir-engineering 2026'),
  (5006, 'catharsis', 'palette', 'Emotional release after sustained tension or sustained loss.', 'mimir-engineering 2026')
ON CONFLICT (name) DO NOTHING;


-- ========================================================================
-- COGNITIVE PROFILE: 6 dimensions (per Manus § 1.4)
-- ========================================================================
INSERT INTO rec_cognitive_profile (id, dimension, description, source)
VALUES
  (6001, 'working_memory_load', 'How much state must the player track in their head at once. Eclipse (track 7 alien specs) is high; Codenames (one clue) is low.', 'Manus 2026 § 1.4'),
  (6002, 'attention_span',       'How long the game requires sustained focus per turn or per session. Pandemic Legacy = high; Sushi Go = low.', 'Manus 2026 § 1.4'),
  (6003, 'processing_speed',     'How quickly decisions must be made. Real-time (Captain Sonar) is high; turn-based with timers is medium; deliberation-encouraged is low.', 'Manus 2026 § 1.4'),
  (6004, 'spatial_reasoning',    'Visualizing 2D/3D arrangements -- adjacency, packing, paths. Patchwork = high; Codenames = low.', 'Manus 2026 § 1.4'),
  (6005, 'verbal_linguistic',    'Word play, association, vocabulary. Codenames = high; Tigris & Euphrates = low.', 'Manus 2026 § 1.4'),
  (6006, 'social_cognition',     'Reading other players: bluffs, intentions, alliance signals. Werewolf = high; solo puzzles = low.', 'Manus 2026 § 1.4')
ON CONFLICT (dimension) DO NOTHING;


-- ========================================================================
-- CONTEXT TYPE: 10 named recurring contexts
-- ========================================================================
INSERT INTO rec_context_type (id, name, description, min_players, max_players, min_minutes, max_minutes, source)
VALUES
  (7001, 'party-night',         'Loud, large-group event; alcohol common; time-of-night usually 7pm-midnight; humor + accessibility prioritized.', 6, 12, 15, 60, 'platform'),
  (7002, 'family-night',        'Multi-generational household; mixed ages including kids; everyone-finishes-with-a-smile preferred.', 3, 6, 30, 75, 'platform'),
  (7003, 'hobby-group',         'Recurring 3-5 person dedicated gaming group; tolerance for complexity high; deep games OK.', 3, 5, 60, 240, 'platform'),
  (7004, 'couples',             '2-player evening; intimate; quick-to-set-up preferred; not too crunchy.', 2, 2, 20, 90, 'platform'),
  (7005, 'educational',         'Teaching context: classroom, scout troop, library program; tolerates teach-time; ages 8-14 typical.', 4, 12, 30, 75, 'platform'),
  (7006, 'kids-evening',        'Children-only or kids-with-light-supervision; ages 6-12; bright themes; short play sessions.', 2, 6, 15, 45, 'platform'),
  (7007, 'after-work-quick',    'Single hour or less; weeknight; medium energy; usually 2-4p; nothing requires re-learning rules.', 2, 4, 15, 60, 'platform'),
  (7008, 'weekend-deep-dive',   'Saturday afternoon all-day session; tolerance for 4hr+ games; rare-occasion event.', 3, 6, 180, 480, 'platform'),
  (7009, 'introducing-non-gamer', 'New player at the table; gateway games; rules teach must be < 5 min; first impressions matter.', 2, 5, 20, 60, 'platform'),
  (7010, 'convention-pickup',   'Strangers at a convention; ad-hoc gaming; predictable mechanics + replayability across sessions matter.', 3, 6, 30, 120, 'platform')
ON CONFLICT (name) DO NOTHING;


-- ========================================================================
-- END OF MIGRATION 0003
-- ========================================================================
-- Summary:
--   12 rec_personality_profile rows (4 Bartle + 5 OCEAN + 3 SDT)
--   14 rec_emotion rows (8 MDA + 6 palette)
--    6 rec_cognitive_profile rows (Manus's 6 dimensions)
--   10 rec_context_type rows (named contexts)
--   42 total rows across 4 tables
--
-- Total: 4 INSERT statements (one per target table; ON CONFLICT DO NOTHING
-- ensures idempotency on re-apply).
-- ========================================================================
