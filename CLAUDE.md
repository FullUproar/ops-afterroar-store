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
- All Store Ops tables use `pos_` prefix (36+ tables)
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
- prisma.posReturn, prisma.posReturnItem
- prisma.posLoyaltyEntry
- prisma.posImportJob, prisma.posImportRecord
- prisma.posCertification
- prisma.posGiftCard
- prisma.posCatalogProduct, prisma.posCatalogCategory, prisma.posCatalogPricing
- prisma.posPurchaseOrder, prisma.posPurchaseOrderItem
- prisma.posStockCount, prisma.posStockCountItem
- prisma.posTournament, prisma.posTournamentPlayer, prisma.posTournamentMatch
- prisma.posOrder, prisma.posOrderItem
- prisma.posGameCheckout
- prisma.posLocation, prisma.posInventoryLevel, prisma.posTransfer
- prisma.posTimeEntry, prisma.posPromotion, prisma.posPreorder
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
- Payment: `src/lib/payment.ts` — abstraction layer (Stripe live in test mode)
- Types: `src/lib/types.ts` — `formatCents()`, `parseDollars()`
- Scanner: `src/hooks/use-scanner.ts` — global keydown listener, NO hidden inputs
- HQ Bridge: `src/lib/hq-bridge.ts` — validated write functions for HQ tables
- TCG Pricing: `src/lib/tcg-pricing.ts` — condition multipliers, buylist calculations
- Market Cache: `src/lib/market-price-cache.ts` — Scryfall price cache (1hr TTL)

## Dual Mode Layout
- **Dashboard Mode**: full sidebar, all features, data-heavy (owner/manager default)
- **Register Mode**: full-screen POS, bottom nav, touch-first (cashier default)
- Toggle via sidebar footer or More menu
- Register page is refactored into components: `src/components/register/`

## Register Components
- `page.tsx` — orchestrator, state, cart logic, payment flow
- `register-header.tsx` — store name, scanner dot, fullscreen, exit
- `action-bar.tsx` — Search, Scan, Customer, Quick Add, Manual, Discount, More
- `cart-list.tsx` — receipt tape with qty edit, delete, discounts
- `payment-buttons.tsx` — Cash/Card/Gift Card/Credit/Other
- `status-bar.tsx` — customer, park/recall, last receipt
- `panel-content.tsx` — search, customer, quick add, manual, discount panels
- `more-menu.tsx` — 9 sub-panels (price check, credit, returns, loyalty, gift card, no sale, flag issue, void last, order lookup)

## Scanner Integration
- USB/Bluetooth HID scanners work via global keydown listener
- Scanner ONLY fires when NO input element has focus
- When any input has focus, scanner does nothing (user is typing)
- Barcode learn flow: scan unknown → UPC lookup → BGG enrichment → add to inventory
- Camera barcode scanning via BarcodeDetector API

## Test Accounts
- Owner: Google sign-in (shawnoah.pollock@gmail.com or info@fulluproar.com)
- Manager: manager@teststore.com / password123
- Cashier: cashier@teststore.com / password123
- Bot Owner: bot-owner@afterroar.store / bot1234!
- Bot Manager: bot-manager@afterroar.store / bot1234!
- Bot Cashier: bot-cashier@afterroar.store / bot1234!

## Env Vars (Vercel)
- DATABASE_URL — Prisma Postgres direct connection
- AUTH_SECRET — NextAuth signing (NOT NEXTAUTH_SECRET)
- AUTH_URL — https://www.afterroar.store
- NEXTAUTH_URL — https://www.afterroar.store
- GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET — shared with HQ
- NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY — Stripe test key (pk_test_...)
- STRIPE_SECRET_KEY — Stripe test key (sk_test_...)
- EBAY_USER_TOKEN — eBay API OAuth token
- EBAY_VERIFICATION_TOKEN — eBay account deletion webhook token
- EBAY_ENDPOINT_URL — eBay webhook endpoint URL

## Brand
- Accent: Chaos Orange #FF8200 (dark), #D97706 (light)
- Surface: Blue-tinted #1a1a2e (dark), #ffffff (light)
- Purple: #7D55C7 for GOD MODE and Afterroar-linked features
- Brand guide: /brand page + docs/brand-guide.md
