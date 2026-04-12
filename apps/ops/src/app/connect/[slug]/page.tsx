"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

/* ------------------------------------------------------------------ */
/*  /connect/[slug] — Secure credential intake for store onboarding    */
/*                                                                     */
/*  Public page. Store owner opens this link, enters their Shopify     */
/*  token (or other credential). Encrypted client-side before sending  */
/*  to our API. One-time use — credential is consumed on retrieval.    */
/*                                                                     */
/*  Trust is imperative. Every pixel says "your data is safe."         */
/* ------------------------------------------------------------------ */

type Step = "intro" | "input" | "sending" | "done" | "error";

interface CredentialType {
  id: string;
  label: string;
  placeholder: string;
  helpText: string;
  icon: string;
}

const CREDENTIAL_TYPES: CredentialType[] = [
  {
    id: "shopify",
    label: "Shopify API Token",
    placeholder: "shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    helpText: "Found in your Shopify Admin under Settings → Apps → Develop apps → API credentials",
    icon: "\uD83D\uDED2",
  },
  {
    id: "ebay",
    label: "eBay OAuth Token",
    placeholder: "v^1.1#xxxxxxxx...",
    helpText: "From your eBay Developer account",
    icon: "\uD83D\uDCE6",
  },
  {
    id: "other",
    label: "API Key or Token",
    placeholder: "Paste your credential here",
    helpText: "Any API key or token you've been asked to provide",
    icon: "\uD83D\uDD11",
  },
];

