"use client";

import { useState, useRef, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const searchParams = useSearchParams();

  // Show NextAuth errors from redirect
  useEffect(() => {
    const authError = searchParams.get("error");
    if (authError) {
      const messages: Record<string, string> = {
        AccessDenied: "Access denied — you need an Afterroar HQ account first.",
        Callback: "Authentication failed. Please try again.",
        OAuthSignin: "Could not start Google sign-in.",
        OAuthCallback: "Google sign-in callback failed.",
        Default: `Auth error: ${authError}`,
      };
      setError(messages[authError] || messages.Default);
    }
  }, [searchParams]);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const storeNameRef = useRef<HTMLInputElement>(null);
  const staffNameRef = useRef<HTMLInputElement>(null);

  async function handleClick() {
    const email = emailRef.current?.value?.trim();
    const password = passwordRef.current?.value;

    if (!email || !password || password.length < 6) {
      setError("Please enter email and password (min 6 chars)");
      return;
    }

    setError("");
    setLoading(true);

    try {
      if (isSignUp) {
        const storeName = storeNameRef.current?.value?.trim();
        const staffName = staffNameRef.current?.value?.trim();

        if (!storeName) {
          setError("Store name is required");
          setLoading(false);
          return;
        }

        // Create account via API
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, storeName, staffName }),
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Sign up failed");
          setLoading(false);
          return;
        }
      }

      // Sign in via NextAuth
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password");
        setLoading(false);
        return;
      }

      window.location.href = "/dashboard";
    } catch (err) {
      setError("Network error: " + (err instanceof Error ? err.message : "unknown"));
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-600 text-2xl font-bold text-white">
          A
        </div>
        <h1 className="text-2xl font-bold text-white">
          {isSignUp ? "Create your store" : "Welcome back"}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {isSignUp
            ? "Set up your game store in seconds"
            : "Sign in to Afterroar Store Ops"}
        </p>
      </div>

      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="space-y-4">
          {isSignUp && (
            <>
              <div>
                <label htmlFor="storeName" className="mb-1 block text-xs font-medium text-zinc-400">Store name</label>
                <input ref={storeNameRef} id="storeName" type="text" placeholder="Full Uproar Games" autoComplete="organization" className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-white placeholder-zinc-500 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label htmlFor="staffName" className="mb-1 block text-xs font-medium text-zinc-400">Your name</label>
                <input ref={staffNameRef} id="staffName" type="text" placeholder="Jane Smith" autoComplete="name" className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-white placeholder-zinc-500 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div className="border-t border-zinc-800" />
            </>
          )}

          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-medium text-zinc-400">Email</label>
            <input ref={emailRef} id="email" type="email" placeholder="you@yourstore.com" autoFocus autoComplete="email" onKeyDown={(e) => e.key === "Enter" && passwordRef.current?.focus()} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-white placeholder-zinc-500 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-medium text-zinc-400">Password</label>
            <div className="relative">
              <input ref={passwordRef} id="password" type={showPassword ? "text" : "password"} placeholder={isSignUp ? "Min 6 characters" : "••••••••"} autoComplete={isSignUp ? "new-password" : "current-password"} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleClick(); } }} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 pr-10 text-sm text-white placeholder-zinc-500 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <button type="button" tabIndex={-1} onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-500 hover:text-zinc-300">
                {showPassword ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-900/50 bg-red-950/50 px-3 py-2 text-sm text-red-400">{error}</div>
          )}

          <button type="button" disabled={loading} onClick={handleClick} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50">
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                {isSignUp ? "Creating store..." : "Signing in..."}
              </>
            ) : isSignUp ? "Create Store" : "Sign In"}
          </button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-800" />
            <span className="text-xs text-zinc-600">or</span>
            <div className="h-px flex-1 bg-zinc-800" />
          </div>

          <button
            type="button"
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Sign in with Google
          </button>
        </div>
      </div>

      <p className="mt-6 text-sm text-zinc-500">
        {isSignUp ? "Already have an account?" : "New store?"}{" "}
        <button type="button" onClick={() => { setIsSignUp(!isSignUp); setError(""); }} className="font-medium text-blue-400 hover:text-blue-300">
          {isSignUp ? "Sign in" : "Create account"}
        </button>
      </p>

      <p className="mt-8 text-xs text-zinc-600">Afterroar Store Ops &mdash; by Full Uproar Games</p>
    </div>
  );
}
