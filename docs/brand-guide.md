# Afterroar Store Ops — Brand Style Guide

**Last updated:** March 27, 2026
**Parent brand:** Full Uproar Games, Inc.
**Relationship:** Store Ops is a professional business tool under the Afterroar ecosystem. It inherits Full Uproar's energy but channels it into calm, functional, trustworthy design. Think: the same DNA, wearing a work shirt.

---

## Brand Identity

**Tagline:** "The operating system for friendly local game stores."

**Brand voice:** Confident, clear, helpful. Never corporate. Never chaotic.

| Say this | Not this |
|----------|----------|
| "Ring up a sale" | "Process a point-of-sale transaction" |
| "Your FNM brought in $450 tonight" | "Event revenue report generated successfully" |
| "3 items running low" | "Inventory alert: threshold breach detected" |
| "Link your Afterroar account" | "Initiate federated identity synchronization" |
| "Something went wrong. Try again." | "Error 500: Internal server error" |

**Tone by context:**
- **Register/checkout:** Minimal. Get out of the way. Speed is the UX.
- **Dashboard/reports:** Insightful. Tell them something they didn't know.
- **Settings/admin:** Calm. Explain what each option does in plain English.
- **Empty states:** Encouraging. Show them what to do, not what's missing.
- **Errors:** Honest. Say what happened and what to do next.

---

## Logo

**Primary mark:** The Afterroar Ring — a hand-drawn open circle in Chaos Orange.

**Usage:**
- Favicon: Ring mark only, 16x16 and 32x32
- App icon (PWA): Ring mark on dark background, 192x192 and 512x512
- Login page: Ring mark above "Afterroar" wordmark
- Bottom nav: Ring mark as the brand touch point
- Loading states: Ring mark as spinner (rotate animation)

**Clear space:** Minimum 8px around the ring mark at any size.

**Don'ts:**
- Don't fill the ring (it's always an open stroke)
- Don't change the ring color
- Don't add drop shadows or effects
- Don't place the orange ring on orange backgrounds
- Don't use the Full Uproar wordmark on Store Ops screens

**Footer text:** "Afterroar Store Ops — by Full Uproar Games"

---

## Colors

### Primary Palette

| Name | Dark Mode | Light Mode | Usage |
|------|-----------|------------|-------|
| **Chaos Orange** | `#FF8200` | `#D97706` | Primary accent, CTAs, active nav, brand elements |
| **Background** | `#0a0a0a` | `#fafafa` | Page background |
| **Surface** | `#1a1a2e` | `#ffffff` | Cards, panels, inputs |
| **Surface Border** | `#2a2a3e` | `#e5e5e5` | Card borders, dividers |
| **Surface Hover** | `#222240` | `#f5f5f5` | Hover/active state on cards |
| **Foreground** | `#e2e8f0` | `#1a1a1a` | Primary text |
| **Muted** | `#94a3b8` | `#6b7280` | Secondary text, labels, placeholders |

### Accent Colors

| Name | Hex | Usage |
|------|-----|-------|
| **Chaos Orange** | `#FF8200` | Primary actions, nav highlights, brand accent |
| **Afterroar Purple** | `#7D55C7` | GOD MODE, Afterroar-linked badges, premium features |
| **Register Green** | `#16a34a` | PAY button, success states, "available" badges |

### Status Colors

Used for badges, alerts, and indicators. Same in both modes.

| Status | Border | Text (Dark) | Text (Light) | Usage |
|--------|--------|-------------|--------------|-------|
| **Success** | `#22c55e33` | `#4ade80` | `#16a34a` | Completed, active, in stock |
| **Pending** | `#f59e0b33` | `#fbbf24` | `#d97706` | In progress, awaiting action |
| **Warning** | `#f9731633` | `#fb923c` | `#ea580c` | Overdue, low stock |
| **Error** | `#ef444433` | `#f87171` | `#dc2626` | Failed, cancelled, out of stock |
| **Info** | `#64748b33` | `#94a3b8` | `#6b7280` | Neutral, default |
| **Special** | `#7D55C733` | `#a78bfa` | `#7D55C7` | Afterroar-linked, premium |

