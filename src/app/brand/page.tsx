"use client";

import { useState } from "react";

const COLORS = {
  primary: [
    { name: "Chaos Orange", dark: "#FF8200", light: "#D97706", usage: "Primary accent, CTAs, active nav" },
    { name: "Background", dark: "#0a0a0a", light: "#fafafa", usage: "Page background" },
    { name: "Surface", dark: "#1a1a2e", light: "#ffffff", usage: "Cards, panels, inputs" },
    { name: "Surface Border", dark: "#2a2a3e", light: "#e5e5e5", usage: "Card borders, dividers" },
    { name: "Surface Hover", dark: "#222240", light: "#f5f5f5", usage: "Hover/active states" },
    { name: "Foreground", dark: "#e2e8f0", light: "#1a1a1a", usage: "Primary text" },
    { name: "Muted", dark: "#94a3b8", light: "#6b7280", usage: "Secondary text, labels" },
  ],
  accent: [
    { name: "Chaos Orange", hex: "#FF8200", usage: "Primary actions, nav highlights, brand" },
    { name: "Afterroar Purple", hex: "#7D55C7", usage: "GOD MODE, Afterroar-linked, premium" },
    { name: "Register Green", hex: "#16a34a", usage: "PAY button, success, available" },
  ],
  status: [
    { name: "Success", border: "#22c55e", text: "#4ade80", textLight: "#16a34a", usage: "Completed, active" },
    { name: "Pending", border: "#f59e0b", text: "#fbbf24", textLight: "#d97706", usage: "In progress, awaiting" },
    { name: "Warning", border: "#f97316", text: "#fb923c", textLight: "#ea580c", usage: "Overdue, low stock" },
    { name: "Error", border: "#ef4444", text: "#f87171", textLight: "#dc2626", usage: "Failed, cancelled" },
    { name: "Info", border: "#64748b", text: "#94a3b8", textLight: "#6b7280", usage: "Neutral, default" },
    { name: "Special", border: "#7D55C7", text: "#a78bfa", textLight: "#7D55C7", usage: "Afterroar-linked" },
  ],
};

const TYPOGRAPHY = [
  { level: "Page Title", size: "1.5rem", weight: "600", example: "Store Settings" },
  { level: "Section Head", size: "0.875rem", weight: "600", example: "Afterroar Integration" },
  { level: "Body", size: "0.875rem", weight: "400", example: "Ring up a sale, check inventory, manage your store." },
  { level: "Small", size: "0.75rem", weight: "500", example: "Last updated 2 hours ago" },
  { level: "Caption", size: "0.625rem", weight: "500", example: "COMPLETED" },
  { level: "Price", size: "0.875rem", weight: "600", example: "$42.50", mono: true },
];

function Swatch({ color, label, size = "h-16" }: { color: string; label: string; size?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`${size} w-full rounded-xl border border-white/10`} style={{ backgroundColor: color }} />
      <span className="text-xs font-mono opacity-70">{color}</span>
      <span className="text-xs opacity-50">{label}</span>
    </div>
  );
}

