# SLA Commitments — Afterroar Platform

This document defines the operational commitments Afterroar makes to two audiences: (1) **paying customers** of the platform (Connect, Store Ops, future tiers) and (2) **data partners** whose APIs we consume or whose data flows through our system (TCGPlayer, ComicVine, future distributors and pricing partners).

It exists for three reasons:

1. **B2B partnership conversations require concrete SLAs.** Vague "we commit to high uptime" answers are how POS pitches end up in the vaporware bucket. This doc converts intent into numbers.
2. **Customers buying a POS need to trust us with their business.** A POS is the most operationally critical piece of software in a small retailer's stack — a downed register on Friday Night Magic is a real problem.
3. **The Credo (`full-uproar-site/docs/CREDO.md`) makes structural commitments to player privacy, store partner equality, and federation neutrality.** Many of those commitments are operational, not just legal — they require the SLA scaffolding to be real.

---

## Posture

Afterroar makes SLA commitments at the **tier level**, not on bespoke contract terms. Every customer in a tier gets the same SLA. Every partner in a relationship class gets the same data-handling commitments. This is consistent with Credo Tier 2 — *"every store on Afterroar operates on the same terms"* — and with how we want partnership conversations to go: *"here's what tier you'd be in, here's what we commit to that tier, here's the upgrade path."*

Custom one-off SLAs (e.g. *"we'll do 99.99% just for you"*) are off the table. Either it's a tier we offer to everyone in that class, or we don't offer it.

---

## The current state — honest gap analysis (2026-04-29)

Before defining targets, the truth about today:

| Area | Current reality |
|---|---|
| Uptime measurement | Sentry catches errors, not outages. No formal uptime tracking. Garmr (the planned phone-native uptime watchdog) is designed but not shipped. |
| Severity tiers | Not defined. |
| 24/7 on-call | Founder's phone (single point of contact). |
| Support hours | Ad-hoc; no published response targets. |
| Backup / restore | Neon point-in-time recovery is enabled by default. We have not tested a restore. |
| Data encryption | At rest: yes (Neon default). In transit: yes (TLS). Key management: cloud-default. |
| Security IR | No documented runbook. No public disclosure window committed. |
| Multi-region failover | Single-region (us-east). No DR site. |
| SOC2 / formal audit | Not started. |

**This is normal for a pre-scale platform.** It is also exactly what we need to upgrade in milestone-tied ways before partnership conversations get concrete. The gap below isn't a panic list — it's the work itself.

---

## Customer-facing SLA tiers

The customer tiers map to existing pricing tiers (per `memory/project_pricing_tiers_locked_2026_04_21.md`):

### Connect ($49/mo) — Standard

The base tier; what we commit to *every paying customer* regardless of plan.

- **Uptime:** 99.5% monthly (≈3.6 hours of downtime per month allowed)
- **Severity response targets:**
  - S1 (production-blocking): 4-hour first response, 1-business-day resolution
  - S2 (degraded but functional): 1-business-day first response, 3-business-day resolution
  - S3 (single-feature broken / workaround exists): 3-business-day first response, best-effort
  - S4 (cosmetic / non-blocking): best effort
- **Support hours:** 9 AM – 6 PM ET, Monday–Friday (US holidays excluded)
- **Support channels:** email, in-app
- **Data integrity:** RPO 1 hour, RTO 4 hours
- **Backup retention:** 7 days (Neon default rolling)
- **Security IR:** 72-hour disclosure window from confirmed breach to affected customers

### Store Ops Standard ($149/mo)

Adds:

- **Uptime:** 99.9% monthly (≈43 minutes/month allowed)
- **Severity:**
  - S1: 1-hour first response, 4-hour resolution target
  - S2: 4-hour first response, 1-business-day resolution
  - S3: 1-business-day first response, 1-week resolution
- **Support channels:** + phone for S1 issues during business hours
- **Data integrity:** RPO 15 minutes, RTO 2 hours

### Store Ops Pro ($249/mo)

Adds:

- **Uptime:** 99.95% monthly (≈22 minutes/month)
- **Severity:** S1 24/7 phone with 1-hour response target
- **Data integrity:** RPO 5 minutes, RTO 1 hour
- **Backup retention:** 30 days
- **Tested restore:** quarterly (we run a real restore drill, share results with the customer on request)

