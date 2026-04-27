@AGENTS.md

# Afterroar (monorepo: apps/ops + apps/me)

**This is the monorepo for `afterroar-ops` (Store Ops POS at www.afterroar.store) and `afterroar-me` (Passport identity at www.afterroar.me).** Both apps share `packages/database`.

> ## Platform map (cross-repo orientation)
>
> The Afterroar/Full Uproar platform spans 3 active repos. Authoritative master map: [`../CLAUDE.md`](../CLAUDE.md) at the platform root.
>
> | Repo | What it contains | Local path |
> |---|---|---|
> | **`afterroar`** (this repo) | Store Ops POS server + Passport identity | `c:\dev\FULL UPROAR PLATFORM\ops-afterroar-store` |
> | `full-uproar-site` | FU storefront + Game Night HQ + 3 marketing sites | `c:\dev\full-uproar-site` |
> | `afterroar-mobile` | Capacitor apps: register (R1 in flight), garmr (watchdog), passport (consumer) | `c:\dev\FULL UPROAR PLATFORM\afterroar-mobile` |
>
> **Trap path**: `c:\dev\ops-afterroar-store` is a stale legacy clone. Do not push schema changes from there.

POS and operations platform for friendly local game stores (FLGS).
Part of the Full Uproar Games ecosystem.

## Tech Stack
- Next.js 16 + React 19 + TypeScript + Tailwind CSS
- Prisma 7 with `@prisma/adapter-pg` driver-adapter mode (NOT Supabase — fully migrated)
- NextAuth v5 (Google OAuth + Afterroar OIDC)
- **Database**: dedicated **Neon** project (`ep-steep-king-amgsp5e4-pooler.c-5.us-east-1.aws.neon.tech`), split from the FU shared Neon on 2026-04-27. Both apps/ops + apps/me share this single Afterroar Neon DB.
- Vercel hosting (separate Vercel projects: `afterroar-ops` for apps/ops, `afterroar-me` for apps/me)

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
- Stripe Terminal: S710 reader registration, connection tokens, payment collection (`src/app/api/stripe/terminal/`)
- Tax: `src/lib/tax.ts` — Stripe Tax (primary, auto-fallback) + manual rate from store settings / `DEFAULT_TAX_RATE` env
- Types: `src/lib/types.ts` — `formatCents()`, `parseDollars()`
- Scanner: `src/hooks/use-scanner.ts` — capture phase global keydown listener, NO hidden inputs
- Barcode learn: scan unknown → UPC lookup (upcitemdb) → BGG enrichment → catalog product → add to inventory
- HQ Bridge: `src/lib/hq-bridge.ts` — enqueues to outbox (no more direct SQL to HQ)
- HQ Outbox: `src/lib/hq-outbox.ts` — async writes to HQ webhook, exponential backoff, dead-letter
- Outbox Drain: `/api/hq-bridge/drain` — Vercel Cron (every minute), drains pending events to HQ
- Bridge Events: checkin, points_earned, tournament_result, event_attendance, purchase_summary
- Public Catalog: `/api/public/catalog` — shared product catalog for HQ pull (board games with BGG IDs)
- Federated Catalog: `pos_catalog_products` — shared game data across stores, BGG as canonical ID
- TCG Pricing: `src/lib/tcg-pricing.ts` — condition multipliers, buylist calculations
- Market Cache: `src/lib/market-price-cache.ts` — Scryfall price cache (1hr TTL)
- Op Log: `src/lib/op-log.ts` — operational logging to `pos_operational_logs` table (fire-and-forget)
- Receipt QR: token-based receipt lookup (`/r/[token]`), customer-facing display
- Intelligence Engine: `src/lib/store-intelligence.ts` — FLGS-vocabulary insights (liquidity runway, bench warmers, regulars MIA, credit liability, seasonal warnings, WPN metrics, cash-aware buylist)
- Store Advisor: `src/components/store-advisor.tsx` + `/api/intelligence/advisor` — Claude-powered business co-pilot, feeds real store metrics to Claude Sonnet, returns personalized advice in gamer language
- Intelligence Preferences: store-level settings for thresholds (dead stock days, at-risk days, cash comfort zone), monthly fixed costs (rent, payroll, utilities), WPN level, advisor tone, seasonal warnings
- Configurable Permissions: `src/lib/permissions.ts` — 30+ granular permissions, per-role overrides stored in store settings, owner always has all. API at `/api/permissions`
- Feature Gating: `src/components/feature-gate.tsx` — store plans (free/base/pro/enterprise) + add-on modules (intelligence, events, tcg_engine, ecommerce, multi_location, cafe, advanced_reports, api_access)
- Permission Categories: pos, inventory, customers, trade_returns, events, reports, admin — each with specific toggles
- `requireFeature()` and `requirePermissionAndFeature()` in require-staff.ts for server-side gating
- Mobile Timeclock: `/clock/[slug]` — PIN-based employee clock-in from phone, no session needed, PWA installable
- Geofence: GPS tagging on clock-in (on_site/remote/no_gps), never blocks, just tags. Store configurable.
- Staff PINs: `pos_staff.pin_hash` — 4-8 digit PIN, set by owner/manager via PATCH `/api/clock`
- Clock API: GET/POST `/api/clock` — public (PIN auth), no session required
- Mobile Register: `/mobile/[slug]` — access-code paired, PIN-auth, slimmed POS for employee phones
- Access Code: 6-digit store code (hashed), generates via PATCH `/api/mobile`, revokes all sessions on rotation
- Mobile Sessions: `pos_mobile_sessions` table tracks pairing, tx count, tx total, expiry, revocation
- Mobile Guardrails: configurable per store — max tx per session, max $ per tx, no refunds by default, discount toggle, cash toggle
- Rate Limiting: `pos_access_code_attempts` table, 10 attempts per 15 min per IP
- Mobile API: GET/POST/PATCH `/api/mobile` — pair, activate, checkout, admin ops (generate code, revoke sessions, list sessions)

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
- `status-bar.tsx` — heartbeat clock (system health check), date, status messages (display only, no interactions)
- `panel-content.tsx` — search, customer, quick add, manual, discount panels
- `more-menu.tsx` — 9 sub-panels (price check, credit, returns, loyalty, gift card, no sale, flag issue, void last, order lookup)

