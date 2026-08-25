import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { resetSessionForDemoLogin } from "./auth/demoSession";

describe("demo login session boundary", () => {
  test("rotates the browser session before activating a demo member", async () => {
    let regenerated = false;
    await resetSessionForDemoLogin({
      regenerate(callback) {
        regenerated = true;
        callback(null);
      },
    });
    assert.equal(regenerated, true);
  });

  test("does not continue when the old session cannot be rotated", async () => {
    await assert.rejects(
      resetSessionForDemoLogin({
        regenerate(callback) {
          callback(new Error("session store unavailable"));
        },
      }),
      /session store unavailable/,
    );
  });
});