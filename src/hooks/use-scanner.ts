"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ScannerInputManager,
  DEFAULT_SCANNER_CONFIG,
  type ScannerError,
  type ScannerStatus,
} from "@/lib/scanner-manager";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface UseScannerOptions {
  /** Called when a valid barcode scan is detected */
  onScan: (barcode: string) => void;
  /** Called when human typing is detected (optional) */
  onHumanTyping?: (text: string) => void;
  /** Called on scanner errors (optional) */
  onError?: (error: ScannerError) => void;
  /** Whether the scanner is enabled (default: true) */
  enabled?: boolean;
}

interface UseScannerReturn {
  /** Whether the scanner is actively listening */
  isListening: boolean;
  /** Last successful scan */
  lastScan: { code: string; time: Date } | null;
  /** Last error */
  lastError: ScannerError | null;
  /** Pause scanner (e.g., when modal opens) */
  pause: () => void;
  /** Resume scanner (e.g., when modal closes) */
  resume: () => void;
  /** Current scanner status */
  status: ScannerStatus;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useScanner(options: UseScannerOptions): UseScannerReturn {
  const { onScan, onHumanTyping, onError, enabled = true } = options;

  const managerRef = useRef<ScannerInputManager | null>(null);
  const isPausedRef = useRef(false);

  const [lastScan, setLastScan] = useState<{
    code: string;
    time: Date;
  } | null>(null);
  const [lastError, setLastError] = useState<ScannerError | null>(null);
  const [status, setStatus] = useState<ScannerStatus>("listening");

  // Stable callback refs to avoid re-creating the manager on every render
  const onScanRef = useRef(onScan);
  const onHumanTypingRef = useRef(onHumanTyping);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);
  useEffect(() => {
    onHumanTypingRef.current = onHumanTyping;
  }, [onHumanTyping]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // Create / destroy the scanner manager
  useEffect(() => {
    const manager = new ScannerInputManager({
      ...DEFAULT_SCANNER_CONFIG,
      onScan: (barcode: string) => {
        setLastScan({ code: barcode, time: new Date() });
        setLastError(null);
        setStatus("listening");
        onScanRef.current(barcode);
      },
      onHumanTyping: (text: string) => {
        setStatus("listening");
        onHumanTypingRef.current?.(text);
      },
      onError: (error: ScannerError) => {
        setLastError(error);
        setStatus("listening");
        onErrorRef.current?.(error);
      },
    });

    managerRef.current = manager;

    return () => {
      manager.destroy();
      managerRef.current = null;
    };
  }, []);

  // Handle enabled/disabled state
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) return;

    if (enabled && !isPausedRef.current) {
      manager.resume();
      setStatus("listening");
    } else {
      manager.pause();
      setStatus("paused");
    }
  }, [enabled]);

  // Set up the global keydown listener for scanner input
  // This is the ONLY scanner input mechanism — no hidden inputs needed.
  // It captures all keystrokes at the document level via capture phase.
  // Scanner detection (speed-based) distinguishes scanner from human typing
  // regardless of what element has focus.
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      const manager = managerRef.current;
      if (!manager || isPausedRef.current) return;

      // Ignore modifier combos (Ctrl+C, Alt+Tab, etc.)
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      // CHECK FIRST: if a visible input has focus, let it handle ALL keystrokes.
      // The scanner only operates when NO input is focused.
      const active = document.activeElement;
      if (
        active &&
        active !== document.body &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.tagName === "SELECT" ||
          (active as HTMLElement).isContentEditable)
      ) {
        // Reset scanner buffer if it was accumulating — user switched to typing
        if (manager.status === "processing") {
          manager.reset();
          setStatus("listening");
        }
        return;
      }

      // No input focused — scanner territory.
      // Ignore function keys, arrows, etc. — only printable chars and terminators
      if (e.key.length > 1) {
        if (manager.isTerminator(e.key)) {
          if (manager.status === "processing") {
            e.preventDefault();
            e.stopPropagation();
            setStatus("processing");
            manager.handleTerminator();
          }
          return;
        }
        return;
      }

      // No input focused — feed the character to the scanner manager
      e.preventDefault();
      manager.handleKeyPress(e.key, e.timeStamp || Date.now());
      setStatus(manager.status);
    }

    // Use capture phase to intercept before other handlers
    // Use bubble phase (not capture) — capture phase can interfere with
    // on-screen keyboard behavior on Android tablets
    window.addEventListener("keydown", handleKeyDown, false);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, false);
    };
  }, [enabled]);

  // Pause / resume
  const pause = useCallback(() => {
    isPausedRef.current = true;
    managerRef.current?.pause();
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    isPausedRef.current = false;
    managerRef.current?.resume();
    setStatus("listening");
  }, []);

  return {
    isListening: status === "listening" && enabled,
    lastScan,
    lastError,
    pause,
    resume,
    status: enabled ? status : "paused",
  };
}