## Scanner Integration
- USB/Bluetooth HID scanners work via capture phase global keydown listener
- Scanner ONLY fires when NO input element has focus
- When any input has focus, scanner does nothing (user is typing)
- Barcode learn flow: scan unknown → UPC lookup → BGG enrichment → catalog product → add to inventory
- Camera barcode scanning via BarcodeDetector API
- focusin scroll trick on all modals/panels with inputs (Android tablet keyboard fix)

## Onboarding & Training
- Onboarding wizard: 6-step setup flow (store info, products, staff, payment, test sale, go live)
- Demo data seeder: POST /api/store/seed-demo — one-click sample inventory, customers, events
- NUX system: `<NuxHint>` + `<EmptyState>` components, globally dismissable via nux_dismissed setting
- Training mode: toggle in settings, all transactions marked `training: true`, no real charges
- Help center: 27 articles covering all features, searchable, in-app

## Hardware
- Stripe Terminal S710 reader (registration, connection tokens, payment collection)
- Samsung Galaxy Tab (primary tablet target)
- Inateck USB barcode scanner (HID mode)

## Marketplace Sync
- Order ingestion engine: `src/lib/order-ingest.ts` — `ingestOrder()` shared by HQ bridge, eBay, Shopify, generic API
- Generic order API: `POST /api/orders/ingest` — API-key authed, for any external e-commerce site
- API key management: `/api/settings/api-key` — SHA-256 hashed, feature-gated behind `api_access`
- Marketplace sync engine: `src/lib/marketplace-sync.ts` — bidirectional (push inventory out, pull orders in)
- Auto inventory push: POS sale/return → pushes updated qty to eBay (fire-and-forget)
- Cron: `/api/marketplace/sync` every 5 min — polls eBay orders for stores with `marketplace_sync_enabled`
- eBay client: `src/lib/ebay.ts` — Inventory, Offer, Fulfillment APIs + OAuth
- eBay listings: `/api/ebay/listings` (single) + `/api/ebay/listings/bulk` (batch)
- eBay OAuth: `/api/ebay/connect` + `/api/ebay/callback` — per-store token storage, auto-refresh
- Account deletion compliance: `/api/ebay/account-deletion`
- Fulfillment: `/dashboard/fulfillment` — pick/pack/ship queue with rate shopping + label creation
- Fulfillment types: merchant (self-fulfill), pod (stays on HQ), 3pl (future)
- ShipStation: `src/lib/shipstation.ts` — multi-tenant platform account, webhook at `/api/webhooks/shipstation`
- Transactional emails: `src/lib/email.ts` — Resend provider, order confirmation + shipping notification + gift card delivery
- Tax codes: `src/lib/tax-codes.ts` — per-category Stripe Tax code mapping (gift cards = no tax, food = different rate)
- Tips: `shouldPromptTip()` in store-settings-shared.ts — contextual tip prompts (cafe/food/table/always/never)
- COGS margins: `/api/reports/margins` + `/dashboard/reports/margins` — revenue, COGS, margins by category
- Pull sheets: `/api/fulfillment/pull-sheet` — consolidated pick lists for fulfillment

