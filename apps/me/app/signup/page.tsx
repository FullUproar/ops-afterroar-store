"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChromeNav, PlayerCard, Workbench } from "@/app/components/card-shell";
import { TYPE, TitleBar } from "@/app/components/ui";
import { signIn } from "next-auth/react";

function SignupContent() {
  const router = useRouter();
  // Distillery-model age gate. The default signup flow is a 18+
  // self-attestation checkbox, NOT a forced DOB screen. This gives
  // honest adults a frictionless path AND avoids the awkward "lie about
  // your birthday to enter" dynamic for honest 16-year-olds. Users who
  // are actually under 18 click the "I am under 18" link, which routes
  // them to /signup/age (DOB picker → blocked or parental-consent flow).
  //
  // We still honor the under-13 sticky cookie (set if a previous attempt
  // entered a sub-13 DOB) and the teen cookie (entered DOB but didn't
  // complete parental consent yet).
  useEffect(() => {
    fetch('/api/auth/age-gate/check')
      .then((r) => r.json())
      .then((d) => {
        if (d.cohort === 'under13') router.replace('/signup/blocked');
        if (d.cohort === 'teen') router.replace('/signup/teen');
      })
      .catch(() => {});
  }, [router]);

  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [confirmedAdult, setConfirmedAdult] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (!confirmedAdult) {
      setError("Please confirm you are 18 or older.");
      return;
    }
    if (!email.includes("@")) {
      setError("Enter a valid email");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
          confirmedAdult: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Signup failed");
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch {
      setError("Could not reach the server");
      setSubmitting(false);
    }
  }

  async function startGoogleSignup() {
    if (!confirmedAdult) {
      setError("Please confirm you are 18 or older first.");
      return;
    }
    // Drop the attestation cookie before redirecting to Google so the
    // signIn callback can verify the user clicked the checkbox before
    // initiating OAuth. Without this, the callback would have no way
    // to know the attestation happened on the client.
    await fetch('/api/auth/age-gate/attest-adult', { method: 'POST' });
    signIn('google', { callbackUrl });
  }

  if (done) {
    return (
      <>
        <ChromeNav signedIn={false} />
        <Workbench>
          <PlayerCard maxWidth="26rem">
            <TitleBar left="Check Your Inbox" />
            <div
              style={{
                padding: "2rem var(--pad-x) 1.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "1.25rem",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "3rem", lineHeight: 1, color: "var(--orange)" }}>📬</div>
              <h1
                style={{
                  ...TYPE.display,
                  fontSize: "clamp(1.4rem, 4vw, 1.8rem)",
                  color: "var(--cream)",
                  margin: 0,
                }}
              >
                Verify your email
              </h1>
              <p style={{ ...TYPE.body, fontSize: "0.9rem", color: "var(--ink-soft)", lineHeight: 1.5, margin: 0 }}>
                We sent a verification link to <strong style={{ color: "var(--cream)" }}>{email}</strong>. Click it to finish setting up your Passport.
              </p>
              <p style={{ ...TYPE.body, fontSize: "0.85rem", color: "var(--ink-faint)", margin: 0, lineHeight: 1.5 }}>
                Didn&apos;t get it? Check spam, or sign up again to resend.
              </p>
              <a
                href="/login"
                style={{
                  color: "var(--orange)",
                  ...TYPE.body,
                  fontSize: "0.88rem",
                  marginTop: "0.5rem",
                }}
              >
                Back to sign in
              </a>
            </div>
          </PlayerCard>
        </Workbench>
      </>
    );
  }

  return (
    <>
      <ChromeNav signedIn={false} />
      <Workbench>
        <PlayerCard maxWidth="26rem">
          <TitleBar left="Create Passport" />
          <div
            style={{
              padding: "2rem var(--pad-x) 1.5rem",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <h1
                style={{
                  ...TYPE.display,
                  fontSize: "clamp(1.6rem, 5vw, 2rem)",
                  color: "var(--cream)",
                  margin: 0,
                  lineHeight: 1,
                }}
              >
                Create your<br />Passport
              </h1>
              <p style={{ ...TYPE.body, fontSize: "0.9rem", color: "var(--ink-soft)", margin: "0.75rem 0 0", lineHeight: 1.5 }}>
                Your portable gaming profile. Track your collection, find local stores, earn points and badges — all in one place you control.
              </p>
            </div>

            {error && (
              <div
                style={{
                  padding: "0.75rem 0.9rem",
                  background: "rgba(196, 77, 77, 0.08)",
                  border: "1px solid rgba(196, 77, 77, 0.3)",
                  color: "var(--red)",
                  ...TYPE.body,
                  fontSize: "0.82rem",
                }}
              >
                {error}
              </div>
            )}

            {/* 18+ self-attestation. Required to enable both OAuth and
                email/password buttons. Honest under-18 users click the
                "I am under 18" link below to enter the parental-consent
                flow. */}
            <label style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.6rem',
              padding: '0.85rem 1rem',
              background: confirmedAdult ? 'rgba(255, 130, 0, 0.06)' : 'var(--panel-mute)',
              border: `1.5px solid ${confirmedAdult ? 'var(--orange)' : 'var(--rule)'}`,
              cursor: 'pointer',
              ...TYPE.body,
              fontSize: '0.88rem',
              color: 'var(--cream)',
              lineHeight: 1.45,
            }}>
              <input
                type="checkbox"
                checked={confirmedAdult}
                onChange={(e) => setConfirmedAdult(e.target.checked)}
                style={{ marginTop: '0.2rem', accentColor: 'var(--orange)' }}
              />
              <span>
                I confirm I am <strong>18 or older</strong> and agree to the{' '}
                <a href="/terms" style={{ color: 'var(--orange)' }} target="_blank" rel="noopener">Terms</a>{' '}
                and{' '}
                <a href="/privacy" style={{ color: 'var(--orange)' }} target="_blank" rel="noopener">Privacy Policy</a>.
              </span>
            </label>
            <p style={{
              ...TYPE.body,
              fontSize: '0.78rem',
              color: 'var(--ink-faint)',
              textAlign: 'center',
              margin: '-0.5rem 0 0',
              lineHeight: 1.5,
            }}>
              Under 18?{' '}
              <a href="/signup/age" style={{ color: 'var(--orange)' }}>
                We have a different path for you →
              </a>
            </p>

            <button
              onClick={startGoogleSignup}
              disabled={submitting || !confirmedAdult}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.6rem",
                width: "100%",
                padding: "0.9rem 1.25rem",
                background: "var(--panel-mute)",
                border: "1.5px solid var(--rule)",
                color: "var(--cream)",
                ...TYPE.display,
                fontSize: "0.95rem",
                cursor: submitting || !confirmedAdult ? "not-allowed" : "pointer",
                opacity: submitting || !confirmedAdult ? 0.5 : 1,
                transition: "border-color 0.2s ease",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign up with Google
            </button>

            <Divider />

            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <Field
                label="Display name"
                hint="What other players see. You can change this later."
                value={displayName}
                onChange={setDisplayName}
                placeholder="optional"
              />
              <Field
                label="Email"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                type="email"
                required
              />
              <Field
                label="Password"
                value={password}
                onChange={setPassword}
                placeholder="At least 8 characters"
                type="password"
                required
              />

              <button
                type="submit"
                disabled={submitting || !confirmedAdult}
                style={{
                  width: "100%",
                  padding: "0.9rem 1.25rem",
                  background: "var(--orange)",
                  border: "none",
                  color: "var(--void, #1a1a1a)",
                  ...TYPE.display,
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  cursor: submitting || !confirmedAdult ? "not-allowed" : "pointer",
                  opacity: submitting || !confirmedAdult ? 0.6 : 1,
                  marginTop: "0.5rem",
                }}
              >
                {submitting ? "Creating…" : "Create Passport"}
              </button>
            </form>

            <p
              style={{
                ...TYPE.body,
                fontSize: "0.82rem",
                color: "var(--ink-soft)",
                textAlign: "center",
                margin: 0,
              }}
            >
              Already have a Passport?{" "}
              <a href="/login" style={{ color: "var(--orange)" }}>
                Sign in
              </a>
            </p>
            <p
              style={{
                ...TYPE.body,
                fontSize: "0.85rem",
                color: "var(--ink-faint)",
                textAlign: "center",
                margin: 0,
              }}
            >
              <a href="/passport-101" style={{ color: "var(--ink-soft)" }}>
                What is a Passport? →
              </a>
            </p>

          </div>
        </PlayerCard>
      </Workbench>
    </>
  );
}

function Divider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "var(--ink-faint)" }}>
      <div style={{ flex: 1, height: 1, background: "var(--rule)" }} />
      <span style={{ ...TYPE.body, fontSize: "0.7rem", letterSpacing: "0.2em", textTransform: "uppercase" }}>or</span>
      <div style={{ flex: 1, height: 1, background: "var(--rule)" }} />
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
      <span
        style={{
          ...TYPE.body,
          fontSize: "0.85rem",
          color: "var(--ink-soft)",
          fontWeight: 600,
          letterSpacing: "0.04em",
        }}
      >
        {label}
        {required && <span style={{ color: "var(--orange)", marginLeft: 4 }}>*</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={type === "password" ? "new-password" : type === "email" ? "email" : "off"}
        style={{
          width: "100%",
          padding: "0.7rem 0.85rem",
          background: "var(--panel-mute)",
          border: "1.5px solid var(--rule)",
          color: "var(--cream)",
          ...TYPE.body,
          fontSize: "0.95rem",
          outline: "none",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--orange)")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--rule)")}
      />
      {hint && (
        <span style={{ ...TYPE.body, fontSize: "0.82rem", color: "var(--ink-faint)", lineHeight: 1.4 }}>{hint}</span>
      )}
    </label>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <main style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
          <p style={{ color: "var(--orange)" }}>Loading…</p>
        </main>
      }
    >
      <SignupContent />
    </Suspense>
  );
}
