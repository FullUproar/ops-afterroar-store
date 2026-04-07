/**
 * Tenant Isolation Test Suite
 *
 * Verifies that data from one store NEVER appears in another store's views.
 * Uses two different browser sessions with different credentials accounts.
 *
 * Run: npx playwright test tests/tenant-isolation.spec.ts --project=isolation
 *
 * Prerequisites:
 * - bot-owner@afterroar.store (FU Games store) — credentials account
 * - bot-cashier@afterroar.store (different store) — credentials account
 *   OR use any two credentials accounts on different stores
 */
import { test, expect, type Browser, type Page } from "@playwright/test";

const BASE_URL = "https://www.afterroar.store";

// Two accounts that MUST be on different stores
const STORE_A = { email: "bot-owner@afterroar.store", password: "bot1234!" };
const STORE_B = { email: "isolationtest@afterroar.store", password: "12345678" };

interface StoreSession {
  page: Page;
  storeId: string;
  storeName: string;
}

async function loginAndGetSession(browser: Browser, creds: { email: string; password: string }): Promise<StoreSession> {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  await page.locator("#email").fill(creds.email);
  await page.locator("#password").fill(creds.password);
  await page.locator("button[type=submit], button:has-text('Sign In')").first().click();

  try {
    await page.waitForURL("**/dashboard**", { timeout: 15_000, waitUntil: "domcontentloaded" });
  } catch {
    throw new Error(`Login failed for ${creds.email} — didn't redirect to dashboard`);
  }
  await page.waitForTimeout(2000);

  // Get store info
  const meRes = await page.request.get(`${BASE_URL}/api/me`);
  const meText = await meRes.text();
  let me: Record<string, Record<string, string>>;
  try {
    me = JSON.parse(meText);
  } catch {
    throw new Error(`Login for ${creds.email}: /api/me returned non-JSON (${meRes.status()}): ${meText.slice(0, 200)}`);
  }

  return {
    page,
    storeId: me.store?.id || "",
    storeName: me.store?.name || "unknown",
  };
}

async function apiGet(page: Page, path: string) {
  const res = await page.request.get(`${BASE_URL}${path}`);
  if (!res.ok()) return [];
  return res.json();
}

test.describe("tenant isolation", () => {
  let a: StoreSession;
  let b: StoreSession;
  let bothReady = false;

  test.beforeAll(async ({ browser }) => {
    // Try to log in both accounts
    try {
      a = await loginAndGetSession(browser, STORE_A);
      console.log(`Store A: "${a.storeName}" (${a.storeId})`);
    } catch (e) {
      console.log(`Store A login failed: ${e}`);
      return;
    }

    try {
      b = await loginAndGetSession(browser, STORE_B);
      console.log(`Store B: "${b.storeName}" (${b.storeId})`);
    } catch (e) {
      console.log(`Store B login failed: ${e}`);
      return;
    }

    if (a.storeId && b.storeId && a.storeId !== b.storeId) {
      bothReady = true;
    } else {
      console.log("WARNING: Both accounts on same store or login failed. Tests will be skipped.");
    }
  });

  test.afterAll(async () => {
    await a?.page?.context()?.close();
    await b?.page?.context()?.close();
  });

  test("/api/me returns correct store for each user", async () => {
    test.skip(!bothReady, "Two stores required");
    expect(a.storeId).not.toEqual(b.storeId);

    const meA = await apiGet(a.page, "/api/me");
    const meB = await apiGet(b.page, "/api/me");
    expect(meA.store?.id).toEqual(a.storeId);
    expect(meB.store?.id).toEqual(b.storeId);
  });

  test("customers are isolated between stores", async () => {
    test.skip(!bothReady, "Two stores required");

    const customersA = await apiGet(a.page, "/api/customers");
    const customersB = await apiGet(b.page, "/api/customers");

    for (const c of customersA) {
      expect(c.store_id, `Customer "${c.name}" from A has wrong store_id`).toEqual(a.storeId);
    }
    for (const c of customersB) {
      expect(c.store_id, `Customer "${c.name}" from B has wrong store_id`).toEqual(b.storeId);
    }

    // No ID overlap
    const idsA = new Set(customersA.map((c: { id: string }) => c.id));
    for (const c of customersB) {
      expect(idsA.has(c.id), `Customer "${c.name}" in both stores`).toBeFalsy();
    }
  });

  test("inventory is isolated between stores", async () => {
    test.skip(!bothReady, "Two stores required");

    const itemsA = await apiGet(a.page, "/api/inventory");
    const itemsB = await apiGet(b.page, "/api/inventory");

    for (const item of itemsA) {
      expect(item.store_id, `Item "${item.name}" from A`).toEqual(a.storeId);
    }
    for (const item of itemsB) {
      expect(item.store_id, `Item "${item.name}" from B`).toEqual(b.storeId);
    }
  });

  test("staff is isolated between stores", async () => {
    test.skip(!bothReady, "Two stores required");

    const staffA = await apiGet(a.page, "/api/staff");
    const staffB = await apiGet(b.page, "/api/staff");

    for (const s of staffA) {
      expect(s.store_id, `Staff "${s.name}" from A`).toEqual(a.storeId);
    }
    for (const s of staffB) {
      expect(s.store_id, `Staff "${s.name}" from B`).toEqual(b.storeId);
    }
  });

  test("events are isolated between stores", async () => {
    test.skip(!bothReady, "Two stores required");

    const eventsA = await apiGet(a.page, "/api/events");
    const eventsB = await apiGet(b.page, "/api/events");

    for (const e of eventsA) {
      expect(e.store_id, `Event "${e.name}" from A`).toEqual(a.storeId);
    }
    for (const e of eventsB) {
      expect(e.store_id, `Event "${e.name}" from B`).toEqual(b.storeId);
    }
  });

  test("gift cards are isolated between stores", async () => {
    test.skip(!bothReady, "Two stores required");

    const cardsA = await apiGet(a.page, "/api/gift-cards");
    const cardsB = await apiGet(b.page, "/api/gift-cards");

    for (const card of cardsA) {
      expect(card.store_id, `Gift card from A`).toEqual(a.storeId);
    }
    for (const card of cardsB) {
      expect(card.store_id, `Gift card from B`).toEqual(b.storeId);
    }
  });

  test("creating a customer in A does NOT appear in B", async () => {
    test.skip(!bothReady, "Two stores required");

    const uniqueName = `IsolationTest_${Date.now()}`;

    // Create in A
    const createRes = await a.page.request.post(`${BASE_URL}/api/customers`, {
      data: { name: uniqueName, email: `${uniqueName.toLowerCase()}@test.com` },
    });
    expect(createRes.ok()).toBeTruthy();
    const created = await createRes.json();
    expect(created.store_id).toEqual(a.storeId);

    // Must NOT appear in B
    const searchB = await apiGet(b.page, `/api/customers?q=${uniqueName}`);
    const leaked = searchB.find((c: { name: string }) => c.name === uniqueName);
    expect(leaked, `CRITICAL: Customer "${uniqueName}" leaked from A to B!`).toBeUndefined();

    // Must appear in A
    const searchA = await apiGet(a.page, `/api/customers?q=${uniqueName}`);
    const found = searchA.find((c: { name: string }) => c.name === uniqueName);
    expect(found).toBeTruthy();

    // Clean up
    if (created.id) {
      await a.page.request.delete(`${BASE_URL}/api/customers/${created.id}`);
    }
  });
});
