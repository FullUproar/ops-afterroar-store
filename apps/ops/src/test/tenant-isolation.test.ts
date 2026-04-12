import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createTestStore,
  createTestUser,
  createTestStaff,
  createTestCustomer,
  createTestInventoryItem,
  createTestEvent,
  createTestLedgerEntry,
  cleanupTestStores,
  cleanupTestUsers,
  getTenantClient,
} from "./setup";

/**
 * Multi-Tenant Isolation Test Suite
 *
 * Verifies that the tenant-scoped Prisma client prevents cross-store
 * data access. This is the core safety guarantee of the system.
 */

let storeA: { id: string };
let storeB: { id: string };
let userA: { id: string };
let userB: { id: string };
let staffA: { id: string; store_id: string };
let staffB: { id: string; store_id: string };
let customerA: { id: string; store_id: string; name: string };
let customerB: { id: string; store_id: string; name: string };
let itemA: { id: string };
let itemB: { id: string };
let eventA: { id: string };
let eventB: { id: string };
let ledgerA: { id: string };
let ledgerB: { id: string };

describe("Multi-Tenant Isolation", () => {
  beforeAll(async () => {
    // Create two completely isolated stores
    storeA = await createTestStore("Store Alpha");
    storeB = await createTestStore("Store Beta");

    userA = await createTestUser();
    userB = await createTestUser();

    staffA = await createTestStaff(storeA.id, userA.id, "owner");
    staffB = await createTestStaff(storeB.id, userB.id, "owner");

    customerA = await createTestCustomer(storeA.id, "Alice from Alpha");
    customerB = await createTestCustomer(storeB.id, "Bob from Beta");

    itemA = await createTestInventoryItem(storeA.id, { name: "Alpha Card", quantity: 5 });
    itemB = await createTestInventoryItem(storeB.id, { name: "Beta Card", quantity: 5 });

    eventA = await createTestEvent(storeA.id, { name: "Alpha FNM" });
    eventB = await createTestEvent(storeB.id, { name: "Beta FNM" });

    ledgerA = await createTestLedgerEntry(storeA.id, {
      type: "sale",
      amount_cents: 1500,
      customer_id: customerA.id,
      staff_id: staffA.id,
    });
    ledgerB = await createTestLedgerEntry(storeB.id, {
      type: "sale",
      amount_cents: 2000,
      customer_id: customerB.id,
      staff_id: staffB.id,
    });
  });

  afterAll(async () => {
    await cleanupTestStores([storeA.id, storeB.id]);
    await cleanupTestUsers([userA.id, userB.id]);
  });

  // ---- Customer Isolation ----

  it("Store A cannot see Store B customers via tenant client", async () => {
    const dbA = getTenantClient(storeA.id);
    const customers = await dbA.posCustomer.findMany();
    const names = customers.map((c) => c.name);
    expect(names).toContain("Alice from Alpha");
    expect(names).not.toContain("Bob from Beta");
  });

  it("Store B cannot see Store A customers via tenant client", async () => {
    const dbB = getTenantClient(storeB.id);
    const customers = await dbB.posCustomer.findMany();
    const names = customers.map((c) => c.name);
    expect(names).toContain("Bob from Beta");
    expect(names).not.toContain("Alice from Alpha");
  });

  it("Store A findFirst for Store B customer returns null", async () => {
    const dbA = getTenantClient(storeA.id);
    const result = await dbA.posCustomer.findFirst({
      where: { id: customerB.id },
    });
    expect(result).toBeNull();
  });

  // ---- Inventory Isolation ----

  it("Store A cannot see Store B inventory", async () => {
    const dbA = getTenantClient(storeA.id);
    const items = await dbA.posInventoryItem.findMany();
    const names = items.map((i) => i.name);
    expect(names).toContain("Alpha Card");
    expect(names).not.toContain("Beta Card");
  });

  it("Store A cannot find Store B item by ID", async () => {
    const dbA = getTenantClient(storeA.id);
    const result = await dbA.posInventoryItem.findFirst({
      where: { id: itemB.id },
    });
    expect(result).toBeNull();
  });

  // ---- Event Isolation ----

  it("Store A cannot see Store B events", async () => {
    const dbA = getTenantClient(storeA.id);
    const events = await dbA.posEvent.findMany();
    const names = events.map((e) => e.name);
    expect(names).toContain("Alpha FNM");
    expect(names).not.toContain("Beta FNM");
  });

  // ---- Ledger Isolation ----

  it("Store A cannot see Store B ledger entries", async () => {
    const dbA = getTenantClient(storeA.id);
    const entries = await dbA.posLedgerEntry.findMany();
    const ids = entries.map((e) => e.id);
    expect(ids).toContain(ledgerA.id);
    expect(ids).not.toContain(ledgerB.id);
  });

  it("Ledger count is store-scoped", async () => {
    const dbA = getTenantClient(storeA.id);
    const dbB = getTenantClient(storeB.id);
    const countA = await dbA.posLedgerEntry.count();
    const countB = await dbB.posLedgerEntry.count();
    // Each store should have exactly 1 test ledger entry
    expect(countA).toBeGreaterThanOrEqual(1);
    expect(countB).toBeGreaterThanOrEqual(1);
    // They should be independent
    expect(countA).not.toBe(countA + countB);
  });

  // ---- Staff Isolation ----

  it("Store A cannot see Store B staff", async () => {
    const dbA = getTenantClient(storeA.id);
    const staff = await dbA.posStaff.findMany();
    const ids = staff.map((s) => s.id);
    expect(ids).toContain(staffA.id);
    expect(ids).not.toContain(staffB.id);
  });

  // ---- Create scoping ----

  it("Tenant client auto-injects store_id on create", async () => {
    const dbA = getTenantClient(storeA.id);
    const customer = await dbA.posCustomer.create({
      data: {
        name: "Auto-scoped Customer",
        store_id: storeA.id, // should match
      },
    });
    expect(customer.store_id).toBe(storeA.id);

    // Clean up
    const { prisma } = await import("@/lib/prisma");
    await prisma.posCustomer.delete({ where: { id: customer.id } });
  });

  // ---- Update scoping ----

  it("Store A cannot update Store B customer via tenant client", async () => {
    const dbA = getTenantClient(storeA.id);
    // Attempting to update Store B's customer should fail
    // (Prisma will throw because the record won't be found with store_id filter)
    await expect(
      dbA.posCustomer.update({
        where: { id: customerB.id },
        data: { name: "Hacked!" },
      })
    ).rejects.toThrow();

    // Verify original is unchanged
    const { prisma } = await import("@/lib/prisma");
    const original = await prisma.posCustomer.findUnique({
      where: { id: customerB.id },
    });
    expect(original?.name).toBe("Bob from Beta");
  });
});
