/**
 * Tenant Isolation Test Suite
 *
 * Verifies that data from one store NEVER appears in another store's views.
 * Logs in as two different users via API, then checks every endpoint for bleed.
 *
 * Run: npx playwright test tests/tenant-isolation.spec.ts --project=auth-desktop
 */
import { test, expect } from "@playwright/test";

// Two accounts on DIFFERENT stores
const STORE_A_CREDS = { email: "bot-owner@afterroar.store", password: "bot1234!" };
const STORE_B_CREDS = { email: "manager@teststore.com", password: "password123" };

interface SessionInfo {
  cookie: string;
  storeId: string;
  storeName: string;
}

async function getSession(baseURL: string, creds: { email: string; password: string }): Promise<SessionInfo> {
  // Get CSRF token
  const csrfRes = await fetch(`${baseURL}/api/auth/csrf`);
  const csrfData = await csrfRes.json();
  const csrfToken = csrfData.csrfToken;
  const csrfCookies = csrfRes.headers.getSetCookie?.() || [];

  // Sign in with credentials
  const signInRes = await fetch(`${baseURL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: csrfCookies.join("; "),
    },
    body: new URLSearchParams({
      csrfToken,
      email: creds.email,
      password: creds.password,
    }),
    redirect: "manual",
  });

  // Collect all cookies from the redirect
  const allCookies = [
    ...csrfCookies,
    ...(signInRes.headers.getSetCookie?.() || []),
  ];
  const cookie = allCookies
    .map((c) => c.split(";")[0])
    .join("; ");

  // Get /api/me to verify and get store info
  const meRes = await fetch(`${baseURL}/api/me`, {
    headers: { Cookie: cookie },
  });
  const me = await meRes.json();

  return {
    cookie,
    storeId: me.store?.id || "",
    storeName: me.store?.name || "unknown",
  };
}

async function apiGet(baseURL: string, path: string, cookie: string) {
  const res = await fetch(`${baseURL}${path}`, {
    headers: { Cookie: cookie },
  });
  if (!res.ok) return [];
  return res.json();
}

test.describe("authenticated: tenant isolation", () => {
  let baseURL: string;
  let sessionA: SessionInfo;
  let sessionB: SessionInfo;

  test.beforeAll(async () => {
    baseURL = "https://www.afterroar.store";

    sessionA = await getSession(baseURL, STORE_A_CREDS);
    sessionB = await getSession(baseURL, STORE_B_CREDS);

    console.log(`Store A: "${sessionA.storeName}" (${sessionA.storeId}) — cookie: ${sessionA.cookie.slice(0, 50)}...`);
    console.log(`Store B: "${sessionB.storeName}" (${sessionB.storeId}) — cookie: ${sessionB.cookie.slice(0, 50)}...`);

    // If same store, it might mean the test account doesn't have a separate store
    if (sessionA.storeId === sessionB.storeId) {
      console.log("WARNING: Both accounts resolved to the same store.");
      console.log("The test requires two accounts on DIFFERENT stores.");
      console.log("Skipping — create a second store with a different owner first.");
    }

    // CRITICAL: stores must be different
    expect(sessionA.storeId).toBeTruthy();
    expect(sessionB.storeId).toBeTruthy();
    expect(sessionA.storeId).not.toEqual(sessionB.storeId);
  });

  test("/api/me returns correct store for each user", async () => {
    const meA = await apiGet(baseURL, "/api/me", sessionA.cookie);
    const meB = await apiGet(baseURL, "/api/me", sessionB.cookie);

    expect(meA.store?.id).toEqual(sessionA.storeId);
    expect(meB.store?.id).toEqual(sessionB.storeId);
    expect(meA.staff?.store_id).toEqual(sessionA.storeId);
    expect(meB.staff?.store_id).toEqual(sessionB.storeId);
  });

  test("customers are isolated between stores", async () => {
    const customersA = await apiGet(baseURL, "/api/customers", sessionA.cookie);
    const customersB = await apiGet(baseURL, "/api/customers", sessionB.cookie);

    for (const c of customersA) {
      expect(c.store_id, `Customer "${c.name}" from A has wrong store_id`).toEqual(sessionA.storeId);
    }
    for (const c of customersB) {
      expect(c.store_id, `Customer "${c.name}" from B has wrong store_id`).toEqual(sessionB.storeId);
    }

    // No ID overlap
    const idsA = new Set(customersA.map((c: { id: string }) => c.id));
    for (const c of customersB) {
      expect(idsA.has(c.id), `Customer "${c.name}" (${c.id}) in both stores`).toBeFalsy();
    }
  });

  test("inventory is isolated between stores", async () => {
    const itemsA = await apiGet(baseURL, "/api/inventory", sessionA.cookie);
    const itemsB = await apiGet(baseURL, "/api/inventory", sessionB.cookie);

    for (const item of itemsA) {
      expect(item.store_id, `Item "${item.name}" from A`).toEqual(sessionA.storeId);
    }
    for (const item of itemsB) {
      expect(item.store_id, `Item "${item.name}" from B`).toEqual(sessionB.storeId);
    }
  });

  test("staff is isolated between stores", async () => {
    const staffA = await apiGet(baseURL, "/api/staff", sessionA.cookie);
    const staffB = await apiGet(baseURL, "/api/staff", sessionB.cookie);

    for (const s of staffA) {
      expect(s.store_id, `Staff "${s.name}" from A`).toEqual(sessionA.storeId);
    }
    for (const s of staffB) {
      expect(s.store_id, `Staff "${s.name}" from B`).toEqual(sessionB.storeId);
    }
  });

  test("events are isolated between stores", async () => {
    const eventsA = await apiGet(baseURL, "/api/events", sessionA.cookie);
    const eventsB = await apiGet(baseURL, "/api/events", sessionB.cookie);

    for (const e of eventsA) {
      expect(e.store_id, `Event "${e.name}" from A`).toEqual(sessionA.storeId);
    }
    for (const e of eventsB) {
      expect(e.store_id, `Event "${e.name}" from B`).toEqual(sessionB.storeId);
    }
  });

  test("gift cards are isolated between stores", async () => {
    const cardsA = await apiGet(baseURL, "/api/gift-cards", sessionA.cookie);
    const cardsB = await apiGet(baseURL, "/api/gift-cards", sessionB.cookie);

    for (const card of cardsA) {
      expect(card.store_id, `Gift card from A`).toEqual(sessionA.storeId);
    }
    for (const card of cardsB) {
      expect(card.store_id, `Gift card from B`).toEqual(sessionB.storeId);
    }
  });

  test("creating a customer in A does NOT appear in B", async () => {
    const uniqueName = `IsolationTest_${Date.now()}`;

    // Create in A
    const createRes = await fetch(`${baseURL}/api/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: sessionA.cookie },
      body: JSON.stringify({ name: uniqueName, email: `${uniqueName.toLowerCase()}@test.com` }),
    });
    expect(createRes.ok()).toBeTruthy();
    const created = await createRes.json();
    expect(created.store_id).toEqual(sessionA.storeId);

    // Search in B — must NOT find it
    const searchB = await apiGet(baseURL, `/api/customers?q=${uniqueName}`, sessionB.cookie);
    const leaked = searchB.find((c: { name: string }) => c.name === uniqueName);
    expect(leaked, `CRITICAL: Customer "${uniqueName}" leaked from A to B!`).toBeUndefined();

    // Search in A — must find it
    const searchA = await apiGet(baseURL, `/api/customers?q=${uniqueName}`, sessionA.cookie);
    const found = searchA.find((c: { name: string }) => c.name === uniqueName);
    expect(found).toBeTruthy();

    // Clean up
    if (created.id) {
      await fetch(`${baseURL}/api/customers/${created.id}`, {
        method: "DELETE",
        headers: { Cookie: sessionA.cookie },
      });
    }
  });
});
