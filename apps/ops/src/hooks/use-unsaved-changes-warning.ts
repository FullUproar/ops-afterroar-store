"use client";

import { useEffect } from "react";
import { useMode } from "@/lib/mode-context";

/* ------------------------------------------------------------------ */
/*  useUnsavedChangesWarning                                           */
/*                                                                     */
/*  Two-pronged guard for forms with unsaved changes:                 */
/*    1. Browser beforeunload — warns on tab close / hard nav.        */
/*    2. Mode switch guard    — registered with ModeContext so when   */
/*       the cashier toggles dashboard ↔ register, we surface a       */
/*       confirm() prompt before throwing the form data away.         */
/*                                                                     */
/*  Pair with useFormDraft to also auto-persist (so even if the user  */
/*  confirms switching modes, their draft is restored when they nav   */
/*  back to the form).                                                */
/*                                                                     */
/*  Usage:                                                             */
/*    const dirty = JSON.stringify(value) !== JSON.stringify(initial);*/
/*    useUnsavedChangesWarning(dirty);                                 */
/* ------------------------------------------------------------------ */

const DEFAULT_MESSAGE = "You have unsaved changes. Leave anyway?";

export function useUnsavedChangesWarning(
  hasUnsavedChanges: boolean,
  message: string = DEFAULT_MESSAGE,
): void {
  const { registerUnsavedGuard, unregisterUnsavedGuard } = useMode();

  // Browser-level beforeunload prompt for tab close / external nav.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Modern browsers ignore the returned string and show their own
      // generic prompt, but setting it is still required.
      e.returnValue = message;
      return message;
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges, message]);

  // Mode-switch guard via ModeContext. The check returns true when the
  // form is dirty; ModeContext's setMode() will window.confirm() before
  // proceeding if any registered guard returns true.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const check = () => true;
    registerUnsavedGuard(check);
    return () => unregisterUnsavedGuard(check);
  }, [hasUnsavedChanges, registerUnsavedGuard, unregisterUnsavedGuard]);
}
