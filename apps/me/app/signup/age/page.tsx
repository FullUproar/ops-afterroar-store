import { redirect } from 'next/navigation';
import { isUnder13Blocked, readAgeGateCookie } from '@/lib/age-gate';
import { ChromeNav, PlayerCard, Workbench } from '@/app/components/card-shell';
import { TYPE, TitleBar } from '@/app/components/ui';
import AgeGateForm from './AgeGateForm';

/**
 * Under-18 side-door (distillery-model age gate). Default adult signup
 * is a checkbox attestation on /signup; this page is the path users
 * click into when they answer "I am under 18" honestly. COPPA-compliant
 * neutral age screen: no defaults, no "you must be 13+" copy.
 *
 * Routes based on entered DOB:
 *   - <13   → /signup/blocked + sticky cookie
 *   - 13-17 → /signup/teen (parental consent flow when feature flag on)
 *   - 18+   → /signup (loop back to the regular adult path; rare, but
 *             possible if someone clicked the under-18 link by mistake)
 *
 * If a previous attempt was blocked (<13), we refuse to show the form
 * and route them to /signup/blocked.
 */
export default async function AgeGatePage() {
  if (await isUnder13Blocked()) {
    redirect('/signup/blocked');
  }

  const existing = await readAgeGateCookie();
  if (existing) {
    if (existing.cohort === 'adult') redirect('/signup');
    if (existing.cohort === 'teen') redirect('/signup/teen');
    if (existing.cohort === 'under13') redirect('/signup/blocked');
  }

  return (
    <>
      <ChromeNav signedIn={false} />
      <Workbench>
        <PlayerCard maxWidth="26rem">
          <TitleBar left="Under 18?" />
          <div
            style={{
              padding: '1.75rem var(--pad-x) 1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <h1
                style={{
                  ...TYPE.display,
                  fontSize: 'clamp(1.4rem, 5vw, 1.8rem)',
                  color: 'var(--cream)',
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                What&apos;s your birthday?
              </h1>
              <p
                style={{
                  ...TYPE.body,
                  fontSize: '0.9rem',
                  color: 'var(--ink-soft)',
                  margin: '0.75rem 0 0',
                  lineHeight: 1.5,
                }}
              >
                We&apos;ll route you to the right setup path. If you&apos;re 18+ and ended up here by mistake, you can head{' '}
                <a href="/signup" style={{ color: 'var(--orange)' }}>back to the regular signup</a>.
              </p>
            </div>

            <AgeGateForm />

            <p
              style={{
                ...TYPE.body,
                fontSize: '0.78rem',
                color: 'var(--ink-faint)',
                lineHeight: 1.55,
                margin: 0,
                textAlign: 'center',
              }}
            >
              We use your date of birth to keep Afterroar safe. Read more in our{' '}
              <a href="/privacy" style={{ color: 'var(--orange)' }}>
                Privacy Policy
              </a>
              .
            </p>
          </div>
        </PlayerCard>
      </Workbench>
    </>
  );
}
