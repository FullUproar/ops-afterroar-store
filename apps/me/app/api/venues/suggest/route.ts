import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-config";
import { prisma } from "@/lib/prisma";
import { createLinearIssue } from "@/lib/linear";

/* ------------------------------------------------------------------ */
/*  POST /api/venues/suggest                                           */
/*                                                                      */
/*  Crowdsourced "I don't see my store here, add it" flow. Sign-in    */
/*  required to keep anonymous spam out. Three layers of guard:        */
/*    1. Rate limit: 5 suggestions per user per 24h.                   */
/*    2. Fuzzy dedup: lowercased name + city against existing rows.    */
/*       If a hit, return the existing slug + a message — no new row. */
/*    3. Slug uniqueness: dedup with -2/-3 suffix on conflict.         */
/*                                                                      */
/*  New rows get status="unclaimed" + metadata.crowdsourced=true so   */
/*  the directory can show a "community-added" badge and the actual   */
/*  store owner can claim later via the EntityClaim flow.              */
/* ------------------------------------------------------------------ */

const RATE_LIMIT_WINDOW_HOURS = 24;
const RATE_LIMIT_PER_USER = 5;

interface SuggestBody {
  name?: string;
  city?: string;
  state?: string;
  address?: string;
  phone?: string;
  website?: string;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function normalize(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Sign in to suggest a store." },
      { status: 401 },
    );
  }
  // Narrow once so promise callbacks below see a non-undefined value.
  const userId: string = session.user.id;

  let body: SuggestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const city = (body.city ?? "").trim();
  const state = (body.state ?? "").trim();
  if (name.length < 2) {
    return NextResponse.json({ error: "Store name is required." }, { status: 400 });
  }
  if (city.length < 2) {
    return NextResponse.json({ error: "City helps us find duplicates and place the store on a map." }, { status: 400 });
  }

  // ── Rate limit ──
  // Cheap version: count recent rows attributed to this user via metadata
  // path. GIN index on Venue.metadata means this is fast even at scale.
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000);
  const recentCount = await prisma.venue.count({
    where: {
      createdAt: { gte: since },
      metadata: { path: ["suggested_by_user_id"], equals: userId },
    },
  });
  if (recentCount >= RATE_LIMIT_PER_USER) {
    return NextResponse.json(
      {
        error: `You've suggested ${RATE_LIMIT_PER_USER} stores in the last ${RATE_LIMIT_WINDOW_HOURS} hours. Try again later.`,
      },
      { status: 429 },
    );
  }

  // ── Dedup against existing rows by (name, city) ──
  const candidates = await prisma.venue.findMany({
    where: {
      city: { equals: city, mode: "insensitive" },
    },
    select: { id: true, slug: true, name: true, city: true, status: true },
  });
  const targetName = normalize(name);
  const targetCity = normalize(city);
  const exact = candidates.find(
    (v) => normalize(v.name) === targetName && normalize(v.city) === targetCity,
  );
  if (exact) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      message: `Looks like ${exact.name} is already in the directory.`,
      slug: exact.slug,
      status: exact.status,
    });
  }

  // Loose match: name shares first ~6 chars and same city — flag but still
  // create. Front-end can show a "did you mean?" hint with the loose-match
  // slug so the user can self-correct.
  const looseMatch =
    candidates.find((v) => normalize(v.name).slice(0, 6) === targetName.slice(0, 6)) ?? null;

  // ── Slug ──
  let baseSlug = slugify(name);
  if (city) baseSlug = `${baseSlug}-${slugify(city)}`;
  let finalSlug = baseSlug;
  let n = 2;
  while (await prisma.venue.findUnique({ where: { slug: finalSlug } })) {
    finalSlug = `${baseSlug}-${n}`;
    n++;
    if (n > 50) {
      return NextResponse.json(
        { error: "Could not generate a unique URL for this store. Try a more specific name." },
        { status: 422 },
      );
    }
  }

  // ── Create ──
  const submitterEmail = session.user.email ?? "unknown";
  const submitterName = session.user.name ?? null;
  const venue = await prisma.venue.create({
    data: {
      slug: finalSlug,
      name,
      status: "unclaimed",
      city: city || null,
      state: state || null,
      address: body.address?.trim() || null,
      phone: body.phone?.trim() || null,
      website: body.website?.trim() || null,
      venueType: "game_store",
      metadata: {
        crowdsourced: true,
        suggested_by_user_id: userId,
        suggested_at: new Date().toISOString(),
      },
    },
  });

  // Fire-and-forget: open a Linear issue so we can sanity-check the
  // submission, enrich the listing, and (if we feel like it) reach out
  // to the actual store. Failure here MUST NOT block the user response.
  const baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "https://afterroar.me";
  const linearLabel = process.env.LINEAR_VENUE_SUGGEST_LABEL || "ME";
  const looseMatchLine = looseMatch
    ? `\n**Possible duplicate:** [${looseMatch.name}](${baseUrl}/stores/${looseMatch.slug}) — flagged via fuzzy name match. Worth a look before approving.\n`
    : "";
  void createLinearIssue({
    title: `Suggested venue: ${name} (${[city, state].filter(Boolean).join(", ") || "no location"})`,
    description: [
      `**New venue** added to the directory by an Afterroar Passport user.`,
      "",
      `**Listing:** [${name}](${baseUrl}/stores/${finalSlug}) (\`${finalSlug}\`)`,
      `**Location:** ${[city, state].filter(Boolean).join(", ") || "—"}`,
      `**Website:** ${body.website?.trim() || "—"}`,
      `**Phone:** ${body.phone?.trim() || "—"}`,
      `**Address:** ${body.address?.trim() || "—"}`,
      "",
      `**Suggested by:** ${submitterName ?? "(no display name)"} — ${submitterEmail}`,
      looseMatchLine,
      "---",
      "",
      "Status: \`unclaimed\` (community-added). The actual store owner can claim it from the listing page; until then this is searchable in the directory with a 'Community-added' badge.",
    ]
      .join("\n")
      .trim(),
    labels: [linearLabel],
  })
    .then((issue) => {
      if (!issue) return;
      return prisma.venue.update({
        where: { id: venue.id },
        data: {
          metadata: {
            crowdsourced: true,
            suggested_by_user_id: userId,
            suggested_at: new Date().toISOString(),
            linear_issue_id: issue.identifier,
            linear_issue_url: issue.url,
          },
        },
      });
    })
    .catch((err) => console.error("[venues/suggest] linear filing failed", err));

  return NextResponse.json({
    ok: true,
    duplicate: false,
    slug: venue.slug,
    status: venue.status,
    message: "Added to the directory. The actual owner can claim it later.",
    ...(looseMatch
      ? { loose_match: { slug: looseMatch.slug, name: looseMatch.name } }
      : {}),
  });
}
