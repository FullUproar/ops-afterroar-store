# Passport as Canonical Identity — Audit & Migration Plan

**Principle**: Every account created anywhere on the platform — fulluproar.com, afterroar.store, afterroar.me, hq.fulluproar.com — mints a single canonical user record on Passport (afterroar.me). Local properties may cache a denormalized snapshot, but Passport is the source of truth for identity.

**Why**: A user can carry their identity across the platform (and to FLGSes connected via Connect/Store Ops) without asking each property to handle account creation, password reset, email verification, KYC, or revocation. The pitch: *your identity is yours; properties cache what they need with consent*.

This doc covers (1) what exists today, (2) the canonical signup model going forward, and (3) the migration plan.

Last updated 2026-04-28.

---

## 1. Today's signup surfaces

| Surface | URL | DB it writes to | Today's flow |
|---|---|---|---|
| **Passport** | `afterroar.me/signup` | `User` on `afterroar-pos-prod` Neon | NextAuth + Credentials + Google OAuth. Email verification (24h token). **This is already canonical — it stays.** |
| **FU site** | `fulluproar.com/sign-up` | `User` on `neon-full-uproar` Neon (separate DB) | NextAuth + Credentials + Google OAuth + custom AfterroarProvider. Username + optional email. **This is the architectural divergence.** |
| **Store Ops invite** | `afterroar.store/invite/[token]` | Updates existing `User` on `afterroar-pos-prod`; creates `pos_staff` | Custom token-based. Owner provisions staff first; this only finishes setup. **Not a signup — it's an attachment.** |

The Store Ops invite isn't a real signup divergence — it requires a User row to exist beforehand. The two true divergences are FU's separate User table and the absence of a Passport-callable user-creation API.

## 2. The canonical signup model

```
Any property's signup form
        │
        ▼  POST /api/v1/users  (Passport API, server-to-server, API-key auth)
   ┌─────────────────────┐
   │ Passport (afterroar.me)│
   │  - mints User row    │
   │  - sends verify email│
   │  - returns user record│
   └─────────────────────┘
        │
        ▼
   Caller property:
     - caches local denormalized snapshot (FU's `User`, HQ's `User`, etc.)
     - logs the user in via its NextAuth flow (Credentials or Afterroar OIDC)
```

Forms stay where they are (per Shawn's "don't force the user out to afterroar.me, similar to Apple ID" direction). The branding stays native; the *identity* goes through Passport.

### What a property is responsible for
- Capturing the form input
- Calling Passport's `POST /api/v1/users` server-to-server
- On success, caching the snapshot in their local DB if needed
- Signing the user in (NextAuth Credentials, custom session, etc.)

### What Passport is responsible for
- Validating the email is unique, password meets policy
- Storing the canonical `User` row
- Sending email-verification mail (or the property can opt out and handle locally)
- Returning the user record so the property can cache it

### Who Passport trusts
Server-to-server API-key auth (the same `register:write`-style mechanism we already use for the register), with a new `users:create` scope. Each property gets its own API key. Passport logs every call to the existing `ApiUsageLog` table.

## 3. Migration plan, by surface

### Passport (afterroar.me/signup) — STAYS
No change. This is the canonical surface. May add `?source=` and `?return_url=` query params for friendlier integrations later.

### FU site (fulluproar.com/sign-up) — PROXIES
**Today**: `POST /api/auth/register` writes to FU's `User` on `neon-full-uproar`.
**Going forward**:
1. `POST /api/auth/register` becomes a thin proxy: validates input, calls Passport `POST /api/v1/users`, gets back the canonical user, caches a snapshot in FU's local `User` table, signs the user in via NextAuth Credentials.
2. The local `User` table gains an `afterroar_user_id` column (FK to Passport's `User.id`). It's a cache, not the source.
3. On every login, refresh the FU snapshot from Passport (or stale-revalidate every N hours).

**Backfill**: existing FU users need Passport accounts. Run a one-time migration script that:
- For each FU `User` row, call Passport's `POST /api/v1/users/import` (server-to-server, accepts already-hashed passwords) with their email+passwordHash
- Store the returned Passport `User.id` on the FU row
- On next login, the user is invisibly upgraded

### Store Ops invite (afterroar.store/invite/[token]) — TWO PATHS
**Today**: requires an existing `User` row, just adds `pos_staff` and updates the `User` record's password/PIN.
**Going forward**:
1. Owner invites staff by email at `/dashboard/staff` → if email already exists as a Passport user, send invite to that account; if not, the invite link lands on a "Create your Passport account" form (still on afterroar.store, not redirected) that proxies to Passport
2. Either way, after the invite is accepted, attach the `pos_staff` row to the resulting Passport user

**Existing staff**: their `User` rows are already on `afterroar-pos-prod` — they're already Passport-rooted, just historically created via the invite flow rather than the signup flow. No backfill needed; reconcile during a routine audit.

### HQ (hq.fulluproar.com) — PROXIES
Same pattern as FU site. Probably less work since HQ's signup volume is lower.

### Marketing sites (impeachcolleen, shadypineshoa, whatisafterroar) — N/A
These are static-ish marketing pages with no real signup flows. No work needed.

## 4. Schema additions

### On Passport (apps/me)
- `User` already has everything needed; no schema change to Passport itself.
- New API key scope: `users:create` (additive — existing scope strings stay).

### On FU's User table
```diff
+ afterroar_user_id String?  @unique  // Passport User.id; null until backfilled
+ last_synced_at    DateTime?           // when we last refreshed from Passport
```

The existing FU User keeps its primary key for backwards-compat with FK relations (cart, order, etc.). The Passport id is a side-channel pointer.

### On Store Ops `User` (afterroar-pos-prod)
No change. This table IS Passport's User table — they share the schema and DB.

## 5. Order of operations

1. **Now (this session)**: ship Passport `POST /api/v1/users` + ship FU site proxy on `/api/auth/register`.
2. **Next session**: backfill existing FU users into Passport.
3. **Following session**: HQ signup proxy + Store Ops invite proxy.
4. **Then**: optional public API for partner-driven signups (e.g. an FLGS website embedding "Sign up for Passport" via our SDK).

## 6. What this lets us claim publicly

> "Your identity is yours, not the FLGS's. Sign up once on Passport — your purchases, your loyalty, your data live with you. The FLGS sees only what you've consented to share."

This is a meaningful product story. Square, Toast, Clover all keep customer identity at the merchant level — what we're building is the inversion. That's worth pitching aggressively.
