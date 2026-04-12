import type { Metadata } from "next";
import Link from "next/link";
import MarketingNav from "@/components/marketing-nav";
import MarketingFooter from "@/components/marketing-footer";

export const metadata: Metadata = {
  title: "Pricing — Afterroar Store Ops",
  description:
    "Simple, transparent pricing for your game store. No commissions, no contracts.",
};

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

const tiers = [
  {
    name: "Pro",
    price: "$149",
    period: "/mo",
    description: "Everything you need to run a modern FLGS.",
    trial: "30-day free trial",
    cta: "Start Free Trial",
    ctaHref: "/login?new=true",
    highlight: true,
    features: [
      "Unlimited inventory items",
      "Unlimited staff",
      "TCG pricing engine (Scryfall, Pokemon, Yu-Gi-Oh)",
      "Marketplace sync (eBay, CardTrader, Mana Pool)",
      "Events & tournaments",
      "Shipping & fulfillment",
      "Tips & gift cards",
      "Intelligence & smart advisor",
      "Cafe module",
      "Loyalty & store credit",
      "Email support",
    ],
  },
  {
    name: "Enterprise",
    price: "$249",
    period: "/mo",
    description: "Multi-location, full API, and priority support.",
    trial: "30-day free trial",
    cta: "Start Free Trial",
    ctaHref: "/login?new=true",
    highlight: false,
    features: [
      "Everything in Pro",
      "Multi-location (up to 3)",
      "Full API access",
      "Consignment module",
      "Advanced reporting",
      "Priority support + onboarding",
      "Custom integrations",
      "Dedicated account manager",
    ],
  },
];

const faq = [
  {
    q: "Do you take a commission on sales?",
    a: "No. You keep 100% of your revenue. We charge a flat monthly fee — that's it. Stripe charges their standard processing rate for card payments; we add nothing on top.",
  },
  {
    q: "Do I need Shopify?",
    a: "Only if you sell online. Afterroar handles your in-store POS. It integrates with Shopify, WooCommerce, or any online store you already have.",
  },
  {
    q: "What about hardware?",
    a: "Use any tablet with a web browser. We recommend specific scanners and receipt printers — details in our hardware guide.",
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

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <MarketingNav />

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pb-12 pt-16 text-center sm:pt-20">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Simple, transparent pricing
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-[#94a3b8]">
          No commissions. No contracts. No surprises.
        </p>
        <p className="mx-auto mt-2 text-sm text-[#94a3b8]">
          Try free for 30 days. No credit card required during trial.
        </p>
      </section>

      {/* Tier cards */}
      <section className="mx-auto grid max-w-4xl gap-6 px-6 sm:grid-cols-2">
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
            <p className="mt-1 text-xs font-medium text-[#FF8200]">{tier.trial}</p>

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

      {/* Migration */}
      <section className="mx-auto mt-16 max-w-4xl px-6">
        <div className="rounded-2xl border border-[#FF8200]/30 bg-[#FF8200]/5 p-8 text-center sm:p-10">
          <h2 className="text-xl font-bold sm:text-2xl">
            Switching from another POS?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-[#94a3b8]">
            We&rsquo;ll help you move your data. Free migration support for
            BinderPOS, Crystal Commerce, TCGSync, Shopify, Square, and CSV
            imports.
          </p>
          <a
            href="mailto:support@afterroar.store?subject=POS%20Migration%20Help"
            className="mt-6 inline-block rounded-xl bg-[#FF8200] px-8 py-3 text-sm font-semibold transition-colors hover:bg-[#e67400]"
          >
            Get Migration Help
          </a>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">
          Frequently asked questions
        </h2>
        <dl className="mt-12 space-y-5">
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

      <MarketingFooter />
    </div>
  );
}
