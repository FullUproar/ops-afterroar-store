/**
 * Linear GraphQL client — thin wrapper for filing issues from server-side
 * flows (e.g. store-claim contests, support requests). Fire-and-forget by
 * design: the caller never blocks on Linear, and missing/invalid config
 * logs to console instead of throwing.
 *
 * Env vars:
 *   LINEAR_API_KEY        — required to enable; if absent, every call is a
 *                           no-op (returns null) and a one-line warning is
 *                           logged. Lets dev work without hitting Linear.
 *   LINEAR_TEAM_KEY       — defaults to "FUL" (Full Uproar Games)
 *   LINEAR_CLAIM_LABEL    — defaults to "ME" (Shawn's site-tag convention:
 *                           HQ / FU / ME / STORE for the four major
 *                           surfaces). Auto-created in the team if it
 *                           doesn't exist (one-time on first filing).
 */

const LINEAR_API_URL = "https://api.linear.app/graphql";

interface LinearIssue {
  id: string;
  identifier: string; // e.g. "FUL-42"
  url: string;
  title: string;
}

interface CreateIssueParams {
  title: string;
  description: string;
  labels?: string[]; // human-readable label names; auto-created if missing
}

// In-memory caches keyed on the process. Linear resource IDs don't change.
const labelIdCache = new Map<string, string>();
let teamIdCache: string | null = null;

function isEnabled(): boolean {
  return !!process.env.LINEAR_API_KEY;
}

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T | null> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    console.log("[linear] LINEAR_API_KEY not set — skipping Linear call");
    return null;
  }

  try {
    const res = await fetch(LINEAR_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey, // personal API keys go raw, no Bearer prefix
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[linear] ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }
    const json = (await res.json()) as { data?: T; errors?: unknown[] };
    if (json.errors) {
      console.error("[linear] graphql errors:", JSON.stringify(json.errors).slice(0, 300));
      return null;
    }
    return json.data ?? null;
  } catch (err) {
    console.error("[linear] request failed:", err);
    return null;
  }
}

async function getTeamId(): Promise<string | null> {
  if (teamIdCache) return teamIdCache;
  const teamKey = process.env.LINEAR_TEAM_KEY || "FUL";
  const data = await gql<{ teams: { nodes: Array<{ id: string; key: string }> } }>(`
    query Teams { teams { nodes { id key } } }
  `);
  if (!data) return null;
  const team = data.teams.nodes.find((t) => t.key.toUpperCase() === teamKey.toUpperCase());
  if (!team) {
    console.error(`[linear] no team with key "${teamKey}" — set LINEAR_TEAM_KEY`);
    return null;
  }
  teamIdCache = team.id;
  return team.id;
}

async function getOrCreateLabelId(name: string, teamId: string): Promise<string | null> {
  const cacheKey = `${teamId}:${name.toLowerCase()}`;
  const cached = labelIdCache.get(cacheKey);
  if (cached) return cached;

  // 1. Look up by name
  const found = await gql<{ issueLabels: { nodes: Array<{ id: string; name: string; team: { id: string } }> } }>(
    `
      query LabelByName($name: String!) {
        issueLabels(filter: { name: { eq: $name } }, first: 25) {
          nodes { id name team { id } }
        }
      }
    `,
    { name },
  );
  const existing = found?.issueLabels.nodes.find((l) => l.team.id === teamId);
  if (existing) {
    labelIdCache.set(cacheKey, existing.id);
    return existing.id;
  }

  // 2. Create
  const created = await gql<{ issueLabelCreate: { success: boolean; issueLabel: { id: string } | null } }>(
    `
      mutation CreateLabel($input: IssueLabelCreateInput!) {
        issueLabelCreate(input: $input) {
          success
          issueLabel { id }
        }
      }
    `,
    {
      input: { name, teamId, color: "#FF8200" /* orange to match brand */ },
    },
  );

  if (!created?.issueLabelCreate.success || !created.issueLabelCreate.issueLabel) {
    console.error(`[linear] failed to create label "${name}"`);
    return null;
  }
  const id = created.issueLabelCreate.issueLabel.id;
  labelIdCache.set(cacheKey, id);
  return id;
}

/**
 * Create an issue in the configured team. Returns the issue's identifier
 * + URL on success, null on any failure (config missing, API error, etc).
 *
 * This is a fire-and-forget primitive: the caller should not depend on
 * the return value for correctness — only for *enriching* their response
 * (e.g. surfacing the Linear URL to the user).
 */
export async function createLinearIssue(params: CreateIssueParams): Promise<LinearIssue | null> {
  if (!isEnabled()) return null;

  const teamId = await getTeamId();
  if (!teamId) return null;

  // Resolve label IDs (creating any that don't exist yet)
  const labelIds: string[] = [];
  for (const name of params.labels ?? []) {
    const id = await getOrCreateLabelId(name, teamId);
    if (id) labelIds.push(id);
  }

  const created = await gql<{
    issueCreate: {
      success: boolean;
      issue: { id: string; identifier: string; url: string; title: string } | null;
    };
  }>(
    `
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue { id identifier url title }
        }
      }
    `,
    {
      input: {
        teamId,
        title: params.title,
        description: params.description,
        labelIds,
      },
    },
  );

  if (!created?.issueCreate.success || !created.issueCreate.issue) {
    console.error("[linear] issue create returned non-success");
    return null;
  }
  return created.issueCreate.issue;
}

/* ------------------------------------------------------------------ */
/*  Higher-level helper: file a claim-contest issue                    */
/* ------------------------------------------------------------------ */

export interface ClaimContestIssueParams {
  storeName: string;
  storeSlug: string;
  contestantName: string | null;
  contestantEmail: string;
  contestantContactEmail: string | null;
  evidenceNote: string;
  currentOwnerEmails: string[];
  adminUrl: string; // e.g. https://afterroar.me/admin/claims
}

export async function fileClaimContestIssue(p: ClaimContestIssueParams): Promise<LinearIssue | null> {
  // Default to the "ME" site-tag (Passport / afterroar.me). Shawn's
  // convention: HQ / FU / ME / STORE on every issue so you can filter
  // the queue by surface. The issue title carries the specific concern
  // ("Store-claim contest: …") so we don't double-tag with a thing-label.
  const labelName = process.env.LINEAR_CLAIM_LABEL || "ME";
  const title = `Store-claim contest: ${p.storeName}`;
  const description = [
    `**Store:** [${p.storeName}](https://afterroar.me/stores/${p.storeSlug}) (\`${p.storeSlug}\`)`,
    "",
    `**Contestant:** ${p.contestantName ?? "(no display name)"} — ${p.contestantEmail}`,
    p.contestantContactEmail && p.contestantContactEmail !== p.contestantEmail
      ? `**Reach-back email:** ${p.contestantContactEmail}`
      : null,
    "",
    `**Current owner${p.currentOwnerEmails.length === 1 ? "" : "s"}:** ${
      p.currentOwnerEmails.length > 0 ? p.currentOwnerEmails.join(", ") : "(none active)"
    }`,
    "",
    "---",
    "",
    "**Submitted evidence:**",
    "",
    p.evidenceNote.trim() || "(none)",
    "",
    "---",
    "",
    `Resolve at the admin queue: ${p.adminUrl}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  return createLinearIssue({
    title,
    description,
    labels: [labelName],
  });
}
