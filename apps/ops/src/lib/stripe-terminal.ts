"use client";

/* ------------------------------------------------------------------ */
/*  Stripe Terminal Client — connects to card readers and collects      */
/*  payments using the Stripe Terminal JS SDK.                          */
/*                                                                      */
/*  Supports:                                                           */
/*    - S710 (WiFi/Ethernet/Cellular) via internet connection           */
/*    - M2 (Bluetooth) via Bluetooth connection                         */
/*    - Simulated reader for development/testing                        */
/*                                                                      */
/*  Usage:                                                              */
/*    const terminal = await initTerminal(fetchConnectionToken);        */
/*    const readers = await terminal.discoverReaders();                 */
/*    await terminal.connectReader(readers[0]);                         */
/*    const result = await terminal.collectPayment(paymentIntentSecret);*/
/* ------------------------------------------------------------------ */

export interface TerminalReader {
  id: string;
  label: string;
  serial_number: string;
  device_type: string;
  status: string;
  ip_address?: string;
}

export interface TerminalStatus {
  connected: boolean;
  reader: TerminalReader | null;
  sdk_loaded: boolean;
  error: string | null;
}

export type ConnectionTokenFetcher = () => Promise<string>;

let terminalInstance: any = null; // StripeTerminal SDK instance
let connectedReader: TerminalReader | null = null;

/**
 * Initialize the Stripe Terminal SDK.
 * Must be called once before any reader operations.
 *
 * @param fetchConnectionToken - async function that calls your server
 *   to create a connection token (POST /api/stripe/terminal/connection-token)
 */
export async function initTerminal(
  fetchConnectionToken: ConnectionTokenFetcher
): Promise<void> {
  if (terminalInstance) return; // Already initialized

  // Load Stripe Terminal SDK dynamically
  if (typeof window === "undefined") return;

  // Check if StripeTerminal is already loaded
  if (!(window as any).StripeTerminal) {
    // Load the SDK script
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://js.stripe.com/terminal/v1/";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Stripe Terminal SDK"));
      document.head.appendChild(script);
    });
  }

  const StripeTerminal = (window as any).StripeTerminal;
  if (!StripeTerminal) {
    throw new Error("Stripe Terminal SDK not available");
  }

  terminalInstance = StripeTerminal.create({
    onFetchConnectionToken: fetchConnectionToken,
    onUnexpectedReaderDisconnect: () => {
      connectedReader = null;
      console.log("[Terminal] Reader disconnected unexpectedly");
    },
  });
}

/**
 * Discover available readers on the local network.
 * For S710: discovers via local network (same WiFi).
 * For simulated: returns a simulated reader.
 */
export async function discoverReaders(
  options?: { simulated?: boolean }
): Promise<TerminalReader[]> {
  if (!terminalInstance) throw new Error("Terminal not initialized");

  const config: Record<string, unknown> = {};
  if (options?.simulated) {
    config.simulated = true;
  }

  const result = await terminalInstance.discoverReaders(config);

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.discoveredReaders ?? []).map((r: any) => ({
    id: r.id,
    label: r.label ?? r.serial_number,
    serial_number: r.serial_number,
    device_type: r.device_type,
    status: r.status,
    ip_address: r.ip_address,
  }));
}

/**
 * Connect to a specific reader.
 */
export async function connectReader(reader: TerminalReader): Promise<void> {
  if (!terminalInstance) throw new Error("Terminal not initialized");

  const result = await terminalInstance.connectReader(reader);

  if (result.error) {
    throw new Error(result.error.message);
  }

  connectedReader = reader;
}

/**
 * Collect a payment using the connected reader.
 * The paymentIntentClientSecret comes from creating a PaymentIntent
 * on the server (via StripeConnectProvider.charge()).
 *
 * This triggers the reader to prompt the customer to tap/insert their card.
 */
export async function collectPayment(
  paymentIntentClientSecret: string
): Promise<{ success: boolean; paymentIntentId?: string; error?: string }> {
  if (!terminalInstance) throw new Error("Terminal not initialized");
  if (!connectedReader) throw new Error("No reader connected");

  const result = await terminalInstance.collectPaymentMethod(
    paymentIntentClientSecret
  );

  if (result.error) {
    return { success: false, error: result.error.message };
  }

  // Confirm the payment
  const confirmResult = await terminalInstance.processPayment(
    result.paymentIntent
  );

  if (confirmResult.error) {
    return { success: false, error: confirmResult.error.message };
  }

  return {
    success: true,
    paymentIntentId: confirmResult.paymentIntent.id,
  };
}

/**
 * Cancel the current reader action (e.g., if customer walks away).
 */
export async function cancelReaderAction(): Promise<void> {
  if (!terminalInstance) return;
  await terminalInstance.cancelCollectPaymentMethod();
}

/**
 * Disconnect from the current reader.
 */
export async function disconnectReader(): Promise<void> {
  if (!terminalInstance) return;
  await terminalInstance.disconnectReader();
  connectedReader = null;
}

/**
 * Get current terminal status.
 */
export function getTerminalStatus(): TerminalStatus {
  return {
    connected: connectedReader !== null,
    reader: connectedReader,
    sdk_loaded: terminalInstance !== null,
    error: null,
  };
}

/**
 * Display a message on the reader's customer-facing screen (S710).
 */
export async function setReaderDisplay(
  lineItems: Array<{ description: string; amount: number; quantity: number }>,
  total: number,
  currency: string = "usd"
): Promise<void> {
  if (!terminalInstance || !connectedReader) return;

  await terminalInstance.setReaderDisplay({
    type: "cart",
    cart: {
      line_items: lineItems.map((item) => ({
        description: item.description,
        amount: item.amount,
        quantity: item.quantity,
      })),
      total,
      currency,
    },
  });
}

/**
 * Clear the reader's customer-facing display.
 */
export async function clearReaderDisplay(): Promise<void> {
  if (!terminalInstance || !connectedReader) return;
  await terminalInstance.clearReaderDisplay();
}