### Badge Style

Outline style — never filled. Border + text color, transparent background.

```
Dark:  border-[color]/20 text-[color]-400 bg-transparent
Light: border-[color]/30 text-[color]-600 bg-transparent
```

### Color Rules

- **Never** use Tailwind's default orange (`#f97316`) — use Chaos Orange (`#FF8200`)
- **Never** use pure black text in light mode — use `#1a1a1a`
- **Never** use pure white backgrounds — use `#fafafa`
- **Always** use CSS variables, never hardcode hex values in components
- The subtle blue tint in dark surfaces (`#1a1a2e`) is intentional — it prevents the "cheap dark mode" look

---

## CSS Variables

```css
/* Dark mode (default) */
:root {
  --background: #0a0a0a;
  --foreground: #e2e8f0;
  --card: #1a1a2e;
  --card-border: #2a2a3e;
  --card-hover: #222240;
  --muted: #94a3b8;
  --accent: #FF8200;
  --accent-light: #451a03;
  --input-bg: #1a1a2e;
  --input-border: #2a2a3e;
  --overlay-bg: rgba(0, 0, 0, 0.7);
}

/* Light mode */
html.light {
  --background: #fafafa;
  --foreground: #1a1a1a;
  --card: #ffffff;
  --card-border: #e5e5e5;
  --card-hover: #f5f5f5;
  --muted: #6b7280;
  --accent: #D97706;
  --accent-light: #fef3c7;
  --input-bg: #ffffff;
  --input-border: #d4d4d8;
  --overlay-bg: rgba(0, 0, 0, 0.4);
}
```

---

## Typography

**Font stack:** System fonts (Geist Sans via Next.js, falls back to system UI)

| Level | Size | Weight | Color | Usage |
|-------|------|--------|-------|-------|
| Page title | 1.5rem (24px) | 600 (semibold) | `--foreground` | Page headers (desktop only) |
| Section head | 0.875rem (14px) | 600 (semibold) | `--foreground` | Card section titles |
| Body | 0.875rem (14px) | 400 (normal) | `--foreground` | Standard text |
| Small | 0.75rem (12px) | 500 (medium) | `--muted` | Labels, timestamps, secondary info |
| Caption | 0.625rem (10px) | 500 (medium) | `--muted` | Badge text, tiny labels |
| Price/Amount | 0.875rem (14px) | 600 (semibold) | `--foreground` | Always `tabular-nums` |

### Typography Rules

- **Never** use `font-bold` (700) on cards — use `font-semibold` (600)
- **Never** use `font-bold` on page titles — use `font-semibold` (600)
- **Always** use `tabular-nums` on prices, quantities, and amounts
- **Always** use `leading-snug` on card content for tighter line height
- Page titles are `hidden md:block` on mobile (bottom nav provides context)
- Prices are right-aligned in tables and cards

---

## Iconography

**Framework:** Unicode symbols (current) → migrate to Lucide React (outline only)

**Current nav icons:** `◈ ⌂ ▦ ♜ ⇄ ♟ ★ ⚔ ◩ ◎ ⚙`

**Target:** Lucide React icons, outline style, 20px default size. Match Full Uproar's icon convention.

**Approved icon mapping:**
| Feature | Current | Lucide Target |
|---------|---------|---------------|
| Register | ◈ | `ShoppingCart` |
| Dashboard | ⌂ | `LayoutDashboard` |
| Inventory | ▦ | `Package` |
| Game Library | ♜ | `Gamepad2` |
| Trade-Ins | ⇄ | `ArrowLeftRight` |
| Customers | ♟ | `Users` |
| Events | ★ | `Calendar` |
| Tournaments | ⚔ | `Trophy` |
| Reports | ◩ | `BarChart3` |
| Cash Flow | ◎ | `TrendingUp` |
| Settings | ⚙ | `Settings` |
| Orders | ⊟ | `Truck` |
| Gift Cards | ◆ | `Gift` |

