/**
 * /admin/api-keys — mint, list, revoke federation API keys.
 *
 * Newly minted keys are shown ONCE in the URL hash (#key=ar_live_...) and
 * cleared from history immediately. Never logged or stored after display.
 *
 * Admin-only.
 */

import { auth } from "@/lib/auth-config";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { mintKey } from "@/lib/api-key";
import Link from "next/link";

export const dynamic = "force-dynamic";

const AVAILABLE_SCOPES = [
  "read:users",
  "read:events:checkins",
  "read:venues:inventory",
  "read:venues:revenue",
  // R2 register sync — push offline events to /api/sync on apps/ops.
  // Per-store scope: each register tablet gets its own key.
  "register:write",
  "admin:*",
];

async function mintAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user?.id || !isAdmin(session.user.email)) {
    throw new Error("Not authorized");
  }
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required");
  const scopes = AVAILABLE_SCOPES.filter((s) => formData.get(`scope:${s}`) === "on");
  if (scopes.length === 0) throw new Error("At least one scope is required");

  const { fullKey, prefix, hash } = mintKey("live");
  await prisma.apiKey.create({
    data: {
      keyPrefix: prefix,
      keyHash: hash,
      name,
      scopes,
      createdById: session.user.id,
    },
  });
  // Pass the freshly minted key via URL hash (never sent to server, history-cleared by client script below).
  redirect(`/admin/api-keys#key=${encodeURIComponent(fullKey)}&prefix=${encodeURIComponent(prefix)}`);
}

async function revokeAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user?.id || !isAdmin(session.user.email)) {
    throw new Error("Not authorized");
  }
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("id required");
  await prisma.apiKey.update({
    where: { id },
    data: { revokedAt: new Date(), revokedBy: session.user.email ?? session.user.id },
  });
  revalidatePath("/admin/api-keys");
}

