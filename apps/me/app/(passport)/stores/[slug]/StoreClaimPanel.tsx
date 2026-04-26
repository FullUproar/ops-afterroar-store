"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { TYPE } from "@/app/components/ui";
import { Shield, ChevronRight, AlertTriangle } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Store Claim Panel                                                  */
/*                                                                      */
/*  Renders three different states based on the entity's current      */
/*  status and the user's auth state:                                  */
/*                                                                      */
/*  ─── Unclaimed (status = unclaimed | pending) ────                  */
/*  Logged-out: prompt to sign in / create a Passport.                */
/*  Logged-in: a single 'Claim this store' button. Click → instant    */
/*  claim, no email verification step. Trust the signed-in user; the  */
/*  protection is at the contest layer if someone later disputes.     */
/*                                                                      */
/*  ─── Active (status = active) ────                                  */
/*  Mostly invisible (this panel only shows when the parent page      */
/*  passes status='unclaimed' or 'pending'), but if it does render    */
/*  in active state we show a 'Not the owner? Request review' link.   */
/*  Click → form to submit evidence → admin queue.                    */
/* ------------------------------------------------------------------ */

interface StoreClaimPanelProps {
  slug: string;
  storeName: string;
  status: string;
  websiteUrl: string | null;
}

type Stage =
  | "idle"
  | "claiming"
  | "claimed"
  | "contesting_form"
  | "contesting_submitting"
  | "contested"
  | "error";

