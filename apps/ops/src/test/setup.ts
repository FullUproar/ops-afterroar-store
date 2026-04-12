/**
 * Vitest test setup — helpers for multi-tenant testing.
 *
 * These helpers create isolated test data that can be used to verify
 * tenant isolation across API routes and the Prisma scoping layer.
 *
 * NOTE: These tests are designed to run against a test database.
 * Do NOT run against production. Set DATABASE_URL to a test instance.
 */

import { prisma } from "@/lib/prisma";
import { getTenantClient } from "@/lib/tenant-prisma";

let testCounter = 0;

function uniqueId() {
  return `test_${Date.now()}_${++testCounter}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Create an isolated test store with a unique slug.
 */
export async function createTestStore(name?: string) {
  const id = uniqueId();
  return prisma.posStore.create({
    data: {
      id,
      name: name ?? `Test Store ${id}`,
      slug: `test-store-${id}`,
      settings: {},
    },
  });
}

/**
 * Create a test user in the HQ User table.
 */
export async function createTestUser(email?: string) {
  const id = uniqueId();
  return prisma.user.create({
    data: {
      id,
      email: email ?? `testuser-${id}@test.afterroar.store`,
      displayName: `Test User ${id}`,
    },
  });
}

/**
 * Create a test staff member linked to a store and user.
 */
export async function createTestStaff(
  storeId: string,
  userId: string,
  role: "owner" | "manager" | "cashier" = "owner"
) {
  const id = uniqueId();
  return prisma.posStaff.create({
    data: {
      id,
      store_id: storeId,
      user_id: userId,
      role,
      name: `Test Staff ${id}`,
      active: true,
    },
  });
}

/**
 * Create a test customer scoped to a store.
 */
export async function createTestCustomer(storeId: string, name?: string) {
  const id = uniqueId();
  return prisma.posCustomer.create({
    data: {
      id,
      store_id: storeId,
      name: name ?? `Test Customer ${id}`,
      email: `customer-${id}@test.afterroar.store`,
      credit_balance_cents: 0,
    },
  });
}

/**
 * Create a test inventory item scoped to a store.
 */
export async function createTestInventoryItem(
  storeId: string,
  overrides?: Partial<{
    name: string;
    category: string;
    price_cents: number;
    cost_cents: number;
    quantity: number;
    sku: string;
    barcode: string;
  }>
) {
  const id = uniqueId();
  return prisma.posInventoryItem.create({
    data: {
      id,
      store_id: storeId,
      name: overrides?.name ?? `Test Item ${id}`,
      category: overrides?.category ?? "other",
      price_cents: overrides?.price_cents ?? 999,
      cost_cents: overrides?.cost_cents ?? 500,
      quantity: overrides?.quantity ?? 10,
      sku: overrides?.sku ?? `SKU-${id}`,
      barcode: overrides?.barcode,
      active: true,
    },
  });
}

/**
 * Create a test event scoped to a store.
 */
export async function createTestEvent(
  storeId: string,
  overrides?: Partial<{
    name: string;
    entry_fee_cents: number;
  }>
) {
  const id = uniqueId();
  return prisma.posEvent.create({
    data: {
      id,
      store_id: storeId,
      name: overrides?.name ?? `Test Event ${id}`,
      event_type: "casual",
      starts_at: new Date(),
      entry_fee_cents: overrides?.entry_fee_cents ?? 0,
    },
  });
}

/**
 * Create a test ledger entry scoped to a store.
 */
export async function createTestLedgerEntry(
  storeId: string,
  overrides?: Partial<{
    type: string;
    amount_cents: number;
    customer_id: string;
    staff_id: string;
    event_id: string;
    description: string;
  }>
) {
  const id = uniqueId();
  return prisma.posLedgerEntry.create({
    data: {
      id,
      store_id: storeId,
      type: overrides?.type ?? "sale",
      amount_cents: overrides?.amount_cents ?? 1000,
      customer_id: overrides?.customer_id,
      staff_id: overrides?.staff_id,
      event_id: overrides?.event_id,
      description: overrides?.description ?? "Test entry",
    },
  });
}

/**
 * Clean up all test data by store IDs.
 */
export async function cleanupTestStores(storeIds: string[]) {
  if (storeIds.length === 0) return;

  // Delete in dependency order
  for (const storeId of storeIds) {
    await prisma.posReturnItem.deleteMany({
      where: { return_record: { store_id: storeId } },
    });
    await prisma.posReturn.deleteMany({ where: { store_id: storeId } });
    await prisma.posTradeInItem.deleteMany({
      where: { trade_in: { store_id: storeId } },
    });
    await prisma.posTradeIn.deleteMany({ where: { store_id: storeId } });
    await prisma.posEventCheckin.deleteMany({
      where: { event: { store_id: storeId } },
    });
    await prisma.posLedgerEntry.deleteMany({ where: { store_id: storeId } });
    await prisma.posEvent.deleteMany({ where: { store_id: storeId } });
    await prisma.posGiftCard.deleteMany({ where: { store_id: storeId } });
    await prisma.posInventoryItem.deleteMany({ where: { store_id: storeId } });
    await prisma.posSupplier.deleteMany({ where: { store_id: storeId } });
    await prisma.posCustomer.deleteMany({ where: { store_id: storeId } });
    await prisma.posStaff.deleteMany({ where: { store_id: storeId } });
    await prisma.posStore.deleteMany({ where: { id: storeId } });
  }
}

/**
 * Clean up test users.
 */
export async function cleanupTestUsers(userIds: string[]) {
  if (userIds.length === 0) return;
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

/**
 * Get a tenant-scoped Prisma client for testing.
 */
export { getTenantClient };
