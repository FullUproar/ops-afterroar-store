# TCGPlayer BD Intro Call — Brief

**Context:** Their BD lead has already said API is closed to new partners. Goal of this call: (1) be remarkable enough that we move from cold list to "watch this name" list when they reopen, and (2) do enough listening to learn the real shape of the API freeze and the partner pathway.

**Tone:** curious + restrained. We don't need to pitch hard — they didn't take the call to be sold to. We want to leave her thinking *"that's a different kind of POS than the others I get pinged about — flag this one when we reopen."*

---

## The actual ask, in one line

> "We'd love TCGPlayer in our integrations layer the moment your team reopens. Today is mostly listening: what does the partner pathway look like when it does, and is there anything we should be doing now to be a high-priority candidate?"

This frames us as patient, not pushy. It also opens her to talk about the freeze (we learn the why), the partner program (we learn the criteria), and her perspective on what makes a good partner candidate (gold for us).

If she gives an opening for more — *then* go to the narrative below.

---

## The 60-second narrative (only if she opens for it)

> "Afterroar is the POS layer for hybrid game/comic/board game stores — the FLGS that sells MTG and Pokemon AND comics AND board games AND has a cafe attached. Not your TCG-only Crystal Commerce / BinderPOS segment. We're picky about partnerships: every catalog source we integrate has to be one that doesn't conflict with the existing ecosystem. Scryfall for MTG, BGG for board games, ComicVine for comics, Pokemon TCG API for Pokemon. The gap we can't fill cleanly is non-MTG TCG pricing — Pokemon, Yu-Gi-Oh, Lorcana, FAB. That's where TCGPlayer is uniquely valuable to our customers."

Three things this does:
1. Names a segment (hybrid stores) that **isn't** TCGPlayer's existing partner segment, so we're not seen as a small competitor of theirs
2. Shows we're disciplined about integrations (we've integrated with everyone who'll have us, on their terms)
3. Narrows the ask from "TCGPlayer pricing for everything" to "the non-MTG corner where you're the only game in town" — much smaller, harder to refuse

---

## Why we're safe to give API to

Three points that pre-empt the data-leak / competitive-concern objections:

1. **Per-store key model, not platform-wide.** We don't aggregate API access across our customer base. When a TCGPlayer-credentialed store wants to pull pricing, they do it with their own key on their own quota. Their relationship is direct with you. We're middleware, not a wrapper.

2. **We don't operate a competing marketplace.** Our outbound integrations are ManaPool + CardTrader + eBay. ManaPool fills the marketplace-not-TCGPlayer slot for our customers — but ManaPool isn't a TCGPlayer-scale competitor. We have no horse in a "TCGPlayer vs us" race because we're not building a marketplace.

3. **The Credo (our founding doc, public on afterroar.me) explicitly forbids backdoor data deals.** Tier 4: *"No participant in the ecosystem receives preferential or back-door access."* That's a structural commitment — we don't sell bulk TCGPlayer-derived data to third parties because we contractually couldn't. If they ask whether we'd ever data-share TCGPlayer pricing to a competitor, the answer is "we'd violate our own founding doc to do that."

---

## What we already have integrated (proof we're disciplined, not API-hungry)

Have this table memorized — she may ask, and showing we've actually done the work matters:

| Source | Status | What it gives | Auth model |
|---|---|---|---|
| **Scryfall** | Live | MTG metadata + prices + images | Public, no key |
| **BoardGameGeek** | Live | Board game catalog | Public XML API |
| **Pokemon TCG API** | Live | Pokemon catalog + prices | Public (optional key) |
| **DriveThruRPG / RPGGeek** | Live | RPG catalog | Public |
| **Open Library** | Live | Books + ISBN + graphic novels | Public |
| **ComicVine** | Live (key-required) | Comic metadata | Per-store / platform key |
| **Open Food Facts** | Live | Cafe nutrition + allergens | Public |
| **UPC database** | Live | Generic barcode fallback | Public |
| **ManaPool, CardTrader** | Live (outbound) | TCG marketplace listings | Per-store keys |
| **eBay** | Live (outbound) | Marketplace listings | Per-store OAuth |
| **Stripe** | Live | Card sales + Tap-to-Pay | Per-store Stripe Connect |
| **TCGPlayer** | Pending | Pricing + listings | (the ask) |

The shape: 11 live integrations, every one disciplined. We're not collecting partnerships — we're filling specific gaps.

