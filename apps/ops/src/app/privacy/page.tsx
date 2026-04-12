import type { Metadata } from "next";
import MarketingNav from "@/components/marketing-nav";
import MarketingFooter from "@/components/marketing-footer";

export const metadata: Metadata = {
  title: "Privacy Policy — Afterroar Store Ops",
  description: "Privacy policy for Afterroar Store Ops by Full Uproar Games.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <MarketingNav />

      <article className="mx-auto max-w-3xl px-6 pb-24 pt-12">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-[#94a3b8]">
          Last updated: April 2026
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-[#cbd5e1]">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">1. What We Collect</h2>
            <p>We collect the following types of information:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong>Account data:</strong> Name, email address, and authentication
                credentials when you create an account.
              </li>
              <li>
                <strong>Store data:</strong> Store name, address, settings, staff accounts,
                and configuration preferences.
              </li>
              <li>
                <strong>Transaction data:</strong> Sales, returns, trade-ins, and payment
                records processed through the Service.
              </li>
              <li>
                <strong>Customer data:</strong> Information about your store&apos;s customers that
                you enter into the system (names, contact info, purchase history, loyalty
                points). This data belongs to you and is stored on your behalf.
              </li>
              <li>
                <strong>Inventory data:</strong> Product listings, pricing, stock levels,
                and marketplace sync data.
              </li>
              <li>
                <strong>Usage data:</strong> Basic analytics about how you use the Service
                to help us improve the product.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">2. How We Use Your Data</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>To operate and provide the Service</li>
              <li>To process payments through Stripe</li>
              <li>To sync inventory with marketplace platforms you connect (eBay, etc.)</li>
              <li>To generate reports and insights for your store</li>
              <li>To send transactional emails (order confirmations, shipping notifications)</li>
              <li>To improve the product based on aggregate usage patterns</li>
              <li>To provide customer support</li>
            </ul>
            <p className="mt-3 font-medium text-white">
              We never sell your data to third parties. Period.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">3. Data Storage and Security</h2>
            <p>
              Your data is stored in a managed PostgreSQL database hosted by Prisma Data
              Platform. All data is encrypted at rest and in transit. We use industry-standard
              security practices including TLS encryption, hashed passwords and PINs, and
              scoped access controls.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">4. Third-Party Services</h2>
            <p>We integrate with the following third-party services:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong>Stripe</strong> — Payment processing and terminal readers. Stripe&apos;s
                privacy policy applies to payment data.
              </li>
              <li>
                <strong>Scryfall</strong> — Magic: The Gathering card data and pricing
                (public API, no personal data shared).
              </li>
              <li>
                <strong>Pokemon TCG API</strong> — Pokemon card data and pricing (public
                API, no personal data shared).
              </li>
              <li>
                <strong>ShipStation</strong> — Shipping label generation and fulfillment
                (order and address data shared for shipping purposes).
              </li>
              <li>
                <strong>Resend</strong> — Transactional email delivery (email addresses and
                message content).
              </li>
              <li>
                <strong>Google OAuth</strong> — Authentication (we receive your name and
                email from Google when you sign in).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">5. Data Retention</h2>
            <p>
              Your data is retained for as long as your account is active. If you cancel your
              account, your data remains available for export for 30 days. After the 30-day
              window, all data associated with your account is permanently deleted from our
              systems and backups.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">6. GDPR and CCPA Compliance</h2>
            <p>We support the following data rights for all users:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong>Right to access:</strong> You can export all your data at any time
                from your dashboard.
              </li>
              <li>
                <strong>Right to deletion:</strong> You can request deletion of your account
                and all associated data.
              </li>
              <li>
                <strong>Right to portability:</strong> Data exports are provided in standard
                formats (CSV, JSON).
              </li>
              <li>
                <strong>Right to correction:</strong> You can update your information at any
                time through the Service.
              </li>
            </ul>

            <h3 className="mt-5 mb-2 text-base font-semibold text-white">
              Customer Data Deletion
            </h3>
            <p>
              Store customers can request deletion of their personal data by
              contacting the store owner. Store owners can export and delete
              customer data directly from the dashboard.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Personal information (name, email, phone) is permanently
                removed from the customer record.
              </li>
              <li>
                Financial records (sales, returns, trade-ins) are anonymized
                rather than deleted, as required for tax and audit compliance.
              </li>
              <li>
                Customer notes are permanently deleted.
              </li>
              <li>
                Deletion is permanent and irreversible. Anonymized financial
                records cannot be re-linked to the original customer.
              </li>
              <li>
                If the customer has an Afterroar account, our headquarters
                (Full Uproar Games) is automatically notified to handle
                cross-platform deletion.
              </li>
            </ul>

            <p className="mt-3">
              To exercise any of these rights, contact{" "}
              <a
                href="mailto:privacy@afterroar.store"
                className="text-[#FF8200] hover:underline"
              >
                privacy@afterroar.store
              </a>{" "}
              or ask your store owner to process the request from their
              dashboard.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">7. Cookies</h2>
            <p>
              We use session cookies only, strictly necessary for authentication and keeping
              you signed in. We do not use tracking cookies, advertising cookies, or any
              third-party analytics cookies. No cookie banner is required because we only use
              essential cookies.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">8. Children&apos;s Privacy</h2>
            <p>
              The Service is designed for business use and is not directed at individuals
              under 18. We do not knowingly collect personal information from children.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">9. Changes to This Policy</h2>
            <p>
              We may update this privacy policy from time to time. We will notify you of
              material changes via email or in-app notification. The &quot;Last updated&quot; date at
              the top of this page indicates when the policy was last revised.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">10. Contact</h2>
            <p>
              For privacy-related questions or requests, contact us at{" "}
              <a
                href="mailto:privacy@afterroar.store"
                className="text-[#FF8200] hover:underline"
              >
                privacy@afterroar.store
              </a>
              .
            </p>
            <p className="mt-2">
              Full Uproar Games LLC
            </p>
          </section>
        </div>
      </article>

      <MarketingFooter />
    </div>
  );
}
