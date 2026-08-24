import { randomUUID } from "crypto";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const IDEMPOTENCY_FINGERPRINT_PATTERN = /^v1-[a-f0-9]{8}$/;

/** Accept a bounded caller correlation ID or generate a fresh one. */
export function getRequestId(supplied: string | string[] | undefined): string {
  return typeof supplied === "string" && REQUEST_ID_PATTERN.test(supplied)
    ? supplied
    : randomUUID();
}

/** Parse an optional checkout key without silently treating malformed input as absent. */
export function parseIdempotencyKey(supplied: string | string[] | undefined): {
  key: string | undefined;
  invalid: boolean;
} {
  if (supplied === undefined) return { key: undefined, invalid: false };
  if (typeof supplied === "string" && REQUEST_ID_PATTERN.test(supplied)) {
    return { key: supplied, invalid: false };
  }
  return { key: undefined, invalid: true };
}

export function parseIdempotencyFingerprint(supplied: string | string[] | undefined): string | undefined {
  return typeof supplied === "string" && IDEMPOTENCY_FINGERPRINT_PATTERN.test(supplied)
    ? supplied
    : undefined;
}

/**
 * Unexpected errors must not disclose SQL, provider, filesystem, or stack
 * details to API clients. Route handlers can still return their own deliberate
 * validation/business messages.
 */
export function publicErrorMessage(status: number): string {
  return status >= 500
    ? "Die Anfrage konnte nicht verarbeitet werden. Bitte versuchen Sie es später erneut."
    : "Die Anfrage konnte nicht verarbeitet werden.";
}