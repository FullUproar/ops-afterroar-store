import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only send errors in production
  enabled: process.env.NODE_ENV === "production",

  // Performance monitoring
  tracesSampleRate: 0.1, // 10% of transactions

  // Session replay for debugging UI issues
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0, // 100% of errors get replay

  // Don't send PII
  sendDefaultPii: false,

  // Filter out noisy errors
  ignoreErrors: [
    "ResizeObserver loop",
    "Non-Error promise rejection",
    "Load failed",
    "ChunkLoadError",
  ],
});