### Store Ops Enterprise ($349/mo)

Adds:

- **Uptime:** 99.95% with **service credit guarantee** — for any month falling below SLA, customer receives a credit equal to 10% of monthly fee per 0.1% of missed uptime (capped at 100%)
- **Severity:** S1 24/7 with 30-minute response, named escalation contact
- **Backup retention:** 90 days + weekly archives kept for 1 year
- **Custom data export:** on demand, in our standard format, within 5 business days
- **Quarterly business review:** account check-in covering uptime delivery, roadmap relevance to your store, integration health

### Future tiers (not yet offered)

A future *Federation Partner* tier (multi-store chains, regional groups) and *Platform Enterprise* tier (white-label deployments) are scoped but not priced. They'll add multi-region failover, SOC2 Type 2 attestation, and custom contractual terms when launched.

---

## Partnership-facing commitments

For data partners (TCGPlayer, ComicVine, future distributors/pricing/marketplace partners), the SLA shape is different. Partners care less about "how much downtime" and more about "what do you do with our data, and what happens if something goes wrong."

These commitments apply to **every data partner equally** — Credo Tier 4 forbids preferential terms.

### API consumption discipline

- **Rate limits:** we respect documented rate limits exactly. Our adapter layer enforces partner-side rate limits as hard caps, not best-effort.
- **Exponential backoff** on errors. No retry storms.
- **No scraping** when official APIs exist. We use the APIs as intended.
- **No tenant aggregation:** when API access is per-store-key, we never roll up data across tenants. Each store's API consumption is its own — we're middleware, not a data warehouse.
- **Caching policy:** we cache to respect rate limits, not to circumvent them. Cache TTLs match partner guidance where published.

### Data handling

- **Encryption at rest:** AES-256 (Neon default).
- **Encryption in transit:** TLS 1.3 for all egress and inter-service traffic.
- **Access control:** least-privilege; only platform operators (`Role.GOD`, audit-logged) have access to partner data; never accessed for non-operational purposes.
- **No third-party reselling:** we don't sell or relicense partner data to anyone, ever. This is a **structural commitment**, not a contractual one — the Credo (Tier 4) makes it part of our founding terms. Violating it would require violating our public founding doc.
- **Data residency:** US (us-east region today, multi-region capability scoped for the Enterprise tier).

### Breach disclosure

- **Internal notification:** founders within 24 hours of confirmed breach.
- **Affected-customer notification:** 72 hours from confirmed breach, regardless of resolution status.
- **Affected-partner notification:** 24 hours from confirmed breach involving partner-derived data.
- **Post-incident report:** root cause, scope, mitigation, prevention plan — within 7 days, shared with affected parties.

### Termination + data return

- **On termination of the partnership:** we cease API consumption immediately, delete any cached partner data within 30 days, and provide a written attestation of deletion.
- **Customer-facing surfaces** that depended on the partner's data degrade gracefully (we never display stale partner data more than 7 days old without flagging it, and never as fresh).
- **Code escrow** option available for Enterprise tier partners — if Afterroar ever ceases to operate, the source code for partner-data-handling components is released to a designated escrow agent. (Available on contract; not default.)

### Business continuity