---

## Components

### Cards

```
Mobile: rounded-xl, border border-card-border, bg-card
        shadow-sm (light only), px-4 py-3.5
        12px gap between cards (space-y-3)

Desktop: Same, but can be in grid layouts
```

### Buttons

| Type | Style | Usage |
|------|-------|-------|
| **Primary** | `bg-accent text-white rounded-xl px-4 py-2.5` | Main CTAs |
| **PAY** | `bg-green-600 text-white rounded-xl py-3 w-full` | Checkout complete |
| **Secondary** | `border border-card-border bg-card text-foreground rounded-xl` | Cancel, secondary actions |
| **Ghost** | `text-muted hover:text-foreground` | Subtle actions, links |
| **Destructive** | `border border-red-500/30 text-red-400 rounded-xl` | Delete, cancel, disconnect |

All buttons: `min-height: 44px` on mobile. `active:scale-[0.98]` for press feedback.

### Inputs

```
rounded-xl border border-input-border bg-input-bg
px-4 py-2.5 text-sm text-foreground
placeholder:text-muted
focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30
```

On mobile: `font-size: 16px !important` (prevents iOS zoom)

### Modals

- Desktop: centered, max-w-md, rounded-xl
- Mobile: slide up from bottom, rounded-t-2xl, full width
- Always: X close button, Escape to close, backdrop click to close
- `mx-4` padding on mobile for safe edges

### Status Badges

Outline style (Printify-inspired):
```
rounded-full border px-2 py-0.5 text-xs font-medium
```
Never filled background. Border + text color only.

---

## Layout

### Desktop (md+)
- Sidebar (w-56) on left
- Main content area with p-6
- Max content width: none (fills available space)

### Mobile (<md)
- No sidebar
- Bottom tab bar (64px + safe area)
- Main content with p-4, pb-20 (above bottom nav)
- Page titles hidden (bottom nav provides context)
- Back arrow (←) in PageHeader for navigation

### Bottom Nav
- 4 items: 3 configurable favorites + "More"
- 64px height + safe area padding
- Active: accent color icon + label, thin top border
- Inactive: muted icon + label

---

## Motion

| Animation | Duration | Easing | Usage |
|-----------|----------|--------|-------|
| Slide in (right) | 250ms | ease-out | Desktop slide-over panels |
| Slide up | 250ms | ease-out | Mobile modals, More menu |
| Fade | 200ms | ease | Overlay backgrounds |
| Press | 100ms | ease | `scale(0.98)` on button tap |
| Toast | 2500ms | — | Auto-dismiss duration |

### Motion Rules
- No bouncy animations — this is a business tool
- No page transitions — instant navigation
- Modals animate in, instant close (no close animation)
- Loading states: simple spinner, never skeleton screens

---

## Accessibility

- Minimum tap target: 44x44px on mobile
- Contrast ratio: 4.5:1 minimum for body text
- Focus visible: `ring-2 ring-accent ring-offset-2`
- All images need alt text
- Form inputs need visible labels (not just placeholders)
- Color is never the ONLY indicator (always pair with text/icon)

---

## Brand Relationship

```
Full Uproar Games (parent)
├── fulluproar.com — Fugly. Bold. Unapologetic. Dark mode only.
│   Colors: #FF8200, #FBDB65, #7D55C7
│   Tone: Chaotic, playful, aggressive
│
├── Afterroar HQ — Game night platform
│   Inherits FU palette, slightly calmer tone
│   Player-facing, community-focused
│
└── Afterroar Store Ops — Business operating system
    Colors: #FF8200 (inherited), #D97706 (light mode)
    Tone: Confident, clear, helpful
    Supports light AND dark mode
    Professional but not corporate
    Same DNA, different context
```

The ring logo, the orange accent, and the purple for special features connect all three products visually. But Store Ops is the one that needs to look good under fluorescent lights at 2 PM on a Tuesday, not just in a marketing hero section at midnight.
