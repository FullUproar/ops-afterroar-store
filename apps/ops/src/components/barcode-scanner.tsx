"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  BarcodeScanner — reusable camera barcode scanner component          */
/*  Uses native BarcodeDetector API (Chrome 83+, Edge, Android WebView) */
/*  Falls back to manual code entry if BarcodeDetector unavailable      */
/* ------------------------------------------------------------------ */

export interface BarcodeScannerProps {
  onScan: (code: string, format: string) => void;
  onClose: () => void;
  formats?: string[]; // 'ean_13', 'upc_a', 'code_128', 'qr_code', etc.
  title?: string;
}

// Extend window for BarcodeDetector API (not yet in all TS libs)
declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats: string[] }) => {
      detect: (source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap) => Promise<
        Array<{ rawValue: string; format: string; boundingBox: DOMRectReadOnly }>
      >;
    };
  }
}

export function BarcodeScanner({
  onScan,
  onClose,
  formats = ["ean_13", "upc_a", "code_128", "qr_code", "ean_8", "code_39"],
  title = "Scan Barcode",
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const [hasDetector, setHasDetector] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);

  // Check for BarcodeDetector support
  useEffect(() => {
    if (typeof window !== "undefined" && window.BarcodeDetector) {
      setHasDetector(true);
    }
  }, []);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
      }

      // Check torch support
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities?.() as Record<string, unknown> | undefined;
      if (capabilities && "torch" in capabilities) {
        setTorchSupported(true);
      }
    } catch (err) {
      console.error("Camera error:", err);
      setCameraError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera permission denied. Please allow camera access."
          : "Could not access camera. Try entering the code manually."
      );
      setManualMode(true);
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (scannerRef.current) {
      clearInterval(scannerRef.current);
      scannerRef.current = undefined;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // Start camera on mount
  useEffect(() => {
    if (!manualMode) {
      startCamera();
    }
    return () => stopCamera();
  }, [manualMode, startCamera, stopCamera]);

  // Scan loop using BarcodeDetector
  useEffect(() => {
    if (!cameraReady || !hasDetector || !videoRef.current || manualMode) return;

    const detector = new window.BarcodeDetector!({ formats });

    scannerRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState !== 4) return;
      try {
        const results = await detector.detect(videoRef.current);
        if (results.length > 0) {
          const { rawValue, format } = results[0];
          if (rawValue && rawValue !== lastScanned) {
            setLastScanned(rawValue);
            // Haptic feedback
            if (navigator.vibrate) navigator.vibrate(100);
            // Brief visual feedback delay before calling onScan
            setTimeout(() => {
              stopCamera();
              onScan(rawValue, format);
            }, 200);
          }
        }
      } catch {
        // Detection failed for this frame, continue
      }
    }, 250);

    return () => {
      if (scannerRef.current) {
        clearInterval(scannerRef.current);
        scannerRef.current = undefined;
      }
    };
  }, [cameraReady, hasDetector, formats, lastScanned, manualMode, onScan, stopCamera]);

  // Toggle torch
  async function toggleTorch() {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    const newState = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: newState } as MediaTrackConstraintSet],
      });
      setTorchOn(newState);
    } catch {
      // Torch toggle failed
    }
  }

  // Handle manual submit
  function handleManualSubmit() {
    const code = manualCode.trim();
    if (!code) return;
    if (navigator.vibrate) navigator.vibrate(50);
    stopCamera();
    onScan(code, "manual");
  }

  // Handle close
  function handleClose() {
    stopCamera();
    onClose();
  }

  // Focus manual input
  useEffect(() => {
    if (manualMode && manualInputRef.current) {
      manualInputRef.current.focus();
    }
  }, [manualMode]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90">
      {/* Full-screen on mobile, modal on desktop */}
      <div className="relative w-full h-full md:h-auto md:max-w-lg md:max-h-[80vh] md:rounded-xl bg-background md:border md:border-card-border flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-card-border shrink-0">
          <h2 className="text-base font-bold text-foreground">{title}</h2>
          <div className="flex items-center gap-2">
            {torchSupported && !manualMode && (
              <button
                onClick={toggleTorch}
                className={`rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                  torchOn
                    ? "bg-yellow-500 text-black"
                    : "bg-card-hover text-muted hover:text-foreground"
                }`}
              >
                {torchOn ? "Light ON" : "Light"}
              </button>
            )}
            <button
              onClick={handleClose}
              className="rounded-xl bg-card-hover px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-card-hover hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              Close
            </button>
          </div>
        </div>

        {/* Camera view */}
        {!manualMode && (
          <div className="relative flex-1 flex items-center justify-center bg-black overflow-hidden">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
              autoPlay
            />

            {/* Scan area overlay */}
            {cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-64 h-40 md:w-72 md:h-44 border-2 border-white/40 rounded-xl">
                  {/* Corner markers */}
                  <div className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-3 border-l-3 border-emerald-400 rounded-tl-lg" />
                  <div className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-3 border-r-3 border-emerald-400 rounded-tr-lg" />
                  <div className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-3 border-l-3 border-emerald-400 rounded-bl-lg" />
                  <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-3 border-r-3 border-emerald-400 rounded-br-lg" />
                </div>
                <div className="absolute bottom-6 text-center">
                  <div className="text-sm text-foreground/70">
                    {hasDetector
                      ? "Point camera at barcode"
                      : "Auto-detect not available"}
                  </div>
                </div>
              </div>
            )}

            {!cameraReady && !cameraError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-muted text-sm">Starting camera...</div>
              </div>
            )}
          </div>
        )}

        {/* Manual entry mode */}
        {manualMode && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
            {cameraError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400 text-center max-w-sm">
                {cameraError}
              </div>
            )}
            <div className="text-muted text-sm text-center">
              Enter the barcode number manually
            </div>
            <div className="w-full max-w-xs flex gap-2">
              <input
                ref={manualInputRef}
                type="text"
                inputMode="numeric"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
                placeholder="e.g. 0123456789012"
                className="flex-1 rounded-xl border border-input-border bg-card px-4 py-3 text-base text-foreground font-mono placeholder:text-muted focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={handleManualSubmit}
                disabled={!manualCode.trim()}
                className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-foreground hover:bg-emerald-500 disabled:opacity-50 transition-colors min-h-[44px]"
              >
                Go
              </button>
            </div>
          </div>
        )}

        {/* Bottom actions */}
        <div className="border-t border-card-border px-4 py-3 pb-safe shrink-0">
          <button
            onClick={() => {
              if (manualMode) {
                setCameraError(null);
                setManualMode(false);
              } else {
                stopCamera();
                setManualMode(true);
              }
            }}
            className="w-full rounded-xl border border-input-border px-4 py-3 text-sm font-medium text-foreground/70 hover:bg-card-hover hover:text-foreground transition-colors min-h-[44px]"
          >
            {manualMode ? "Try Camera Instead" : "Enter Code Manually"}
          </button>
        </div>
      </div>
    </div>
  );
}
