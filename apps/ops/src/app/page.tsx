import Link from "next/link";
import MarketingNav from "@/components/marketing-nav";

/* ────────────────────────────────────────────────────────────────
   Afterroar Store Ops — Landing Page (Hero Only)
   Public page. Logged-in users are redirected by middleware.
   ──────────────────────────────────────────────────────────────── */

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a0a] text-white">
      <MarketingNav />

      {/* ─── HERO ─── */}
      <section className="relative flex flex-1 items-center justify-center overflow-hidden">
        {/* animated gradient blob */}
        <div
          className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 opacity-30"
          style={{
            background:
              "radial-gradient(ellipse at center, #FF8200 0%, #7D55C7 40%, transparent 70%)",
            filter: "blur(100px)",
            animation: "pulse 8s ease-in-out infinite alternate",
          }}
        />
        <style>{`@keyframes pulse{0%{opacity:.25;transform:translateX(-50%) scale(1)}100%{opacity:.35;transform:translateX(-50%) scale(1.15)}}`}</style>

        <div className="relative mx-auto max-w-4xl px-6 py-20 text-center">
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl lg:text-7xl">
            One system to rule them all.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#94a3b8] sm:text-xl">
            The operating system for friendly local game stores.
          </p>
          <p className="mt-4 text-sm text-[#4a4a6a] tracking-wide">
            POS &middot; TCG Pricing &middot; Events &middot; Inventory &middot; Marketplace &middot; Cafe &middot; Shipping
          </p>
          <div className="mt-10">
            <Link
              href="/features"
              className="inline-block rounded-xl bg-[#FF8200] px-10 py-4 text-lg font-semibold text-white shadow-lg shadow-[#FF8200]/20 transition-all hover:bg-[#e67400] hover:shadow-[#FF8200]/30"
            >
              See What It Does
            </Link>
          </div>
          <p className="mt-6 text-sm text-[#4a4a6a]">
            Built by game people, for game stores
          </p>
        </div>
      </section>
    </div>
  );
}
