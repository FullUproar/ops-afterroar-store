"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useStore } from "@/lib/store-context";

interface TrainingModeContextValue {
  isTraining: boolean;
  setTraining: (on: boolean) => void;
  toggleTraining: () => void;
}

const TrainingModeContext = createContext<TrainingModeContextValue>({
  isTraining: false,
  setTraining: () => {},
  toggleTraining: () => {},
});

const STORAGE_KEY = "afterroar-training-mode";

export function TrainingModeProvider({ children }: { children: React.ReactNode }) {
  const [isTraining, setIsTraining] = useState(false);

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "true") setIsTraining(true);
    } catch {}
  }, []);

  const setTraining = useCallback((on: boolean) => {
    setIsTraining(on);
    try { localStorage.setItem(STORAGE_KEY, String(on)); } catch {}
  }, []);

  const toggleTraining = useCallback(() => {
    setTraining(!isTraining);
  }, [isTraining, setTraining]);

  return (
    <TrainingModeContext.Provider value={{ isTraining, setTraining, toggleTraining }}>
      {children}
    </TrainingModeContext.Provider>
  );
}

export function useTrainingMode() {
  return useContext(TrainingModeContext);
}

/** Banner component that shows when training mode is active.
 *  Hidden during onboarding (Sandbox banner takes priority). */
export function TrainingBanner() {
  const { isTraining } = useTrainingMode();
  const { store } = useStore();

  const onboarding = !((store?.settings as Record<string, unknown>)?.onboarding_complete);
  if (!isTraining || onboarding) return null;

  return (
    <div className="w-full bg-yellow-500/15 border-b border-yellow-500/30 px-2 py-1 sm:px-4 sm:py-2 text-center">
      <span className="text-[10px] sm:text-xs font-bold text-yellow-400 tracking-wider uppercase">
        Training — Not Real
      </span>
    </div>
  );
}

/** Badge for the register header */
export function TrainingBadge() {
  const { isTraining } = useTrainingMode();
  if (!isTraining) return null;

  return (
    <span className="ml-2 rounded-full bg-yellow-500/20 border border-yellow-500/40 px-2.5 py-0.5 text-[10px] font-bold text-yellow-400 uppercase tracking-wider">
      Training
    </span>
  );
}
