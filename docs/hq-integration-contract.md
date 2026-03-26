# Afterroar HQ ↔ Store Ops Integration Contract

**Status:** Agreed March 26, 2026
**Database:** Shared Prisma Postgres at db.prisma.io

---

## Write Contract

| Table | HQ | Store Ops |
|-------|:---:|:---------:|
| User | Read + Write (owns) | Read only |
| GameNight | Read + Write (owns) | Write via `createHQGameNight()` validation function |
| GameNightGuest | Read + Write (owns) | Read freely, Write `attended`/`noShow` only |
| GameNightGame | Read + Write (owns) | Read only |
| GameGroup | Read + Write (owns) | Read only |
| Venue | Read + Write (owns) | Read only |
| PointsLedger | Read + Write (owns) | Write via `earnPointsFromPurchase()` validation function |
| pos_* tables | Read only (for venue analytics) | Read + Write (owns) |

---

## What Store Ops Builds

### 1. `createHQGameNight()` validation function
- Lives in `src/lib/hq-bridge.ts`
- Enforces required fields + sensible defaults for fields Store Ops doesn't care about
- Defaults: `vibe: 'COMPETITIVE'`, `status: 'PLANNING'`, `startTime: '19:00'`
- Only fires when store is linked to an Afterroar venue (afterroar_event_id is nullable)

### 2. "Connect to Afterroar" in Settings
- Store Ops Settings page: "Do you have a venue page on Afterroar?"
- Search by name or enter venue URL
- Links `pos_stores.settings.venueId` and `pos_stores.settings.groupId`
- Once linked, events CAN create GameNight counterparts
- If not linked, events are POS-only (still fully functional)

### 3. QR Check-in Flow
- Player RSVPed on HQ → `GameNightGuest` row exists with `userId`
- Player scans QR at the door
- Store Ops reads `GameNightGuest` → finds the guest
- Matches `GameNightGuest.userId` to `pos_customers.afterroar_user_id` (or creates the link)
- Writes `pos_event_checkins` (POS data)
- Writes `pos_ledger_entries` for entry fee (POS data)
- Updates `GameNightGuest.attended = true` (HQ data — the ONE HQ write at check-in)
- Awards loyalty points

### 4. `earnPointsFromPurchase()` writing to PointsLedger
- Writes to HQ's `PointsLedger` with `action: 'STORE_PURCHASE'`, `category: 'engagement'`
- HQ's points engine handles balance calculation
- Store Ops just reads the balance for display

### 5. Customer Identity Linking (Opportunistic)
- Walk-in pays cash → `pos_customer` with just a name, no Afterroar link
- Same person RSVPs for FNM → QR scan links them
- `pos_customers.afterroar_user_id` → `User.id`
- "Link Afterroar Account" button in customer detail view
- Not required — works without it

### 6. `GameNightGuest.attended` update on check-in
- Simple boolean update at check-in time
- HQ already expects this field

### 7. Points Migration on Account Link
- When POS customer links to Afterroar account, migrate `pos_customers.loyalty_points` into HQ's `PointsLedger` as a one-time `LOYALTY_MIGRATION` entry
- Zero out POS-local points after migration

---

## What HQ Builds

### 1. Venue page reads `pos_event_checkins`
- Show "X checked in" on the live game night dashboard
- Read from shared DB, no API call needed

### 2. Venue game library reads `pos_inventory_items`
- `WHERE category = 'board_game' AND store_id = (linked store)`
- Auto-populates venue's game library from store's actual inventory

### 3. Venue analytics includes POS revenue
- Read `pos_ledger_entries` for the linked store
- Event ROI: combine HQ recap data + Store Ops revenue data

### 4. Recap pulls attendance from `pos_event_checkins`
- Who actually showed (checked in at POS) vs who RSVPed
- More accurate than self-reported attendance

---

## Standalone Mode

Store Ops works fully without Afterroar HQ integration:
- `pos_events` table is functional independently
- `afterroar_event_id` is nullable (null = standalone, populated = linked)
- Customer loyalty works locally via `pos_customers.loyalty_points`
- All POS features work without a venue page or Afterroar account
- Integration is additive, not required (Augment Rule)

---

## Key Data Relationships

```
Store Ops                          Afterroar HQ
─────────                          ────────────
pos_stores.settings.venueId   ───→ Venue.id
pos_stores.settings.groupId  ───→ GameGroup.id
pos_events.afterroar_event_id ───→ GameNight.id
pos_customers.afterroar_user_id ──→ User.id
pos_staff.user_id             ───→ User.id (existing, working)
pos_event_checkins            ←──→ GameNightGuest (cross-read)
pos_ledger_entries            ←──  Read by HQ for venue analytics
pos_inventory_items           ←──  Read by HQ for game library
```

---

## Loyalty Points Architecture

- **One wallet, HQ owns the balance**
- HQ: `PointsLedger` table, 17 earn actions + store purchases
- Store Ops: writes to `PointsLedger` via validation function
- If customer has NO Afterroar link: points accumulate on `pos_customers.loyalty_points` (POS-local)
- On account link: migrate POS points → HQ `PointsLedger` as `LOYALTY_MIGRATION` entry
- Display: Store Ops reads HQ balance for linked customers, POS-local balance for unlinked
