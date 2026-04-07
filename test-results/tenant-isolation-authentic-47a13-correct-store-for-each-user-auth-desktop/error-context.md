# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tenant-isolation.spec.ts >> authenticated: tenant isolation >> /api/me returns correct store for each user
- Location: tests\tenant-isolation.spec.ts:93:7

# Error details

```
Error: expect(received).not.toEqual(expected) // deep equality

Expected: not "885ccb77-6cc4-4868-b667-6cbf06f61ca8"

```

# Test source

```ts
  1   | /**
  2   |  * Tenant Isolation Test Suite
  3   |  *
  4   |  * Verifies that data from one store NEVER appears in another store's views.
  5   |  * Logs in as two different users via API, then checks every endpoint for bleed.
  6   |  *
  7   |  * Run: npx playwright test tests/tenant-isolation.spec.ts --project=auth-desktop
  8   |  */
  9   | import { test, expect } from "@playwright/test";
  10  | 
  11  | // Two accounts on DIFFERENT stores
  12  | const STORE_A_CREDS = { email: "bot-owner@afterroar.store", password: "bot1234!" };
  13  | const STORE_B_CREDS = { email: "manager@teststore.com", password: "password123" };
  14  | 
  15  | interface SessionInfo {
  16  |   cookie: string;
  17  |   storeId: string;
  18  |   storeName: string;
  19  | }
  20  | 
  21  | async function getSession(baseURL: string, creds: { email: string; password: string }): Promise<SessionInfo> {
  22  |   // Get CSRF token
  23  |   const csrfRes = await fetch(`${baseURL}/api/auth/csrf`);
  24  |   const csrfData = await csrfRes.json();
  25  |   const csrfToken = csrfData.csrfToken;
  26  |   const csrfCookies = csrfRes.headers.getSetCookie?.() || [];
  27  | 
  28  |   // Sign in with credentials
  29  |   const signInRes = await fetch(`${baseURL}/api/auth/callback/credentials`, {
  30  |     method: "POST",
  31  |     headers: {
  32  |       "Content-Type": "application/x-www-form-urlencoded",
  33  |       Cookie: csrfCookies.join("; "),
  34  |     },
  35  |     body: new URLSearchParams({
  36  |       csrfToken,
  37  |       email: creds.email,
  38  |       password: creds.password,
  39  |     }),
  40  |     redirect: "manual",
  41  |   });
  42  | 
  43  |   // Collect all cookies from the redirect
  44  |   const allCookies = [
  45  |     ...csrfCookies,
  46  |     ...(signInRes.headers.getSetCookie?.() || []),
  47  |   ];
  48  |   const cookie = allCookies
  49  |     .map((c) => c.split(";")[0])
  50  |     .join("; ");
  51  | 
  52  |   // Get /api/me to verify and get store info
  53  |   const meRes = await fetch(`${baseURL}/api/me`, {
  54  |     headers: { Cookie: cookie },
  55  |   });
  56  |   const me = await meRes.json();
  57  | 
  58  |   return {
  59  |     cookie,
  60  |     storeId: me.store?.id || "",
  61  |     storeName: me.store?.name || "unknown",
  62  |   };
  63  | }
  64  | 
  65  | async function apiGet(baseURL: string, path: string, cookie: string) {
  66  |   const res = await fetch(`${baseURL}${path}`, {
  67  |     headers: { Cookie: cookie },
  68  |   });
  69  |   if (!res.ok) return [];
  70  |   return res.json();
  71  | }
  72  | 
  73  | test.describe("authenticated: tenant isolation", () => {
  74  |   let baseURL: string;
  75  |   let sessionA: SessionInfo;
  76  |   let sessionB: SessionInfo;
  77  | 
  78  |   test.beforeAll(async () => {
  79  |     baseURL = "https://www.afterroar.store";
  80  | 
  81  |     sessionA = await getSession(baseURL, STORE_A_CREDS);
  82  |     sessionB = await getSession(baseURL, STORE_B_CREDS);
  83  | 
  84  |     console.log(`Store A: "${sessionA.storeName}" (${sessionA.storeId})`);
  85  |     console.log(`Store B: "${sessionB.storeName}" (${sessionB.storeId})`);
  86  | 
  87  |     // CRITICAL: stores must be different
  88  |     expect(sessionA.storeId).toBeTruthy();
  89  |     expect(sessionB.storeId).toBeTruthy();
> 90  |     expect(sessionA.storeId).not.toEqual(sessionB.storeId);
      |                                  ^ Error: expect(received).not.toEqual(expected) // deep equality
  91  |   });
  92  | 
  93  |   test("/api/me returns correct store for each user", async () => {
  94  |     const meA = await apiGet(baseURL, "/api/me", sessionA.cookie);
  95  |     const meB = await apiGet(baseURL, "/api/me", sessionB.cookie);
  96  | 
  97  |     expect(meA.store?.id).toEqual(sessionA.storeId);
  98  |     expect(meB.store?.id).toEqual(sessionB.storeId);
  99  |     expect(meA.staff?.store_id).toEqual(sessionA.storeId);
  100 |     expect(meB.staff?.store_id).toEqual(sessionB.storeId);
  101 |   });
  102 | 
  103 |   test("customers are isolated between stores", async () => {
  104 |     const customersA = await apiGet(baseURL, "/api/customers", sessionA.cookie);
  105 |     const customersB = await apiGet(baseURL, "/api/customers", sessionB.cookie);
  106 | 
  107 |     for (const c of customersA) {
  108 |       expect(c.store_id, `Customer "${c.name}" from A has wrong store_id`).toEqual(sessionA.storeId);
  109 |     }
  110 |     for (const c of customersB) {
  111 |       expect(c.store_id, `Customer "${c.name}" from B has wrong store_id`).toEqual(sessionB.storeId);
  112 |     }
  113 | 
  114 |     // No ID overlap
  115 |     const idsA = new Set(customersA.map((c: { id: string }) => c.id));
  116 |     for (const c of customersB) {
  117 |       expect(idsA.has(c.id), `Customer "${c.name}" (${c.id}) in both stores`).toBeFalsy();
  118 |     }
  119 |   });
  120 | 
  121 |   test("inventory is isolated between stores", async () => {
  122 |     const itemsA = await apiGet(baseURL, "/api/inventory", sessionA.cookie);
  123 |     const itemsB = await apiGet(baseURL, "/api/inventory", sessionB.cookie);
  124 | 
  125 |     for (const item of itemsA) {
  126 |       expect(item.store_id, `Item "${item.name}" from A`).toEqual(sessionA.storeId);
  127 |     }
  128 |     for (const item of itemsB) {
  129 |       expect(item.store_id, `Item "${item.name}" from B`).toEqual(sessionB.storeId);
  130 |     }
  131 |   });
  132 | 
  133 |   test("staff is isolated between stores", async () => {
  134 |     const staffA = await apiGet(baseURL, "/api/staff", sessionA.cookie);
  135 |     const staffB = await apiGet(baseURL, "/api/staff", sessionB.cookie);
  136 | 
  137 |     for (const s of staffA) {
  138 |       expect(s.store_id, `Staff "${s.name}" from A`).toEqual(sessionA.storeId);
  139 |     }
  140 |     for (const s of staffB) {
  141 |       expect(s.store_id, `Staff "${s.name}" from B`).toEqual(sessionB.storeId);
  142 |     }
  143 |   });
  144 | 
  145 |   test("events are isolated between stores", async () => {
  146 |     const eventsA = await apiGet(baseURL, "/api/events", sessionA.cookie);
  147 |     const eventsB = await apiGet(baseURL, "/api/events", sessionB.cookie);
  148 | 
  149 |     for (const e of eventsA) {
  150 |       expect(e.store_id, `Event "${e.name}" from A`).toEqual(sessionA.storeId);
  151 |     }
  152 |     for (const e of eventsB) {
  153 |       expect(e.store_id, `Event "${e.name}" from B`).toEqual(sessionB.storeId);
  154 |     }
  155 |   });
  156 | 
  157 |   test("gift cards are isolated between stores", async () => {
  158 |     const cardsA = await apiGet(baseURL, "/api/gift-cards", sessionA.cookie);
  159 |     const cardsB = await apiGet(baseURL, "/api/gift-cards", sessionB.cookie);
  160 | 
  161 |     for (const card of cardsA) {
  162 |       expect(card.store_id, `Gift card from A`).toEqual(sessionA.storeId);
  163 |     }
  164 |     for (const card of cardsB) {
  165 |       expect(card.store_id, `Gift card from B`).toEqual(sessionB.storeId);
  166 |     }
  167 |   });
  168 | 
  169 |   test("creating a customer in A does NOT appear in B", async () => {
  170 |     const uniqueName = `IsolationTest_${Date.now()}`;
  171 | 
  172 |     // Create in A
  173 |     const createRes = await fetch(`${baseURL}/api/customers`, {
  174 |       method: "POST",
  175 |       headers: { "Content-Type": "application/json", Cookie: sessionA.cookie },
  176 |       body: JSON.stringify({ name: uniqueName, email: `${uniqueName.toLowerCase()}@test.com` }),
  177 |     });
  178 |     expect(createRes.ok()).toBeTruthy();
  179 |     const created = await createRes.json();
  180 |     expect(created.store_id).toEqual(sessionA.storeId);
  181 | 
  182 |     // Search in B — must NOT find it
  183 |     const searchB = await apiGet(baseURL, `/api/customers?q=${uniqueName}`, sessionB.cookie);
  184 |     const leaked = searchB.find((c: { name: string }) => c.name === uniqueName);
  185 |     expect(leaked, `CRITICAL: Customer "${uniqueName}" leaked from A to B!`).toBeUndefined();
  186 | 
  187 |     // Search in A — must find it
  188 |     const searchA = await apiGet(baseURL, `/api/customers?q=${uniqueName}`, sessionA.cookie);
  189 |     const found = searchA.find((c: { name: string }) => c.name === uniqueName);
  190 |     expect(found).toBeTruthy();
```