"use client";

import React from "react";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/*  Shared UI Components                                               */
/*  Single source of truth for common UI patterns across Store Ops.    */
/*  Used by: dashboard, fulfillment, orders, events, staff, reports,   */
/*  customers, inventory, and all detail pages.                        */
/* ------------------------------------------------------------------ */

/* ---- StatusBadge ---- */

const STATUS_COLORS: Record<string, string> = {
  // Green — active/live states
  active: "bg-green-500/20 text-green-400 border-green-500/30",
  open: "bg-green-500/20 text-green-400 border-green-500/30",
  available: "bg-green-500/20 text-green-400 border-green-500/30",
  in_stock: "bg-green-500/20 text-green-400 border-green-500/30",

  // Yellow — pending/waiting states
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  processing: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  picking: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  unfulfilled: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",

  // Blue — in-progress/shipped states
  shipped: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  packed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  in_progress: "bg-blue-500/20 text-blue-400 border-blue-500/30",

  // Emerald — completed/done states
  completed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  delivered: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  fulfilled: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",

  // Red — cancelled/inactive states
  cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
  inactive: "bg-red-500/20 text-red-400 border-red-500/30",
  closed: "bg-red-500/20 text-red-400 border-red-500/30",

  // Gray — draft/paused states
  draft: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  paused: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

const BADGE_SIZE_CLASSES = {
  xs: "text-[10px] px-1.5 py-0 leading-4",
  sm: "text-xs px-2 py-0.5",
  md: "text-sm px-2.5 py-1",
};

export function StatusBadge({
  status,
  size = "sm",
  className = "",
}: {
  status: string;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const key = status.toLowerCase().replace(/[\s-]+/g, "_");
  const colors = STATUS_COLORS[key] || "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
  const sizeClass = BADGE_SIZE_CLASSES[size];

  return (
    <span
      className={`inline-block rounded-full border font-medium capitalize whitespace-nowrap ${sizeClass} ${colors} ${className}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

/* ---- ActionButton ---- */

const VARIANT_CLASSES = {
  primary: "bg-green-600 text-white hover:bg-green-700",
  secondary: "border border-card-border text-foreground hover:bg-card-hover",
  destructive: "bg-red-600 text-white hover:bg-red-700",
  accent: "bg-[#FF8200] text-white hover:bg-[#e67400]",
  ghost: "text-muted hover:text-foreground",
};

const BUTTON_SIZE_CLASSES = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-3 text-base",
};

export function ActionButton({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  className = "",
  children,
  ...props
}: {
  variant?: "primary" | "secondary" | "destructive" | "accent" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "disabled">) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none ${VARIANT_CLASSES[variant]} ${BUTTON_SIZE_CLASSES[size]} ${className}`}
      {...props}
    >
      {loading && <span className="animate-spin inline-block">&#9696;</span>}
      {children}
    </button>
  );
}

/* ---- StatCard ---- */

const STAT_ACCENT_CLASSES = {
  default: "text-foreground",
  green: "text-green-400",
  red: "text-red-400",
  amber: "text-amber-400",
  purple: "text-purple-400",
};

export function StatCard({
  label,
  value,
  trend,
  trendUp,
  accent = "default",
  className = "",
}: {
  label: string;
  value: string;
  trend?: string;
  trendUp?: boolean;
  accent?: "default" | "green" | "red" | "amber" | "purple";
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-card-border bg-card p-4 ${className}`}>
      <p className="text-xs text-muted uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-xl font-bold ${STAT_ACCENT_CLASSES[accent]}`}>
        {value}
      </p>
      {trend && (
        <p className={`mt-0.5 text-xs font-medium ${trendUp ? "text-green-400" : "text-red-400"}`}>
          {trend}
        </p>
      )}
    </div>
  );
}

/* ---- EmptyState ---- */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon: string;
  title: string;
  description?: string;
  action?: { label: string; href?: string; onClick?: () => void };
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-card-border bg-card p-8 text-center shadow-sm dark:shadow-none ${className}`}>
      <span className="text-4xl block mx-auto mb-3 opacity-60">{icon}</span>
      <p className="text-lg font-medium text-foreground">{title}</p>
      {description && <p className="text-sm text-muted mt-1">{description}</p>}
      {action && (
        action.href ? (
          <Link
            href={action.href}
            className="inline-block mt-4 px-4 py-2 bg-accent hover:opacity-90 text-white rounded-xl text-sm font-medium transition-opacity"
          >
            {action.label}
          </Link>
        ) : (
          <button
            onClick={action.onClick}
            className="mt-4 px-4 py-2 bg-accent hover:opacity-90 text-white rounded-xl text-sm font-medium transition-opacity"
          >
            {action.label}
          </button>
        )
      )}
    </div>
  );
}

/* ---- DataRow ---- */

export function DataRow({
  label,
  value,
  muted = false,
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  muted?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between py-2 ${className}`}>
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-sm font-medium ${muted ? "text-muted" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

/* ---- MonoValue ---- */

const MONO_SIZE_CLASSES = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
};

export function MonoValue({
  size = "md",
  className = "",
  children,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={`font-mono font-bold tabular-nums ${MONO_SIZE_CLASSES[size]} ${className}`}>
      {children}
    </span>
  );
}

/* ---- SectionHeader ---- */

export function SectionHeader({
  children,
  count,
  className = "",
}: {
  children: string;
  count?: number;
  className?: string;
}) {
  return (
    <h2 className={`text-base font-semibold text-foreground flex items-center gap-2 ${className}`}>
      {children}
      {count !== undefined && (
        <span className="text-xs font-normal text-muted bg-card-hover rounded-full px-2 py-0.5 tabular-nums">
          {count}
        </span>
      )}
    </h2>
  );
}

/* ---- Re-exports for convenience ---- */

export { STATUS_COLORS };
