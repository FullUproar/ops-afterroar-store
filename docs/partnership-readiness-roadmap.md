# Partnership-Readiness Roadmap

## Why this exists

The 2026-04-29 TCGPlayer BD call surfaced two things we want to be ready for:

1. A 90-day check-in window where the BD lead may circle back, and a "confidential thing that will be public at some point" timeline that's likely 3–12 months out (per `memory/project_tcgplayer_bd_call_2026_04_29.md`).
2. The working hypothesis that TCGPlayer's API freeze is downstream of an eBay merchant-platform play — making non-Shopify architecture + structural neutrality + operational discipline strategic advantages for partnership candidacy (per `memory/project_ebay_shopify_competitor_thesis.md`).

The strategic problem: **Afterroar is a single-founder startup with casual family helpers. We need to present as a competent business partner before we have the team to back that up at scale.** The lever is operational track record. A solo founder *can* present credibly if the discipline is real and the evidence is public. Track record substitutes for headcount — but only if it's documented from the start.

This roadmap is milestone-driven, not calendar-driven. The "launch+6 months" target maps roughly to the M-D phase (~6 calendar months from first paying customer in steady state), but the milestones are the contract, not the dates. If a milestone takes longer, the next conversation with TCGPlayer waits. If milestones land faster, the conversation moves up.

---

## Headline goal

**Partnership-ready posture means:**

1. **12 paying stores live on the platform** — not free trials, not betas, not friends-of-the-founder, paying customers
2. **6 months of public uptime data** on Garmr, transparently visible at `afterroar.store/uptime` (or equivalent)
3. **3+ documented incident retrospectives** posted publicly on the trust center
4. **2+ documented database restore drills** with recorded execution and verification reports
5. **1+ tabletop security incident response exercise** with documented runbook and learnings
6. **A live trust center page** with current SLA commitments, uptime track record, security posture, breach disclosure policy, and contacts
7. **2 quarterly partner-update emails sent** — the first at ~90 days post-launch, second at ~6 months post-launch — referencing concrete operational evidence

When all seven are true, we have what no pre-scale POS competitor has: **demonstrable operational maturity**. That is the partnership-ready posture, and it's defensible without a team.

---

## Phase A — Pre-launch readiness

Before the first paying customer onboards, the operational scaffolding has to exist. Most of these can ship in parallel.

| # | Milestone | Definition of done |
|---|---|---|
| M-A1 | Onboarding flow productized | Recorded video walkthrough, written setup checklist, time-boxed onboarding (target: 2 hours founder-time per new store after the first 3) |
| M-A2 | Trust center page scaffolded | `afterroar.store/trust` lives. Includes SLA tier table, security policy, breach disclosure commitment, contact info. Uptime + incident sections are present even if empty (placeholder: "data begins on launch day"). |
| M-A3 | Garmr v1 in staging | Health checks against 4 endpoints (apps/site, apps/hq, apps/ops, apps/me) every 60 seconds. Status page renders. Notifications fire to founder phone on detected outage. |
| M-A4 | First 3 FLGS prospects in serious conversation | "Serious" = scheduled onboarding call, biz verification submitted, payment method ready |
| M-A5 | Incident-response runbook documented | Internal doc covering: who responds, what gets logged, how customer communication happens, how the public retrospective gets written. Used as the tabletop in Phase D. |

---

## Phase B — Launch + first signals

The first paying customer is "launch." Everything in this phase happens within ~30 days of that event.

| # | Milestone | Definition of done |
|---|---|---|
| M-B1 | First paying store live | Real money charged, real transactions running, founder has stopped touching their config daily |
| M-B2 | Garmr public | `afterroar.store/uptime` (or equivalent) shows live status. Public from day one of paying customer. |
| M-B3 | First incident response documented | Could be real (uptime blip, partner API outage, anything) or tabletop (you walk through a hypothetical scenario, document the response). Posted publicly to the trust center. |
| M-B4 | First restore drill complete | Recorded screen capture of executing point-in-time recovery to a clean replica. Verification report posted publicly with: drill date, RPO achieved, RTO achieved, data integrity check result. |

---

## Phase C — Operational track record

This is where claims become evidence. Every milestone in this phase produces a partnership asset.

| # | Milestone | Definition of done |
|---|---|---|
| M-C1 | Stores 2–3 live + 30 days of public uptime | Cumulative track record of at least 99.5% on the public Garmr page |
| M-C2 | **First quarterly partner update sent** | Brief email (one paragraph) to TCGPlayer BD contact + any other partner candidates, referencing: store count, public uptime page, link to trust center. No ask, just signal. (Per the original BD call commitment offer: "send a quarterly one-paragraph update — you can ignore them all but they'll be there.") |
| M-C3 | Stores 4–6 live | First Pro tier customer ($249) helps tier-mix evidence |
| M-C4 | Restore drill #2 complete | Second drill posted, with comparison to drill #1 (faster? better? what learnings?) |
| M-C5 | First public security policy commitment | Formal breach disclosure window (72 hours per the SLA doc) committed publicly with a named security contact |

---

## Phase D — Partnership-ready posture (the headline goal)

When this phase completes, the seven-item list at the top of this doc is satisfied. This is the moment we're ready to engage TCGPlayer (or any partner candidate) with concrete operational evidence rather than commitments.

