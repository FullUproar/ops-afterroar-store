import { MarketingPage, ChromeNav } from '@/app/components/card-shell';
import { TYPE } from '@/app/components/ui';

export const metadata = {
  title: 'Privacy Policy — Afterroar',
  description: 'How Afterroar handles your data. What we collect, why, how long we keep it, and how to delete it.',
};

const h2: React.CSSProperties = { ...TYPE.displayMd, fontSize: '1.25rem', color: 'var(--cream)', marginBottom: '0.5rem', marginTop: '2rem' };
const p: React.CSSProperties = { ...TYPE.body, color: 'var(--ink-soft)', lineHeight: 1.7, fontSize: '0.92rem' };
const ul: React.CSSProperties = { ...p, paddingLeft: '1.2rem' };
const a: React.CSSProperties = { color: 'var(--orange)' };

export default function PrivacyPage() {
  return (
    <>
      <ChromeNav signedIn={false} />
      <MarketingPage>
        <p style={{ ...TYPE.mono, color: 'var(--orange)', fontSize: '0.7rem', letterSpacing: '0.32em', textTransform: 'uppercase', margin: '0 0 0.5rem', fontWeight: 700 }}>
          Afterroar · Privacy
        </p>
        <h1 style={{ ...TYPE.display, fontSize: 'clamp(2rem, 6vw, 3rem)', color: 'var(--cream)', margin: '0 0 0.4rem', lineHeight: 0.95 }}>Privacy Policy</h1>
        <p style={{ ...TYPE.mono, color: 'var(--ink-faint)', marginBottom: '1.5rem', fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Last updated: May 1, 2026
        </p>

        <h2 style={h2}>The short version</h2>
        <p style={p}>Your data belongs to you. We collect only what&apos;s needed to run the platform. You can see everything we know about you, control who accesses it, export it as JSON, and delete it anytime. We never sell your data. We never use it in ways you didn&apos;t explicitly consent to. Per the Afterroar Credo, players come first.</p>

        <h2 style={h2}>What we collect</h2>
        <ul style={ul}>
          <li><strong>Identity:</strong> email, display name, avatar (from Google sign-in).</li>
          <li><strong>Date of birth:</strong> collected once at signup to confirm you&apos;re old enough to use Afterroar and to apply age-appropriate privacy defaults. We store the date itself, not your age (which we compute as needed).</li>
          <li><strong>Passport code:</strong> a unique 8-character identifier for QR scanning at stores.</li>
          <li><strong>Game library:</strong> games you declare you own. Added manually or auto-added from consented purchases.</li>
          <li><strong>Loyalty points:</strong> points earned at participating stores. Tracked per-store with a running balance.</li>
          <li><strong>Activity history:</strong> check-ins at stores, event attendance, tournament results. Created when you actively participate.</li>
          <li><strong>Consent grants:</strong> which types of communication you&apos;ve opted into or out of, per category, with timestamps.</li>
          <li><strong>For minor accounts (13–17):</strong> the parent or legal guardian&apos;s identifier and the date of consent. Date of birth on minor accounts is used only to compute the date the account graduates to adult privacy defaults.</li>
        </ul>

        <h2 style={h2}>Age and minors</h2>
        <p style={p}>
          Afterroar requires users to be at least 18, or 13–17 with active parental or legal-guardian consent. Children under 13 cannot create a Passport. We collect date of birth at signup using a neutral age screen (no defaults, no copy implying a minimum age), and we use a session cookie to prevent retry-with-different-age attempts after an under-13 entry, in line with FTC guidance under the Children&apos;s Online Privacy Protection Act.
        </p>
        <p style={p}>
          Minor accounts (13–17) inherit the most restrictive privacy settings by default: profile visibility is limited to approved circles, direct messages from adults outside the approved circle are blocked, and public game-night discovery is restricted to events hosted by verified venues and tagged appropriate for the minor&apos;s age.
        </p>
        <p style={p}>
          We do not collect biometric data (face geometry, voiceprints, fingerprints) from any user, regardless of age. Identity verification for adult Pro and Connect tiers is handled by our verification partner under their own terms; the partner does not return biometric identifiers to Afterroar.
        </p>

        <h2 style={h2}>How we use it</h2>
        <ul style={ul}>
          <li>To provide the Passport experience — showing your points, library, and history.</li>
          <li>To let stores you&apos;ve consented to recognize you at checkout via QR scan.</li>
          <li>To send you communications you&apos;ve explicitly opted into (and nothing else).</li>
          <li>To improve the platform — aggregate, anonymized analytics only. Never individual tracking.</li>
        </ul>

        <h2 style={h2}>Who can see your data</h2>
        <p style={p}>No one, unless you consent. When you scan your Passport at a store or authorize an app via &ldquo;Log in with Afterroar,&rdquo; that specific store or app receives only the data you approved — typically your display name, avatar, loyalty tier, and reputation score. They do not receive your email, phone number, or activity at other stores. You can revoke any store or app&apos;s access anytime at <a href="/settings" style={a}>afterroar.me/settings</a>.</p>
        <p style={p}>Full Uproar Games, Inc. (the company that built this platform) has no privileged access to your data. They operate under the same consent rules as every other store or app. Per the Afterroar Credo: the platform is a commons, not a tollbooth.</p>

        <h2 style={h2}>Shopify merchants and their customers</h2>
        <p style={p}>When a store installs Afterroar Connect from the Shopify App Store, we receive a read-only OAuth token for that store&apos;s <code style={{ color: 'var(--cream)' }}>read_orders</code> and <code style={{ color: 'var(--cream)' }}>read_customers</code> scopes. We use this access solely to match incoming paid orders to the customer&apos;s Afterroar Passport (by email or by a Passport code the customer supplied at checkout) and to award store-specific loyalty points.</p>
        <p style={p}><strong>Customer personal data from Shopify webhooks</strong> (names, emails, order details) is retained in raw form for up to 30 days for idempotency and audit, then automatically stripped while we keep only a non-PII metadata row (topic, dedupe key, processing result) for 180 days. We do not store Shopify card data, shipping addresses, product catalogs, or any data we don&apos;t need to match to a Passport.</p>
        <p style={p}><strong>Mandatory Shopify compliance webhooks:</strong> we handle <code style={{ color: 'var(--cream)' }}>customers/data_request</code>, <code style={{ color: 'var(--cream)' }}>customers/redact</code>, and <code style={{ color: 'var(--cream)' }}>shop/redact</code>. Customer redact requests are effectively no-ops on our side because we don&apos;t persist Shopify customer records — the customer&apos;s actual data lives in their own Passport, which they control. Shop redact purges all our data about that merchant within 48 hours of the request.</p>
        <p style={p}>Merchants can disconnect Afterroar Connect from their Shopify admin at any time. On uninstall, the connection is deactivated immediately; all retained data then follows the retention schedule above.</p>

        <h2 style={h2}>Data retention</h2>
        <p style={p}>We keep your data as long as your Passport is active. When you delete your Passport, we delete your identity, consent grants, game library, and activity history immediately. Points ledger entries are anonymized (disassociated from your identity) for store accounting purposes. Stores running Afterroar Store Ops have their records deleted automatically. For other stores, we send a deletion request but cannot verify compliance — see &ldquo;Your rights&rdquo; below.</p>

        <h2 style={h2}>Your rights</h2>
        <ul style={ul}>
          <li><strong>See your data:</strong> <a href="/settings" style={a}>afterroar.me/settings</a> shows everything we know.</li>
          <li><strong>Export your data:</strong> <a href="/api/export-data" style={a}>Download as JSON</a> anytime.</li>
          <li><strong>Control your consent:</strong> Toggle each communication category on or off at <a href="/settings" style={a}>settings</a>. Changes take effect immediately.</li>
          <li><strong>Delete your data:</strong> Available at <a href="/data" style={a}>/data</a>. For stores running our POS software, deletion is automatic and verified. For other stores, we revoke their access and send a deletion request, but we cannot force external systems to purge their records — we provide their contact info so you can follow up directly.</li>
          <li><strong>CCPA / GDPR:</strong> If you&apos;re a California or EU resident, you have additional rights under local privacy law. Contact <a href="mailto:afterroar@fulluproar.com" style={a}>afterroar@fulluproar.com</a> with any privacy-related requests.</li>
        </ul>

        <h2 style={h2}>What we don&apos;t do</h2>
        <ul style={ul}>
          <li>We never sell your data.</li>
          <li>We never share it with advertisers.</li>
          <li>We never use it for behavioral targeting or cross-site tracking.</li>
          <li>We never give any store — including Full Uproar Games — back-door access.</li>
          <li>We never send you communications you didn&apos;t consent to.</li>
        </ul>

        <h2 style={h2}>Contact</h2>
        <p style={p}>For privacy questions or data requests: <a href="mailto:afterroar@fulluproar.com" style={a}>afterroar@fulluproar.com</a></p>
        <p style={p}>Afterroar is operated by Full Uproar Games, Inc., South Bend, Indiana, USA.</p>

        <div style={{ borderTop: '1px solid var(--rule)', paddingTop: '1.5rem', marginTop: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <p style={{ ...TYPE.body, color: 'var(--ink-faint)', fontSize: '0.8rem', textAlign: 'center', margin: 0 }}>
            Per the Afterroar Credo: your data belongs to you — not to us, not to any store, not to any advertiser. This policy is how we keep that promise.
          </p>
          <div style={{ display: 'flex', gap: '1.2rem', ...TYPE.mono, fontSize: '0.7rem', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            <a href="/" style={{ color: 'var(--orange)', textDecoration: 'none', fontWeight: 700 }}>← Home</a>
            <a href="/credo" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>The Credo</a>
            <a href="/terms" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>Terms</a>
            <a href="/login" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>Sign in</a>
          </div>
        </div>
      </MarketingPage>
    </>
  );
}
