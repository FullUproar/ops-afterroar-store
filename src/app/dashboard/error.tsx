"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center space-y-4">
      <h2 className="text-xl font-bold text-white">Something went wrong</h2>
      <p className="max-w-md text-center text-sm text-zinc-400">
        {error.message}
      </p>
      {error.digest && (
        <p className="text-xs text-zinc-600">Digest: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
      >
        Try again
      </button>
    </div>
  );
}
