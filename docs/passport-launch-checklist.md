# Passport Launch Checklist — Pollock Party, April 17 2026

## Pre-launch soft test (April 16)

Run this the day before the party. Invite 3-5 friends to do the full flow on their real phones. Fix anything that breaks.

### The QR code

- [ ] Generate the launch QR code pointing to `https://afterroar.me/welcome?event=pollock-party-2026`
- [ ] Print at 4x4" minimum on white background (black QR on white is most scannable)
- [ ] Test scan from 6+ inches away with an iPhone
- [ ] Test scan from 6+ inches away with an Android phone
- [ ] Test scan in bright light (outdoors simulation)
- [ ] Test scan in low light (evening party simulation)
- [ ] Print backup copies — at least 2 physical locations at the party (drinks table + game shelf)

### The end-to-end flow

Pick one tester for each path. Have them do it on their own phone while you watch over their shoulder and note anything confusing.

**Path 1: Brand new user (never used Full Uproar)**
- [ ] Scan QR code
- [ ] Land on `/welcome?event=pollock-party-2026`
- [ ] Redirected to `/login?callbackUrl=...`
- [ ] Sign in with Google (first time)
- [ ] Land back on `/welcome?event=pollock-party-2026`
- [ ] See "Welcome, [First Name]!" headline
- [ ] See their 8-char Passport code prominently
- [ ] See both badges: Passport Pioneer + Pollock Party 2026
- [ ] See 4 CTA cards (Library, Wishlist, Loans, Settings)
- [ ] Tap Library → lands on `/library`
- [ ] Everything works

**Path 2: Existing Full Uproar user (has Google account linked)**
- [ ] Scan QR code
- [ ] Either immediately signed in, or one-tap to finish
- [ ] Land on `/welcome?event=pollock-party-2026`
- [ ] See "Hey again, [First Name]!" headline
- [ ] Passport Pioneer badge is already there
- [ ] Pollock Party 2026 badge is newly added
- [ ] Passport code is present

**Path 3: Edge case — no Google account, or denies permission**
- [ ] What happens? Should fallback to a clear "sign in required" state
- [ ] Test by using a browser in incognito, refusing Google sign-in

### The dashboard pages

For each page, verify it loads and works on a phone:
- [ ] `/` (home) — shows signed-in state after /welcome
- [ ] `/library` — add a game manually, test shelf scan
- [ ] `/wishlist` — add 3 games with different priorities
- [ ] `/loans` — record a test loan, mark as returned
- [ ] `/settings` — see identity, badges section, consent toggles
- [ ] `/data` — JSON export works, delete button shows

### Infrastructure checks

- [ ] Passport code is unique (test with 5 signups — all different codes)
- [ ] Pioneer badge total count increments with each signup
- [ ] Pollock Party 2026 badge total count increments correctly
- [ ] Issue the same event param twice — doesn't duplicate the badge
- [ ] `/api/badges/catalog` returns both badges
- [ ] afterroar.me is fast on mobile (test on 4G if possible)

## Day-of-event (April 17)

### Before the party starts

- [ ] Print materials on site: QR code poster, 1-pager explaining Passport
- [ ] QR code verified one more time
- [ ] Your phone signed into info@fulluproar.com so you can show Greg/others
- [ ] Device battery full
- [ ] Backup: printed instructions ("go to afterroar.me/welcome?event=pollock-party-2026") in case QR fails

### During the party

- [ ] Watch for questions — what isn't obvious?
- [ ] Screenshot the live pre-order pages *if* FMM is live too (USPTO SOU)
- [ ] Note any bugs or confusing moments on your phone
- [ ] Congratulate people on their badges — lean into the fun

### After the party

- [ ] Count total signups (query: `SELECT COUNT(*) FROM "User" WHERE "passportCode" IS NOT NULL AND "createdAt" >= '2026-04-17';`)
- [ ] Count event badge issuances (query the Pollock Party badge totalIssued)
- [ ] Review error logs for anything that went wrong
- [ ] Send follow-up email to attendees (if they consented) thanking them for being Pioneers
- [ ] Write up what worked and what didn't for next launch

## Known issues / cut from V1

- QR scanner on the Passport side (currently only email sign-in, no QR-first experience) — not launch blocking
- Event badge attribution for people who sign up *before* the event via direct URL — fine, they still get Pioneer
- iOS Safari quirks — test before launch

## Materials needed

- [ ] QR poster (print at home or Staples)
- [ ] 1-page "what is Passport?" handout with 3 bullets max
- [ ] Fugly-voice copy on the handout
- [ ] Small cards with just the QR — pocket-sized for anyone interested

## Post-launch

- [ ] By April 18: every person who signed up gets a "welcome back, here's what to do next" email (if consent)
- [ ] By April 20: Start Connect infrastructure for April 24 soft launch
- [ ] By April 24: Greg or first store using Connect