export function StoreClaimPanel({ slug, storeName, status }: StoreClaimPanelProps) {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [evidence, setEvidence] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  const isLoggedIn = sessionStatus === "authenticated" && !!session?.user;
  const callbackUrl = `/stores/${slug}`;
  const loginHref = `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  const signupHref = `/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  async function instantClaim() {
    if (stage === "claiming") return;
    setError(null);
    setStage("claiming");
    try {
      const res = await fetch(`/api/entities/${slug}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Could not claim. Try again.");
        setStage("error");
        return;
      }
      setStage("claimed");
      // Refresh server-rendered state so the panel disappears + the page
      // reflects active status without a hard reload.
      setTimeout(() => router.refresh(), 1200);
    } catch {
      setError("Could not reach the server. Try again.");
      setStage("error");
    }
  }

  async function submitContest(e: React.FormEvent) {
    e.preventDefault();
    if (stage === "contesting_submitting") return;
    if (evidence.trim().length < 10) {
      setError("Tell us briefly why you should be the owner — a sentence is fine.");
      return;
    }
    setError(null);
    setStage("contesting_submitting");
    try {
      const res = await fetch(`/api/entities/${slug}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contest: true,
          contactEmail: contactEmail.trim() || undefined,
          evidence: { note: evidence.trim() },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Could not submit. Try again.");
        setStage("contesting_form");
        return;
      }
      setStage("contested");
    } catch {
      setError("Could not reach the server. Try again.");
      setStage("contesting_form");
    }
  }

  const isContestPath = status === "active";

  return (
    <div
      style={{
        margin: "0.5rem var(--pad-x) 0",
        background: isContestPath
          ? "linear-gradient(135deg, rgba(196, 77, 77, 0.05) 0%, rgba(255, 130, 0, 0.04) 100%)"
          : "linear-gradient(135deg, rgba(255, 130, 0, 0.08) 0%, rgba(245, 158, 11, 0.04) 100%)",
        border: `1.5px solid ${isContestPath ? "var(--rule-hi)" : "var(--orange)"}`,
        borderLeft: `4px solid ${isContestPath ? "var(--ink-faint)" : "var(--orange)"}`,
        padding: "1rem 1.1rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.5rem" }}>
        {isContestPath ? (
          <AlertTriangle size={16} color="var(--ink-faint)" strokeWidth={2.5} />
        ) : (
          <Shield size={16} color="var(--orange)" strokeWidth={2.5} />
        )}
        <span
          style={{
            ...TYPE.mono,
            fontSize: "0.6rem",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            fontWeight: 700,
            color: isContestPath ? "var(--ink-soft)" : "var(--orange)",
          }}
        >
          {stage === "claimed"
            ? "You're the owner"
            : stage === "contested"
              ? "Contest filed"
              : isContestPath
                ? "This store is claimed"
                : status === "pending"
                  ? "Claim in progress"
                  : "Unclaimed listing"}
        </span>
      </div>

      {/* ── State: just claimed ── */}
      {stage === "claimed" && (
        <p style={{ ...TYPE.body, color: "var(--ink)", fontSize: "0.92rem", lineHeight: 1.5, margin: 0 }}>
          ✓ {storeName} is now yours. You can update details, invite staff, and connect tools from your dashboard.
        </p>
      )}

      {/* ── State: contest filed ── */}
      {stage === "contested" && (
        <p style={{ ...TYPE.body, color: "var(--ink)", fontSize: "0.92rem", lineHeight: 1.5, margin: 0 }}>
          Thanks — your contest is in the admin queue. We&apos;ll review and reach out if we need more information.
          Most reviews land within a few business days.
        </p>
      )}

      {/* ── Logged-out: route to auth ── */}
      {(stage === "idle" || stage === "error") && !isLoggedIn && !isContestPath && (
        <>
          <p style={{ ...TYPE.body, color: "var(--ink)", fontSize: "0.92rem", lineHeight: 1.5, margin: "0 0 0.85rem" }}>
            Are you the owner of <strong>{storeName}</strong>? Sign in to claim this listing and update your details, invite staff, and connect Afterroar tools.
          </p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Link
              href={loginHref}
              style={{
                padding: "0.6rem 1rem",
                background: "var(--orange)",
                color: "var(--void, #1a1a1a)",
                ...TYPE.display,
                fontSize: "0.85rem",
                fontWeight: 700,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              Sign in to claim <ChevronRight size={14} />
            </Link>
            <Link
              href={signupHref}
              style={{
                padding: "0.6rem 1rem",
                background: "transparent",
                color: "var(--orange)",
                border: "1.5px solid var(--orange)",
                ...TYPE.display,
                fontSize: "0.85rem",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Create a Passport
            </Link>
          </div>
        </>
      )}

      {/* ── Logged-in, instant claim ── */}
      {(stage === "idle" || stage === "claiming" || stage === "error") && isLoggedIn && !isContestPath && (
        <>
          <p style={{ ...TYPE.body, color: "var(--ink)", fontSize: "0.92rem", lineHeight: 1.5, margin: "0 0 0.85rem" }}>
            Are you the owner of <strong>{storeName}</strong>? Claim it now — you&apos;ll be the listing&apos;s owner immediately and can update its info, invite staff, and connect tools.
          </p>
          <button
            onClick={instantClaim}
            disabled={stage === "claiming"}
            style={{
              padding: "0.65rem 1.05rem",
              background: "var(--orange)",
              color: "var(--void, #1a1a1a)",
              border: "none",
              ...TYPE.display,
              fontSize: "0.9rem",
              fontWeight: 700,
              cursor: stage === "claiming" ? "not-allowed" : "pointer",
              opacity: stage === "claiming" ? 0.6 : 1,
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            {stage === "claiming" ? "Claiming…" : "Claim this store"}
            {stage !== "claiming" && <ChevronRight size={14} />}
          </button>
          <p style={{ ...TYPE.mono, fontSize: "0.66rem", letterSpacing: "0.1em", color: "var(--ink-faint)", margin: "0.6rem 0 0" }}>
            Bad-faith claims are reversible — owners can contest a claim with proof anytime.
          </p>
          {error && (
            <p style={{ ...TYPE.body, color: "var(--red)", fontSize: "0.82rem", margin: "0.5rem 0 0" }}>
              {error}
            </p>
          )}
        </>
      )}

      {/* ── Contest path: idle ── */}
      {(stage === "idle" || stage === "error") && isContestPath && (
        <>
          <p style={{ ...TYPE.body, color: "var(--ink)", fontSize: "0.92rem", lineHeight: 1.5, margin: "0 0 0.85rem" }}>
            <strong>{storeName}</strong> is already claimed by an Afterroar Passport user. If you&apos;re the actual owner and someone else claimed it in error, you can submit evidence for review.
          </p>
          {!isLoggedIn ? (
            <Link
              href={loginHref}
              style={{
                ...TYPE.display,
                fontSize: "0.85rem",
                fontWeight: 700,
                color: "var(--orange)",
                textDecoration: "underline",
              }}
            >
              Sign in to request review →
            </Link>
          ) : (
            <button
              onClick={() => setStage("contesting_form")}
              style={{
                padding: "0.55rem 0.95rem",
                background: "transparent",
                color: "var(--orange)",
                border: "1.5px solid var(--orange)",
                ...TYPE.display,
                fontSize: "0.82rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Request review
            </button>
          )}
        </>
      )}

      {/* ── Contest path: form ── */}
      {(stage === "contesting_form" || stage === "contesting_submitting") && isContestPath && isLoggedIn && (
        <form onSubmit={submitContest} style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          <p style={{ ...TYPE.body, color: "var(--ink-soft)", fontSize: "0.86rem", lineHeight: 1.55, margin: "0 0 0.25rem" }}>
            Tell us why you should be the owner of <strong>{storeName}</strong>. Include anything that helps us verify — domain you operate, business license, links, etc.
          </p>
          <textarea
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder="I'm the owner of [store]. My business email is X, our website is Y, here's our Google Business listing…"
            rows={4}
            required
            style={{
              padding: "0.65rem 0.85rem",
              background: "var(--panel-mute)",
              border: "1.5px solid var(--rule)",
              color: "var(--cream)",
              fontFamily: "var(--font-body)",
              fontSize: "0.92rem",
              outline: "none",
              resize: "vertical",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--orange)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--rule)")}
          />
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="Best email for us to reach you (optional)"
            style={{
              padding: "0.6rem 0.85rem",
              background: "var(--panel-mute)",
              border: "1.5px solid var(--rule)",
              color: "var(--cream)",
              fontFamily: "var(--font-body)",
              fontSize: "0.9rem",
              outline: "none",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--orange)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--rule)")}
          />
          {error && (
            <p style={{ ...TYPE.body, color: "var(--red)", fontSize: "0.82rem", margin: 0 }}>
              {error}
            </p>
          )}
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => {
                setStage("idle");
                setEvidence("");
                setContactEmail("");
                setError(null);
              }}
              style={{
                padding: "0.55rem 0.95rem",
                background: "transparent",
                color: "var(--ink-soft)",
                border: "none",
                ...TYPE.body,
                fontSize: "0.85rem",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={stage === "contesting_submitting"}
              style={{
                padding: "0.55rem 0.95rem",
                background: "var(--orange)",
                color: "var(--void, #1a1a1a)",
                border: "none",
                ...TYPE.display,
                fontSize: "0.85rem",
                fontWeight: 700,
                cursor: stage === "contesting_submitting" ? "not-allowed" : "pointer",
                opacity: stage === "contesting_submitting" ? 0.6 : 1,
              }}
            >
              {stage === "contesting_submitting" ? "Submitting…" : "File contest"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
