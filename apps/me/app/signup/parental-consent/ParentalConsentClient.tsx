'use client';

import { useEffect, useMemo, useState } from 'react';
import { signIn } from 'next-auth/react';
import { TYPE } from '@/app/components/ui';

/**
 * Four-step parent consent UX (revised model — May 2026):
 *   1. Sign in (Google or email/password). Required because the parent's
 *      Passport account is the link to the kid.
 *   2. Verify identity via Persona.
 *   3. Choose a path: pay one-time consent fee ($5) for the verification
 *      cost OR start Pro ($5/mo) which bundles the consent fee in the
 *      first month AND unlocks the parent monitoring dashboard.
 *   4. Attest "I am the parent or legal guardian" + activate.
 *
 * The previous model required ongoing Pro for the kid account to exist.
 * The new model treats Pro as a value-add ("monitor your kid's activity")
 * rather than a tax. Free-parent kid accounts work fine; Pro-parent
 * accounts get the monitoring dashboard.
 *
 * Stripe handoffs are stubbed in v1 — the endpoints exist and mark
 * payment status, but the actual checkout flow needs to be wired against
 * the existing Stripe integration. The status doc tracks what's full vs
 * stubbed.
 */
export default function ParentalConsentClient({
  token,
  childEmail,
  childDisplayName,
  parentEmail,
  session,
  initialConsentFeePaid,
}: {
  token: string;
  childEmail: string;
  childDisplayName: string | null;
  parentEmail: string;
  session: {
    email: string | null | undefined;
    identityVerified: boolean;
    membershipTier: string;
  } | null;
  initialConsentFeePaid: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [attestationChecked, setAttestationChecked] = useState(false);
  const [consentFeePaid, setConsentFeePaid] = useState(initialConsentFeePaid);
  const [chosenPath, setChosenPath] = useState<'free' | 'pro' | null>(
    session?.membershipTier === 'PRO' || session?.membershipTier === 'CONNECT' ? 'pro'
    : initialConsentFeePaid ? 'free'
    : null,
  );
  const [paymentStarting, setPaymentStarting] = useState(false);

  // After a Stripe redirect-back, the URL may contain ?paid=consent or
  // ?paid=pro. Re-read the consent state from the server to pick up the
  // payment confirmation. (Actual Stripe wiring is stubbed; the endpoint
  // marks paid via a manual call for now.)
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('paid')) {
      const paid = url.searchParams.get('paid');
      if (paid === 'consent' || paid === 'pro') {
        // Refresh page state via a soft reload so server data updates.
        url.searchParams.delete('paid');
        window.history.replaceState(null, '', url.toString());
        setConsentFeePaid(true);
        setChosenPath(paid === 'pro' ? 'pro' : 'free');
      }
    }
  }, []);

  const callbackUrl = useMemo(
    () => `/signup/parental-consent?token=${encodeURIComponent(token)}`,
    [token],
  );

  const isSignedIn = !!session;
  const isWrongAccount =
    isSignedIn && session.email && session.email.toLowerCase() !== parentEmail.toLowerCase();
  const isVerified = !!session?.identityVerified;
  const isProActive = session?.membershipTier === 'PRO' || session?.membershipTier === 'CONNECT';
  const pathSatisfied = chosenPath === 'pro' ? isProActive : chosenPath === 'free' ? consentFeePaid : false;

  async function startConsentFeePayment() {
    if (paymentStarting) return;
    setPaymentStarting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/parental-consent/start-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, path: 'free' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Could not start payment.');
        setPaymentStarting(false);
        return;
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else if (data.devMarkPaid) {
        // Dev fallback: endpoint immediately marked paid (no Stripe key set).
        setConsentFeePaid(true);
        setChosenPath('free');
        setPaymentStarting(false);
      }
    } catch {
      setError('Network error. Try again.');
      setPaymentStarting(false);
    }
  }

  async function handleApprove() {
    if (submitting) return;
    if (!attestationChecked) {
      setError('Please confirm you are the parent or legal guardian.');
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/parental-consent/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, attestation: 'I am the parent or legal guardian.' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Could not complete consent.');
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch {
      setError('Network error. Try again.');
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div
        style={{
          padding: '1.5rem',
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          textAlign: 'center',
          ...TYPE.body,
          fontSize: '0.95rem',
          color: 'var(--cream)',
          lineHeight: 1.6,
        }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✅</div>
        <strong style={{ color: 'var(--orange)' }}>Done.</strong>
        <p style={{ margin: '0.5rem 0 0' }}>
          {childDisplayName || childEmail}&apos;s Passport is set up. They&apos;ll get an email at{' '}
          <strong>{childEmail}</strong> with a link to set their password and sign in.
        </p>
        {chosenPath === 'pro' ? (
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: 'var(--ink-soft)' }}>
            Your Pro subscription includes the parent monitoring dashboard. You can find it under
            <a href="/parent-dashboard" style={{ color: 'var(--orange)', marginLeft: '0.25rem' }}>
              /parent-dashboard
            </a>
            .
          </p>
        ) : (
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: 'var(--ink-soft)' }}>
            You can upgrade to Pro any time to monitor their activity. Your Afterroar account stays
            active for free.
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {error && (
        <div
          style={{
            padding: '0.7rem 0.9rem',
            background: 'rgba(196, 77, 77, 0.08)',
            border: '1px solid rgba(196, 77, 77, 0.3)',
            color: 'var(--red)',
            ...TYPE.body,
            fontSize: '0.82rem',
          }}
        >
          {error}
        </div>
      )}

      <Step
        index={1}
        title="Sign in to your Afterroar account"
        complete={isSignedIn && !isWrongAccount}
        active={!isSignedIn || !!isWrongAccount}
      >
        {!isSignedIn && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <p style={{ ...TYPE.body, fontSize: '0.85rem', color: 'var(--ink-soft)', margin: 0, lineHeight: 1.5 }}>
              Sign in with the email <strong style={{ color: 'var(--cream)' }}>{parentEmail}</strong>, or create a new
              account if you don&apos;t have one yet.
            </p>
            <button
              onClick={() => signIn('google', { callbackUrl })}
              style={{
                padding: '0.7rem 1rem',
                background: 'var(--panel-mute)',
                border: '1.5px solid var(--rule)',
                color: 'var(--cream)',
                ...TYPE.display,
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              Sign in with Google
            </button>
            <a
              href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              style={{
                padding: '0.7rem 1rem',
                background: 'transparent',
                border: '1.5px solid var(--rule)',
                color: 'var(--ink-soft)',
                ...TYPE.body,
                fontSize: '0.85rem',
                textAlign: 'center',
                textDecoration: 'none',
              }}
            >
              Use email and password
            </a>
          </div>
        )}
        {isSignedIn && isWrongAccount && (
          <p style={{ ...TYPE.body, fontSize: '0.85rem', color: 'var(--red)', margin: 0, lineHeight: 1.5 }}>
            You&apos;re signed in as <strong>{session.email}</strong>, but the consent email was sent to{' '}
            <strong>{parentEmail}</strong>.{' '}
            <a href={`/api/auth/signout?callbackUrl=${encodeURIComponent(callbackUrl)}`} style={{ color: 'var(--orange)' }}>
              Sign out and try again
            </a>
            .
          </p>
        )}
      </Step>

      <Step
        index={2}
        title="Verify your identity"
        complete={isVerified}
        active={isSignedIn && !isWrongAccount && !isVerified}
        disabled={!isSignedIn || !!isWrongAccount}
      >
        <p style={{ ...TYPE.body, fontSize: '0.85rem', color: 'var(--ink-soft)', margin: 0, lineHeight: 1.5 }}>
          Quick photo of your ID. Takes about 60 seconds. We use Persona; no biometric data is retained on Afterroar&apos;s side.
        </p>
        {isSignedIn && !isVerified && (
          <a
            href={`/verify-identity?return=${encodeURIComponent(callbackUrl)}`}
            style={{
              display: 'inline-block',
              padding: '0.7rem 1rem',
              background: 'var(--orange)',
              color: 'var(--void, #1a1a1a)',
              ...TYPE.display,
              fontSize: '0.9rem',
              fontWeight: 700,
              textDecoration: 'none',
              marginTop: '0.5rem',
            }}
          >
            Verify identity
          </a>
        )}
      </Step>

      <Step
        index={3}
        title="Choose how to maintain this consent"
        complete={pathSatisfied}
        active={isVerified && !pathSatisfied}
        disabled={!isVerified}
      >
        <p style={{ ...TYPE.body, fontSize: '0.85rem', color: 'var(--ink-soft)', margin: 0, lineHeight: 1.5 }}>
          Pick what fits — both paths fully approve {childDisplayName || childEmail}&apos;s account.
          Pro adds the ability to see what they&apos;re up to.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '0.75rem',
          marginTop: '0.5rem',
        }}>
          {/* Free path: $5 one-time consent fee */}
          <PathCard
            tier="Free + verification"
            price="$5 once"
            selected={chosenPath === 'free'}
            disabled={!isVerified}
            features={[
              'Approves their account',
              'Verifies you as a real adult',
              'Your Afterroar account stays free',
            ]}
            actionLabel={consentFeePaid ? 'Paid ✓' : paymentStarting ? 'Starting…' : 'Pay $5'}
            actionDisabled={consentFeePaid || paymentStarting}
            onAction={consentFeePaid ? undefined : startConsentFeePayment}
            footnote="Covers the cost of your ID verification. No further charges."
          />
          {/* Pro path: $5/mo Pro */}
          <PathCard
            tier="Pro · Monitored Passport"
            price="$5/mo"
            highlighted
            selected={chosenPath === 'pro'}
            disabled={!isVerified}
            features={[
              'Everything in Free path',
              "See where they're using their Passport (apps signed in, stores checked in)",
              'Badges earned + account-level alerts (new device, identity changes)',
              'All your own Pro perks (verified profile, public hosting, etc.)',
            ]}
            actionLabel={isProActive ? 'Active ✓' : 'Start Pro'}
            actionDisabled={isProActive}
            onAction={
              isProActive
                ? undefined
                : () => {
                    window.location.href = `/billing/subscribe?tier=pro&consent_token=${encodeURIComponent(token)}&return=${encodeURIComponent(callbackUrl)}`;
                  }
            }
            footnote="First month covers the consent fee. Cancel any time. Passport-level only — individual apps hold their own data."
          />
        </div>
      </Step>

      <Step
        index={4}
        title="Confirm and activate"
        complete={false}
        active={pathSatisfied}
        disabled={!pathSatisfied}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.6rem',
            ...TYPE.body,
            fontSize: '0.88rem',
            color: 'var(--cream)',
            lineHeight: 1.5,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={attestationChecked}
            onChange={(e) => setAttestationChecked(e.target.checked)}
            style={{ marginTop: '0.2rem', accentColor: 'var(--orange)' }}
          />
          <span>
            I am the parent or legal guardian of {childDisplayName || childEmail}, and I authorize Afterroar to set up
            their Passport. I understand that misrepresenting this is a serious offense.
          </span>
        </label>
        <button
          onClick={handleApprove}
          disabled={submitting || !attestationChecked || !pathSatisfied}
          style={{
            width: '100%',
            padding: '0.9rem 1.25rem',
            background: 'var(--orange)',
            border: 'none',
            color: 'var(--void, #1a1a1a)',
            ...TYPE.display,
            fontSize: '0.95rem',
            fontWeight: 700,
            cursor: submitting || !attestationChecked || !pathSatisfied ? 'not-allowed' : 'pointer',
            opacity: submitting || !attestationChecked || !pathSatisfied ? 0.5 : 1,
            marginTop: '0.5rem',
          }}
        >
          {submitting ? 'Activating…' : 'Activate their Passport'}
        </button>
      </Step>
    </div>
  );
}

