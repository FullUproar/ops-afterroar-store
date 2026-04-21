# Session Handoff — morning of 2026-04-21

**What ran overnight while Shawn slept.** Picked up from `session-handoff-2026-04-20.md`. Tonight was the TCG lockdown pass ("light load") that Shawn asked to extend into the full Deck Builder Level 2.5 polish.

## Commits pushed to prod

Both landed on `main`, deployed via Vercel to https://www.afterroar.store.

1. **`70256c7` — TCG catalog lockdown + deck-builder hover preview**
   - Catalog page and 6 API routes gated behind `tcg_engine` feature (`<FeatureGate>` client + `requireFeature`/`requirePermissionAndFeature` server).
   - New **Sealed EV page** at `/dashboard/catalog/sealed-ev` (hero EV, breakdown chips, top-10 chase cards).
   - New **Import Collection page** at `/dashboard/catalog/import` (3-step flow, TCGPlayer/Moxfield/simple CSV, failed-lookup callout).
   - **CardHoverPreview** component — floating full-size card image on hover, wired into inventory card (main + substitute).

2. **`8047b8b` — Deck Builder Level 2.5**
   - **Moxfield + Archidekt URL import.** Paste a deck URL at `/dashboard/deck-builder`, imports mainboard + sideboard + commanders via their public APIs, auto-fills the paste area, auto-switches format, and runs inventory match.
   - **Deck analysis panel** above the inventory match list: color identity (Azorius, Izzet, Grixis, …), mana curve bar chart w/ avg CMC, featured format legality badge, and "also legal in" strip.
   - **Scryfall batch lookup** (`/cards/collection`, ~1 call per 75 cards) — feeds analysis without hammering the API like the old per-card fuzzy path.
   - Scryfall-SVG mana symbol pips + Color Pips components (ready to use in more surfaces later).

## Product scope reminder

Deck Builder is locked at **Level 2.5** — NOT a Moxfield replacement. See `memory/project_deck_builder_scope.md`. If a feature request sounds like "composer / sideboard manager / card-browser builder," push back before implementing.

Shawn's stated reason: he isn't a TCG player and can't sell Level 4. Level 2.5 is sellable as "bring your list from anywhere, we'll turn it into a sale" — a FLGS-operator value prop.

## Visual QA results (Playwright)

Test file: `apps/ops/tests/deck-builder-qa.spec.ts`. Runs against prod (`www.afterroar.store`) with bot-owner auth.

Screenshots saved to `apps/ops/tests/screenshots/deck-builder/`:

- `01-landing.png` — deck builder empty state
- `02-paste-tab-with-import.png` — new URL import field + paste textarea
- `03-results-with-analysis.png` — analysis panel + inventory match after parsing the Burn sample deck
- `04-hover-preview.png` — CardHoverPreview floating card image
- `05-import-bad-url-error.png` — error handling for non-supported URLs

**How to review:** open those PNGs. They're the "did it land right" check. See the `## Known gaps / next steps` below for anything flagged during QA.

To rerun: `cd apps/ops && npx playwright test tests/deck-builder-qa.spec.ts --project=auth-desktop`.

## URLs for review

- Deck Builder: https://www.afterroar.store/dashboard/deck-builder
- Sealed EV: https://www.afterroar.store/dashboard/catalog/sealed-ev
- Import Collection: https://www.afterroar.store/dashboard/catalog/import

Sample Moxfield URL to try (popular Commander deck): paste any public `https://moxfield.com/decks/...` URL. Also accepts `archidekt.com/decks/...`.

## Known gaps / next steps (priority order)

1. **Typography polish is still light.** I did the structural work, not a sweep. Tomorrow: tighten spacing between the analysis panel and inventory match list, align the card-name truncation with the hover trigger width.
2. **ManaCost rendering not yet wired into inventory card rows.** We fetch `mana_cost` in the analysis path but the `InventoryCard` component doesn't display it yet — that's a Level 2.5 polish item for tomorrow.
3. **TappedOut + MTGGoldfish URL import not yet in.** Moxfield and Archidekt cover ~90%+ of deck-sharing traffic. Add the other two if there's a concrete customer asking.
4. **Old `ColorPips` function in `deck-builder/page.tsx` (lines 124-142) is now duplicated** with the new `components/deck-builder/color-pips.tsx`. The old inline one is still used for commander results. Worth consolidating but not urgent.
5. **Format dropdown lacks Pauper / Historic / Brawl.** Deck analysis checks legality across all, but user can't select those as their target format. Cheap to add.
6. **Re-verify the P1 punch list** from last night's explore-agent audit — agent was sloppy (2 false positives already). Real issues remaining: catalog search spam on keystroke, public buylist cache has no invalidation, deck builder parse errors don't indicate which line failed.

## Other context

- See `MEMORY.md` index. Key memories from this session:
  - `user_tcg_not_a_player.md` — don't rely on Shawn for TCG taste calls
  - `feedback_tcg_is_signal_to_store_owners.md` — higher polish bar on TCG
  - `project_deck_builder_scope.md` — Level 2.5 ceiling
  - `reference_afterroar_ops_url.md` — POS is at `www.afterroar.store`, not `ops.afterroar.store`

- Tomorrow's heavier workload is supposed to be FMM presale readiness on the Full Uproar store side (see `session-handoff-2026-04-20.md`). TCG polish + FMM is a lot for one day — recommend sequencing: FMM critical path first since the presale was supposed to launch 4/20 and is only slipped a few days.