---

## What makes our architecture different (one line)

> **"We're vertical-agnostic in the core, FLGS-specific in the extensions. Same registry pattern adds a record-store vertical or a comic-shop vertical without forking the schema. So our integration appetite is bounded by what our specific customers need, not by what we *could* do — which makes us a low-risk partner."**

If she asks more, the longer version: most POS systems are either fully horizontal (Square, Clover, Toast) or fully vertical (Crystal Commerce for TCG, Lightspeed for retail). The horizontal POS systems can't go deep on TCG; the vertical ones can't expand beyond their niche. We have a thin core + per-vertical extensions, so we go deep on TCG without being a TCG-only POS.

---

## Probing questions to ask her

Get her talking — every answer is intel:

1. **"What drove the API freeze?"** — bandwidth? abuse? competitive? data-sovereignty? (The answer determines what we can do to be a good candidate later.)
2. **"Is there a current partner-program tier that's still open?"** — sometimes vetted integrators / volume partners get grandfathered access while general API is closed.
3. **"When you reopen, what's the ICP?"** — volume of stores? specific verticals? regional focus?
4. **"What does the timeline look like?"** — even a vague "Q3" / "next year" is useful. If she won't say, ask "what would you need to see in the market to know it's time?"
5. **"Is there a path through eBay's partnership framework?"** — TCGPlayer is owned by eBay; we already integrate with eBay's APIs. There may be an eBay-side partner path that flows down to TCGPlayer.
6. **"Are there current partners we should know who do something similar?"** — surfaces the existing landscape + where we'd fit.
7. **"What would the ideal pilot look like, even at a small scale?"** — opens the door to a 5-store / 6-month / read-only-pricing-only pilot. Worth asking even if the answer is "we don't do pilots." If she does pilots, we're in.

---

## What NOT to say

- **Don't pretend volume we don't have.** "We'll have hundreds of stores by Q3" is the kind of pitch that gets you noted as a hype-merchant. Better: "Our pilot stores onboard in Q2; we're disciplined about growth."
- **Don't bash competitors.** No "BinderPOS is dying" / "Crystal Commerce got acquired and gutted." She's heard all of that.
- **Don't ask for the world.** Don't say "we want full pricing + listing + buylist + bulk APIs." Say "the highest-leverage thing for our customers is read-only pricing on non-MTG TCG."
- **Don't volunteer financials, fundraising, runway, or pricing.** If she asks, give a clean one-liner. Don't lead with it.
- **Don't mention "Connect" or "federation" or "Credo" by name without setup.** The right framing is what those things DO (vetted onboarding, neutral platform, structural data commitments) — not their internal brand names.
- **Don't oversell the "ecosystem" angle.** TCGPlayer hears "ecosystem" from every pitch. They've stopped registering it. Show, don't say.

---

## If she says "API stays closed, sorry"

That's the most likely outcome. Three moves:

1. **Acknowledge cleanly.** "Totally understand. The freeze is your call and we want you to feel good about whoever ends up in your integrations layer."
2. **Get one specific commitment.** Something concrete, not "let's stay in touch": *"Could I send a quarterly update — one paragraph, what we shipped + signal we're hearing from stores — so when you do reopen we're not starting from zero? You can ignore them all, but they'll be there."* Yes/no question, hard to refuse.
3. **Open a backchannel for genuine signal.** "If you ever hear of a hybrid-store FLGS that's frustrated with their current POS, send them our way. We'll send back what we learn from them. No formal partnership, just market intel both directions."

That third one is gold — even if API never opens, you've built a relationship with someone who hears every TCG-store-owner gripe in the market.

---

## After-the-call to-do (when you're back)

- Save her name + role in a CRM/notes — she's the named contact for when API reopens
- Write 3 bullet notes from the call (what she said about freeze, what she said about partner pathway, any specific commitments she made)
- If she gave a "send us a quarterly update" commitment, calendar the next one (90 days out)
- If she mentioned any specific contact at TCGPlayer or eBay we should know, follow up by email same day with a one-liner thank-you + the intro ask

---

## One last thing

Re-read the Credo right before the call. The CEO posture in this conversation is: **we're a partner candidate that takes commitments seriously and isn't desperate.** Not selling. Not begging. Listening hard, asking sharp questions, and being remarkable through restraint.

The best signal you can leave: she walks away thinking *"that founder asked better questions than I'm used to."*

Good luck.