export default function BrandGuidePage() {
  const [mode, setMode] = useState<"dark" | "light">("dark");
  const isDark = mode === "dark";

  const bg = isDark ? "#0a0a0a" : "#fafafa";
  const fg = isDark ? "#e2e8f0" : "#1a1a1a";
  const card = isDark ? "#1a1a2e" : "#ffffff";
  const cardBorder = isDark ? "#2a2a3e" : "#e5e5e5";
  const muted = isDark ? "#94a3b8" : "#6b7280";
  const accent = isDark ? "#FF8200" : "#D97706";
  const accentLight = isDark ? "#451a03" : "#fef3c7";

  return (
    <div className="min-h-screen transition-colors duration-300" style={{ backgroundColor: bg, color: fg }}>
      {/* Header */}
      <div className="sticky top-0 z-10 border-b backdrop-blur-sm" style={{ borderColor: cardBorder, backgroundColor: `${bg}ee` }}>
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center">
              <svg viewBox="0 0 100 100" className="h-8 w-8">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#FF8200" strokeWidth="8" strokeLinecap="round" strokeDasharray="220 30" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold">Afterroar Store Ops</h1>
              <p className="text-xs" style={{ color: muted }}>Brand Style Guide</p>
            </div>
          </div>
          <div className="flex rounded-xl border p-0.5" style={{ borderColor: cardBorder, backgroundColor: card }}>
            <button
              onClick={() => setMode("dark")}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor: isDark ? accent : "transparent",
                color: isDark ? "#fff" : muted,
              }}
            >
              Dark
            </button>
            <button
              onClick={() => setMode("light")}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor: !isDark ? accent : "transparent",
                color: !isDark ? "#fff" : muted,
              }}
            >
              Light
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-12 space-y-16">
        {/* Identity */}
        <section>
          <h2 className="text-2xl font-semibold mb-2">Identity</h2>
          <p style={{ color: muted }} className="text-sm max-w-2xl">
            The operating system for friendly local game stores. Store Ops inherits Full Uproar&apos;s
            energy but channels it into calm, functional, trustworthy design.
            Same DNA, wearing a work shirt.
          </p>
        </section>

        {/* Logo */}
        <section>
          <h2 className="text-xl font-semibold mb-6">Logo</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { bg: "#0a0a0a", label: "On dark" },
              { bg: "#1a1a2e", label: "On surface" },
              { bg: "#fafafa", label: "On light" },
              { bg: "#FF8200", label: "On accent" },
            ].map((variant) => (
              <div
                key={variant.label}
                className="flex flex-col items-center gap-2 rounded-xl border p-6"
                style={{ borderColor: cardBorder, backgroundColor: variant.bg }}
              >
                <svg viewBox="0 0 100 100" className="h-16 w-16">
                  <circle
                    cx="50" cy="50" r="40" fill="none"
                    stroke={variant.bg === "#FF8200" ? "#fff" : "#FF8200"}
                    strokeWidth="8" strokeLinecap="round" strokeDasharray="220 30"
                  />
                </svg>
                <span className="text-xs" style={{ color: variant.bg === "#0a0a0a" || variant.bg === "#1a1a2e" ? "#94a3b8" : variant.bg === "#FF8200" ? "#fff" : "#6b7280" }}>
                  {variant.label}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs" style={{ color: muted }}>
            The Afterroar Ring — always an open stroke, never filled. Minimum 8px clear space at any size.
          </p>
        </section>

        {/* Primary Colors */}
        <section>
          <h2 className="text-xl font-semibold mb-2">Primary Palette</h2>
          <p className="text-xs mb-6" style={{ color: muted }}>
            Showing {isDark ? "dark" : "light"} mode values. Toggle above to compare.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {COLORS.primary.map((c) => (
              <Swatch key={c.name} color={isDark ? c.dark : c.light} label={c.name} />
            ))}
          </div>
        </section>

        {/* Accent Colors */}
        <section>
          <h2 className="text-xl font-semibold mb-6">Accent Colors</h2>
          <div className="grid grid-cols-3 gap-4">
            {COLORS.accent.map((c) => (
              <div key={c.name} className="text-center">
                <div className="h-24 rounded-xl border" style={{ backgroundColor: c.hex, borderColor: `${c.hex}44` }} />
                <p className="mt-2 text-sm font-medium">{c.name}</p>
                <p className="text-xs font-mono" style={{ color: muted }}>{c.hex}</p>
                <p className="text-xs mt-1" style={{ color: muted }}>{c.usage}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Status Badges */}
        <section>
          <h2 className="text-xl font-semibold mb-6">Status Badges</h2>
          <p className="text-xs mb-4" style={{ color: muted }}>
            Outline style — border + text color, transparent background. Never filled.
          </p>
          <div className="flex flex-wrap gap-3">
            {COLORS.status.map((s) => (
              <span
                key={s.name}
                className="rounded-full border px-3 py-1 text-xs font-medium"
                style={{
                  borderColor: `${s.border}44`,
                  color: isDark ? s.text : s.textLight,
                }}
              >
                {s.name}
              </span>
            ))}
          </div>
          <div className="mt-6 rounded-xl border p-4" style={{ borderColor: cardBorder, backgroundColor: card }}>
            <p className="text-xs font-medium mb-3" style={{ color: muted }}>In context:</p>
            <div className="space-y-2">
              {[
                { badge: "Completed", color: COLORS.status[0], text: "Trade-in #1042 — Marcus Thompson" },
                { badge: "In Progress", color: COLORS.status[1], text: "FNM Round 3 — 12 players" },
                { badge: "Overdue", color: COLORS.status[2], text: "Wingspan — Table 4, 2h over" },
                { badge: "Cancelled", color: COLORS.status[3], text: "Order #2081 — refund issued" },
              ].map((item) => (
                <div key={item.badge} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ backgroundColor: isDark ? "#12122a" : "#f9fafb" }}>
                  <span className="text-sm">{item.text}</span>
                  <span
                    className="rounded-full border px-2 py-0.5 text-xs font-medium"
                    style={{
                      borderColor: `${item.color.border}44`,
                      color: isDark ? item.color.text : item.color.textLight,
                    }}
                  >
                    {item.badge}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Typography */}
        <section>
          <h2 className="text-xl font-semibold mb-6">Typography</h2>
          <div className="space-y-4">
            {TYPOGRAPHY.map((t) => (
              <div
                key={t.level}
                className="flex items-baseline justify-between rounded-xl border px-4 py-3"
                style={{ borderColor: cardBorder, backgroundColor: card }}
              >
                <div className="flex-1 min-w-0">
                  <span
                    className={t.mono ? "font-mono" : ""}
                    style={{
                      fontSize: t.size,
                      fontWeight: parseInt(t.weight),
                      fontVariantNumeric: t.mono ? "tabular-nums" : undefined,
                    }}
                  >
                    {t.example}
                  </span>
                </div>
                <div className="ml-4 shrink-0 text-right">
                  <p className="text-xs font-medium">{t.level}</p>
                  <p className="text-xs font-mono" style={{ color: muted }}>
                    {t.size} / {t.weight}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Components */}
        <section>
          <h2 className="text-xl font-semibold mb-6">Components</h2>

          {/* Buttons */}
          <h3 className="text-sm font-semibold mb-3" style={{ color: muted }}>Buttons</h3>
          <div className="flex flex-wrap gap-3 mb-8">
            <button className="rounded-xl px-4 py-2.5 text-sm font-medium text-white" style={{ backgroundColor: accent }}>
              Primary Action
            </button>
            <button className="rounded-xl px-4 py-2.5 text-sm font-medium text-white" style={{ backgroundColor: "#16a34a" }}>
              Complete Sale
            </button>
            <button
              className="rounded-xl border px-4 py-2.5 text-sm font-medium"
              style={{ borderColor: cardBorder, backgroundColor: card }}
            >
              Secondary
            </button>
            <button className="rounded-xl px-4 py-2.5 text-sm font-medium" style={{ color: muted }}>
              Ghost
            </button>
            <button
              className="rounded-xl border px-4 py-2.5 text-sm font-medium"
              style={{ borderColor: "#ef444444", color: isDark ? "#f87171" : "#dc2626" }}
            >
              Destructive
            </button>
          </div>

          {/* Cards */}
          <h3 className="text-sm font-semibold mb-3" style={{ color: muted }}>Cards</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
            <div className="rounded-xl border p-4" style={{ borderColor: cardBorder, backgroundColor: card, boxShadow: isDark ? "none" : "0 1px 2px rgba(0,0,0,0.05)" }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Lightning Bolt</span>
                <span className="text-sm font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>$2.50</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xs" style={{ color: muted }}>MTG · Foundations · NM</span>
                <span
                  className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
                  style={{ borderColor: "#22c55e33", color: isDark ? "#4ade80" : "#16a34a" }}
                >
                  In Stock
                </span>
              </div>
            </div>
            <div className="rounded-xl border p-4" style={{ borderColor: cardBorder, backgroundColor: card, boxShadow: isDark ? "none" : "0 1px 2px rgba(0,0,0,0.05)" }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">FNM Standard</span>
                <span className="text-sm font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>$5.00</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xs" style={{ color: muted }}>Tonight 6PM · 18 players</span>
                <span
                  className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
                  style={{ borderColor: "#f59e0b33", color: isDark ? "#fbbf24" : "#d97706" }}
                >
                  Upcoming
                </span>
              </div>
            </div>
          </div>

          {/* Inputs */}
          <h3 className="text-sm font-semibold mb-3" style={{ color: muted }}>Inputs</h3>
          <div className="max-w-sm space-y-3 mb-8">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: muted }}>Search</label>
              <input
                type="text"
                placeholder="Scan barcode or search..."
                className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none"
                style={{
                  borderColor: isDark ? "#2a2a3e" : "#d4d4d8",
                  backgroundColor: isDark ? "#1a1a2e" : "#ffffff",
                  color: fg,
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: muted }}>With focus ring</label>
              <input
                type="text"
                defaultValue="Lightning Bolt"
                className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none ring-1"
                style={{
                  borderColor: accent,
                  backgroundColor: isDark ? "#1a1a2e" : "#ffffff",
                  color: fg,
                  boxShadow: `0 0 0 3px ${accent}22`,
                }}
              />
            </div>
          </div>
        </section>

        {/* Voice */}
        <section>
          <h2 className="text-xl font-semibold mb-6">Voice &amp; Tone</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border p-4" style={{ borderColor: "#22c55e33", backgroundColor: isDark ? "#0a1a0a" : "#f0fdf4" }}>
              <p className="text-xs font-semibold mb-3" style={{ color: isDark ? "#4ade80" : "#16a34a" }}>Say this</p>
              <ul className="space-y-2 text-sm">
                <li>&ldquo;Ring up a sale&rdquo;</li>
                <li>&ldquo;Your FNM brought in $450 tonight&rdquo;</li>
                <li>&ldquo;3 items running low&rdquo;</li>
                <li>&ldquo;Something went wrong. Try again.&rdquo;</li>
              </ul>
            </div>
            <div className="rounded-xl border p-4" style={{ borderColor: "#ef444433", backgroundColor: isDark ? "#1a0a0a" : "#fef2f2" }}>
              <p className="text-xs font-semibold mb-3" style={{ color: isDark ? "#f87171" : "#dc2626" }}>Not this</p>
              <ul className="space-y-2 text-sm" style={{ color: muted }}>
                <li>&ldquo;Process a point-of-sale transaction&rdquo;</li>
                <li>&ldquo;Event revenue report generated successfully&rdquo;</li>
                <li>&ldquo;Inventory alert: threshold breach detected&rdquo;</li>
                <li>&ldquo;Error 500: Internal server error&rdquo;</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Brand Relationship */}
        <section>
          <h2 className="text-xl font-semibold mb-6">Brand Relationship</h2>
          <div className="rounded-xl border p-6 space-y-4" style={{ borderColor: cardBorder, backgroundColor: card }}>
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: "#FF8200" }} />
              <div>
                <p className="text-sm font-semibold">Full Uproar Games</p>
                <p className="text-xs" style={{ color: muted }}>Fugly. Bold. Unapologetic. Dark mode only.</p>
              </div>
            </div>
            <div className="ml-6 border-l-2 pl-4 space-y-4" style={{ borderColor: cardBorder }}>
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: "#7D55C7" }} />
                <div>
                  <p className="text-sm font-semibold">Afterroar HQ</p>
                  <p className="text-xs" style={{ color: muted }}>Game night platform. Player-facing. Community.</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: accent }} />
                <div>
                  <p className="text-sm font-semibold">Afterroar Store Ops</p>
                  <p className="text-xs" style={{ color: muted }}>Business OS. Staff-facing. Professional but not corporate.</p>
                </div>
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm" style={{ color: muted }}>
            Same DNA, different context. Store Ops needs to look good under fluorescent lights
            at 2 PM on a Tuesday, not just in a marketing hero section at midnight.
          </p>
        </section>

        {/* Footer */}
        <footer className="border-t pt-8 text-center" style={{ borderColor: cardBorder }}>
          <p className="text-xs" style={{ color: muted }}>
            Afterroar Store Ops — by Full Uproar Games
          </p>
          <p className="text-xs mt-1" style={{ color: `${muted}88` }}>
            Brand Guide v1.0 · March 2026
          </p>
        </footer>
      </div>
    </div>
  );
}
