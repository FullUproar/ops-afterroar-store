# Overnight build status — 2026-05-01

This doc summarizes what landed overnight on the age-gating + parental-consent
build. Quick scan first, details after. Commits are listed inline.

## TL;DR

**Working end-to-end:**
- Memory + Manus research saved
- Schema migrations applied to both Neon DBs (Passport + FU)
- Neutral age screen at `/signup/age` with COPPA-compliant `<13` cookie block
- Three-cohort routing: under-13 hard wall, 13–17 parent-consent flow, 18+ standard
- Parental-consent magic-link flow (kid → parent email → 4-step wizard → kid activation)
- Feature flag `PARENTAL_CONSENT_REQUIRED` (default `true`); flip to `false` post-legal-review
- TOS and Privacy Policy updated with new age + venue-event language
- Privacy-by-default for 13–17 (visibility = circle, no public hosting, blocked from user-hosted public events)
- Event audience filtering wired into HQ public discovery (`/api/game-nights/discover`)

**Stubbed / requires follow-up before going live:**
- The Persona ID step in the parent flow links to existing `/verify-identity`. If that endpoint isn't already plumbed for a `?return=` callback, the parent will land back at the wizard but step 2 won't auto-advance. (Stripe step has the same caveat.)
- The "kid account pauses on parent's Pro lapse" behavior is documented but not yet wired to the Stripe webhook handler.
- No billing webhook listener for `customer.subscription.deleted` that flips child accountStatus.
- Adult-to-minor DM block: schema field exists (`defaultVisibility`), but no DM surface enforces it yet (HQ doesn't currently expose adult→minor DMs to begin with, but this is worth a sweep).
- 18th-birthday cron job to flip `isMinor` from `true → false`: not built. Add as scheduled task before any 13-year-old who signs up actually turns 18.

## Commits

- Passport (`ops-afterroar-store`): `04964e8 feat(me): age-gating + parental consent flow (feature-flagged)`
- HQ (`full-uproar-site`): pending push at end of session (see git log)

## What you can test in the AM

### Under-13 hard wall
1. Visit `https://www.afterroar.me/signup/age`
2. Enter a DOB making you under 13 (e.g., year 2020)
3. Lands on `/signup/blocked`
4. Try to revisit `/signup/age` — you'll be redirected back to `/signup/blocked` (cookie-sticky)

### 13–17 parental consent (feature flag ON, default)
1. Clear cookies. Visit `/signup/age`
2. Enter a DOB making you 14
3. Lands on `/signup/teen`. Form asks for kid's email, kid's display name, parent's email
4. Submit. Confirmation says "email sent to parent"
5. In dev (no Resend key) the magic link prints to the server logs. In prod it goes to the parent's inbox.
6. Parent clicks link → lands at `/signup/parental-consent?token=...`
7. Four-step wizard:
   - Sign in (Google or email/password) as the parent
   - Verify identity (Persona)
   - Subscribe to Pro $5/mo
   - Check the attestation + click "Activate their Passport"
8. Kid receives the standard verify-email link to set their password and sign in.

### 18+ standard
1. Clear cookies. Visit `/signup/age`
2. Enter a DOB making you 25
3. Lands on `/signup`. Existing OAuth + email/password form, plus the new server-side DOB persistence on creation.

### Feature flag flip (post-legal-review)
1. Vercel: set `PARENTAL_CONSENT_REQUIRED=false` on the `afterroar-me` project, scope = production
2. Redeploy
3. 13–17 path now drops the parent flow and goes directly to a teen signup form (email + password, privacy-by-default applied).

### HQ event audience filtering
1. As a 13–17 user (teen-cohort cookie set), hit `/api/game-nights/discover` — only venue-hosted events tagged `all-ages` or `13+` should return.
2. As an 18+ Free user, you'll see venue events at 18+ and below.
3. As a Pro user, you'll see venue events plus user-hosted public events.
4. Direct RSVP to a user-hosted event by a minor returns 403 from `POST /api/game-nights/discover`.

## Schema change summary

Passport DB (`ep-steep-king-amgsp5e4-pooler`):
- `User.dateOfBirth: DateTime?`
- `User.isMinor: Boolean default(false)` (denormalized for fast filtering; needs cron to flip on 18th birthday)
- `User.defaultVisibility: String default("public")` ("circle" for minors)
- `User.parentUserId: String?` (links minor to parent)
- `User.parentVerifiedAt: DateTime?`
- `User.accountStatus: String default("active")` ("pending_parent" | "paused" | "suspended")
- `MinorWaitlist` table: email + computed `notifyAfter` date (no DOB stored)
- `MinorConsentRequest` table: token + child + parent + status lifecycle

FU DB (`ep-crimson-surf-amyp1ski-pooler`):
- `User.dateOfBirth`, `User.isMinor`, `User.defaultVisibility`, `User.accountStatus` (mirrored snapshot)
- `GameNight.audience: String default("18+")` (`all-ages` | `13+` | `18+` | `21+`)
- `GameNight.hostType: String default("user")` (`user` | `venue`)
- Indexes on both new fields

## Files added / changed

### Added
- `apps/me/lib/age-gate.ts` — cohort math, cookie helpers, feature flag
- `apps/me/app/signup/age/page.tsx` + `AgeGateForm.tsx`
- `apps/me/app/signup/blocked/page.tsx`
- `apps/me/app/signup/teen/page.tsx` + `TeenSignupForm.tsx`
- `apps/me/app/signup/parental-consent/page.tsx` + `ParentalConsentClient.tsx`
- `apps/me/app/api/auth/age-gate/route.ts` (POST: validate + set cookie)
- `apps/me/app/api/auth/age-gate/check/route.ts` (GET: read cookie state)
- `apps/me/app/api/auth/parental-consent/request/route.ts` (POST: kid creates request, emails parent)
- `apps/me/app/api/auth/parental-consent/approve/route.ts` (POST: parent completes, kid activates)
- `apps/hq/lib/age-cohort.ts` — viewer classification + `publicEventDiscoveryWhere`
- `docs/legal-minor-privacy-2026-05-01.md` — Manus's research memo
- 7 memory entries under `~/.claude/projects/c--dev-FULL-UPROAR-PLATFORM/memory/`

### Changed
- `packages/database/prisma/schema.prisma` (Passport) — User fields + 2 new tables
- `packages/database/prisma/schema.prisma` (FU) — User fields + GameNight fields
- `apps/me/lib/auth-config.ts` — signIn callback enforces age gate on Google OAuth, events.createUser persists DOB
- `apps/me/lib/email.ts` — added `parentalConsentTemplate`
- `apps/me/app/api/auth/signup/route.ts` — reads age cookie, persists DOB
- `apps/me/app/signup/page.tsx` — bounces to age gate if no cookie
- `apps/me/app/terms/page.tsx` — 18+ baseline language, parental consent clause, venue indemnity, Persona/no-biometric statement
- `apps/me/app/privacy/page.tsx` — DOB collection, neutral age screen, minor handling, no-biometric clause
- `apps/hq/app/api/game-nights/discover/route.ts` — applies `publicEventDiscoveryWhere`, blocks minor RSVPs to user-hosted/older-audience events
- `apps/hq/app/api/game-nights/[id]/route.ts` — explicit minor block on `isPublic=true` (PUT and PATCH)

## Known gaps to plug before any minor signs up for real

1. **Stripe webhook → child account pause**. When a parent's Pro subscription cancels, fails to renew, or is downgraded out of Pro, every minor account where `parentUserId = parent.id` should flip `accountStatus = "paused"`. Wire this into the existing Stripe customer.subscription.updated/deleted handler.
2. **18th-birthday cron**. Daily job that scans `User.dateOfBirth` and flips `isMinor = false` + `defaultVisibility = "public"` (or whatever the user has chosen) for accounts crossing the 18-year boundary. Without this, minors stay flagged as minors past their birthday until they manually update something.
3. **`/verify-identity?return=` callback**. Confirm the existing identity-verification flow respects the `?return=` query param so the parent lands back at the consent wizard.
4. **Stripe `/billing/subscribe?tier=pro&return=`**. Same callback question for Stripe checkout.
5. **MinorWaitlist trigger**. The waitlist table exists but nothing writes to it yet. When the feature flag is `false` and we're declining a 13–17 user without consent (or when consent expires unanswered), we should add them to the waitlist with their computed `notifyAfter` date. Today the consent flow assumes the parent will eventually act; if 7 days pass and they don't, the request expires silently.
6. **Vercel env var**. Add `PARENTAL_CONSENT_REQUIRED=true` to `afterroar-me` project (defaults to `true` if absent, but explicit is better for the legal-review handoff).

## Things deliberately NOT done

- **Junior tier pricing**. Skipped per Shawn's plan. Minors are entirely free, gated by the parent's $5/mo Pro subscription.
- **VPC for under-13**. Hard block; no parental-consent path. Per Manus, the 2025 COPPA Rule made this too heavy to justify.
- **Indiana/Wisconsin/Michigan minor laws**. None apply — Afterroar doesn't hit the $1B revenue threshold those laws target. No special handling needed.
- **Illinois BIPA mitigations beyond the no-biometric statement**. We don't currently collect biometric data. If we add facial recognition or voiceprint anywhere, this becomes urgent.

## Lawyer review punch list

Things Shawn flagged for legal review:
- 18+ self-attestation language in ToS — does it cover us, or do we need stronger indemnity from venues that admit minors to "all-ages" events?
- Parental consent flow architecture — is what we're doing sufficient under California's Age-Appropriate Design Code? UK's Children's Code? (Both extend protections beyond COPPA's 13-cutoff, which is why we're applying privacy-by-default to 13–17 even though federal law doesn't require it.)
- Persona vendor contract — confirm explicitly that no biometric data is retained by Persona on Afterroar's behalf, that Persona accepts BIPA compliance obligations.
- The phrase "I am the parent or legal guardian" in the attestation — is that the right legal standard? Some jurisdictions distinguish parents from guardians, and the verification path doesn't actually verify guardianship (only adult identity).

When the lawyer signs off, flip `PARENTAL_CONSENT_REQUIRED=false` and 13–17 onboarding becomes self-serve (still privacy-defaulted to circle).

## What I want you to do first when you wake up

1. Read this doc.
2. Visit `/signup/age` in production. Enter a teen DOB. Walk through to `/signup/teen`, submit with a real parent email you control. Watch for the email landing.
3. Click the parent link. Sign in. Walk through the 4-step wizard. The Persona + Stripe steps will use the existing `/verify-identity` and `/billing/subscribe` routes — let me know if the `?return=` callback works or if it needs surgery.
4. Tell me what's missing or feels wrong before we widen the test population.
