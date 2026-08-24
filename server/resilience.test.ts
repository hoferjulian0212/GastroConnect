import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseIdempotencyFingerprint, parseIdempotencyKey, getRequestId, publicErrorMessage } from "./resilience";

describe("resilience request identifiers", () => {
  test("preserves a bounded safe caller correlation id", () => {
    assert.equal(getRequestId("checkout-123"), "checkout-123");
    assert.equal(getRequestId("a:b.c-9_foo"), "a:b.c-9_foo");
  });

  test("does not accept malformed or oversized caller ids", () => {
    const generated = getRequestId("bad id\nforged-log-line");
    assert.notEqual(generated, "bad id\nforged-log-line");
    assert.match(generated, /^[0-9a-f-]{36}$/);

    const oversized = getRequestId("x".repeat(129));
    assert.match(oversized, /^[0-9a-f-]{36}$/);
    assert.match(getRequestId(["array-value"]), /^[0-9a-f-]{36}$/);
  });
});

describe("checkout idempotency keys", () => {
  test("distinguishes a missing key from malformed input so checkout routes can require it", () => {
    assert.deepEqual(parseIdempotencyKey(undefined), { key: undefined, invalid: false });
    assert.deepEqual(parseIdempotencyKey("checkout:0f75-1"), { key: "checkout:0f75-1", invalid: false });
    assert.deepEqual(parseIdempotencyKey("key with whitespace"), { key: undefined, invalid: true });
    assert.deepEqual(parseIdempotencyKey("x".repeat(129)), { key: undefined, invalid: true });
    assert.deepEqual(parseIdempotencyKey(["replayed-header"]), { key: undefined, invalid: true });
  });

  test("accepts only versioned checkout request fingerprints", () => {
    assert.equal(parseIdempotencyFingerprint("v1-deadbeef"), "v1-deadbeef");
    assert.equal(parseIdempotencyFingerprint("v1-nothex!"), undefined);
    assert.equal(parseIdempotencyFingerprint(undefined), undefined);
  });
});

describe("resilience public error responses", () => {
  test("hides internal details from server errors", () => {
    const message = publicErrorMessage(500);
    assert.equal(message, "Die Anfrage konnte nicht verarbeitet werden. Bitte versuchen Sie es später erneut.");
    assert.doesNotMatch(message, /postgres|sql|password|stack/i);
  });

  test("keeps unexpected client errors generic too", () => {
    assert.equal(publicErrorMessage(400), "Die Anfrage konnte nicht verarbeitet werden.");
    assert.equal(publicErrorMessage(503), "Die Anfrage konnte nicht verarbeitet werden. Bitte versuchen Sie es später erneut.");
  });
});