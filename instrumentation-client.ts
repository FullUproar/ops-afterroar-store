import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  enabled: process.env.NODE_ENV === "production",

  // 10% of transactions in prod
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Session Replay: 0% general, 100% on errors
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  sendDefaultPii: false,

  integrations: [
    Sentry.replayIntegration(),
  ],

  ignoreErrors: [
    "ResizeObserver loop",
    "Non-Error promise rejection",
    "Load failed",
    "ChunkLoadError",
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
