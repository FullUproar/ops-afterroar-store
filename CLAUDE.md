@AGENTS.md

# Afterroar Store Ops

POS and operations platform for friendly local game stores (FLGS).
Part of the Full Uproar Games ecosystem.

## Tech Stack
- Next.js 16 + React 19 + TypeScript + Tailwind CSS
- Prisma ORM with @prisma/adapter-pg (NOT Supabase — fully migrated)
- NextAuth v5 (Google OAuth + Credentials)
- Shared PostgreSQL with Afterroar HQ (Prisma Postgres at db.prisma.io)
- Vercel hosting

## Database
- All Store Ops tables use `pos_` prefix (11 tables)
- Shares database with Afterroar HQ (~100 HQ tables)
- Store Ops reads HQ `User` table (PascalCase: `"User"`) but never writes to HQ tables
- Bridge: `pos_staff.user_id` → `User.id`
- Migrations are RAW SQL files in `migrations/` — NEVER use `prisma migrate` or `prisma db push`
- Only `prisma generate` in build scripts

## Prisma Model Names
All Store Ops models are prefixed with `Pos`:
- prisma.posStore, prisma.posStaff, prisma.posCustomer
- prisma.posInventoryItem, prisma.posSupplier
- prisma.posEvent, prisma.posEventCheckin
- prisma.posLedgerEntry
- prisma.posTradeIn, prisma.posTradeInItem
- prisma.posGiftCard
- prisma.user (HQ User table — READ ONLY)

## Auth
- NextAuth v5 with JWT strategy
- Google OAuth (same app as HQ) + Credentials provider
- Middleware uses `getToken()` from `next-auth/jwt` (Edge-compatible)
- API routes use `auth()` from `@/auth`
- GOD MODE admin: info@fulluproar.com (test panel to switch roles)

## Key Patterns
- API routes: `auth()` → `prisma.posStaff.findFirst()` → get `store_id` → scoped queries
- Permissions: `src/lib/permissions.ts` — owner/manager/cashier roles
- Store context: `useStore()` hook provides `can()`, `effectiveRole`, `isGodAdmin`
- Payment: `src/lib/payment.ts` — abstraction layer (simulated, Stripe Connect later)
- Types: `src/lib/types.ts` — `formatCents()`, `parseDollars()`

## Test Accounts
- Owner: Google sign-in (shawnoah.pollock@gmail.com)
- Manager: manager@teststore.com / password123
- Cashier: cashier@teststore.com / password123

## Env Vars (Vercel)
- DATABASE_URL — Prisma Postgres direct connection
- AUTH_SECRET — NextAuth signing (NOT NEXTAUTH_SECRET)
- AUTH_URL — https://www.afterroar.store
- NEXTAUTH_URL — https://www.afterroar.store
- GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET — shared with HQ