| # | Milestone | Definition of done |
|---|---|---|
| M-D1 | Stores 7–9 live | Onboarding flow proving repeatable; founder time per new store is now 2-4 hours |
| M-D2 | Tabletop security IR exercise complete | Hypothetical breach walked through end-to-end, runbook updated based on learnings, summary posted to trust center |
| M-D3 | Stores 10–12 live + 6 months of public uptime data | The headline goal, achieved |
| M-D4 | **Second quarterly partner update sent** | Same brief format as M-C2, but now with ~6 months of operational evidence: store count, uptime track record (six months of data with a number attached), incident count + how many were resolved within SLA, restore drill cadence, named reference customer (with permission) |
| M-D5 | Partnership-ready brief drafted | Internal version of the leave-behind we'd hand to TCGPlayer or any concrete partnership prospect: 1-2 page PDF with the evidence list, the SLA commitments, and the architectural fit. Not sent yet, just ready. |

---

## Phase E — Beyond partnership-ready (scaling)

Once Phase D is achieved, the next-tier work begins. These milestones aren't required for partnership-readiness but are required for partnership-*scaling*.

| # | Milestone | Definition of done |
|---|---|---|
| M-E1 | Founding Partner tier formalized | Named FLGS owners involved in product input get permanent benefits (advisory status, service credits or free tier, named on the trust center as advisors). Distinguishes them from staff. |
| M-E2 | SOC2 Type 1 readiness assessment complete | Audit firm engaged, gap analysis complete, remediation plan in motion |
| M-E3 | First dedicated support hire (or contract equivalent) | Founder is no longer the only on-call contact for S1 |
| M-E4 | Multi-region failover scoped | Active-passive architecture designed, costs calculated, decision made on whether to ship before or after SOC2 |

These are post-headline-goal milestones. We don't promise them in partnership conversations until they're real.

---

## Quarterly partner update — what's in each one

The quarterly partner update is a single short email. It does not ask for anything. It is a signal mechanism.

### M-C2 update (~90 days post-launch)

Subject: *Afterroar quarterly update — [date]*

Body (≤150 words):

- One sentence on store count and growth direction
- One sentence on uptime status with link to public page
- One sentence on a recent operational milestone (first restore drill, first incident retro, etc.)
- "Happy to chat anytime if any of this becomes interesting on your end."

That's it. Brevity is the point.

### M-D4 update (~6 months post-launch)

Same format, but the operational milestones are richer: 6 months of uptime data with a single percentage number, multiple restore drills, multiple incident retros, a tabletop IR. May reference SOC2 readiness if M-E2 has begun.

### Cadence after that

Quarterly forever, as long as the relationship is dormant. Drops to monthly if active conversation resumes. Stops if explicitly asked to stop.

---

## What we won't fix in this window — and shouldn't pretend to

Honest constraints, called out so we don't accidentally over-commit in a partnership conversation:

- **24/7 staffed support.** Not happening pre-Phase E. Founder phone for S1 with a defined response window is the answer.
- **SOC2 Type 1 attestation.** 6–9 month audit; M-E2 is the readiness assessment, not the attestation. Best case: in flight by Phase D, complete in the year following.
- **Multi-region failover.** Single-region (us-east) is the reality. The committed SLA tier (99.5–99.95%) is defensible single-region; we don't promise the kind of uptime that requires DR.
- **Dedicated security or reliability engineering.** The mitigation: documented runbooks + tabletop exercises + the Credo's structural commitments. Real team comes after Phase E.
- **Volume claims.** "We'll have hundreds of stores by [date]" is the kind of pitch that gets us noted as a hype-merchant. The honest version: "12 stores, growing carefully, 6 months of uptime data, here's our trust center."

Saying these out loud in partnership conversations is a strength, not a weakness. Anyone evaluating us has heard 20 startups claim 99.99% uptime with multi-region failover from day one. The credibility move is honest about the gap and pointed about the milestone path that closes it.

---

## What this doc is NOT

- **Not a product roadmap.** Product features (Connect launch, Store Ops feature parity, Passport integration) live elsewhere. This is purely operational + partnership-readiness.
- **Not a sales playbook.** Sales conversations follow the partnership-ready posture, not the other way around. We don't do outbound sales to TCGPlayer-tier partners until M-D is complete.
- **Not a fundraising plan.** The milestones are achievable bootstrap. If fundraising happens it would compress the timeline; this plan stands either way.
- **Not a hiring plan.** The "M-E3 first hire" milestone is when hiring becomes appropriate. Earlier hiring would be premature unless there's specific demand justifying it.

---

## Review cadence

- **Monthly self-review** by founder: which milestones moved, which slipped, what changed in the underlying assumptions
- **Quarterly external check** at each partner-update send: does the evidence in this plan actually match what we sent? If not, fix one or the other
- **Phase-boundary review**: when crossing from B → C, C → D, etc., reread the next phase and update milestones based on what was actually learned in the prior phase
- **Thesis-test review**: every quarter, check whether the eBay-as-Shopify-competitor thesis is still supported by external signals. If TCGPlayer's API reopens to everyone with no merchant-platform context, the thesis was wrong and this plan still produces a partnership-ready posture but not specifically positioned for the eBay vector.

---

## How this maps to the SLA doc

The SLA commitments doc (`SLA_COMMITMENTS.md`) defines *what we commit to*. This roadmap defines *how we earn the right to commit*. They reference each other:

- The SLA doc's milestones (M1 → M6 in that doc, e.g. "10 paying stores OR $5K MRR adds Garmr public") are operational milestones tied to revenue.
- This roadmap's milestones (M-A → M-E phases) are partnership-readiness milestones tied to the headline goal.
- They overlap heavily but aren't identical. The SLA doc is for partnership conversations; this roadmap is internal planning.

When a partnership conversation gets concrete, the SLA doc is the leave-behind. This roadmap is the working document.

---

*Last updated: 2026-04-29. Owner: Shawn Pollock. Review cadence: monthly. Phase boundaries trigger structured review.*
