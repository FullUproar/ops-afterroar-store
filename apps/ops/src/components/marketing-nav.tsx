"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
];

export default function MarketingNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-lg">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <img
            src="/logo-ring.png"
            alt="Afterroar"
            className="h-8 w-8 object-contain"
          />
          <span className="text-lg font-bold tracking-tight">
            <span className="text-[#FF8200]">afterroar</span>{" "}
            <span className="text-white">store ops</span>
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-8 text-sm md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`transition-colors hover:text-white ${
                pathname === l.href ? "text-white font-medium" : "text-[#94a3b8]"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="rounded-lg bg-[#FF8200] px-5 py-2 font-medium text-white transition-colors hover:bg-[#e67400]"
          >
            Sign In
          </Link>
        </div>

        {/* Mobile: hamburger + Sign In */}
        <div className="flex items-center gap-3 md:hidden">
          <Link
            href="/login"
            className="rounded-lg bg-[#FF8200] px-4 py-2 text-sm font-medium text-white"
          >
            Sign In
          </Link>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="rounded-lg p-2 text-[#94a3b8] hover:text-white"
            aria-label="Toggle menu"
          >
            {open ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="border-t border-white/5 bg-[#0a0a0a]/95 px-6 py-4 md:hidden">
          <div className="flex flex-col gap-4">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={`text-sm transition-colors hover:text-white ${
                  pathname === l.href ? "text-white font-medium" : "text-[#94a3b8]"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