export default async function ApiKeysPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/admin/api-keys");
  if (!isAdmin(session.user.email)) {
    return (
      <main style={{ maxWidth: "32rem", margin: "0 auto", padding: "4rem 1.5rem", textAlign: "center", color: "#e2e8f0" }}>
        <h1 style={{ color: "#ef4444", fontSize: "1.5rem", fontWeight: 900 }}>Not authorized</h1>
        <Link href="/" style={{ color: "#FF8200" }}>← Back</Link>
      </main>
    );
  }

  const keys = await prisma.apiKey.findMany({
    orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
    include: { createdBy: { select: { displayName: true, email: true } } },
  });

  return (
    <main style={{ maxWidth: "1000px", margin: "0 auto", padding: "2rem 1.5rem", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "1rem" }}>
        <h1 style={{ color: "#FBDB65", fontSize: "1.75rem", fontWeight: 900, margin: 0 }}>API Keys</h1>
        <Link href="/admin/api-usage" style={{ color: "#FF8200", fontSize: "0.9rem", fontWeight: 700, textDecoration: "none" }}>
          View usage →
        </Link>
      </header>

      {/* Reveal-once banner: client-side script picks the freshly-minted key out of the URL hash */}
      <div id="reveal-banner" style={{ display: "none" }} />
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function () {
              if (!location.hash.includes('key=')) return;
              var params = new URLSearchParams(location.hash.slice(1));
              var key = params.get('key');
              var prefix = params.get('prefix');
              if (!key) return;
              // Clear hash from history immediately
              history.replaceState(null, '', location.pathname);
              var banner = document.getElementById('reveal-banner');
              if (!banner) return;
              banner.style.display = 'block';
              banner.style.cssText = 'display:block;background:linear-gradient(135deg,rgba(16,185,129,0.15),rgba(16,185,129,0.05));border:2px solid #10b981;border-radius:0.75rem;padding:1.25rem;margin-bottom:1.5rem;';
              banner.innerHTML = [
                '<div style="color:#10b981;font-weight:900;font-size:1rem;margin-bottom:0.5rem;">Key minted (' + prefix + ')</div>',
                '<div style="color:#94a3b8;font-size:0.85rem;margin-bottom:0.625rem;">Copy this NOW. After you navigate away, the full key is gone forever.</div>',
                '<div style="display:flex;gap:0.5rem;">',
                  '<input id="revealed-key" readonly value="' + key.replace(/"/g, '&quot;') + '" style="flex:1;font-family:monospace;font-size:0.9rem;padding:0.5rem 0.75rem;background:rgba(0,0,0,0.4);border:1px solid #374151;border-radius:0.375rem;color:#FBDB65;" />',
                  '<button onclick="navigator.clipboard.writeText(document.getElementById(\\'revealed-key\\').value);this.textContent=\\'Copied\\';" style="padding:0.5rem 1rem;background:#FF8200;border:none;border-radius:0.375rem;color:#fff;font-weight:700;cursor:pointer;">Copy</button>',
                '</div>',
              ].join('');
            })();
          `,
        }}
      />

      <details style={{ marginBottom: "2rem" }}>
        <summary style={{ cursor: "pointer", color: "#FF8200", fontWeight: 700, padding: "0.75rem 0", userSelect: "none" }}>
          + Mint a new key
        </summary>
        <form
          action={mintAction}
          style={{
            background: "rgba(31, 41, 55, 0.6)",
            border: "1px solid #374151",
            borderRadius: "0.75rem",
            padding: "1.25rem",
            marginTop: "0.75rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <span style={{ color: "#94a3b8", fontSize: "0.85rem", fontWeight: 700 }}>Name (e.g. "fu-site")</span>
            <input
              name="name"
              required
              placeholder="What's this key for?"
              style={{
                padding: "0.5rem 0.75rem",
                background: "rgba(0, 0, 0, 0.4)",
                border: "1px solid #374151",
                borderRadius: "0.5rem",
                color: "#fff",
                fontSize: "0.95rem",
              }}
            />
          </label>
          <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
            <legend style={{ color: "#94a3b8", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.5rem" }}>Scopes</legend>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              {AVAILABLE_SCOPES.map((s) => (
                <label key={s} style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#e2e8f0", fontSize: "0.9rem", cursor: "pointer" }}>
                  <input type="checkbox" name={`scope:${s}`} />
                  <code style={{ color: "#FBDB65" }}>{s}</code>
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="submit"
            style={{
              padding: "0.625rem 1rem",
              background: "linear-gradient(135deg, #FF8200, #ea580c)",
              border: "none",
              borderRadius: "0.5rem",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
              alignSelf: "flex-start",
            }}
          >
            Mint key
          </button>
        </form>
      </details>

      <div style={{ overflow: "auto", border: "1px solid #374151", borderRadius: "0.75rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ background: "rgba(0, 0, 0, 0.4)" }}>
              {["Name", "Prefix", "Scopes", "Created", "Last used", "Uses", "Status", ""].map((h) => (
                <th key={h} style={{ padding: "0.625rem 0.875rem", textAlign: "left", color: "#94a3b8", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} style={{ borderTop: "1px solid #1f2937", opacity: k.revokedAt ? 0.5 : 1 }}>
                <td style={td}>{k.name}</td>
                <td style={td}><code style={{ color: "#FBDB65", fontFamily: "monospace" }}>{k.keyPrefix}</code></td>
                <td style={{ ...td, color: "#94a3b8", fontSize: "0.78rem" }}>{k.scopes.join(", ")}</td>
                <td style={td}>{k.createdAt.toISOString().slice(0, 10)}</td>
                <td style={td}>{k.lastUsedAt ? k.lastUsedAt.toISOString().slice(0, 10) : "never"}</td>
                <td style={td}>{k.usageCount.toLocaleString()}</td>
                <td style={td}>
                  {k.revokedAt
                    ? <span style={{ color: "#ef4444", fontWeight: 700 }}>revoked</span>
                    : <span style={{ color: "#10b981", fontWeight: 700 }}>active</span>}
                </td>
                <td style={td}>
                  {!k.revokedAt && (
                    <form action={revokeAction}>
                      <input type="hidden" name="id" value={k.id} />
                      <button type="submit" style={{ background: "transparent", border: "1px solid rgba(239, 68, 68, 0.4)", color: "#ef4444", padding: "0.25rem 0.625rem", borderRadius: "0.375rem", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}>
                        Revoke
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {keys.length === 0 && (
              <tr>
                <td colSpan={8} style={{ ...td, textAlign: "center", color: "#6b7280", padding: "2rem" }}>
                  No keys minted yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

const td: React.CSSProperties = { padding: "0.625rem 0.875rem", color: "#e2e8f0", verticalAlign: "middle" };
