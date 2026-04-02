"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, SessionProvider } from "next-auth/react";

/* ------------------------------------------------------------------ */
/*  Store Setup — for users who signed in but don't have a store yet   */
/*  This happens when someone signs up with Google OAuth.              */
/* ------------------------------------------------------------------ */

export default function SetupPage() {
  return <SessionProvider><SetupContent /></SessionProvider>;
}

function SetupContent() {
  const router = useRouter();
  const { data: session } = useSession();
  const [storeName, setStoreName] = useState("");
  const [ownerName, setOwnerName] = useState(session?.user?.name || "");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!storeName.trim()) {
      setError("Store name is required");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/store/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_name: storeName.trim(),
          owner_name: ownerName.trim() || session?.user?.name || "Owner",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create store");
        setCreating(false);
        return;
      }

      // Store created — go to onboarding
      router.push("/dashboard/onboarding");
      router.refresh();
    } catch {
      setError("Connection error. Please try again.");
      setCreating(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/logo-ring.png"
            alt="Afterroar"
            className="mx-auto mb-4 h-16 w-16 object-contain"
          />
          <h1 className="text-2xl font-bold text-white">
            Create Your Store
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Welcome to Afterroar Store Ops. Let&apos;s set up your game store.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-5">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Store Name
            </label>
            <input
              type="text"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              placeholder="Full Uproar Games"
              autoFocus
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-base text-white placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Your Name
            </label>
            <input
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              placeholder="Jane Smith"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-base text-white placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-900/50 bg-red-950/50 px-4 py-2.5 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            onClick={handleCreate}
            disabled={creating || !storeName.trim()}
            className="w-full rounded-xl bg-blue-600 py-3 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {creating ? "Creating your store..." : "Create Store"}
          </button>

          <p className="text-center text-xs text-zinc-600">
            You can change your store name anytime in Settings.
          </p>
        </div>
      </div>
    </div>
  );
}