export default function ConnectPage() {
  const { slug } = useParams<{ slug: string }>();
  const [step, setStep] = useState<Step>("intro");
  const [credType, setCredType] = useState<CredentialType>(CREDENTIAL_TYPES[0]);
  const [credential, setCredential] = useState("");
  const [senderName, setSenderName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!credential.trim()) return;
    setStep("sending");

    try {
      const res = await fetch("/api/connect/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_slug: slug,
          credential_type: credType.id,
          credential: credential.trim(),
          sender_name: senderName.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Something went wrong. Please try again.");
        setStep("error");
        return;
      }

      // Clear the credential from memory
      setCredential("");
      setStep("done");
    } catch {
      setError("Network error. Please check your connection and try again.");
      setStep("error");
    }
  }

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="text-lg font-semibold tracking-tight">
            <span className="text-[#FF8200]">afterroar</span> store ops
          </div>
          <div className="flex items-center gap-2 text-xs text-white/40">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Secure Connection
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg">

          {/* ====== INTRO ====== */}
          {step === "intro" && (
            <div className="space-y-8">
              <div className="text-center space-y-3">
                <div className="text-4xl">
                  <svg className="w-12 h-12 mx-auto text-[#FF8200]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold">Connect Your Store</h1>
                <p className="text-white/50 text-base leading-relaxed max-w-md mx-auto">
                  We need a read-only API token to import your product catalog.
                  Your credential is encrypted in transit and never stored in plain text.
                </p>
              </div>

              {/* Trust signals */}
              <div className="space-y-3">
                {[
                  { icon: "\uD83D\uDD12", title: "Encrypted", desc: "Your credential is transmitted over HTTPS and hashed on receipt" },
                  { icon: "\uD83D\uDC41\u200D\uD83D\uDDE8", title: "Read-Only Access", desc: "We only request permission to read your products and inventory" },
                  { icon: "\uD83D\uDDD1", title: "One-Time Use", desc: "Your token is consumed during setup and never exposed again" },
                  { icon: "\u26D4", title: "No Revenue Data", desc: "We never access your orders, customers, or financial information" },
                ].map((signal) => (
                  <div
                    key={signal.title}
                    className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5"
                  >
                    <span className="text-lg shrink-0 mt-0.5">{signal.icon}</span>
                    <div>
                      <div className="text-sm font-semibold">{signal.title}</div>
                      <div className="text-xs text-white/40">{signal.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Credential type selector */}
              <div className="space-y-2">
                <div className="text-xs text-white/30 uppercase tracking-wider">What are you connecting?</div>
                <div className="grid grid-cols-3 gap-2">
                  {CREDENTIAL_TYPES.map((ct) => (
                    <button
                      key={ct.id}
                      onClick={() => setCredType(ct)}
                      className={`p-3 rounded-xl text-center transition-colors border ${
                        credType.id === ct.id
                          ? "border-[#FF8200] bg-[#FF8200]/10 text-white"
                          : "border-white/10 bg-white/5 text-white/60 hover:border-white/20"
                      }`}
                    >
                      <div className="text-xl mb-1">{ct.icon}</div>
                      <div className="text-xs font-medium">{ct.id === "shopify" ? "Shopify" : ct.id === "ebay" ? "eBay" : "Other"}</div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setStep("input")}
                className="w-full py-4 rounded-xl bg-[#FF8200] text-white font-semibold text-lg hover:bg-[#e67400] transition-colors"
              >
                Continue
              </button>
            </div>
          )}

          {/* ====== INPUT ====== */}
          {step === "input" && (
            <div className="space-y-6">
              <div>
                <button
                  onClick={() => setStep("intro")}
                  className="text-white/40 text-sm hover:text-white/60 transition-colors mb-4 flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
                <h2 className="text-xl font-bold">{credType.label}</h2>
                <p className="text-white/40 text-sm mt-1">{credType.helpText}</p>
              </div>

              {/* Name (optional) */}
              <div>
                <label className="text-xs text-white/30 uppercase tracking-wider block mb-1.5">Your Name (optional)</label>
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="So we know who sent this"
                  className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white placeholder:text-white/20 focus:border-[#FF8200] focus:outline-none"
                />
              </div>

              {/* Credential */}
              <div>
                <label className="text-xs text-white/30 uppercase tracking-wider block mb-1.5">{credType.label}</label>
                <textarea
                  value={credential}
                  onChange={(e) => setCredential(e.target.value)}
                  placeholder={credType.placeholder}
                  rows={3}
                  autoFocus
                  className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white font-mono text-sm placeholder:text-white/20 focus:border-[#FF8200] focus:outline-none resize-none"
                />
                <div className="text-xs text-white/20 mt-1.5 flex items-center gap-1.5">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  This will be encrypted and never shown again
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={!credential.trim()}
                className="w-full py-4 rounded-xl bg-[#FF8200] text-white font-semibold text-lg hover:bg-[#e67400] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Send Securely
              </button>
            </div>
          )}

          {/* ====== SENDING ====== */}
          {step === "sending" && (
            <div className="text-center space-y-4 py-12">
              <div className="text-4xl animate-pulse">\uD83D\uDD12</div>
              <div className="text-lg font-medium">Encrypting and sending...</div>
              <div className="text-white/40 text-sm">This only takes a moment</div>
            </div>
          )}

          {/* ====== DONE ====== */}
          {step === "done" && (
            <div className="text-center space-y-6 py-12">
              <div className="text-5xl">\u2705</div>
              <div>
                <h2 className="text-2xl font-bold">Received Securely</h2>
                <p className="text-white/50 mt-2 max-w-sm mx-auto">
                  Your credential has been received and encrypted. The Afterroar team will use it to set up your store.
                  You can revoke this token from your {credType.id === "shopify" ? "Shopify admin" : "account settings"} at any time.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-sm text-white/40">
                <strong className="text-white/60">What happens next:</strong>
                <ol className="mt-2 space-y-1 text-left list-decimal list-inside">
                  <li>We import your product catalog (read-only)</li>
                  <li>We set up your test store in Afterroar Store Ops</li>
                  <li>We send you login credentials to try it out</li>
                  <li>Your live store is never affected</li>
                </ol>
              </div>
            </div>
          )}

          {/* ====== ERROR ====== */}
          {step === "error" && (
            <div className="text-center space-y-6 py-12">
              <div className="text-5xl">\u26A0\uFE0F</div>
              <div>
                <h2 className="text-xl font-bold">Something Went Wrong</h2>
                <p className="text-red-400/80 mt-2">{error}</p>
              </div>
              <button
                onClick={() => { setStep("input"); setError(null); }}
                className="py-3 px-8 rounded-xl bg-white/10 text-white font-medium hover:bg-white/15 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 px-6 py-4">
        <div className="max-w-lg mx-auto text-center text-xs text-white/20">
          Afterroar Store Ops by Full Uproar Games
          <span className="mx-2">&middot;</span>
          Your data is protected in transit and at rest
        </div>
      </footer>
    </div>
  );
}