function PathCard({
  tier,
  price,
  features,
  actionLabel,
  actionDisabled,
  onAction,
  footnote,
  selected,
  highlighted,
  disabled,
}: {
  tier: string;
  price: string;
  features: string[];
  actionLabel: string;
  actionDisabled?: boolean;
  onAction?: () => void;
  footnote?: string;
  selected?: boolean;
  highlighted?: boolean;
  disabled?: boolean;
}) {
  const accent = highlighted ? 'var(--orange)' : 'var(--ink-soft)';
  return (
    <div style={{
      padding: '1rem 1.1rem',
      background: selected
        ? 'rgba(16, 185, 129, 0.08)'
        : highlighted
          ? 'rgba(255, 130, 0, 0.05)'
          : 'var(--panel-mute)',
      border: `1.5px solid ${selected ? 'rgba(16, 185, 129, 0.5)' : highlighted ? 'rgba(255, 130, 0, 0.4)' : 'var(--rule)'}`,
      borderRadius: '0.6rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.6rem',
      opacity: disabled ? 0.55 : 1,
    }}>
      <div>
        <div style={{ ...TYPE.display, fontSize: '0.95rem', color: accent, fontWeight: 700, marginBottom: '0.2rem' }}>
          {tier}
        </div>
        <div style={{ ...TYPE.display, fontSize: '1.4rem', color: 'var(--cream)', fontWeight: 800, lineHeight: 1 }}>
          {price}
        </div>
      </div>
      <ul style={{ margin: 0, paddingLeft: '1.05rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {features.map((f, i) => (
          <li key={i} style={{ ...TYPE.body, fontSize: '0.82rem', color: 'var(--ink-soft)', lineHeight: 1.5 }}>{f}</li>
        ))}
      </ul>
      {onAction ? (
        <button
          onClick={onAction}
          disabled={actionDisabled || disabled}
          style={{
            padding: '0.55rem 0.85rem',
            background: highlighted ? 'var(--orange)' : 'var(--panel)',
            color: highlighted ? 'var(--void, #1a1a1a)' : 'var(--cream)',
            border: highlighted ? 'none' : '1px solid var(--rule)',
            borderRadius: '0.4rem',
            ...TYPE.display,
            fontSize: '0.85rem',
            fontWeight: 700,
            cursor: actionDisabled || disabled ? 'not-allowed' : 'pointer',
            opacity: actionDisabled || disabled ? 0.5 : 1,
          }}
        >
          {actionLabel}
        </button>
      ) : (
        <div style={{
          padding: '0.55rem 0.85rem',
          background: 'rgba(16, 185, 129, 0.1)',
          color: '#10b981',
          borderRadius: '0.4rem',
          ...TYPE.display,
          fontSize: '0.85rem',
          fontWeight: 700,
          textAlign: 'center',
        }}>
          {actionLabel}
        </div>
      )}
      {footnote && (
        <div style={{ ...TYPE.body, fontSize: '0.74rem', color: 'var(--ink-faint)', lineHeight: 1.45, marginTop: '0.1rem' }}>
          {footnote}
        </div>
      )}
    </div>
  );
}

