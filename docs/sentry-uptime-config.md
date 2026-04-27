# Sentry Uptime Monitor — config to apply

5–10 minute task in the Sentry web UI. Sentry pings each URL on a schedule, alerts if it fails N consecutive times.

## Where to go

Sentry → your org → **Insights** → **Uptime** (left sidebar) → **Add Uptime Monitor**. Or directly: `https://sentry.io/organizations/<your-org>/uptime/`.

## Monitors to add

Same shape for all four. Adjust threshold/interval to taste.

| # | Name | URL | Interval | Failure threshold |
|---|---|---|---|---|
| 1 | Store Ops | `https://www.afterroar.store/api/health` | 60s | 2 consecutive |
| 2 | Passport | `https://www.afterroar.me/api/health` | 60s | 2 consecutive |
| 3 | Game Night HQ | `https://hq.fulluproar.com/api/health` | 60s | 2 consecutive |
| 4 | FU Site | `https://www.fulluproar.com/api/health?basic=true` | 60s | 2 consecutive |

**Why `?basic=true` only on FU Site**: `apps/site`'s `/api/health` requires admin auth for the full payload by design (exposes memory + service internals). The `?basic=true` shortcut returns just `{status: 'ok'}` unauthenticated — that's what the monitor needs.

**Why 60s + 2 consecutive failures**: rules out flaps. A single 503 from a transient connection blip won't page you; two in a row almost certainly means real outage.

## Alert rules

Per monitor:
- **Notify**: SMS (via Sentry's Twilio integration — same Twilio account already configured for the SMS-consent flow) **and** email.
- **Send to**: shawnoah.pollock@gmail.com + the +1 phone number you want SMS at.
- **Recovery notification**: yes (so you know when the surface is back).

Optional: set up a Slack channel `#alerts` and add it as a third path. SMS bounces or carriers occasionally drop; redundancy across email + SMS + Slack is cheap.

## SLO config (optional but recommended)

Sentry → **Service Level Objectives** → add an SLO per monitor with target = 99.5% uptime over 30d. Gives you a running burn-rate alert separate from per-incident pings — useful for "we've had 3 partial outages this month, that's the trend, not random."

## What this gets you

| Failure mode | Time to alert |
|---|---|
| App crashes, returns 5xx | ≤2 minutes (60s × 2 polls) |
| Vercel deploy fails / unreachable | ≤2 minutes |
| DB fully down (health returns 503) | ≤2 minutes |
| Sentry itself is down | No alert (covered by phone-native watchdog) |
| Home internet is down | False alert risk; carrier-redundant SMS still arrives |

## What this does NOT cover

- **Slow but technically up** (p95 latency triples, still 200) — needs a separate performance budget alert.
- **Partial outage of a feature** (checkout flow broken but `/api/health` fine) — needs a synthetic transaction monitor, later work.
- **Sentry down at the same time as your apps** — the phone-native Capacitor watchdog covers this.

## After adding the four monitors

1. Trigger a fake outage to confirm SMS arrives. Easiest: temporarily block your own IP at `afterroar.me/api/health` via Cloudflare WAF, wait 2 minutes, unblock. Or flip a monitor's threshold to 1, deploy a route that returns 500, wait, revert.
2. Document the on-call playbook somewhere short. What does Shawn-on-the-phone do when SMS arrives at 2 AM?
3. Cross-reference with the dashboard at `https://www.afterroar.me/admin/health` — that's the visibility surface; Sentry is the alerting surface.
