import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — Afterroar Store Ops",
  description: "Terms of service for Afterroar Store Ops by Full Uproar Games.",
};

export default function TermsPage() {
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

      <article className="mx-auto max-w-3xl px-6 pb-24 pt-12">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-[#94a3b8]">
          Last updated: April 2026
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-[#cbd5e1]">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">1. Service Description</h2>
            <p>
              Afterroar Store Ops (&quot;the Service&quot;) is a point-of-sale and store management
              platform operated by Full Uproar Games LLC (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;). The Service
              provides inventory management, transaction processing, customer relationship
              tools, event management, and related functionality for friendly local game
              stores (&quot;FLGS&quot;).
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">2. Account Responsibilities</h2>
            <p>
              You are responsible for maintaining the security of your account credentials,
              including staff PINs and access codes. You must be at least 18 years old to
              create an account. You are responsible for all activity that occurs under your
              account and for ensuring that your use of the Service complies with applicable
              laws.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">3. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Use the Service for any unlawful purpose</li>
              <li>Attempt to gain unauthorized access to any part of the Service</li>
              <li>Interfere with or disrupt the Service or its infrastructure</li>
              <li>Reverse-engineer, decompile, or disassemble any part of the Service</li>
              <li>Use the Service to process transactions for prohibited goods</li>
              <li>Resell or redistribute the Service without written permission</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">4. Payment Terms</h2>
            <p>
              Paid plans are billed monthly via Stripe. Your subscription renews automatically
              unless cancelled before the next billing cycle. We do not offer refunds for
              partial months. Prices may change with 30 days&apos; notice. All fees are exclusive
              of applicable taxes. Stripe payment processing fees are charged at Stripe&apos;s
              standard rates with no additional markup from us.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">5. Data Ownership</h2>
            <p>
              You retain full ownership of all data you enter into the Service, including
              inventory records, customer information, transaction history, and event data.
              We do not sell, license, or share your data with third parties for their own
              purposes. We access your data only to operate and improve the Service, and to
              provide support when requested.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">6. Termination</h2>
            <p>
              You may cancel your account at any time from your dashboard settings. Upon
              cancellation, your data will remain available for export for 30 days, after
              which it will be permanently deleted. We may suspend or terminate accounts
              that violate these terms, with notice where practicable.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">7. Service Availability</h2>
            <p>
              We strive for high availability but do not guarantee uninterrupted service. We
              are not liable for any losses resulting from downtime, data loss, or service
              interruptions. We will provide reasonable notice of scheduled maintenance.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">8. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Full Uproar Games LLC shall not be
              liable for any indirect, incidental, special, consequential, or punitive damages,
              or any loss of profits or revenues, whether incurred directly or indirectly. Our
              total liability for any claim arising from or relating to the Service shall not
              exceed the amount you paid us in the 12 months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">9. Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless Full Uproar Games LLC from any claims,
              damages, or expenses arising from your use of the Service or violation of these
              terms.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">10. Changes to Terms</h2>
            <p>
              We may update these terms from time to time. We will notify you of material
              changes via email or in-app notification at least 30 days before they take
              effect. Continued use of the Service after changes become effective constitutes
              acceptance.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">11. Governing Law</h2>
            <p>
              These terms are governed by the laws of the State of Delaware, United States,
              without regard to conflict of law provisions. Any disputes shall be resolved in
              the courts of Delaware.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">12. Contact</h2>
            <p>
              For questions about these terms, contact us at{" "}
              <a href="mailto:legal@afterroar.store" className="text-[#FF8200] hover:underline">
                legal@afterroar.store
              </a>
              .
            </p>
          </section>
        </div>
      </article>

      <footer className="border-t border-[#2a2a3e] px-6 py-10 text-center text-xs text-[#4a4a6a]">
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link href="/pricing" className="hover:text-[#94a3b8]">Pricing</Link>
          <Link href="/privacy" className="hover:text-[#94a3b8]">Privacy</Link>
          <Link href="/support" className="hover:text-[#94a3b8]">Support</Link>
        </div>
        <p className="mt-4">Afterroar Store Ops &mdash; by Full Uproar Games</p>
      </footer>
    </div>
  );
}
