// Encryption helpers for ERP credentials (API keys, mailbox logins).
//
// Secrets are encrypted at rest with AES-256-GCM. The encryption key is derived
// from the ERP_CREDENTIALS_KEY secret via SHA-256, so any sufficiently strong
// passphrase / random string works as the configured value. The plaintext
// secret values never leave this module except via decryptJson(), which is only
// ever called server-side (e.g. the future sync engine) — never in a response
// to a client.

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGO = "aes-256-gcm";

export class ErpCredentialsKeyMissingError extends Error {
  constructor() {
    super("ERP_CREDENTIALS_KEY is not configured");
    this.name = "ErpCredentialsKeyMissingError";
  }
}

export function isErpCredentialsKeyConfigured(): boolean {
  return !!(process.env.ERP_CREDENTIALS_KEY && process.env.ERP_CREDENTIALS_KEY.trim());
}

function getKey(): Buffer {
  const raw = process.env.ERP_CREDENTIALS_KEY;
  if (!raw || raw.trim().length === 0) {
    throw new ErpCredentialsKeyMissingError();
  }
  // Normalize any provided secret into a 32-byte AES-256 key.
  return createHash("sha256").update(raw, "utf8").digest();
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export function encryptJson(value: unknown): EncryptedPayload {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptJson<T = unknown>(payload: EncryptedPayload): T {
  const key = getKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(dec.toString("utf8")) as T;
}

// Build a non-sensitive masked hint (e.g. "••••3f9a") from a secret value so
// the UI can confirm a credential exists without revealing it.
export function maskHint(value: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  const last = trimmed.slice(-4);
  return `••••${last}`;
}
