"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useStore } from "@/lib/store-context";

type AppMode = "dashboard" | "register";

interface ModeContextValue {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  toggleMode: () => void;
}

const STORAGE_KEY = "afterroar-mode";

const ModeContext = createContext<ModeContextValue>({
  mode: "dashboard",
  setMode: () => {},
  toggleMode: () => {},
});

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const { effectiveRole } = useStore();
  const [mode, setModeState] = useState<AppMode>("dashboard");
  const [initialized, setInitialized] = useState(false);

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
    setModeState(newMode);
    try {
      localStorage.setItem(STORAGE_KEY, newMode);
    } catch {}
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === "dashboard" ? "register" : "dashboard");
  }, [mode, setMode]);

  return (
    <ModeContext.Provider value={{ mode, setMode, toggleMode }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useMode() {
  return useContext(ModeContext);
}