function Step({
  index,
  title,
  complete,
  active,
  disabled,
  children,
}: {
  index: number;
  title: string;
  complete: boolean;
  active: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const opacity = disabled && !complete ? 0.4 : 1;
  return (
    <div
      style={{
        padding: '1rem 1.1rem',
        background: complete ? 'rgba(16, 185, 129, 0.06)' : active ? 'rgba(255, 130, 0, 0.05)' : 'var(--panel-mute)',
        border: `1.5px solid ${complete ? 'rgba(16, 185, 129, 0.4)' : active ? 'var(--orange)' : 'var(--rule)'}`,
        opacity,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.65rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span
          style={{
            width: '1.7rem',
            height: '1.7rem',
            borderRadius: '50%',
            background: complete ? 'rgba(16, 185, 129, 0.2)' : 'var(--panel)',
            color: complete ? '#10b981' : active ? 'var(--orange)' : 'var(--ink-faint)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            ...TYPE.display,
            fontSize: '0.85rem',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {complete ? '✓' : index}
        </span>
        <h3
          style={{
            ...TYPE.display,
            fontSize: '1rem',
            color: 'var(--cream)',
            margin: 0,
            fontWeight: 700,
          }}
        >
          {title}
        </h3>
      </div>
      <div style={{ paddingLeft: '2.45rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>{children}</div>
    </div>
  );
}
