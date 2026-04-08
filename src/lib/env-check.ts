/* ------------------------------------------------------------------ */
/*  Environment Variable Validation                                     */
/*  Fails fast with clear error messages instead of cryptic runtime      */
/*  errors. Called from instrumentation.ts on app startup.               */
/* ------------------------------------------------------------------ */

export function validateEnv() {
  const required = [
    "DATABASE_URL",
  ];

  const recommended = [
    "AUTH_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ];

  const missing: string[] = [];
  const warnings: string[] = [];

  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  for (const key of recommended) {
    if (!process.env[key]) {
      warnings.push(key);
    }
  }

  if (missing.length > 0) {
    console.error(
      `[ENV CHECK] FATAL: Missing required environment variables: ${missing.join(", ")}`
    );
    // Don't throw in production — let the app start and fail on first use
    // But make the error LOUD
  }

  if (warnings.length > 0) {
    console.warn(
      `[ENV CHECK] Missing recommended environment variables: ${warnings.join(", ")}. ` +
      `Some features will be disabled.`
    );
  }

  // Feature availability report
  const features: Record<string, boolean> = {
    "Stripe Payments": !!process.env.STRIPE_SECRET_KEY,
    "AI Features": !!process.env.ANTHROPIC_API_KEY,
    "HQ Bridge": !!(process.env.HQ_WEBHOOK_URL || process.env.NEXT_PUBLIC_HQ_URL),
    "Shopify Sync": !!process.env.SHOPIFY_ACCESS_TOKEN,
    "eBay Integration": !!process.env.EBAY_USER_TOKEN,
  };

  const enabled = Object.entries(features)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const disabled = Object.entries(features)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (enabled.length > 0) {
    console.log(`[ENV CHECK] Enabled: ${enabled.join(", ")}`);
  }
  if (disabled.length > 0) {
    console.log(`[ENV CHECK] Disabled (no key): ${disabled.join(", ")}`);
  }
}
