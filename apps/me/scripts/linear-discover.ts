/**
 * One-off diagnostic: list Linear teams, labels, and projects accessible to
 * the configured LINEAR_API_KEY. Used to pick a team key + label slug for
 * the claim-contest integration.
 *
 * Usage:
 *   set -a && . .env.local && set +a && npx tsx scripts/linear-discover.ts
 */

const LINEAR_API_URL = "https://api.linear.app/graphql";

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) throw new Error("LINEAR_API_KEY is not set in env");

  const res = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey, // Linear personal keys go raw, no "Bearer" prefix
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Linear API ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { data?: T; errors?: unknown[] };
  if (json.errors) {
    throw new Error(`Linear GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  if (!json.data) {
    throw new Error("Linear returned no data");
  }
  return json.data;
}

interface ViewerResp { viewer: { id: string; email: string; name: string; organization: { id: string; name: string; urlKey: string } } }
interface TeamsResp {
  teams: {
    nodes: Array<{
      id: string;
      key: string;
      name: string;
      labels: { nodes: Array<{ id: string; name: string; color: string }> };
      projects: { nodes: Array<{ id: string; name: string; state: string }> };
    }>;
  };
}

async function main() {
  console.log("→ Authenticating against Linear API…\n");
  const viewer = await gql<ViewerResp>(`
    query { viewer { id email name organization { id name urlKey } } }
  `);
  console.log(`✓ Authenticated as ${viewer.viewer.name} <${viewer.viewer.email}>`);
  console.log(`  Organization: ${viewer.viewer.organization.name} (${viewer.viewer.organization.urlKey})\n`);

  const teamsResp = await gql<TeamsResp>(`
    query {
      teams(first: 25) {
        nodes {
          id
          key
          name
          labels(first: 50) { nodes { id name color } }
          projects(first: 25) { nodes { id name state } }
        }
      }
    }
  `);

  if (teamsResp.teams.nodes.length === 0) {
    console.log("No teams found. Create a team in Linear first.");
    return;
  }

  console.log(`Teams (${teamsResp.teams.nodes.length}):\n`);
  for (const team of teamsResp.teams.nodes) {
    console.log(`  ━━━ ${team.name} (key: ${team.key}) ━━━`);
    if (team.labels.nodes.length > 0) {
      console.log("    Labels:");
      for (const l of team.labels.nodes) {
        console.log(`      · ${l.name}`);
      }
    } else {
      console.log("    Labels: (none)");
    }
    const activeProjects = team.projects.nodes.filter((p) => p.state !== "completed" && p.state !== "canceled");
    if (activeProjects.length > 0) {
      console.log("    Active projects:");
      for (const p of activeProjects) {
        console.log(`      · ${p.name}`);
      }
    } else {
      console.log("    Active projects: (none)");
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error("✗", err.message ?? err);
  process.exit(1);
});
