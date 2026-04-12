import crypto from "crypto";

/* ------------------------------------------------------------------ */
/*  Shared credential encryption / decryption (AES-256-GCM)            */
/*  Matches the format used by /api/connect/submit                     */
/* ------------------------------------------------------------------ */

function deriveKey(): Buffer {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.AUTH_SECRET || "";
  return crypto.createHash("sha256").update(key).digest();
}

export function encryptCredential(plaintext: string): {
  encrypted: string;
  iv: string;
  tag: string;
} {
  const derivedKey = deriveKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", derivedKey, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");

  return {
    encrypted,
    iv: iv.toString("hex"),
    tag,
  };
}

export function decryptCredential(data: {
  encrypted: string;
  iv: string;
  tag: string;
}): string {
  const derivedKey = deriveKey();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    derivedKey,
    Buffer.from(data.iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(data.tag, "hex"));

  let plaintext = decipher.update(data.encrypted, "hex", "utf8");
  plaintext += decipher.final("utf8");
  return plaintext;
}
