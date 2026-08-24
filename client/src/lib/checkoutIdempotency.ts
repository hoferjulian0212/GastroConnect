type PendingCheckout = {
  key: string;
  fingerprint: string;
};

/**
 * Preserve a checkout identity across refreshes and lost responses, but never
 * reuse it after the basket/request meaning has changed.
 */
export function getPendingCheckoutKey(storageKey: string, fingerprint: string): string {
  if (typeof window === "undefined") return crypto.randomUUID();
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      const pending = JSON.parse(raw) as PendingCheckout;
      if (pending.fingerprint === fingerprint && typeof pending.key === "string") {
        return pending.key;
      }
    }
    const key = crypto.randomUUID();
    window.localStorage.setItem(storageKey, JSON.stringify({ key, fingerprint } satisfies PendingCheckout));
    return key;
  } catch {
    // Storage can be unavailable in private browser modes; still send a key
    // so the server protects retries made during this page lifetime.
    return crypto.randomUUID();
  }
}

export function clearPendingCheckoutKey(storageKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Best effort only; a retained key is safely invalidated by fingerprint.
  }
}

export function checkoutFingerprint(value: unknown): string {
  const stable = (input: unknown): string => {
    if (Array.isArray(input)) return `[${input.map(stable).join(",")}]`;
    if (input && typeof input === "object") {
      const record = input as Record<string, unknown>;
      return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
    }
    return JSON.stringify(input);
  };
  // A compact versioned fingerprint for binding a browser retry key to the
  // exact checkout request. It is an idempotency contract, not a secret.
  let hash = 0x811c9dc5;
  for (const char of stable(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}