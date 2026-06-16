// Single-use tokens for invitations & password resets. Only the SHA-256 hash is
// ever stored in the database; the raw token is delivered solely via the email
// link, so a database read cannot recover a usable token.
import { randomBytes, createHash } from "crypto";

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
export const RESET_TTL_MS = 1000 * 60 * 60; // 1 hour
