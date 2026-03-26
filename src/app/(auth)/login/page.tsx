"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [staffName, setStaffName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();

    if (isSignUp) {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      if (data.user) {
        // Create store + staff via API (uses service role)
        const res = await fetch("/api/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: data.user.id,
            storeName,
            staffName: staffName || email.split("@")[0],
          }),
        });

        if (!res.ok) {
          const body = await res.json();
          setError(body.error || "Failed to create store");
          setLoading(false);
          return;
        }
      }

      router.push("/dashboard");
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      router.push("/dashboard");
    }

    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">Afterroar</h1>
          <p className="mt-1 text-sm text-zinc-400">Store Ops</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <>
              <input
                type="text"
                placeholder="Store name"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                required
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
              />
              <input
                type="text"
                placeholder="Your name"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
              />
            </>
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
          />

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "..." : isSignUp ? "Create Store" : "Sign In"}
          </button>
        </form>

        <button
          onClick={() => {
            setIsSignUp(!isSignUp);
            setError("");
          }}
          className="w-full text-center text-sm text-zinc-400 hover:text-white"
        >
          {isSignUp
            ? "Already have an account? Sign in"
            : "New store? Create account"}
        </button>
      </div>
    </div>
  );
}