- **Service continuity SLA:** if Afterroar is acquired, the acquirer is contractually bound to honor existing partnership terms for a minimum of 24 months. (This commitment is part of how we read the Credo's Tier 3 — federation must outlast any single company.)
- **Wind-down protocol:** if Afterroar discontinues service, we provide 90 days' notice + a documented data-export path for all customers and partners. No surprise shutdowns.

---

## Milestone plan — when we add what

Today (M0), we honor every commitment above on best-effort basis with the limitations called out in the gap analysis. The plan to convert "best effort" into "contractually defensible" is milestone-driven, with milestones tied to revenue + customer-count thresholds (whichever comes first).

### M1 — first 10 paying stores OR $5K MRR

- Ship Garmr (uptime watchdog) and turn on public uptime tracking
- Document S1/S2 runbooks; first-response timer enforcement via on-call paging
- Test our first DB restore drill; document the result
- Publish this doc on `afterroar.store` and `afterroar.me` (currently internal-only)

### M2 — 50 paying stores OR $25K MRR

- Two-person on-call rotation (founder + one full-time engineer)
- 9-5 ET support staffed by named human (not just founder)
- Quarterly DB restore drills become routine
- Begin SOC2 Type 1 readiness assessment

### M3 — 100 paying stores OR $50K MRR

- Hire first dedicated support engineer (or contracted equivalent)
- SOC2 Type 1 audit kicks off (typical 6–9 month process)
- Monthly uptime SLA reporting per customer (not just internal dashboards)
- Multi-region failover scoped (not yet shipped)

### M4 — 250 paying stores OR $150K MRR

- SOC2 Type 1 complete and attested
- 3+ person on-call rotation; 24/7 S1 coverage without founder pager-burn
- Multi-region active-passive failover live for primary database; tested quarterly
- Dedicated security IR runbook + tabletop exercises

### M5 — 500+ paying stores OR $300K+ MRR

- SOC2 Type 2 audit complete
- Dedicated reliability engineer
- 24/7 staffed support (not just on-call) for Pro and Enterprise tiers
- Annual third-party penetration test; results shareable with Enterprise customers under NDA

### M6 — 1,000+ paying stores or $750K+ MRR

- 99.99% uptime tier becomes available (default for Federation Partners and white-label Platform Enterprise)
- Multi-region active-active for primary database
- 24/7/365 staffed support across multiple time zones

The numbers are starting points — adjust to actual revenue model as we learn. The shape is the point: SLA upgrades follow revenue, not the other way around. We don't promise 99.95% before we have the team to defend it.

---

## What's negotiable vs structural

**Negotiable** (per partnership / contract):
- Specific response time targets within a tier
- Notification format (email vs phone vs API webhook)
- Custom data-export formats
- Service credit calculation methodology
- NDAs and confidentiality terms

**Structural** (the Credo / federation membership requires):
- Equal-tier-equal-terms — no preferential SLAs to one customer or partner inside a tier
- No third-party data reselling
- 90-day wind-down notice
- 72-hour breach disclosure
- Per-store API key model (we never aggregate API keys across tenants)
- Code escrow / continuity guarantees for Enterprise

If a partnership prospect asks for terms that conflict with the structural commitments, we say no. The Credo is the constraint, including on us.

---

## Using this doc in conversations

For B2B partnership conversations:

1. **Don't open with the SLA doc.** Open with the architecture + Credo + segment positioning, like the TCGPlayer brief.
2. **Pull this out when concrete questions arrive** — "what uptime do you commit to?", "how do you handle breaches?", "what happens to our data if you're acquired?"
3. **The honest gap** is the most credible part of this doc. Anyone who claims a startup is already at 99.99% uptime with multi-region failover is lying. Showing the milestone plan with thresholds tells partners we'll get there with revenue, which is how serious companies actually scale operations.
4. **The Credo + structural commitments are the leave-behind.** A partner who's evaluated 20 POS pitches has heard "we care about your data" 20 times. Showing them a written, public commitment that's anchored to the founding doc — that's the thing that gets remembered.

For customer conversations:

1. **The tier table** is the lead. Show what they get at their price point.
2. **The honest gap analysis** stays internal — customers don't need to read about every operational shortcoming. They need to know what they're buying.
3. **Service credits** for Enterprise tier are a real differentiator vs Square/Clover/Toast — none of those offer SLA-backed credits to mid-market POS customers.

---

## Open questions / decisions to lock down

Things we need to align on before this doc is partner-ready:

- **Service credit cap percentages** — is 10% per 0.1% missed uptime, capped at 100% of monthly fee, the right structure? Some industries use 5%; some use 25%.
- **Code escrow vendor** — Iron Mountain is the standard but expensive. Alternatives include NCC Group and lighter-weight options like Codekeeper. Decision: do we offer this only on contract or build it in by default?
- **SOC2 timing** — M3 (100 stores) is reasonable but tight. The audit costs $20-50K and takes 6-12 months. Need to budget against the M3 milestone.
- **Geographic data residency** — US-only is fine for FLGS launch; EU customers will require GDPR-compliant residency. Decision deferred to when we have first EU prospect.
- **Partner-facing dashboard** — do we expose uptime + API consumption stats to partners via a portal, or is everything via email reports? Future build, but worth scoping the API contract.

---

*Last updated: 2026-04-29. Owner: Shawn Pollock. Review cadence: quarterly, or when crossing a milestone boundary.*
