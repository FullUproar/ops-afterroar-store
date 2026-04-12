/**
 * ScannerInputManager — Pure logic class for USB barcode scanner detection.
 *
 * Core insight: USB barcode scanners act as HID keyboards. They send characters
 * in rapid bursts (<50ms between chars) followed by Enter/Tab. Humans type
 * much slower (>100ms between chars).
 *
 * This class is framework-agnostic — no React, no DOM, fully testable.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ScannerManagerConfig {
  /** Max ms between chars to be considered scanner input (default: 60) */
  maxCharGapMs: number;
  /** Minimum chars for valid barcode (default: 3) */
  minBarcodeLength: number;
  /** Maximum chars for valid barcode (default: 50) */
  maxBarcodeLength: number;
  /** Auto-clear buffer after inactivity (default: 200) */
  resetTimeoutMs: number;
  /** Ignore duplicate scans within this window (default: 500) */
  dedupeWindowMs: number;
  /** Treat Tab as terminator in addition to Enter (default: true) */
  tabAsTerminator: boolean;

  /** Called when a valid barcode scan is detected */
  onScan: (barcode: string) => void;
  /** Called when human typing is detected (slow input + Enter) */
  onHumanTyping: (text: string) => void;
  /** Called on any scanner error */
  onError: (error: ScannerError) => void;
  /** Optional custom barcode validation */
  validateBarcode?: (code: string) => boolean;
}

export interface ScannerError {
  type:
    | "partial_scan"
    | "invalid_barcode"
    | "too_short"
    | "too_long"
    | "garbled";
  rawInput: string;
  message: string;
}

export type ScannerStatus = "listening" | "paused" | "processing";

/* ------------------------------------------------------------------ */
/*  Default config                                                     */
/* ------------------------------------------------------------------ */

export const DEFAULT_SCANNER_CONFIG: Omit<
  ScannerManagerConfig,
  "onScan" | "onHumanTyping" | "onError"
> = {
  maxCharGapMs: 60,
  minBarcodeLength: 3,
  maxBarcodeLength: 50,
  resetTimeoutMs: 200,
  dedupeWindowMs: 500,
  tabAsTerminator: true,
};

/* ------------------------------------------------------------------ */
/*  Non-printable character detection                                  */
/* ------------------------------------------------------------------ */

const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

function stripControlChars(s: string): string {
  return s.replace(CONTROL_CHAR_REGEX, "");
}

function hasControlChars(s: string): boolean {
  return CONTROL_CHAR_REGEX.test(s);
}

/* ------------------------------------------------------------------ */
/*  ScannerInputManager                                                */
/* ------------------------------------------------------------------ */

export class ScannerInputManager {
  private buffer: string = "";
  private lastCharTime: number = 0;
  private resetTimer: ReturnType<typeof setTimeout> | null = null;
  private charTimings: number[] = [];
  private isActive: boolean = true;
  private lastScanCode: string = "";
  private lastScanTime: number = 0;
  private isDev: boolean;

  constructor(private config: ScannerManagerConfig) {
    this.isDev =
      typeof process !== "undefined" && process.env.NODE_ENV === "development";
  }

  /* ---- Public API ---- */

  get status(): ScannerStatus {
    if (!this.isActive) return "paused";
    if (this.buffer.length > 0) return "processing";
    return "listening";
  }

  /**
   * Feed a single character into the scanner buffer.
   * Call this on every keypress event (excluding Enter/Tab terminators).
   */
  handleKeyPress(char: string, timestamp: number = Date.now()): void {
    if (!this.isActive) return;

    // Clear any pending reset timer
    this.clearResetTimer();

    // Record timing gap
    if (this.lastCharTime > 0) {
      const gap = timestamp - this.lastCharTime;
      this.charTimings.push(gap);
    }
    this.lastCharTime = timestamp;

    // Append to buffer
    this.buffer += char;

    // Start the inactivity reset timer
    this.startResetTimer();

    if (this.isDev && this.buffer.length === 1) {
      console.log("[Scanner] Buffer started");
    }
  }

  /**
   * Called when Enter or Tab (if configured) is pressed.
   * This is the signal that the barcode is complete.
   */
  handleTerminator(): void {
    if (!this.isActive) return;
    this.clearResetTimer();
    this.processBuffer();
  }

  /**
   * Check if a key event is a terminator (Enter or Tab).
   */
  isTerminator(key: string): boolean {
    if (key === "Enter") return true;
    if (key === "Tab" && this.config.tabAsTerminator) return true;
    return false;
  }

  /**
   * Reset the buffer and all state.
   */
  reset(): void {
    this.buffer = "";
    this.lastCharTime = 0;
    this.charTimings = [];
    this.clearResetTimer();
  }

  /**
   * Pause scanner processing (e.g., when a modal is open).
   */
  pause(): void {
    this.isActive = false;
    this.reset();
  }

  /**
   * Resume scanner processing.
   */
  resume(): void {
    this.isActive = true;
    this.reset();
  }

  /**
   * Clean up all timers.
   */
  destroy(): void {
    this.isActive = false;
    this.clearResetTimer();
    this.buffer = "";
    this.charTimings = [];
  }

  /* ---- Private methods ---- */

