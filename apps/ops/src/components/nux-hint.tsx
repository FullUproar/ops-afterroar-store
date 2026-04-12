"use client";

import { useStoreSettings } from "@/lib/store-settings";

/* ------------------------------------------------------------------ */
/*  NUX Hint — new user experience helper                              */
/*  Shows contextual guidance for first-time users.                    */
/*  Globally dismissable via store settings.                           */
/*                                                                     */
/*  Usage:                                                             */
/*  <NuxHint>                                                          */
/*    <p>Scan a barcode or search to add your first item</p>           */
/*  </NuxHint>                                                         */
/* ------------------------------------------------------------------ */

interface NuxHintProps {
  children: React.ReactNode;
  /** Optional icon (emoji or text) */
  icon?: string;
}

export function NuxHint({ children, icon }: NuxHintProps) {
  const settings = useStoreSettings();

  if (settings.nux_dismissed) return null;

  return (
    <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 flex items-start gap-3">
      {icon && <span className="text-lg shrink-0 mt-0.5">{icon}</span>}
      <div className="text-sm text-foreground/80 leading-relaxed">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty State — shown when a list/page has no data                   */
/*  Always visible (not gated by NUX). Guides the user to take action. */
/*                                                                     */
/*  Usage:                                                             */
/*  <EmptyState                                                        */
/*    icon="📦"                                                        */
/*    title="No inventory yet"                                         */
/*    description="Add your first item to start selling."              */
/*    action={{ label: "Add Item", href: "/dashboard/inventory" }}     */
/*  />                                                                 */
/* ------------------------------------------------------------------ */

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  action?: { label: string; href: string };
  /** Optional NUX hint shown below the empty state (hidden when NUX dismissed) */
  nuxHint?: string;
}

export function EmptyState({ icon, title, description, action, nuxHint }: EmptyStateProps) {
  const settings = useStoreSettings();

  return (
    <div className="rounded-xl border border-card-border bg-card/80 p-8 md:p-12 text-center shadow-sm dark:shadow-none">
      {icon && <p className="text-4xl mb-4">{icon}</p>}
      <h3 className="text-base md:text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-muted max-w-md mx-auto">{description}</p>
      {action && (
        <a
          href={action.href}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          {action.label}
        </a>
      )}
      {nuxHint && !settings.nux_dismissed && (
        <p className="mt-4 text-xs text-muted/60 max-w-sm mx-auto italic">{nuxHint}</p>
      )}
    </div>
  );
}
