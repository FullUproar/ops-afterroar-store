# Seidr Dimension Taxonomy

24 dimensions across 6 clusters. Each scored on a normalized scale -1.0 to 1.0.

21 dimensions originated from Manus AI's research synthesis; 3 added by Mimir engineering for coverage of emotion + player-count contexts (`EMO_*`, `CTX_PLAYER_COUNT`).

## Psychological & Motivational (PSY) — 9 dimensions

Grounded in Bartle's taxonomy, Big Five OCEAN, Self-Determination Theory.

- **PSY_ACHIEVEMENT** — Casual/Social (-1.0) to Mastery/Optimization (+1.0). Bartle's Achiever axis. Maps to objective-completion drive, scoring optimization.
- **PSY_EXPLORATION** — Predictable/Scripted (-1.0) to Emergent/Sandbox (+1.0). Bartle's Explorer axis. Discovery motivation.
- **PSY_SOCIAL** — Solitaire/Focused (-1.0) to Chatty/Interactive (+1.0). Bartle's Socializer axis. Social-as-primary motivation.
- **PSY_KILLER** — Pacifist/Builder (-1.0) to Aggressive/Dominant (+1.0). Bartle's Killer axis. Direct-conflict appetite.
- **PSY_OPENNESS** — Traditional/Familiar (-1.0) to Avant-garde/Novel (+1.0). OCEAN-O. Receptiveness to unusual mechanics, dark themes, experimental design.
- **PSY_CONSCIENTIOUSNESS** — Spontaneous/Chaotic (-1.0) to Planner/Methodical (+1.0). OCEAN-C. Long-term planning preference, deterministic-outcome preference.
- **PSY_EXTRAVERSION** — Introverted/Quiet (-1.0) to Extraverted/Loud (+1.0). OCEAN-E. Group-size preference, talking-during-play preference.
- **PSY_AGREEABLENESS** — Cutthroat/Selfish (-1.0) to Cooperative/Empathetic (+1.0). OCEAN-A. Conflict-comfort, take-that tolerance.
- **PSY_NEUROTICISM** — Resilient/Calm (-1.0) to Anxious/Frustrated by loss (+1.0). OCEAN-N. Loss-tolerance, risk-aversion.

## Social Dynamics (SOC) — 3 dimensions

- **SOC_COOP_COMP** — Pure Cooperative (-1.0) to Pure Competitive (+1.0). Whether the player wants to be on the same team as others or against them.
- **SOC_DIRECT_INDIRECT** — Indirect/Multiplayer Solitaire (-1.0) to Direct Attack/Take-That (+1.0). Within competitive, how directly opponents target each other.
- **SOC_TRUST_BETRAYAL** — Low Tolerance for Betrayal (-1.0) to High Enjoyment of Bluffing/Deception (+1.0). Bluffing/social-deduction comfort.

## Mechanical & Structural (MEC) — 4 dimensions

- **MEC_LUCK_SKILL** — Pure Luck/Randomness (-1.0) to Pure Deterministic Skill (+1.0). Tolerance for output randomness.
- **MEC_COMPLEXITY** — Very Light/Gateway (-1.0) to Extremely Heavy/Opaque (+1.0). Rules complexity preference.
- **MEC_STRATEGY** — Shallow/Tactical (-1.0) to Deep/Long-term Strategic (+1.0). Strategic depth preference. Distinct from complexity (a game can have simple rules but deep strategy, like Go).
- **MEC_ASYMMETRY** — Purely Symmetric (-1.0) to Highly Asymmetric Roles (+1.0). Variable-player-power preference.

## Aesthetic & Experiential (AES) — 3 dimensions

- **AES_THEME_MECH** — Pure Abstract/Mechanics First (-1.0) to Pure Thematic/Ameritrash (+1.0). Eurogame vs thematic-game pole.
- **AES_NARRATIVE** — No Story/Flavor Only (-1.0) to Deep Campaign/Story-Driven (+1.0). Narrative depth appetite.
- **AES_COMPONENT** — Minimalist/Cardboard (-1.0) to Premium/Miniatures/Overproduced (+1.0). Component-quality importance.

## Contextual (CTX) — 3 dimensions

- **CTX_TIME** — Micro/Filler (-1.0) to Epic/All-Day (+1.0). Game-length preference.
- **CTX_NOSTALGIA** — Original IP/New (-1.0) to Familiar Franchise/Nostalgic (+1.0). Licensed-IP appeal.
- **CTX_PLAYER_COUNT** — Solo/2P-preferring (-1.0) to Large-group-preferring (+1.0). *(Editorial addition. Manus's bank didn't cover player count directly. We added because group-size preference is a major real-world constraint and predicts party-game vs solo-game preference well.)*

## Emotional Palette (EMO) — 2 dimensions

*(Editorial addition. Manus covered some of this through OCEAN proxies but didn't have explicit emotion dimensions. We added these because emotion is a primary user-facing way to describe what they want from a game.)*

- **EMO_TENSION** — Calm/Relaxed (-1.0) to High-stakes/Tense (+1.0). Whether the player wants their pulse up.
- **EMO_HUMOR** — Serious-tone-seeking (-1.0) to Humor/Levity-seeking (+1.0). Whether the game should be funny.

## Mapping to Mimir's schema (per Sprint 1.0.15)

When a player completes the quiz, their 24-dim profile is written as edges from `rec_player` to `rec_personality_profile` nodes per the framework column. For Phase 0, all 24 dimensions live under `framework='manus_seidr_v1'` with `archetype='<dim_id>'`. Future migrations may refactor into more specific frameworks if the asymmetry causes friction.

```sql
-- example: writing PSY_OPENNESS=0.7 for player_id=42
insert into rec_personality_profile (id, framework, archetype, description)
values (1001, 'manus_seidr_v1', 'PSY_OPENNESS', 'Openness to Experience')
on conflict (framework, archetype) do nothing;

insert into rec_edge (src_type, src_id, dst_type, dst_id, edge_type, weight, ts, context)
values ('player', 42, 'personality_profile', 1001, 'profile_score', 0.7, now(), '{"framework":"manus_seidr_v1","confidence":0.85,"source":"seidr_quiz_v1.0"}');
```

Games get profiled the same way: edges from `rec_game` to the same `rec_personality_profile` nodes representing the game's affinity for that dimension.

## Open questions

- **Are 24 dimensions the right number?** Could collapse to fewer principal components empirically. v0 keeps 24 for interpretability; future analysis may find redundancies.
- **CTX_PLAYER_COUNT as a single dimension** — oversimplifies. Real preferences are bimodal ("I love 2-player AND I love 6-player; I hate 4-player solo-feeling games"). Future v2 may decompose.
- **EMO_* dimensions only have 2 entries** — likely needs more (TRIUMPH, WONDER, NOSTALGIA, FELLOWSHIP, MELANCHOLY, SCHADENFREUDE). Started narrow; will expand if quiz analysis suggests value.
