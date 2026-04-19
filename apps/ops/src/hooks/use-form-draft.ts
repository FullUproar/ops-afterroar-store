"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  useFormDraft — auto-persist form state to localStorage             */
/*                                                                     */
/*  Pattern for any non-trivial form (customer notes, event create,   */
/*  inventory adjust, etc.) so a mode switch / accidental nav / tab   */
/*  close doesn't blow away half-typed work.                          */
/*                                                                     */
/*  Usage:                                                             */
/*    const { value, setValue, hasDraft, clearDraft } = useFormDraft( */
/*      "customer-create",                                             */
/*      { name: "", email: "", phone: "" },                           */
/*    );                                                               */
/*                                                                     */
/*    // ... render form bound to value/setValue ...                  */
/*                                                                     */
/*    // On successful submit:                                        */
/*    clearDraft();                                                   */
/*                                                                     */
/*  hasDraft is true if a saved draft was found on mount — use it to  */
/*  show a "Restore your draft?" affordance if you'd rather not auto- */
/*  restore (default behavior is auto-restore).                       */
/* ------------------------------------------------------------------ */

const STORAGE_PREFIX = "formDraft:";
const WRITE_DEBOUNCE_MS = 300;

function readDraft<T>(key: string): T | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function writeDraft<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // localStorage full / disabled — drop silently, the form still works.
  }
}

function removeDraft(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    // no-op
  }
}

export interface UseFormDraftReturn<T> {
  value: T;
  setValue: (next: T) => void;
  hasDraft: boolean;
  clearDraft: () => void;
}

export function useFormDraft<T>(key: string, initial: T): UseFormDraftReturn<T> {
  // Lazy initialiser: read the draft once at mount via the function form
  // of useState so we don't touch refs during render. We need the draft
  // to seed both `value` and `hasDraft` — re-reading once is cheaper
  // than threading state another way.
  const [value, setValueState] = useState<T>(() => {
    const draft = readDraft<T>(key);
    return draft !== undefined ? draft : initial;
  });
  const [hasDraft] = useState<boolean>(() => readDraft<T>(key) !== undefined);

  // Debounced write — 300ms after the last setValue call, persist to
  // localStorage. Fast typing = one write per pause, not per keystroke.
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
    writeTimerRef.current = setTimeout(() => {
      writeDraft(key, value);
    }, WRITE_DEBOUNCE_MS);
    return () => {
      if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
    };
  }, [key, value]);

  const setValue = useCallback((next: T) => {
    setValueState(next);
  }, []);

  const clearDraft = useCallback(() => {
    if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
    removeDraft(key);
  }, [key]);

  return { value, setValue, hasDraft, clearDraft };
}
