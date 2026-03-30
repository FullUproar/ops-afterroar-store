"use client";

import React from "react";

interface MobileCardProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onClick?: () => void;
  children?: React.ReactNode;
}

export function MobileCard({ title, subtitle, right, onClick, children }: MobileCardProps) {
  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl border border-card-border bg-card px-4 py-3.5 md:px-5 md:py-4 text-left shadow-sm transition-colors dark:shadow-none ${
        onClick ? "active:bg-card-hover cursor-pointer" : ""
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="truncate text-sm md:text-base font-semibold text-foreground leading-snug">{title}</div>
        {subtitle && (
          <div className="truncate text-xs md:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">{subtitle}</div>
        )}
        {children}
      </div>
      {right && <div className="shrink-0">{right}</div>}
      {onClick && (
        <span className="shrink-0 text-muted text-sm">&#x203A;</span>
      )}
    </Wrapper>
  );
}

/* ------------------------------------------------------------------ */
/*  Reusable status badge component — Printify outline style           */
/* ------------------------------------------------------------------ */
type BadgeVariant = "success" | "pending" | "warning" | "error" | "info" | "special";

const BADGE_STYLES: Record<BadgeVariant, string> = {
  success: "border-green-500/30 text-green-600 dark:text-green-400",
  pending: "border-amber-500/30 text-amber-600 dark:text-amber-400",
  warning: "border-orange-500/30 text-orange-600 dark:text-orange-400",
  error: "border-red-500/30 text-red-600 dark:text-red-400",
  info: "border-zinc-400/30 text-zinc-500 dark:text-zinc-400",
  special: "border-purple-500/30 text-purple-600 dark:text-purple-400",
};

interface StatusBadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export function StatusBadge({ variant = "info", children, className = "" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${BADGE_STYLES[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
