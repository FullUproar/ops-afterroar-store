export const metadata = {
  title: 'Privacy Policy — Afterroar',
  description: 'How Afterroar handles your data. What we collect, why, how long we keep it, and how to delete it.',
};

export default function PrivacyPage() {
  return (
    <main style={{
      maxWidth: '48rem',
      margin: '0 auto',
      padding: '3rem 1.5rem',
      color: '#e2e8f0',
      lineHeight: 1.8,
    }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 900, color: '#FF8200', marginBottom: '0.5rem' }}>
        Privacy Policy
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem', fontSize: '0.85rem' }}>
        Last updated: April 12, 2026
      </p>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
          The short version
        </h2>
        <p style={{ color: '#9ca3af' }}>
          Your data belongs to you. We collect only what's needed to run the platform.
          You can see everything we know about you, control who accesses it, export it
          as JSON, and delete it anytime. We never sell your data. We never use it in
          ways you didn't explicitly consent to. Per the Afterroar Credo, players come first.
        </p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
          What we collect
        </h2>
        <ul style={{ color: '#9ca3af', paddingLeft: '1.5rem' }}>
          <li><strong>Identity:</strong> email, display name, avatar (from Google sign-in). Used to identify you across the platform.</li>
          <li><strong>Passport code:</strong> a unique 8-character identifier for QR scanning at stores. Generated on first use.</li>
          <li><strong>Game library:</strong> games you declare you own. Added manually or auto-added from consented purchases.</li>
          <li><strong>Loyalty points:</strong> points earned at participating stores. Tracked per-store with a running balance.</li>
          <li><strong>Activity history:</strong> check-ins at stores, event attendance, tournament results. Created when you actively participate.</li>
          <li><strong>Consent grants:</strong> which types of communication you've opted into or out of, per category, with timestamps.</li>
        </ul>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
          How we use it
        </h2>
        <ul style={{ color: '#9ca3af', paddingLeft: '1.5rem' }}>
          <li>To provide the Passport experience — showing your points, library, and history.</li>
          <li>To let stores you've consented to recognize you at checkout via QR scan.</li>
          <li>To send you communications you've explicitly opted into (and nothing else).</li>
          <li>To improve the platform — aggregate, anonymized analytics only. Never individual tracking.</li>
        </ul>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
          Who can see your data
        </h2>
        <p style={{ color: '#9ca3af' }}>
          No one, unless you consent. When you scan your Passport at a store or authorize
          an app via "Log in with Afterroar," that specific store or app receives only the
          data you approved — typically your display name, avatar, loyalty tier, and
          reputation score. They do not receive your email, phone number, or activity at
          other stores. You can revoke any store or app's access anytime at{' '}
          <a href="/settings" style={{ color: '#FF8200' }}>afterroar.me/settings</a>.
        </p>
        <p style={{ color: '#9ca3af' }}>
          Full Uproar Games, Inc. (the company that built this platform) has no privileged
          access to your data. They operate under the same consent rules as every other
          store or app. Per the Afterroar Credo: the platform is a commons, not a tollbooth.
        </p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
          Data retention
        </h2>
        <p style={{ color: '#9ca3af' }}>
          We keep your data as long as your Passport is active. When you delete your
          Passport, we delete your identity, consent grants, game library, and activity
          history immediately. Points ledger entries are anonymized (disassociated from
          your identity) for store accounting purposes. Stores running Afterroar Store Ops
          have their records deleted automatically. For other stores, we send a deletion
          request but cannot verify compliance — see "Your rights" below.
        </p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
          Your rights
        </h2>
        <ul style={{ color: '#9ca3af', paddingLeft: '1.5rem' }}>
          <li><strong>See your data:</strong> <a href="/settings" style={{ color: '#FF8200' }}>afterroar.me/settings</a> shows everything we know.</li>
          <li><strong>Export your data:</strong> <a href="/api/export-data" style={{ color: '#FF8200' }}>Download as JSON</a> anytime.</li>
          <li><strong>Control your consent:</strong> Toggle each communication category on or off at <a href="/settings" style={{ color: '#FF8200' }}>settings</a>. Changes take effect immediately.</li>
          <li><strong>Delete your data:</strong> Available at <a href="/settings" style={{ color: '#FF8200' }}>settings</a>. For stores running our POS software, deletion is automatic and verified. For other stores, we revoke their access and send a deletion request, but we cannot force external systems to purge their records — we provide their contact info so you can follow up directly.</li>
          <li><strong>CCPA / GDPR:</strong> If you're a California or EU resident, you have additional rights under local privacy law. Contact <a href="mailto:afterroar@fulluproar.com" style={{ color: '#FF8200' }}>afterroar@fulluproar.com</a> with any privacy-related requests.</li>
        </ul>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
          What we don't do
        </h2>
        <ul style={{ color: '#9ca3af', paddingLeft: '1.5rem' }}>
          <li>We never sell your data.</li>
          <li>We never share it with advertisers.</li>
          <li>We never use it for behavioral targeting or cross-site tracking.</li>
          <li>We never give any store — including Full Uproar Games — back-door access.</li>
          <li>We never send you communications you didn't consent to.</li>
        </ul>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
          Contact
        </h2>
        <p style={{ color: '#9ca3af' }}>
          For privacy questions or data requests:{' '}
          <a href="mailto:afterroar@fulluproar.com" style={{ color: '#FF8200' }}>afterroar@fulluproar.com</a>
        </p>
        <p style={{ color: '#9ca3af' }}>
          Afterroar is operated by Full Uproar Games, Inc., South Bend, Indiana, USA.
        </p>
      </section>

      <div style={{ borderTop: '1px solid #1f2937', paddingTop: '1.5rem', marginTop: '2rem' }}>
        <p style={{ color: '#4b5563', fontSize: '0.8rem', textAlign: 'center' }}>
          Per the Afterroar Credo: your data belongs to you — not to us, not to any store,
          not to any advertiser. This policy is how we keep that promise.
        </p>
      </div>
    </main>
  );
}
