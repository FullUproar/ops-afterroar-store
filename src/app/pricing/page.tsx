import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing — Afterroar Store Ops",
  description:
    "Simple, transparent pricing for your game store. No commissions, no contracts.",
};

const tiers = [
  {
    name: "Starter",
    price: "$0",
    period: "/mo",
    description: "Get started with the essentials. No credit card required.",
    cta: "Start Free",
    ctaHref: "/login",
    highlight: false,
    features: [
      "50 inventory items",
      "1 staff member",
      "POS + barcode scanning",
      "Basic reports",
      "Thermal receipt printing",
    ],
  },
  {
    name: "Pro",
    price: "$149",
    period: "/mo",
    description: "Everything you need to run a modern FLGS.",
    cta: "Start Free Trial",
    ctaHref: "/login",
    highlight: true,
    features: [
      "Unlimited items & staff",
      "TCG pricing engine (Scryfall, Pokemon, Yu-Gi-Oh)",
      "Marketplace sync (eBay, CardTrader, Mana Pool)",
      "Events & tournaments",
      "Shipping & fulfillment",
      "Tips & gift cards",
      "Intelligence & AI advisor",
      "Cafe module",
      "Loyalty & store credit",
      "Email support",
    ],
  },
  {
    name: "Enterprise",
    price: "$249",
    period: "/mo",
    description: "For stores that need scale, integrations, and white-glove setup.",
    cta: "Contact Us",
    ctaHref: "/support",
    highlight: false,
    features: [
      "Everything in Pro",
      "Multi-location (up to 3)",
      "API access",
      "Priority support",
      "Custom onboarding",
      "Dedicated account manager",
    ],
  },
];

const addons = [
  {
    name: "Intelligence",
    description: "AI advisor, cash flow insights, dead stock detection",
  },
  {
    name: "TCG Engine",
    description: "Live pricing, buylist automation, sealed EV calculator",
  },
  {
    name: "E-Commerce",
    description: "Marketplace sync, shipping labels, fulfillment queue",
  },
  {
    name: "Cafe",
    description: "Tab system, KDS, QR table ordering, menu builder",
  },
  {
    name: "Multi-Location",
    description: "Up to 3 locations, cross-store transfers, consolidated reports",
  },
  {
    name: "Advanced Reports",
    description: "COGS margins, category breakdowns, CSV exports",
  },
];

const faq = [
  {
    q: "Do you take a commission on sales?",
    a: "No, never. You keep 100% of your revenue. We charge a flat monthly fee — that's it.",
  },
  {
    q: "Do I need Shopify?",
    a: "No. Afterroar is a standalone POS and store management platform. No other software required.",
  },
  {
    q: "Can I import from BinderPOS?",
    a: "Yes. We offer free migration assistance for stores switching from BinderPOS, Crystal Commerce, or any other POS.",
  },
  {
    q: "What payment processor do you use?",
    a: "Stripe. Standard processing rates, no markup from us. Works with Stripe Terminal readers for in-person payments.",
  },
  {
    q: "Is there a contract?",
    a: "No. All plans are month-to-month. Cancel anytime from your dashboard — no phone calls, no hassle.",
  },
];

function CheckIcon() {
  return (
    <svg
      className="mt-0.5 h-4 w-4 shrink-0 text-[#FF8200]"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2.5}
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Nav */}
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
      <section className="mx-auto max-w-5xl px-6 pb-16 pt-12 text-center sm:pt-20">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Simple, transparent pricing
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-[#94a3b8]">
          No commissions. No contracts. No surprises. Just the tools your game
          store needs.
        </p>
      </section>

      {/* Tier cards */}
      <section className="mx-auto grid max-w-6xl gap-6 px-6 sm:grid-cols-3">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`relative flex flex-col rounded-2xl border p-8 ${
              tier.highlight
                ? "border-[#FF8200] bg-[#FF8200]/5"
                : "border-[#2a2a3e] bg-[#1a1a2e]"
            }`}
          >
            {tier.highlight && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#FF8200] px-4 py-0.5 text-xs font-bold uppercase tracking-wider text-white">
                Most Popular
              </span>
            )}
            <h2 className="text-xl font-semibold">{tier.name}</h2>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-bold">{tier.price}</span>
              <span className="text-[#94a3b8]">{tier.period}</span>
            </div>
            <p className="mt-3 text-sm text-[#94a3b8]">{tier.description}</p>

            <ul className="mt-8 flex-1 space-y-3">
              {tier.features.map((f) => (
                <li key={f} className="flex gap-2 text-sm">
                  <CheckIcon />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <Link
              href={tier.ctaHref}
              className={`mt-8 block rounded-xl py-3 text-center text-sm font-semibold transition-colors ${
                tier.highlight
                  ? "bg-[#FF8200] text-white hover:bg-[#e67400]"
                  : "border border-[#2a2a3e] text-[#94a3b8] hover:border-[#FF8200]/50 hover:text-white"
              }`}
            >
              {tier.cta}
            </Link>
          </div>
        ))}
      </section>

      {/* Add-ons */}
      <section className="mx-auto max-w-5xl px-6 py-24">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">
          Add-on modules
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-center text-[#94a3b8]">
          Available on any plan. $29/mo each, or included free with Pro and
          Enterprise.
        </p>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {addons.map((a) => (
            <div
              key={a.name}
              className="rounded-xl border border-[#2a2a3e] bg-[#1a1a2e] p-6"
            >
              <h3 className="font-semibold">{a.name}</h3>
              <p className="mt-1.5 text-sm text-[#94a3b8]">{a.description}</p>
              <p className="mt-3 text-sm font-medium text-[#FF8200]">$29/mo</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-6 pb-24">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">
          Frequently asked questions
        </h2>
        <dl className="mt-12 space-y-6">
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

      {/* Footer */}
      <footer className="border-t border-[#2a2a3e] px-6 py-10 text-center text-xs text-[#4a4a6a]">
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link href="/terms" className="hover:text-[#94a3b8]">Terms</Link>
          <Link href="/privacy" className="hover:text-[#94a3b8]">Privacy</Link>
          <Link href="/support" className="hover:text-[#94a3b8]">Support</Link>
        </div>
        <p className="mt-4">
          Afterroar Store Ops &mdash; by Full Uproar Games
        </p>
      </footer>
    </div>
  );
}
