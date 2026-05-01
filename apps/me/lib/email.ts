/**
 * Transactional email — Passport.
 *
 * Uses Resend (via RESEND_API_KEY env var). Fire-and-forget: we never block
 * the caller, and missing config logs to console + returns false rather than
 * throwing. That keeps verification flows robust during local dev where the
 * key isn't set.
 */

const RESEND_API_URL = "https://api.resend.com/emails";

interface EmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
  text?: string;
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(
      `[Email] No RESEND_API_KEY — skipping: "${params.subject}" → ${params.to}`,
    );
    if (process.env.NODE_ENV !== "production") {
      // Helpful in dev: print the verification link so we can click it.
      console.log("[Email] Body preview:\n", stripHtml(params.html).slice(0, 800));
    }
    return false;
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: params.from || process.env.EMAIL_FROM || "Afterroar <noreply@afterroar.me>",
        to: params.to,
        subject: params.subject,
        html: params.html,
        ...(params.text ? { text: params.text } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[Email] Resend ${res.status}:`, body);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Email] Send failed:", err);
    return false;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------------ */
/*  Templates                                                          */
/* ------------------------------------------------------------------ */

export function verifyEmailTemplate(verifyUrl: string, displayName?: string | null): {
  subject: string;
  html: string;
  text: string;
} {
  const greeting = displayName ? `Hey ${displayName}` : "Hey there";
  const subject = "Verify your Afterroar Passport";
  const text = `${greeting},

Tap this link to verify your email and finish setting up your Afterroar Passport:

${verifyUrl}

This link expires in 24 hours. If you didn't sign up, you can ignore this email.

— Afterroar`;
  const html = `
<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; max-width: 540px; margin: 0 auto; padding: 32px 24px;">
    <h1 style="font-size: 22px; font-weight: 700; margin: 0 0 16px;">Verify your Afterroar Passport</h1>
    <p style="font-size: 15px; line-height: 1.5; margin: 0 0 12px;">${greeting},</p>
    <p style="font-size: 15px; line-height: 1.5; margin: 0 0 24px;">
      Tap the button below to verify your email and finish setting up your Passport.
    </p>
    <p style="margin: 0 0 32px;">
      <a href="${verifyUrl}"
         style="display: inline-block; padding: 12px 24px; background: #ff6b35; color: #fff; text-decoration: none; font-weight: 600; border-radius: 4px;">
        Verify Email
      </a>
    </p>
    <p style="font-size: 13px; color: #666; line-height: 1.5; margin: 0 0 8px;">
      Or copy this link into your browser:<br>
      <span style="word-break: break-all;">${verifyUrl}</span>
    </p>
    <p style="font-size: 12px; color: #999; margin: 24px 0 0;">
      This link expires in 24 hours. If you didn't sign up, you can ignore this email.
    </p>
  </body>
</html>`.trim();

  return { subject, html, text };
}

interface ClaimVerifyParams {
  storeName: string;
  verifyUrl: string;
  claimantEmail: string | null;
  expiresHours: number;
}

export function claimVerifyTemplate(params: ClaimVerifyParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { storeName, verifyUrl, claimantEmail, expiresHours } = params;
  const subject = `Confirm your Afterroar claim for ${storeName}`;
  const claimantNote = claimantEmail
    ? `An Afterroar Passport user signed in as ${claimantEmail} requested ownership of this listing.`
    : `An Afterroar Passport user requested ownership of this listing.`;
  const text = `${claimantNote}

If that's you, confirm by clicking the link below. Once you confirm:
  • You'll be added as the owner of this store on Afterroar.
  • The store listing will go live for players to find.
  • You can invite staff and connect tools later from your dashboard.

Confirm: ${verifyUrl}

This link expires in ${expiresHours} hours. If you didn't make this request,
you can ignore this email — no claim will be granted.

— Afterroar`;

  const html = `
<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; max-width: 540px; margin: 0 auto; padding: 32px 24px;">
    <h1 style="font-size: 22px; font-weight: 700; margin: 0 0 16px;">Confirm your claim for ${escapeHtml(storeName)}</h1>
    <p style="font-size: 15px; line-height: 1.5; margin: 0 0 12px;">${escapeHtml(claimantNote)}</p>
    <p style="font-size: 15px; line-height: 1.5; margin: 0 0 12px;">
      If that&apos;s you, confirm below. Once you confirm:
    </p>
    <ul style="font-size: 15px; line-height: 1.6; padding-left: 20px; margin: 0 0 24px;">
      <li>You'll be added as the <strong>owner</strong> of this store on Afterroar.</li>
      <li>The listing will go live for players to find.</li>
      <li>You can invite staff and connect tools later from your dashboard.</li>
    </ul>
    <p style="margin: 0 0 32px;">
      <a href="${verifyUrl}"
         style="display: inline-block; padding: 12px 24px; background: #ff6b35; color: #fff; text-decoration: none; font-weight: 600; border-radius: 4px;">
        Confirm Claim
      </a>
    </p>
    <p style="font-size: 13px; color: #666; line-height: 1.5; margin: 0 0 8px;">
      Or copy this link into your browser:<br>
      <span style="word-break: break-all;">${verifyUrl}</span>
    </p>
    <p style="font-size: 12px; color: #999; margin: 24px 0 0;">
      This link expires in ${expiresHours} hours. If you didn't request this,
      ignore this email — no claim will be granted.
    </p>
  </body>
</html>`.trim();

  return { subject, html, text };
}

interface PasswordResetParams {
  resetUrl: string;
  email: string;
  expiresHours: number;
}

export function passwordResetTemplate(params: PasswordResetParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { resetUrl, email, expiresHours } = params;
  const subject = "Reset your Afterroar password";

  const text = `Someone (hopefully you) asked to reset the password on the Afterroar Passport at ${email}.

If that was you, set a new password here:
${resetUrl}

This link expires in ${expiresHours} hours. If you didn't request a reset, ignore this email — your password won't change.

If someone is trying to access your account without your permission, contact us at afterroar@fulluproar.com.

— Afterroar`;

  const html = `
<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; max-width: 540px; margin: 0 auto; padding: 32px 24px;">
    <h1 style="font-size: 22px; font-weight: 700; margin: 0 0 16px;">Reset your Afterroar password</h1>
    <p style="font-size: 15px; line-height: 1.5; margin: 0 0 16px;">
      Someone (hopefully you) asked to reset the password on your Afterroar Passport at <strong>${escapeHtml(email)}</strong>.
    </p>
    <p style="margin: 0 0 32px;">
      <a href="${resetUrl}"
         style="display: inline-block; padding: 12px 24px; background: #ff6b35; color: #fff; text-decoration: none; font-weight: 600; border-radius: 4px;">
        Set a new password
      </a>
    </p>
    <p style="font-size: 13px; color: #666; line-height: 1.5; margin: 0 0 8px;">
      Or copy this link into your browser:<br>
      <span style="word-break: break-all;">${resetUrl}</span>
    </p>
    <p style="font-size: 12px; color: #999; line-height: 1.5; margin: 24px 0 0;">
      This link expires in ${expiresHours} hours. If you didn't request a reset, ignore this email and your password won't change. If someone is trying to access your account, contact us at afterroar@fulluproar.com.
    </p>
  </body>
</html>`.trim();

  return { subject, html, text };
}

interface MagicLinkParams {
  signinUrl: string;
  email: string;
  expiresMinutes: number;
}

export function magicLinkTemplate(params: MagicLinkParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { signinUrl, email, expiresMinutes } = params;
  const subject = "Your Afterroar sign-in link";

  const text = `Click this link to sign in to Afterroar as ${email}:

${signinUrl}

This link expires in ${expiresMinutes} minutes and can only be used once. If you didn't request it, ignore this email — no one can access your account without it.

— Afterroar`;

  const html = `
<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; max-width: 540px; margin: 0 auto; padding: 32px 24px;">
    <h1 style="font-size: 22px; font-weight: 700; margin: 0 0 16px;">Sign in to Afterroar</h1>
    <p style="font-size: 15px; line-height: 1.5; margin: 0 0 16px;">
      Click the button below to sign in as <strong>${escapeHtml(email)}</strong>.
    </p>
    <p style="margin: 0 0 32px;">
      <a href="${signinUrl}"
         style="display: inline-block; padding: 12px 24px; background: #ff6b35; color: #fff; text-decoration: none; font-weight: 600; border-radius: 4px;">
        Sign in
      </a>
    </p>
    <p style="font-size: 13px; color: #666; line-height: 1.5; margin: 0 0 8px;">
      Or copy this link into your browser:<br>
      <span style="word-break: break-all;">${signinUrl}</span>
    </p>
    <p style="font-size: 12px; color: #999; line-height: 1.5; margin: 24px 0 0;">
      This link expires in ${expiresMinutes} minutes and can only be used once. If you didn't request it, ignore this email — no one can access your account without it.
    </p>
  </body>
</html>`.trim();

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface ParentalConsentParams {
  approveUrl: string;
  childEmail: string;
  childDisplayName: string | null;
  expiresHours: number;
}

export function parentalConsentTemplate(params: ParentalConsentParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { approveUrl, childEmail, childDisplayName, expiresHours } = params;
  const childRef = childDisplayName ? `${childDisplayName} (${childEmail})` : childEmail;
  const subject = `${childDisplayName || "A young player"} wants to set up an Afterroar Passport`;

  const text = `Someone using ${childEmail} listed you as their parent or guardian on Afterroar.

Afterroar is a tabletop gaming Passport — players use it to find local game stores, track the games they play, and earn badges for showing up.

To set things up for ${childDisplayName || "them"}, click here:
${approveUrl}

What you'll do on the next screen:
  • Confirm you are their parent or legal guardian
  • Set up your own Afterroar account ($5/mo) so they can stay connected to you
  • Verify your identity (we use Persona; quick photo of your ID)

Their account will be set to the most private settings by default. They will not be able to receive direct messages from adults, host public events, or be discovered by anyone outside their approved circle without your involvement.

This link expires in ${expiresHours} hours. If you didn't expect this email, you can ignore it — no account will be created without your action.

— Afterroar`;

  const html = `
<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; max-width: 540px; margin: 0 auto; padding: 32px 24px;">
    <h1 style="font-size: 22px; font-weight: 700; margin: 0 0 16px;">${escapeHtml(childDisplayName || "A young player")} wants to set up an Afterroar Passport</h1>
    <p style="font-size: 15px; line-height: 1.5; margin: 0 0 16px;">
      Someone using <strong>${escapeHtml(childEmail)}</strong> listed you as their parent or guardian on Afterroar.
    </p>
    <p style="font-size: 15px; line-height: 1.5; margin: 0 0 16px;">
      Afterroar is a tabletop gaming Passport. Players use it to find local game stores, track the games they play, and earn badges for showing up.
    </p>
    <p style="margin: 0 0 32px;">
      <a href="${approveUrl}"
         style="display: inline-block; padding: 12px 24px; background: #ff6b35; color: #fff; text-decoration: none; font-weight: 600; border-radius: 4px;">
        Set up ${escapeHtml(childDisplayName || "their")} account
      </a>
    </p>
    <p style="font-size: 14px; line-height: 1.55; margin: 0 0 12px;"><strong>What you'll do on the next screen:</strong></p>
    <ul style="font-size: 14px; line-height: 1.6; padding-left: 20px; margin: 0 0 20px;">
      <li>Confirm you are their parent or legal guardian</li>
      <li>Set up your own Afterroar account ($5/mo) so you stay connected to them</li>
      <li>Verify your identity (we use Persona; quick photo of your ID)</li>
    </ul>
    <p style="font-size: 14px; line-height: 1.55; margin: 0 0 16px;">
      Their account will be set to the most private settings by default. They will not be able to receive direct messages from adults, host public events, or be discovered outside their approved circle without your involvement.
    </p>
    <p style="font-size: 13px; color: #666; line-height: 1.5; margin: 0 0 8px;">
      Or copy this link into your browser:<br>
      <span style="word-break: break-all;">${approveUrl}</span>
    </p>
    <p style="font-size: 12px; color: #999; margin: 24px 0 0;">
      This link expires in ${expiresHours} hours. If you didn't expect this email, you can ignore it — no account will be created without your action.
    </p>
  </body>
</html>`.trim();

  return { subject, html, text };
}
