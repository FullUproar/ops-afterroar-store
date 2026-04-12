import { NextResponse } from "next/server";

/* ------------------------------------------------------------------ */
/*  GET /api/health/errors — fetch recent Sentry issues                 */
/*  Proxies the Sentry API so the ops PWA doesn't need the auth token.  */
/* ------------------------------------------------------------------ */

export async function GET() {
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;
  const token = process.env.SENTRY_AUTH_TOKEN;

  if (!org || !project || !token) {
    return NextResponse.json({ errors: [], configured: false });
  }

  try {
    const res = await fetch(
      `https://sentry.io/api/0/projects/${org}/${project}/issues/?query=is:unresolved&sort=date&limit=10`,
      {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 60 }, // cache for 1 minute
      },
    );

    if (!res.ok) {
      return NextResponse.json({ errors: [], error: `Sentry API ${res.status}` });
    }

    const issues = await res.json();

    const errors = issues.map((issue: Record<string, unknown>) => ({
      id: issue.id,
      title: issue.title,
      culprit: issue.culprit,
      count: issue.count,
      first_seen: issue.firstSeen,
      last_seen: issue.lastSeen,
      level: issue.level,
      link: `https://${org}.sentry.io/issues/${issue.id}/`,
    }));

    return NextResponse.json({ errors, configured: true });
  } catch (err) {
    return NextResponse.json({ errors: [], error: err instanceof Error ? err.message : "Unknown" });
  }
}