  /**
   * Process the accumulated buffer. Determine if it's a scanner scan
   * or human typing, validate, and fire appropriate callbacks.
   */
  private processBuffer(): void {
    const raw = this.buffer;
    const timings = [...this.charTimings];

    // Reset state immediately so we're ready for the next input
    this.reset();

    if (!raw) return;

    if (this.isDev) {
      console.log("[Scanner] Processing buffer:", JSON.stringify(raw), {
        length: raw.length,
        timings,
        avgGap:
          timings.length > 0
            ? Math.round(timings.reduce((a, b) => a + b, 0) / timings.length)
            : "N/A",
      });
    }

    // Check for garbled input (control characters)
    if (hasControlChars(raw)) {
      const cleaned = stripControlChars(raw);
      if (cleaned.length < this.config.minBarcodeLength) {
        this.config.onError({
          type: "garbled",
          rawInput: raw,
          message: `Garbled input detected (${raw.length} chars, ${cleaned.length} after cleaning)`,
        });
        return;
      }
      // Try to process the cleaned version
      this.processCleanedBarcode(cleaned, timings);
      return;
    }

    // Check if this looks like scanner speed
    const isScanSpeed = this.isScannerSpeed(timings);

    if (this.isDev) {
      console.log("[Scanner] Speed analysis:", {
        isScanSpeed,
        charCount: raw.length,
      });
    }

    if (isScanSpeed) {
      // Scanner-speed input — treat as barcode
      this.processCleanedBarcode(raw, timings);
    } else {
      // Human-speed input
      if (raw.length < this.config.minBarcodeLength) {
        // Short human input — just forward as typing
        this.config.onHumanTyping(raw);
      } else {
        // Long human input — still forward as typing
        this.config.onHumanTyping(raw);
      }
    }
  }

  /**
   * Process a cleaned barcode string through validation.
   */
  private processCleanedBarcode(code: string, timings: number[]): void {
    // Too short
    if (code.length < this.config.minBarcodeLength) {
      this.config.onError({
        type: "too_short",
        rawInput: code,
        message: `Barcode too short (${code.length} chars, minimum ${this.config.minBarcodeLength})`,
      });
      return;
    }

    // Too long
    if (code.length > this.config.maxBarcodeLength) {
      this.config.onError({
        type: "too_long",
        rawInput: code,
        message: `Barcode too long (${code.length} chars, maximum ${this.config.maxBarcodeLength})`,
      });
      return;
    }

    // Custom validation
    if (this.config.validateBarcode && !this.config.validateBarcode(code)) {
      this.config.onError({
        type: "invalid_barcode",
        rawInput: code,
        message: `Barcode failed validation: ${code}`,
      });
      return;
    }

    // Duplicate detection
    const now = Date.now();
    if (
      code === this.lastScanCode &&
      now - this.lastScanTime < this.config.dedupeWindowMs
    ) {
      if (this.isDev) {
        console.log("[Scanner] Duplicate scan ignored:", code);
      }
      return;
    }

    // Valid scan!
    this.lastScanCode = code;
    this.lastScanTime = now;

    if (this.isDev) {
      console.log("[Scanner] Valid scan:", code);
    }

    this.config.onScan(code);
  }

  /**
   * Determine if the input timing pattern matches a barcode scanner.
   *
   * Scanners send all characters within a very short window. The average
   * gap between characters is typically <30ms, and no single gap exceeds
   * ~60ms. Humans rarely type faster than 100ms between keystrokes.
   */
  private isScannerSpeed(timings: number[]): boolean {
    // Single character — can't determine speed, but a single char + Enter
    // is too short for a barcode anyway (handled by minBarcodeLength)
    if (timings.length === 0) {
      // No timing data means single character or no gaps recorded.
      // For a 1-char "barcode" we'll let length validation handle it.
      // But if we have a buffer with chars, treat as scanner if we got here fast.
      return true; // Default to scanner for single-char (will fail length check)
    }

    const avgGap = timings.reduce((a, b) => a + b, 0) / timings.length;
    const maxGap = Math.max(...timings);

    // Scanner: avg gap < maxCharGapMs AND no single gap > 2x maxCharGapMs
    return (
      avgGap < this.config.maxCharGapMs &&
      maxGap < this.config.maxCharGapMs * 2
    );
  }

  /**
   * Start the inactivity reset timer. If no new chars arrive within
   * resetTimeoutMs, treat the buffer as a partial scan.
   */
  private startResetTimer(): void {
    this.resetTimer = setTimeout(() => {
      if (this.buffer.length > 0) {
        const raw = this.buffer;
        const isScanSpeed = this.isScannerSpeed(this.charTimings);

        if (this.isDev) {
          console.log("[Scanner] Reset timeout — partial input:", raw);
        }

        this.reset();

        if (isScanSpeed && raw.length >= this.config.minBarcodeLength) {
          // Looks like a scanner that didn't send a terminator
          this.config.onError({
            type: "partial_scan",
            rawInput: raw,
            message: `Possible partial scan (no terminator received): ${raw}`,
          });
        } else if (raw.length > 0) {
          // Human typed something but didn't press Enter
          // Don't fire anything — they might still be typing in the search bar
        }
      }
    }, this.config.resetTimeoutMs);
  }

  /**
   * Clear the inactivity reset timer.
   */
  private clearResetTimer(): void {
    if (this.resetTimer !== null) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }
}
