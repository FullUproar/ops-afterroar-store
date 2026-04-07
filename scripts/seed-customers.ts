/**
 * Seed 100 test customers for Alice's store via the API.
 * Run: npx tsx scripts/seed-customers.ts
 */

const FIRST_NAMES = [
  "Liam", "Noah", "Oliver", "James", "Elijah", "William", "Henry", "Lucas",
  "Benjamin", "Theodore", "Jack", "Levi", "Alexander", "Mason", "Ethan",
  "Daniel", "Jacob", "Logan", "Jackson", "Sebastian", "Mateo", "Owen",
  "Samuel", "Ryan", "Nathan", "Leo", "Caleb", "Isaac", "Luke", "Jayden",
  "Emma", "Olivia", "Charlotte", "Amelia", "Sophia", "Isabella", "Mia",
  "Evelyn", "Harper", "Luna", "Camila", "Gianna", "Elizabeth", "Eleanor",
  "Chloe", "Sofia", "Layla", "Riley", "Zoey", "Nora", "Lily", "Hazel",
  "Violet", "Aurora", "Savannah", "Audrey", "Brooklyn", "Bella", "Claire",
  "Skylar", "Lucy", "Paisley", "Anna", "Caroline", "Genesis", "Kennedy",
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
  "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez",
  "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
  "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark",
  "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King",
  "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores", "Green",
  "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
  "Carter", "Roberts", "Gomez", "Phillips", "Evans", "Turner", "Diaz",
];

async function main() {
  const BASE = "https://www.afterroar.store";

  // Login as Alice
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const csrfCookies = csrfRes.headers.getSetCookie?.() || [];

  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: csrfCookies.join("; "),
    },
    body: new URLSearchParams({
      csrfToken,
      email: "bot-owner@afterroar.store",
      password: "bot1234!",
    }),
    redirect: "manual",
  });

  const cookies = [...csrfCookies, ...(loginRes.headers.getSetCookie?.() || [])]
    .map((c) => c.split(";")[0])
    .join("; ");

  // Verify login
  const meRes = await fetch(`${BASE}/api/me`, { headers: { Cookie: cookies } });
  const me = await meRes.json();
  console.log(`Logged in as: ${me.staff?.name} @ ${me.store?.name}`);

  if (!me.store?.name?.includes("Alice")) {
    console.error("ERROR: Not logged into Alice's store! Aborting.");
    process.exit(1);
  }

  // Create 100 customers
  let created = 0;
  for (let i = 0; i < 100; i++) {
    const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    const name = `${first} ${last}`;
    const email = `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`;
    const phone = `555-${String(1000 + i).padStart(4, "0")}`;

    const res = await fetch(`${BASE}/api/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookies },
      body: JSON.stringify({ name, email, phone }),
    });

    if (res.ok) {
      created++;
      if (created % 10 === 0) console.log(`Created ${created}/100...`);
    } else {
      const err = await res.text();
      console.error(`Failed to create customer ${i}: ${err}`);
    }
  }

  console.log(`Done! Created ${created} customers.`);
}

main().catch(console.error);
