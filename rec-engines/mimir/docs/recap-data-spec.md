# Recap Data Spec for HQ Recap UI v1

> **Audience:** HQ team building the game-night recap UI.
> **Authored by:** Mimir (the foundation rec engine), but the contract serves all engines, especially saga (the future Monte Carlo simulator) which depends on this data for its per-player fun model.
> **Status:** Authoritative spec for HQ recap UI v1.
> **Last updated:** 2026-05-06 (Mimir Sprint 1.0.13).

## Why this spec exists

The saga engine (the recommendation breakthrough) trains a per-player fun model from structured recap data. Without that data captured AT THE TIME each game-night happens, saga has nothing to learn from when it activates 18–30 months from now.

**Retrofitting structured fields onto recaps that have already happened is impossible.** Players don't accurately remember whether they had fun on a game night three months ago, let alone whether the game finished or got salt-ended.

So the trade-off is:

1. **Spend ~2 weeks of HQ engineering now** to ship the recap UI with structured fields (per this spec).
2. **Or accept that saga can't ship until 12+ months AFTER recap UI is rebuilt later** — and that the data captured before the rebuild is unusable.

Option 1 dominates. This spec defines the shape of option 1.

## Hard requirements

The recap UI v1 MUST:

1. Capture per-game-per-player records (not just per-game). A 4-player night with 2 games has 8 potential rows.
2. Capture per-game records too (the things that don't depend on which player is reporting: who won, how long it actually took, did it finish).
3. Make all individual fields optional. The UI nudges; the data model doesn't punish missing fields.
4. Capture timestamps. Recap may be filled out hours, days, or never after the night.
5. Support edit-after-publish for at least 30 days. Memory-of-the-night sharpens after a beer or two.
6. Be honest about what's stored. Privacy disclosure on the recap form: "these ratings inform recommendations for your group; aggregated insights may inform stocking decisions at participating stores."

The recap UI v1 MUST NOT:

1. Require any field to publish. The friction of mandatory fields will collapse capture rate; missing data is better than no data.
2. Block recap submission on validation errors. Validate; warn; accept.
3. Surface another player's recap data to anyone except their group members + admins.

## The fields

Divided into two groups: **per-game** (one row per played game per night) and **per-player-per-game** (one row per player per played game per night).

### Per-game fields

These describe outcomes that don't depend on which player is reporting.

| Field | Type | Required | Why it matters |
|---|---|---|---|
| `night_id` | bigint | yes | Foreign key to the game-night. Required for grouping. |
| `game_id` | bigint | yes | Foreign key to the game (BGG ID for known games, internal ID for custom). |
| `finished` | boolean | optional | Distinguishes "great game we cut short" from "the game went bad and we abandoned". Saga's fun model needs this to weight outcomes correctly. |
| `length_actual_minutes` | int | optional | The CALIBRATION signal. Saga learns each group's playing-time multiplier vs. BGG's stated time. Without this, length\_fit is an approximation. |
| `winner_player_id` | bigint nullable | optional | The single winner of the game (or null for cooperative wins / no winner). Drives the "Brad always wins Cascadia" dynamic in saga's group simulation. |
| `position_data` | jsonb optional | optional | If captured: ordered list of players by final standing. Goes beyond winner-only. Saga can use this; not all UIs will capture it. |
| `notes` | text optional | optional | Free-form text. Future engines (saga\+) extract sentiment via LLM. "Brad got salty losing the spice market" is exactly the kind of signal that doesn't fit a structured field. |
| `recapped_at` | timestamptz | yes (default now()) | When the recap was submitted, NOT when the night happened. |
| `night_occurred_at` | timestamptz | yes (default = night.occurred\_at) | When the night happened. Saga uses recency-weighted aggregation; this is what "recency" measures against. |

### Per-player-per-game fields

These are the ratings each player provides for each game they played that night. The single highest-information field is `would_play_again`; the single richest is `notes`.

| Field | Type | Required | Why it matters |
|---|---|---|---|
| `night_id` | bigint | yes | Foreign key. |
| `game_id` | bigint | yes | Foreign key. |
| `player_id` | bigint | yes | Foreign key. |
| `fun_rating` | int 1–5 | optional | The headline numeric. Saga's per-player fun model trains primarily on this. UX hint: a 5-star widget (or 5-emoji widget) with no default selection. |
| `would_play_again` | boolean | optional | The single cleanest binary signal. Higher information per bit than fun\_rating because it forces a decision. UX hint: yes/no/skip toggle. **If you can only capture ONE field per player, capture this one.** |
| `engagement_level` | enum optional | optional | One of `fully_engaged`, `mostly_engaged`, `distracted`, `wishing_for_dinner`. Saga uses this to detect "unhappy player drags the night" cases that fun\_rating alone misses (a player can rate 4 stars while being distracted). |
| `learned_today` | boolean | optional | First time playing this game? Saga's fun model treats first-play differently — a learning game often has lower fun-rating but high "would play again" because the player wants to give it another shot now that they know the rules. Critical signal for catching that pattern. |
| `taught_today` | boolean | optional | Did this player teach the rules tonight? Saga's group dynamics simulator uses this to weight "the rules-teacher gets tired" effects. |
| `notes` | text optional | optional | Per-player free-form. Privacy: visible only to the player who wrote it + group admins. |
| `submitted_at` | timestamptz | yes (default now()) | When this player's recap was submitted (each player may submit independently). |

## Schema mapping

The `rec_recap_outcome` table (defined in `mimir/migrations/0001_create_rec_tables.sql`) is per-player-per-game. Per-game fields go in a sibling table that this spec recommends adding in a future migration:

### Per-player-per-game → `rec_recap_outcome` (already exists)

Mapping:

| HQ recap field | rec_recap_outcome column |
|---|---|
| `night_id` | `night_id` |
| `game_id` | `game_id` |
| `player_id` | `player_id` |
| `fun_rating` | `fun_rating` |
| `would_play_again` | `would_play_again` |
| `engagement_level` | (NEW; not in 0001 — add in a follow-up migration) |
| `learned_today` | (NEW; add in follow-up migration) |
| `taught_today` | (NEW; add in follow-up migration) |
| `notes` (per-player) | `notes` |
| `submitted_at` | `created_at` |

Follow-up migration `0002_extend_recap_outcomes.sql` (Sprint 1.1.x of mimir) will add `engagement_level`, `learned_today`, `taught_today` columns.

### Per-game → future `rec_recap_game` table

Not in 0001. To be added in a follow-up migration. Shape:

```sql
create table if not exists rec_recap_game (
  id                bigserial primary key,
  night_id          bigint not null,
  game_id           bigint not null,
  finished          boolean,
  length_actual_minutes int,
  winner_player_id  bigint,
  position_data     jsonb,
  notes             text,
  recapped_at       timestamptz not null default now(),
  night_occurred_at timestamptz not null,
  unique (night_id, game_id)
);

create index if not exists rec_recap_game_night on rec_recap_game (night_id);
create index if not exists rec_recap_game_when on rec_recap_game (night_occurred_at desc);
```

HQ's recap UI v1 should write to BOTH `rec_recap_outcome` (per-player) AND `rec_recap_game` (per-game) when each is available.

## API shape

Suggested HQ endpoint signature (HQ team owns the implementation):

```typescript
POST /api/game-nights/[nightId]/recap
{
  game_recaps: [
    {
      game_id: number,
      finished?: boolean,
      length_actual_minutes?: number,
      winner_player_id?: number | null,
      position_data?: { player_id: number, position: number }[],
      notes?: string,
    }
  ],
  player_game_recaps: [
    {
      game_id: number,
      player_id: number,
      fun_rating?: 1 | 2 | 3 | 4 | 5,
      would_play_again?: boolean,
      engagement_level?: 'fully_engaged' | 'mostly_engaged' | 'distracted' | 'wishing_for_dinner',
      learned_today?: boolean,
      taught_today?: boolean,
      notes?: string,
    }
  ]
}
```

Response: `{ ok: true, recapped_at: "..." }` plus any per-row warnings (validation issues that don't block submission).

## Validation rules

- `fun_rating`: integer 1–5 if present.
- `winner_player_id`: must be in the night's attendance roster if present.
- `length_actual_minutes`: positive int < 1440 (24 hours).
- `position_data`: distinct player_ids; positions form 1..N.
- Cross-row consistency: if multiple players report different `length_actual_minutes` for the same game, the per-game row uses the **median** as canonical (and stores all reports in metadata).

Validation failures emit warnings but DO NOT block submission. The data model accepts incomplete/imperfect records and the rec engine handles them via the optional fields.

## Privacy boundaries

- **Per-player notes** visible only to the player who wrote them + group admins.
- **Per-player ratings** visible to the player + group admins by default. Player may opt to share with the broader group via a setting.
- **Per-game records** (winner, finished, length) visible to all attendees of the night.
- **Aggregated, de-identified data** may be used for cross-store stocking insights (per the data co-op model). Aggregation requires ≥5 distinct attributing players + min-cell-size of 3 plays for any reported statistic. Disclosed in the recap form's privacy notice.
- **Player can delete their own recap data** at any time (Credo tier 1: data belongs to the player). Deletion is hard-delete from `rec_recap_outcome`; the per-game row in `rec_recap_game` retains the per-game outcomes (which are not personally identifying) but loses the per-player records.

## Edit-after-publish

For at least 30 days after `submitted_at`, players may edit their per-player records. After 30 days, records become read-only (with admin override).

When a player edits a record, store the prior version in a sibling `rec_recap_outcome_history` table (suggested follow-up migration) with `superseded_at` timestamp. Saga's training pipeline uses only the current (un-superseded) version; the history exists for forensics + restoration.

## Late-arriving recap data

A player may submit their recap days or weeks after the night. The recap UI should:

1. Show "recap pending" state on the night detail until ≥1 player has submitted.
2. Send a single nudge notification 24h after the night ended; do not nag further.
3. Accept submission anytime within the night's natural lifetime (no hard deadline). Stale recaps (>30 days after night) flag a warning but are accepted.
4. Late submissions are weighted in saga's training pipeline by recency from the **night** (not from submission), so a recap written 6 months later for a 6-month-old night gets the same training weight as one written the night-of.

## Multi-game-night handling

A single game-night may have 2–3 games played sequentially. Each game gets its own per-game record + each player gets their own per-player-per-game records.

The UI should:

1. Default the game list from the night's `played` edges (or RSVP-confirmed game list from the picker).
2. Allow add/remove of games at recap time (sometimes the planned game gets swapped for an unplanned one).
3. Show a stacked-tabs UI per game so the player sees one game's full set of fields at a time.

## What NOT to capture

- **Player identity at recap time.** Recaps are tied to authenticated player_ids; don't ask for names or pseudonyms.
- **Game variant / house rules.** Niche; defer to a future field.
- **Photos / media.** Out of scope for v1. Storage + privacy considerations dwarf the value.
- **Real names of guests.** Guests should be Passport-linked or marked as anonymous attendees; never collected as free-text in recap fields.
- **Geolocation.** Already in night metadata; no need to re-capture.
- **Anything that requires a survey-style "how is your group's mood" question.** Saga infers this from per-player engagement_level + fun_rating + notes; asking explicitly is intrusive and the data is unreliable.

## UI guidance (non-prescriptive)

The rec engine is agnostic to the UI shape. But these patterns help capture rates:

- **Show the night title + game thumbnails** so the player knows which night they're recapping.
- **One game at a time** with tab navigation; not all-games-at-once forms.
- **Default the per-player section to the player's own row only**, with a "someone else recap for the group" expand. Most recap submissions will be self-only; accommodate that.
- **Quick-pick widgets:** 5-emoji fun rating; toggle for would_play_again; chips for engagement_level. Avoid sliders + free-form numbers.
- **No paginated multi-step wizard.** Single-page form, scrollable, optimistic save on field blur.
- **Privacy notice prominent.** "What we do with this data" link visible above the submit button. Per Credo § 1.

## Open questions

1. **Should recap UI v1 support "recap on behalf of another player" with an attribution flag?** Cases: a non-tech-savvy parent attended a game night and the host wants to capture their reaction. Pro: more recap density. Con: surveillance risk if not strictly opt-in. Default: don't ship in v1; revisit if recap density is too low.
2. **Should there be a "highlight of the night" single-field option?** A simple "what was the best moment" text field that all players can answer. Captures co-narrative emotional content for free. Defer to v2 if v1 capture rates are healthy.
3. **Should ratings be a 1–5 stars or 1–7 (Likert) scale?** 5 is universal but 7 has more discriminative power. Saga's training pipeline can convert. Recommend 5 for v1 to minimize friction; revisit if model accuracy plateaus.
4. **How are ratings shown back to the rating player?** Privacy considerations matter. Recommend: my-ratings visible in profile; group-aggregate only if all members opted into group-level visibility.

---

## Cross-reference

- Mimir architectural design doc § 9 ("Recap Data Schema (decide now, capture from day 1)") was the first articulation of these requirements; this spec extends and operationalizes it.
- Saga (future) design notes will detail how each field feeds the per-player fun model. (saga is not yet scaffolded as of Mimir Sprint 1.0.13; will be in a future sprint.)
- HQ recap UI implementation lives in HQ’s codebase, not in rec-engines/. This spec is the contract; HQ owns the build.

## Versioning

This spec is v1.0.0 as of 2026-05-06. Backwards-compatible additions (new optional fields) bump minor version. Breaking changes (rename, remove, change required-vs-optional) bump major version. HQ recap UI must declare which spec version it implements in the recap submission payload via `_spec_version: '1.0.0'`.
