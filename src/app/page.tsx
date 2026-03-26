import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 text-white">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl bg-blue-600 text-3xl font-bold">
        A
      </div>
      <h1 className="text-5xl font-bold tracking-tight sm:text-7xl">
        Afterroar
      </h1>
      <p className="mt-4 max-w-md text-center text-lg text-zinc-400 sm:text-xl">
        The POS platform built for friendly local game stores
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/login"
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          Sign In
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-zinc-700 px-6 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
        >
          Create Store
        </Link>
      </div>
      <p className="mt-12 text-xs text-zinc-600">
        Retail + TCG Singles + Events + Cafe &mdash; one system
      </p>
    </div>
  );
}
