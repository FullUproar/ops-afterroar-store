import Link from "next/link";

/* ────────────────────────────────────────────────────────────────
   Afterroar Store Ops — Marketing Landing Page
   Public page. Logged-in users are redirected by middleware.
   ──────────────────────────────────────────────────────────────── */

// ---------- tiny reusable pieces ----------

function SectionTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-4 inline-block rounded-full border border-[#FF8200]/30 bg-[#FF8200]/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-[#FF8200]">
      {children}
    </span>
  );
}

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

function PricingCard({
  tier,
  price,
  tagline,
  features,
  cta,
  highlight,
}: {
  tier: string;
  price: string;
  tagline: string;
  features: string[];
  cta: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-8 ${
        highlight
          ? "border-[#FF8200] bg-[#FF8200]/5 shadow-[0_0_40px_rgba(255,130,0,0.08)]"
          : "border-[#2a2a3e] bg-[#111128]/60"
      }`}
    >
      {highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#FF8200] px-4 py-0.5 text-xs font-bold text-white">
          Most Popular
        </span>
      )}
      <h3 className="text-xl font-bold text-white">{tier}</h3>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-4xl font-extrabold text-white">{price}</span>
        {price !== "$0" && (
          <span className="text-sm text-[#94a3b8]">/month</span>
        )}
      </div>
      <p className="mt-2 text-sm text-[#94a3b8]">{tagline}</p>
      <ul className="mt-6 flex-1 space-y-3">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-[#c8d0dc]">
            <span className="mt-0.5 text-[#FF8200]">&#10003;</span>
            {f}
          </li>
        ))}
      </ul>
      <Link
        href="/login"
        className={`mt-8 block rounded-xl py-3 text-center text-sm font-semibold transition-colors ${
          highlight
            ? "bg-[#FF8200] text-white hover:bg-[#e67400]"
            : "border border-[#2a2a3e] text-[#94a3b8] hover:border-[#FF8200]/50 hover:text-white"
        }`}
      >
        {cta}
      </Link>
    </div>
  );
}

function CompareCheck() {
  return <span className="text-[#FF8200]">&#10003;</span>;
}
function CompareDash() {
  return <span className="text-[#4a4a6a]">&mdash;</span>;
}

// ---------- main page ----------

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* ─── NAV ─── */}
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <img
              src="/logo-ring.png"
              alt="Afterroar"
              className="h-8 w-8 object-contain"
            />
            <span className="text-lg font-bold tracking-tight">
              Afterroar
            </span>
          </Link>

          <div className="hidden items-center gap-8 text-sm text-[#94a3b8] md:flex">
            <a href="#features" className="transition-colors hover:text-white">
              Features
            </a>
            <a href="#pricing" className="transition-colors hover:text-white">
              Pricing
            </a>
            <a href="#compare" className="transition-colors hover:text-white">
              Compare
            </a>
            <Link
              href="/login"
              className="rounded-lg bg-[#FF8200] px-5 py-2 font-medium text-white transition-colors hover:bg-[#e67400]"
            >
              Sign In
            </Link>
          </div>

          {/* mobile burger — just Sign In on small screens */}
          <Link
            href="/login"
            className="rounded-lg bg-[#FF8200] px-4 py-2 text-sm font-medium text-white md:hidden"
          >
            Sign In
          </Link>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="relative overflow-hidden">
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

        <div className="relative mx-auto max-w-4xl px-6 pb-24 pt-28 text-center sm:pt-36">
          <SectionTag>Now in Early Access</SectionTag>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl lg:text-7xl">
            One Platform.
            <br />
            Every Card. Every Sale.
            <br />
            <span className="text-[#FF8200]">Every Event.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#94a3b8] sm:text-xl">
            The operating system built for game stores &mdash; not adapted from
            generic retail. POS, TCG pricing, tournaments, cafe, marketplace
            sync, and more. All in one place.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/login"
              className="w-full rounded-xl bg-[#FF8200] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#FF8200]/20 transition-all hover:bg-[#e67400] hover:shadow-[#FF8200]/30 sm:w-auto"
            >
              Start Free
            </Link>
            <a
              href="#features"
              className="w-full rounded-xl border border-[#2a2a3e] px-8 py-3.5 text-base font-medium text-[#94a3b8] transition-colors hover:border-[#FF8200]/50 hover:text-white sm:w-auto"
            >
              See It In Action &darr;
            </a>
          </div>
          <p className="mt-6 text-xs text-[#4a4a6a]">
            No credit card required &middot; 50 items free forever
          </p>
        </div>
      </section>

      {/* ─── PROBLEM ─── */}
      <section className="border-t border-[#1a1a2e] bg-[#060614] py-24">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">
            You&rsquo;re running 4&nbsp;tools that don&rsquo;t talk to each
            other
          </h2>
          <div className="mt-14 grid gap-8 sm:grid-cols-3">
            {[
              {
                icon: "🚫",
                title: "Legacy is dead",
                desc: "BinderPOS paused signups. Crystal Commerce hasn't shipped a feature in years. The FLGS POS market is stuck.",
              },
              {
                icon: "🃏",
                title: "Shopify doesn't get singles",
                desc: "Conditions, buylist pricing, sealed EV, TCG market sync — none of that exists in generic retail software.",
              },
              {
                icon: "📱",
                title: "One app per task",
                desc: "Square for payments, Excel for buylist, Google Forms for events, texts for scheduling. Your staff hates it too.",
              },
            ].map((p) => (
              <div
                key={p.title}
                className="rounded-2xl border border-[#2a2a3e] bg-[#0a0a1a] p-8 text-left"
              >
                <div className="mb-4 text-3xl">{p.icon}</div>
                <h3 className="mb-2 text-lg font-bold text-white">{p.title}</h3>
                <p className="text-sm leading-relaxed text-[#94a3b8]">
                  {p.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section id="features" className="scroll-mt-20 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <SectionTag>Features</SectionTag>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">
              Everything your store needs. Nothing it doesn&rsquo;t.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[#94a3b8]">
              Built by people who&rsquo;ve worked the counter, run FNM, and
              counted singles at 1 AM. Every feature earns its place.
            </p>
          </div>

          <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon="💳"
              title="POS & Register"
              desc="Touch-first register, USB/Bluetooth barcode scanning, Stripe Terminal card reader, cash drawer, receipt printing. Runs on a tablet or any browser."
            />
            <FeatureCard
              icon="🎴"
              title="TCG Engine"
              desc="Live market pricing from Scryfall, Pokemon TCG, and YGOPRODeck. Condition grading, buylist auto-generation, sealed EV calculator, one-click repricing."
            />
            <FeatureCard
              icon="📋"
              title="Deck Builder"
              desc="Embeddable deck builder widget for your website. Customers build decks from YOUR inventory — before they walk in. Meta decklists, smart substitutions."
            />
            <FeatureCard
              icon="🏆"
              title="Events & Tournaments"
              desc="Swiss pairing, single elimination, OMW% tiebreakers, round management, ticket tiers, and prize payouts as store credit. Ready for FNM and league night."
            />
            <FeatureCard
              icon="🌐"
              title="Marketplace Sync"
              desc="Push inventory to eBay, CardTrader, and Mana Pool. Pull orders back in automatically. Generic API for any e-commerce site. Bidirectional, real-time."
            />
            <FeatureCard
              icon="📦"
              title="Shipping & Fulfillment"
              desc="ShipStation integration, rate shopping, label creation, pick/pack/ship queue, pull sheets. Transactional emails for order confirmation and tracking."
            />
            <FeatureCard
              icon="☕"
              title="Cafe & Food"
              desc="Tab system, menu builder with modifiers, kitchen display, QR table ordering, hourly table fees, age verification. F&B and retail on one receipt."
            />
            <FeatureCard
              icon="👥"
              title="Employee Tools"
              desc="Mobile timeclock with GPS, PIN auth, mobile register for phones, 30+ configurable permissions, training mode. No separate HR app needed."
            />
            <FeatureCard
              icon="🧠"
              title="Intelligence"
              desc="Smart store advisor, cash flow runway, margin reports, dead stock alerts, price spike detection, WPN metrics. Speaks FLGS, not MBA."
            />
            <FeatureCard
              icon="⭐"
              title="Loyalty & Network"
              desc="Points on purchases, events, and trade-ins. Tiered credit bonuses, cross-store Afterroar Passport, retroactive claim. Customers keep coming back."
            />
            <FeatureCard
              icon="🔄"
              title="Trade-Ins & Returns"
              desc="Market-driven trade-in pricing, condition grading, store credit payouts, return processing with loyalty point reversal, frequent returner flagging."
            />
            <FeatureCard
              icon="🎁"
              title="Gift Cards & Consignment"
              desc="Digital gift cards with email delivery, consignment intake with commission tracking, and a full ledger system for every dollar in and out."
            />
          </div>
        </div>
      </section>

      {/* ─── DECK BUILDER CALLOUT ─── */}
      <section className="border-t border-[#1a1a2e] bg-[#060614] py-24">
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

      {/* ─── PRICING ─── */}
      <section id="pricing" className="scroll-mt-20 py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <SectionTag>Pricing</SectionTag>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">
              No commissions. No hidden fees. No Shopify required.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[#94a3b8]">
              Switching from BinderPOS? We&rsquo;ll import your data for free.
            </p>
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            <PricingCard
              tier="Starter"
              price="$0"
              tagline="Try everything. No credit card required."
              features={[
                "Full POS & register",
                "TCG pricing engine",
                "Up to 50 inventory items",
                "1 staff member",
                "Events & tournaments",
                "Community support",
              ]}
              cta="Start Free"
            />
            <PricingCard
              tier="Pro"
              price="$149"
              tagline="Everything you need to run the store."
              highlight
              features={[
                "Unlimited inventory items",
                "Unlimited staff",
                "Marketplace sync (eBay + more)",
                "Shipping & fulfillment",
                "Intelligence & smart advisor",
                "Loyalty & customer tools",
                "Cafe & food service",
                "Priority email support",
              ]}
              cta="Start Free Trial"
            />
            <PricingCard
              tier="Enterprise"
              price="$249"
              tagline="Multi-location, full API, white glove."
              features={[
                "Everything in Pro",
                "Up to 3 locations",
                "Full API access",
                "Consignment module",
                "Advanced reporting",
                "Priority support + onboarding",
                "Custom integrations",
              ]}
              cta="Contact Us"
            />
          </div>

          <p className="mt-8 text-center text-sm text-[#4a4a6a]">
            All plans include: Stripe payments (their fees, not ours), thermal
            receipt printing, barcode scanning, and free data import.
          </p>
        </div>
      </section>

      {/* ─── COMPARISON TABLE ─── */}
      <section
        id="compare"
        className="scroll-mt-20 border-t border-[#1a1a2e] bg-[#060614] py-24"
      >
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <SectionTag>Compare</SectionTag>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">
              What other POS systems are missing
            </h2>
          </div>

          <div className="mt-14 overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#2a2a3e] text-[#94a3b8]">
                  <th className="pb-4 pr-6 font-medium">Feature</th>
                  <th className="pb-4 pr-6 font-bold text-[#FF8200]">
                    Afterroar
                  </th>
                  <th className="pb-4 pr-6 font-medium">BinderPOS</th>
                  <th className="pb-4 pr-6 font-medium">ShadowPOS</th>
                  <th className="pb-4 font-medium">Shopify + Square</th>
                </tr>
              </thead>
              <tbody className="text-[#c8d0dc]">
                {[
                  ["TCG live pricing (MTG + Pokemon + Yu-Gi-Oh)", true, true, true, false],
                  ["Swiss tournament pairing", true, false, true, false],
                  ["Embeddable deck builder", true, false, false, false],
                  ["Cafe / food service tabs", true, false, false, false],
                  ["Mobile employee timeclock", true, false, false, false],
                  ["Smart business advisor", true, false, false, false],
                  ["eBay + marketplace sync", true, true, true, false],
                  ["Shipping & fulfillment", true, false, false, true],
                  ["Built-in loyalty program", true, true, false, false],
                  ["30+ granular permissions", true, false, false, false],
                  ["QR table ordering", true, false, false, false],
                  ["No commission on sales", true, false, true, false],
                  ["Free tier available", true, false, false, false],
                ].map((row) => (
                  <tr
                    key={row[0] as string}
                    className="border-b border-[#1a1a2e]"
                  >
                    <td className="py-3 pr-6">{row[0] as string}</td>
                    <td className="py-3 pr-6">
                      {row[1] ? <CompareCheck /> : <CompareDash />}
                    </td>
                    <td className="py-3 pr-6">
                      {row[2] ? <CompareCheck /> : <CompareDash />}
                    </td>
                    <td className="py-3 pr-6">
                      {row[3] ? <CompareCheck /> : <CompareDash />}
                    </td>
                    <td className="py-3">
                      {row[4] ? <CompareCheck /> : <CompareDash />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ─── CTA FOOTER ─── */}
      <section className="py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">
            Ready to run your store on{" "}
            <span className="text-[#FF8200]">one platform</span>?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[#94a3b8]">
            Stop duct-taping tools together. Start with 50 free items, no credit
            card, no commitment. Upgrade when you&rsquo;re ready.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/login"
              className="w-full rounded-xl bg-[#FF8200] px-10 py-4 text-base font-semibold text-white shadow-lg shadow-[#FF8200]/20 transition-all hover:bg-[#e67400] hover:shadow-[#FF8200]/30 sm:w-auto"
            >
              Start Free Today
            </Link>
          </div>
          <p className="mt-8 text-sm text-[#4a4a6a]">
            Questions?{" "}
            <a
              href="mailto:hello@afterroar.store"
              className="text-[#94a3b8] underline transition-colors hover:text-white"
            >
              hello@afterroar.store
            </a>
          </p>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
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
    </div>
  );
}
