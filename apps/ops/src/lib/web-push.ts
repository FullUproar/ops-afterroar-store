import { createSign, createPrivateKey } from "crypto";

/* ------------------------------------------------------------------ */
/*  Web Push — VAPID JWT signing + push notification delivery           */
/*  Uses raw crypto, no npm dependencies.                              */
/* ------------------------------------------------------------------ */

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

/**
 * Base64url encode a buffer
 */
function base64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Base64url decode to buffer
 */
function base64urlDecode(str: string): Buffer {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64");
}

/**
 * Create a VAPID JWT for the given audience
 */
function createVapidJwt(audience: string, subject: string, privateKeyBase64url: string): string {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60, // 12 hours
    sub: subject,
  };

  const headerB64 = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const payloadB64 = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Convert base64url private key to PEM for ES256
  const rawKey = base64urlDecode(privateKeyBase64url);
  // Build a PKCS8 DER structure for EC P-256 private key
  // This wraps the raw 32-byte key in the proper ASN.1 structure
  const pkcs8Header = Buffer.from([
    0x30, 0x81, 0x87, // SEQUENCE
    0x02, 0x01, 0x00, // INTEGER 0 (version)
    0x30, 0x13, // SEQUENCE (AlgorithmIdentifier)
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // OID ecPublicKey
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, // OID prime256v1
    0x04, 0x6d, // OCTET STRING
    0x30, 0x6b, // SEQUENCE (ECPrivateKey)
    0x02, 0x01, 0x01, // INTEGER 1 (version)
    0x04, 0x20, // OCTET STRING (32 bytes for private key)
  ]);
  const pkcs8Footer = Buffer.from([
    0xa1, 0x44, 0x03, 0x42, 0x00, // context [1] BIT STRING
  ]);

  // We need the public key for the DER structure, but for signing we can use just the private key
  // Use Node's createPrivateKey with JWK format instead
  const privateKeyJwk = {
    kty: "EC",
    crv: "P-256",
    d: privateKeyBase64url,
    // We don't have x,y but Node can derive them from d for signing
  };

  let key;
  try {
    key = createPrivateKey({ key: privateKeyJwk, format: "jwk" });
  } catch {
    // If JWK import fails, try raw PEM approach
    const der = Buffer.concat([pkcs8Header, rawKey, pkcs8Footer, Buffer.alloc(66)]); // placeholder
    const pem = `-----BEGIN PRIVATE KEY-----\n${der.toString("base64")}\n-----END PRIVATE KEY-----`;
    key = createPrivateKey(pem);
  }

  const sign = createSign("SHA256");
  sign.update(unsignedToken);
  const derSig = sign.sign(key);

  // Convert DER signature to raw r||s format (64 bytes)
  const rawSig = derToRaw(derSig);
  const sigB64 = base64urlEncode(rawSig);

  return `${unsignedToken}.${sigB64}`;
}

/**
 * Convert DER ECDSA signature to raw r||s (64 bytes)
 */
function derToRaw(der: Buffer): Buffer {
  // DER format: 0x30 [total-len] 0x02 [r-len] [r] 0x02 [s-len] [s]
  let offset = 2; // skip 0x30 and total length

  // Read r
  if (der[offset] !== 0x02) throw new Error("Invalid DER signature");
  offset++;
  const rLen = der[offset];
  offset++;
  let r = der.subarray(offset, offset + rLen);
  offset += rLen;

  // Read s
  if (der[offset] !== 0x02) throw new Error("Invalid DER signature");
  offset++;
  const sLen = der[offset];
  offset++;
  let s = der.subarray(offset, offset + sLen);

  // Strip leading zeros and pad to 32 bytes
  if (r.length > 32) r = r.subarray(r.length - 32);
  if (s.length > 32) s = s.subarray(s.length - 32);

  const raw = Buffer.alloc(64);
  r.copy(raw, 32 - r.length);
  s.copy(raw, 64 - s.length);
  return raw;
}

/**
 * Send a push notification to a subscription
 */
export async function sendPushNotification(
  subscription: PushSubscription,
  payload: PushPayload,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || "mailto:ops@afterroar.store";

  if (!vapidPublicKey || !vapidPrivateKey) {
    return { ok: false, status: 0, error: "VAPID keys not configured" };
  }

  try {
    const audience = new URL(subscription.endpoint).origin;
    const jwt = createVapidJwt(audience, vapidSubject, vapidPrivateKey);

    const body = JSON.stringify(payload);

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Encoding": "aes128gcm",
        TTL: "86400",
        Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
      },
      body,
    });

    if (response.status === 410 || response.status === 404) {
      // Subscription expired or invalid — caller should remove it
      return { ok: false, status: response.status, error: "Subscription expired" };
    }

    return { ok: response.ok, status: response.status };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : "Unknown push error",
    };
  }
}

/**
 * Send push notifications to all stored subscriptions for a store
 */
export async function sendPushToStore(
  storeSettings: Record<string, unknown>,
  payload: PushPayload,
): Promise<{ sent: number; failed: number; expired: string[] }> {
  const subscriptions = (storeSettings.push_subscriptions || []) as PushSubscription[];
  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0, expired: [] };
  }

  const results = await Promise.allSettled(
    subscriptions.map((sub) => sendPushNotification(sub, payload)),
  );

  let sent = 0;
  let failed = 0;
  const expired: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled" && result.value.ok) {
      sent++;
    } else {
      failed++;
      const value = result.status === "fulfilled" ? result.value : null;
      if (value?.status === 410 || value?.status === 404) {
        expired.push(subscriptions[i].endpoint);
      }
    }
  }

  return { sent, failed, expired };
}
