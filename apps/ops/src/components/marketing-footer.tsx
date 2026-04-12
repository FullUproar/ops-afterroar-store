import Link from "next/link";

export default function MarketingFooter() {
  return (
    <footer className="border-t border-[#1a1a2e] py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
        <div className="flex items-center gap-2 text-sm text-[#4a4a6a]">
          <img
            src="/logo-ring.png"
            alt=""
            className="h-5 w-5 object-contain opacity-50"
          />
          Afterroar Store Ops &mdash; by Full Uproar Games
        </div>
        <div className="flex flex-wrap gap-6 text-xs text-[#4a4a6a]">
          <Link href="/pricing" className="hover:text-[#94a3b8]">Pricing</Link>
          <Link href="/support" className="hover:text-[#94a3b8]">Support</Link>
          <Link href="/terms" className="hover:text-[#94a3b8]">Terms</Link>
          <Link href="/privacy" className="hover:text-[#94a3b8]">Privacy</Link>
          <span>&copy; {new Date().getFullYear()} Full Uproar Games</span>
        </div>
      </div>
    </footer>
  );
}
