import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Support — Afterroar Store Ops",
  description:
    "Get help with Afterroar Store Ops. Browse our help center, email support, or schedule a call.",
};

const channels = [
  {
    title: "Help Center",
    description:
      "Browse 50+ articles covering every feature — from first sale to advanced TCG pricing.",
    action: "Browse Articles",
    href: "/dashboard/help",
    icon: (
      <svg className="h-8 w-8 text-[#FF8200]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    ),
  },
  {
    title: "Email Support",
    description:
      "Send us an email and we'll get back to you within one business day. Pro and Enterprise get priority.",
    action: "support@afterroar.store",
    href: "mailto:support@afterroar.store",
    icon: (
      <svg className="h-8 w-8 text-[#FF8200]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
    ),
  },
  {
    title: "Schedule a Call",
    description:
      "Book a 30-minute call with our team. Great for onboarding, migration help, or feature walkthroughs.",
    action: "Book a Time",
    href: "#",
    icon: (
      <svg className="h-8 w-8 text-[#FF8200]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
  },
];

const faq = [
  {
    q: "How do I connect my barcode scanner?",
    a: "Any USB or Bluetooth HID barcode scanner works out of the box. Just plug it in and start scanning -- no driver installation needed.",
  },
  {
    q: "How do I set up Stripe Terminal?",
    a: "Go to Dashboard > Settings > Payment, enter your Stripe keys, then register your S710 reader. The setup wizard walks you through every step.",
  },
  {
    q: "Can I use Afterroar on a tablet?",
    a: "Yes. Afterroar is optimized for Samsung Galaxy Tab and iPad. Register Mode provides a full-screen touch-first POS experience.",
  },
  {
    q: "How do I import my existing inventory?",
    a: "Go to Dashboard > Inventory > Import. We support CSV files from TCGPlayer, Moxfield, BinderPOS, and Crystal Commerce. Contact us for free migration help.",
  },
  {
    q: "What happens to my data if I cancel?",
    a: "Your data stays available for export for 30 days after cancellation. After that, it is permanently deleted. We never hold your data hostage.",
  },
];

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <nav className="flex items-center justify-between px-6 py-5 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/logo-ring.png" alt="" className="h-8 w-8" />
          <span className="text-lg font-semibold tracking-tight">Afterroar</span>
        </Link>
        <Link
          href="/login"
          className="rounded-lg bg-[#FF8200] px-5 py-2 text-sm font-medium transition-colors hover:bg-[#e67400]"
        >
          Sign In
        </Link>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pb-16 pt-12 text-center sm:pt-20">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          How can we help?
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-[#94a3b8]">
          We&apos;re here to make sure your store runs smoothly. Reach out anytime.
        </p>
      </section>

      {/* Support channels */}
      <section className="mx-auto grid max-w-4xl gap-6 px-6 sm:grid-cols-3">
        {channels.map((ch) => (
          <a
            key={ch.title}
            href={ch.href}
            className="group flex flex-col rounded-2xl border border-[#2a2a3e] bg-[#1a1a2e] p-8 transition-colors hover:border-[#FF8200]/50"
          >
            <div className="mb-4">{ch.icon}</div>
            <h2 className="text-lg font-semibold">{ch.title}</h2>
            <p className="mt-2 flex-1 text-sm text-[#94a3b8]">{ch.description}</p>
            <span className="mt-5 text-sm font-medium text-[#FF8200] group-hover:underline">
              {ch.action}
            </span>
          </a>
        ))}
      </section>

      {/* Migration callout */}
      <section className="mx-auto mt-16 max-w-4xl px-6">
        <div className="rounded-2xl border border-[#FF8200]/30 bg-[#FF8200]/5 p-8 text-center sm:p-10">
          <h2 className="text-xl font-bold sm:text-2xl">
            Migrating from another POS?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-[#94a3b8]">
            Switching from BinderPOS, Crystal Commerce, or TCGPlayer? We&apos;ll help you
            import everything — inventory, customers, and transaction history — completely
            free.
          </p>
          <a
            href="mailto:support@afterroar.store?subject=POS%20Migration%20Help"
            className="mt-6 inline-block rounded-xl bg-[#FF8200] px-8 py-3 text-sm font-semibold transition-colors hover:bg-[#e67400]"
          >
            Get Migration Help
          </a>
        </div>
      </section>

      {/* Status */}
      <section className="mx-auto mt-12 max-w-4xl px-6 text-center">
        <p className="text-sm text-[#94a3b8]">
          System status:{" "}
          <a href="#" className="text-[#4ade80] hover:underline">
            All systems operational
          </a>
        </p>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">
          Common questions
        </h2>
        <dl className="mt-10 space-y-5">
          {faq.map((item) => (
            <div
              key={item.q}
              className="rounded-xl border border-[#2a2a3e] bg-[#1a1a2e] p-6"
            >
              <dt className="font-semibold">{item.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-[#94a3b8]">
                {item.a}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="border-t border-[#2a2a3e] px-6 py-10 text-center text-xs text-[#4a4a6a]">
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link href="/pricing" className="hover:text-[#94a3b8]">Pricing</Link>
          <Link href="/terms" className="hover:text-[#94a3b8]">Terms</Link>
          <Link href="/privacy" className="hover:text-[#94a3b8]">Privacy</Link>
        </div>
        <p className="mt-4">Afterroar Store Ops &mdash; by Full Uproar Games</p>
      </footer>
    </div>
  );
}