## TCG Multi-Game Support
- Scryfall (MTG) — full integration: search, pricing, card images, price drift, collection import
- Pokemon TCG API — search, pricing, add to inventory
- Yu-Gi-Oh (YGOPRODeck) — search, pricing, add to inventory
- Catalog page: game tabs (MTG | Pokemon | Yu-Gi-Oh) with advanced filters
- Buylist auto-generation: GET /api/buylist (auto-calculated offers from market × condition × buylist%)
- Sealed EV calculator: GET /api/catalog/sealed-ev?set=MH3
- One-click repricing: POST /api/inventory/reprice
- Collection CSV import: POST /api/catalog/import-collection (TCGPlayer, Moxfield, simple format)

## Tournament System
- Swiss pairing algorithm (`src/lib/swiss-pairing.ts`) — standard for FNM/league events
- Single elimination bracket (pre-existing)
- OMW% tiebreaker calculations
- Round management (start_swiss, next_round, report_match, drop_player)
- Prize payouts as store credit via ledger

## Cafe Module
- Tab system: `pos_tabs` + `pos_tab_items` with unified F&B + retail
- Lifecycle: open → add items (menu or inventory) → KDS status updates → close (settles to ledger)
- Menu builder: `pos_menu_items` + `pos_menu_modifiers` (structured modifiers with pricing)
- Table fees: flat, hourly, free-with-purchase. Auto-waive at spend threshold.
- QR table ordering: `/order/[slug]/[table]` — customer scans, orders from phone, items appear on KDS
- Age verification: flag on tab, gate for alcohol items
- Tab operations: transfer (move table), split (move items to new tab)
- Hourly timer: live elapsed time + accrued fee display on open tabs
- API: GET/POST /api/cafe (open_tab, add_item, add_inventory_item, add_menu_to_tab, set_table_fee, waive_table_fee, age_verify, transfer_tab, split_tab, close_tab, kds, get_menu, add_menu_item, add_modifier)
- Public: GET /api/cafe/public-menu, POST /api/cafe/public-order

## Consignment Module
- `pos_consignment_items` table: consignor, asking price, commission %, status
- Intake creates inventory item + consignment record
- Sale calculates commission, credits consignor via ledger
- Return deactivates inventory item
- Full management page: `/dashboard/consignment` with stats, filtering, intake form
- API: GET/POST /api/consignment

## Loyalty System
- Points earned on purchase (configurable rate), event check-in, trade-in
- Tiered credit bonuses: VIP (+10%), Regular (+5%) auto-detected from lifetime spend
- Post-sale retroactive claim: "70 points unclaimed — attach customer" (24hr window, one-time use)
- Return deductions: points reversed on returns (min 0), synced to HQ
- Frequent returner flag: auto-tagged after 3+ returns in 30 days
- All points synced to HQ via outbox (earn, redeem, return)
- API: POST /api/loyalty/claim (retroactive, secured)

## Public Buylist
- `/buylist/[slug]` — customer-facing page showing what the store is buying + prices
- Auto-calculated NM/LP/MP offers from TCG pricing engine
- Demand indicators: "Hot" (low stock) vs "Stocked"
- Credit bonus callout
- API: GET /api/buylist/public

## Receipt System
- Legal-compliant template: `src/lib/receipt-template.ts`
- Thermal print (280px monospace) + email (styled HTML)
- Card last 4 + brand from Stripe Terminal
- Barcode (CODE128) for receipt number
- Customizable: store address, footer, barcode toggle, savings, return policy
- Server-side receipt counter (atomic, synced across devices)
- Print, Email, QR options on sale complete + cash change screens
- Loyalty points earned shown on receipt + success screen

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
- DEFAULT_TAX_RATE — fallback tax rate percent (e.g. 7) when store settings not configured
- DEFAULT_TAX_STATE — fallback state code for Stripe Tax address (e.g. "TX")
- DEFAULT_TAX_ZIP — fallback zip code for Stripe Tax address
- EBAY_USER_TOKEN — eBay API OAuth token
- EBAY_VERIFICATION_TOKEN — eBay account deletion webhook token
- EBAY_ENDPOINT_URL — eBay webhook endpoint URL

## Brand
- Accent: Chaos Orange #FF8200 (dark), #D97706 (light)
- Surface: Blue-tinted #1a1a2e (dark), #ffffff (light)
- Purple: #7D55C7 for GOD MODE and Afterroar-linked features
- Brand guide: /brand page + docs/brand-guide.md
