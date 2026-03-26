"use client";

import { useState, useTransition } from "react";
import { signIn, signUp } from "./actions";

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = isSignUp
        ? await signUp(formData)
        : await signIn(formData);

      if (result?.error) {
        setError(result.error);
      }
      // On success, server action redirects — no client handling needed
    });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4">
      {/* Logo / brand */}
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

      {/* Form card */}
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <form action={handleSubmit} className="space-y-4">
          {isSignUp && (
            <>
              <div>
                <label
                  htmlFor="storeName"
                  className="mb-1 block text-xs font-medium text-zinc-400"
                >
                  Store name
                </label>
                <input
                  id="storeName"
                  name="storeName"
                  type="text"
                  placeholder="Full Uproar Games"
                  required={isSignUp}
                  autoComplete="organization"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-white placeholder-zinc-500 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label
                  htmlFor="staffName"
                  className="mb-1 block text-xs font-medium text-zinc-400"
                >
                  Your name
                </label>
                <input
                  id="staffName"
                  name="staffName"
                  type="text"
                  placeholder="Jane Smith"
                  autoComplete="name"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-white placeholder-zinc-500 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="border-t border-zinc-800" />
            </>
          )}

          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-xs font-medium text-zinc-400"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@yourstore.com"
              required
              autoFocus
              autoComplete="email"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-white placeholder-zinc-500 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-xs font-medium text-zinc-400"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder={isSignUp ? "Min 6 characters" : "••••••••"}
                required
                minLength={6}
                autoComplete={isSignUp ? "new-password" : "current-password"}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 pr-10 text-sm text-white placeholder-zinc-500 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-500 hover:text-zinc-300"
              >
                {showPassword ? (
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-900/50 bg-red-950/50 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50"
          >
            {isPending ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                {isSignUp ? "Creating store..." : "Signing in..."}
              </>
            ) : isSignUp ? (
              "Create Store"
            ) : (
              "Sign In"
            )}
          </button>
        </form>
      </div>

      {/* Toggle sign up / sign in */}
      <p className="mt-6 text-sm text-zinc-500">
        {isSignUp ? "Already have an account?" : "New store?"}{" "}
        <button
          type="button"
          onClick={() => {
            setIsSignUp(!isSignUp);
            setError("");
          }}
          className="font-medium text-blue-400 hover:text-blue-300"
        >
          {isSignUp ? "Sign in" : "Create account"}
        </button>
      </p>

      {/* Footer */}
      <p className="mt-8 text-xs text-zinc-600">
        Built for friendly local game stores
      </p>
    </div>
  );
}
