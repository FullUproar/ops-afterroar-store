import type { Metadata } from "next";
import Link from "next/link";
import MarketingNav from "@/components/marketing-nav";
import MarketingFooter from "@/components/marketing-footer";

export const metadata: Metadata = {
  title: "Features — Afterroar Store Ops",
  description:
    "POS, TCG pricing, tournaments, cafe, marketplace sync, and more — built for game stores from day one.",
};

/* ── tiny helpers ── */

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="group rounded-2xl border border-[#2a2a3e] bg-[#111128]/60 p-6 transition-all hover:border-[#FF8200]/40 hover:bg-[#16163a]">
      <div className="mb-3 text-3xl">{icon}</div>
      <h3 className="mb-2 text-lg font-bold text-white">{title}</h3>
      <p className="text-sm leading-relaxed text-[#94a3b8]">{desc}</p>
    </div>
  );
}

function SectionTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-4 inline-block rounded-full border border-[#FF8200]/30 bg-[#FF8200]/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-[#FF8200]">
      {children}
    </span>
  );
}

function DifferentiatorCard({
  title,
  desc,
}: {
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-[#2a2a3e] bg-[#0a0a1a] p-6">
      <h3 className="mb-2 font-bold text-white">{title}</h3>
      <p className="text-sm leading-relaxed text-[#94a3b8]">{desc}</p>
    </div>
  );
}

/* ── page ── */

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <MarketingNav />

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-8 pt-16 text-center sm:pt-20">
        <SectionTag>Features</SectionTag>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl">
          Everything your store needs. Nothing it doesn&rsquo;t.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[#94a3b8]">
          Built by people who&rsquo;ve worked the counter, run FNM, and
          counted singles at 1 AM. Every feature earns its place.
        </p>
      </section>

      {/* Feature grid */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-8">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon="&#x1F4B3;"
            title="POS & Register"
            desc="Touch-first register, USB/Bluetooth barcode scanning, Stripe Terminal card reader, cash drawer, receipt printing. Runs on a tablet or any browser."
          />
          <FeatureCard
            icon="&#x1F0CF;"
            title="TCG Engine"
            desc="Live market pricing from Scryfall, Pokemon TCG, and YGOPRODeck. Condition grading, buylist auto-generation, sealed EV calculator, one-click repricing."
          />
          <FeatureCard
            icon="&#x1F4CB;"
            title="Deck Builder"
            desc="Embeddable deck builder widget for your website. Customers build decks from YOUR inventory — before they walk in. Meta decklists, smart substitutions."
          />
          <FeatureCard
            icon="&#x1F3C6;"
            title="Events & Tournaments"
            desc="Swiss pairing, single elimination, OMW% tiebreakers, round management, ticket tiers, and prize payouts as store credit. Ready for FNM and league night."
          />
          <FeatureCard
            icon="&#x1F310;"
            title="Marketplace Sync"
            desc="Push inventory to eBay, CardTrader, and Mana Pool. Pull orders back in automatically. Generic API for any e-commerce site. Bidirectional, real-time."
          />
          <FeatureCard
            icon="&#x1F4E6;"
            title="Shipping & Fulfillment"
            desc="ShipStation integration, rate shopping, label creation, pick/pack/ship queue, pull sheets. Transactional emails for order confirmation and tracking."
          />
          <FeatureCard
            icon="&#x2615;"
            title="Cafe & Food"
            desc="Tab system, menu builder with modifiers, kitchen display, QR table ordering, hourly table fees, age verification. F&B and retail on one receipt."
          />
          <FeatureCard
            icon="&#x1F465;"
            title="Employee Tools"
            desc="Mobile timeclock with GPS, PIN auth, mobile register for phones, 30+ configurable permissions, training mode. No separate HR app needed."
          />
          <FeatureCard
            icon="&#x1F9E0;"
            title="Intelligence"
            desc="Smart store advisor, cash flow runway, margin reports, dead stock alerts, price spike detection, WPN metrics. Speaks FLGS, not MBA."
          />
          <FeatureCard
            icon="&#x2B50;"
            title="Loyalty & Network"
            desc="Points on purchases, events, and trade-ins. Tiered credit bonuses, cross-store Afterroar Passport, retroactive claim. Customers keep coming back."
          />
          <FeatureCard
            icon="&#x1F504;"
            title="Trade-Ins & Returns"
            desc="Market-driven trade-in pricing, condition grading, store credit payouts, return processing with loyalty point reversal, frequent returner flagging."
          />
          <FeatureCard
            icon="&#x1F381;"
            title="Gift Cards & Consignment"
            desc="Digital gift cards with email delivery, consignment intake with commission tracking, and a full ledger system for every dollar in and out."
          />
        </div>
      </section>

      {/* What makes us different */}
      <section className="border-t border-[#1a1a2e] bg-[#060614] py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <SectionTag>Why Afterroar</SectionTag>
            <h2 className="mt-2 text-2xl font-bold sm:text-4xl">
              What makes us different
            </h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <DifferentiatorCard
              title="One platform, not four tools duct-taped together"
              desc="POS, TCG pricing, events, cafe, marketplace, shipping, loyalty, employee tools — all in one system that actually shares data between features."
            />
            <DifferentiatorCard
              title="Built for game stores from day one"
              desc="Not adapted from generic retail. Every screen, every workflow, every report is designed for how FLGS owners actually run their stores."
            />
            <DifferentiatorCard
              title="Employee tools no other TCG platform offers"
              desc="Mobile timeclock, GPS check-in, PIN-based mobile register, 30+ granular permissions, training mode. Your staff gets real tools, not workarounds."
            />
            <DifferentiatorCard
              title="Your data, your store, cancel anytime"
              desc="Month-to-month. No contracts. Export your data anytime. We never hold your data hostage or charge to leave."
            />
            <DifferentiatorCard
              title="Integrates with your online store"
              desc="Works with Shopify, WooCommerce, or any custom e-commerce site. Push inventory out, pull orders in. Your online and in-store sales stay in sync."
            />
            <DifferentiatorCard
              title="No commissions on your sales"
              desc="Flat monthly fee. We don't take a percentage of your revenue. Stripe charges their standard processing rate — we add nothing on top."
            />
          </div>
        </div>
      </section>

      {/* Deck builder callout */}
      <section className="border-t border-[#1a1a2e] py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <SectionTag>Embed on Your Site</SectionTag>
              <h2 className="mt-2 text-3xl font-bold sm:text-4xl">
                Give your customers a deck builder on{" "}
                <span className="text-[#FF8200]">YOUR</span> website
              </h2>
              <p className="mt-4 leading-relaxed text-[#94a3b8]">
                Your customers build decks from your live inventory &mdash;
                before they walk in the door. Works on any website with a single
                line of code. Shopify, WordPress, Wix, whatever.
              </p>
              <p className="mt-4 text-sm text-[#7D55C7]">
                Powered by the Afterroar Network
              </p>
            </div>
            <div className="rounded-xl border border-[#2a2a3e] bg-[#0a0a1a] p-6">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[#4a4a6a]">
                Add to your website
              </p>
              <pre className="overflow-x-auto rounded-lg bg-[#0d0d20] p-4 text-sm leading-relaxed text-[#c8d0dc]">
                <code>{`<iframe
  src="https://afterroar.store
    /deck-builder/YOUR-STORE"
  width="100%"
  height="800"
  frameborder="0"
/>`}</code>
              </pre>
              <p className="mt-4 text-xs text-[#94a3b8]">
                Customers see real-time stock, prices, and can request cards they
                want to pick up.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-[#1a1a2e] bg-[#060614] py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">
            Ready to try it?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[#94a3b8]">
            30-day free trial. No credit card required. Set up your store in
            minutes.
          </p>
          <div className="mt-8">
            <Link
              href="/login?new=true"
              className="inline-block rounded-xl bg-[#FF8200] px-10 py-4 text-base font-semibold text-white shadow-lg shadow-[#FF8200]/20 transition-all hover:bg-[#e67400] hover:shadow-[#FF8200]/30"
            >
              Get Started
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
