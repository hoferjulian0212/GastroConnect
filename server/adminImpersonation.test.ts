import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { registerAdminAuthRoutes } from "./auth/adminAuth";

describe("admin impersonation routes", () => {
  test("registers the static exit route before the dynamic member route", () => {
    const postRoutes: string[] = [];
    const app = new Proxy({}, {
      get: (_target, property: string) => {
        if (property === "post") {
          return (path: string) => {
            postRoutes.push(path);
          };
        }
        return () => undefined;
      },
    });

    registerAdminAuthRoutes(app as any);

    assert.ok(
      postRoutes.indexOf("/api/admin/impersonate/exit")
        < postRoutes.indexOf("/api/admin/impersonate/:memberId"),
    );
  });
});