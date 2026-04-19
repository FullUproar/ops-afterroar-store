"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "@/lib/store-context";

type AppMode = "dashboard" | "register";

/**
 * Guards run before a mode change. If any returns `true` the mode
 * context will surface a confirm() prompt before proceeding — used by
 * useUnsavedChangesWarning to keep half-typed forms from being lost
 * when the cashier toggles dashboard ↔ register mode.
 */
type UnsavedGuard = () => boolean;

interface ModeContextValue {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  toggleMode: () => void;
  registerUnsavedGuard: (check: UnsavedGuard) => void;
  unregisterUnsavedGuard: (check: UnsavedGuard) => void;
}

const STORAGE_KEY = "afterroar-mode";

const ModeContext = createContext<ModeContextValue>({
  mode: "dashboard",
  setMode: () => {},
  toggleMode: () => {},
  registerUnsavedGuard: () => {},
  unregisterUnsavedGuard: () => {},
});

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const { effectiveRole } = useStore();
  const [mode, setModeState] = useState<AppMode>("dashboard");
  const [initialized, setInitialized] = useState(false);

  // Set of registered "is the form dirty?" callbacks. Stored in a ref
  // (not state) because we never need to re-render when the set changes
  // — we just consult it on the next setMode() call.
  const guardsRef = useRef<Set<UnsavedGuard>>(new Set());

  // Initialize from localStorage or role default
  useEffect(() => {
    if (initialized) return;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "dashboard" || stored === "register") {
        setModeState(stored);
        setInitialized(true);
        return;
      }
    } catch {}

    // Default based on role: cashier → register, everyone else → dashboard
    if (effectiveRole) {
      const defaultMode: AppMode = effectiveRole === "cashier" ? "register" : "dashboard";
      setModeState(defaultMode);
      setInitialized(true);
    }
  }, [effectiveRole, initialized]);

  const setMode = useCallback((newMode: AppMode) => {
    // Run all registered guards. If any reports unsaved changes, ask
    // the cashier before clobbering the form. This is the single choke
    // point for ALL programmatic mode switches — sidebar toggle, more-
    // menu "Switch to dashboard mode", register exit, etc. — so we
    // don't have to retro-fit confirm() into every caller.
    const dirty = Array.from(guardsRef.current).some((check) => {
      try {
        return check();
      } catch {
        return false;
      }
    });

    if (dirty && typeof window !== "undefined") {
      const proceed = window.confirm(
        "You have unsaved changes. Switch modes anyway?\n\nYour draft is saved and will be restored when you return.",
      );
      if (!proceed) return;
    }

    setModeState(newMode);
    try {
      localStorage.setItem(STORAGE_KEY, newMode);
    } catch {}
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === "dashboard" ? "register" : "dashboard");
  }, [mode, setMode]);

  const registerUnsavedGuard = useCallback((check: UnsavedGuard) => {
    guardsRef.current.add(check);
  }, []);

  const unregisterUnsavedGuard = useCallback((check: UnsavedGuard) => {
    guardsRef.current.delete(check);
  }, []);

  return (
    <ModeContext.Provider
      value={{ mode, setMode, toggleMode, registerUnsavedGuard, unregisterUnsavedGuard }}
    >
      {children}
    </ModeContext.Provider>
  );
}

export function useMode() {
  return useContext(ModeContext);
}
