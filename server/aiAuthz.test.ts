// Authz regression tests for the AI assistant routes (server/aiSearch.ts).
// Contract locked in here: identity for every /api/ai/* and /api/search/ai
// endpoint comes ONLY from the server session (req.auth) — client-supplied
// userId/role in body or query are ignored, unauthenticated callers get 401,
// and cross-tenant chat access returns 404.
//
// Harness: a minimal express app with a test middleware that sets req.auth
// from test-only headers (x-test-org / x-test-org-role), mirroring what
// loadAuth does in production. Runs against the live dev DB.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import express from "express";
import { registerAiSearchRoutes } from "./aiSearch";
import { storage } from "./storage";
import { pool } from "./db";

let server: Server;
let base: string;

// Two real orgs from the seeded dev DB (resolved in before()).
let restaurantOrgId: string;
let supplierOrgId: string;
// Chats owned by each org, created by the tests and cleaned up after.
let restaurantChatId: string;
let supplierChatId: string;

before(async () => {
  const restaurants = await storage.getUsersByRole("restaurant");
  const suppliers = await storage.getUsersByRole("supplier");
  assert.ok(restaurants.length > 0, "seeded restaurant org required");
  assert.ok(suppliers.length > 0, "seeded supplier org required");
  restaurantOrgId = restaurants[0].id;
  supplierOrgId = suppliers[0].id;

  const rChat = await storage.createAiChat({
    userId: restaurantOrgId,
    role: "restaurant",
    title: "authz-test restaurant chat",
  });
  restaurantChatId = rChat.id;
  const sChat = await storage.createAiChat({
    userId: supplierOrgId,
    role: "supplier",
    title: "authz-test supplier chat",
  });
  supplierChatId = sChat.id;

  const app = express();
  // Test stand-in for loadAuth: trusts x-test-org/x-test-org-role headers.
  app.use((req, _res, next) => {
    const orgId = req.header("x-test-org");
    const orgRole = req.header("x-test-org-role");
    if (orgId && orgRole) {
      (req as any).auth = {
        organizationId: orgId,
        memberId: "test-member",
        role: "admin",
        member: { id: "test-member" },
        org: { id: orgId, role: orgRole },
      };
    }
    next();
  });
  registerAiSearchRoutes(app);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const addr = server.address();
  assert.ok(addr && typeof addr === "object");
  base = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  if (restaurantChatId) await storage.deleteAiChat(restaurantChatId, restaurantOrgId);
  if (supplierChatId) await storage.deleteAiChat(supplierChatId, supplierOrgId);
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

function asRestaurant(): Record<string, string> {
  return { "x-test-org": restaurantOrgId, "x-test-org-role": "restaurant" };
}

describe("AI routes reject unauthenticated callers", () => {
  const cases: Array<[string, string, RequestInit]> = [
    ["POST /api/ai/chat", "/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "test", userId: "spoofed", role: "restaurant" }),
    }],
    ["POST /api/search/ai", "/api/search/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "test", userId: "spoofed", role: "restaurant" }),
    }],
    ["GET /api/ai/chats", "/api/ai/chats?userId=spoofed&role=restaurant", {}],
    ["GET /api/ai/suggestions", "/api/ai/suggestions?userId=spoofed&role=restaurant", {}],
  ];
  for (const [name, path, init] of cases) {
    test(`${name} returns 401 without a session even when ids are supplied`, async () => {
      const res = await fetch(`${base}${path}`, init);
      assert.equal(res.status, 401);
      const body = (await res.json()) as any;
      assert.equal(body.error, "unauthenticated");
    });
  }

  test("GET /api/ai/chats/:id returns 401 without a session", async () => {
    const res = await fetch(`${base}/api/ai/chats/${restaurantChatId}?userId=${restaurantOrgId}`);
    assert.equal(res.status, 401);
  });

  test("DELETE /api/ai/chats/:id returns 401 without a session", async () => {
    const res = await fetch(`${base}/api/ai/chats/${restaurantChatId}?userId=${restaurantOrgId}`, {
      method: "DELETE",
    });
    assert.equal(res.status, 401);
  });
});

describe("AI routes derive identity from the session, not client ids", () => {
  test("GET /api/ai/chats ignores spoofed query ids and returns only the session org's chats", async () => {
    // Authenticated as the restaurant org, but query params claim the supplier org.
    const res = await fetch(
      `${base}/api/ai/chats?userId=${supplierOrgId}&role=supplier`,
      { headers: asRestaurant() },
    );
    assert.equal(res.status, 200);
    const chats = (await res.json()) as Array<{ id: string }>;
    const ids = new Set(chats.map((c) => c.id));
    assert.ok(ids.has(restaurantChatId), "must include the session org's own chat");
    assert.ok(!ids.has(supplierChatId), "must NOT include another org's chat");
  });

  test("GET /api/ai/suggestions ignores spoofed query ids (200 for session org)", async () => {
    const res = await fetch(
      `${base}/api/ai/suggestions?userId=${supplierOrgId}&role=supplier&lang=de`,
      { headers: asRestaurant() },
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.ok(Array.isArray(body.suggestions));
  });
});

describe("cross-tenant chat access is denied", () => {
  test("fetching another org's chat returns 404", async () => {
    const res = await fetch(`${base}/api/ai/chats/${supplierChatId}`, {
      headers: asRestaurant(),
    });
    assert.equal(res.status, 404);
    const body = (await res.json()) as any;
    assert.equal(body.error, "chat_not_found");
  });

  test("deleting another org's chat returns 404 and does not delete it", async () => {
    const res = await fetch(`${base}/api/ai/chats/${supplierChatId}`, {
      method: "DELETE",
      headers: asRestaurant(),
    });
    assert.equal(res.status, 404);
    const still = await storage.getAiChat(supplierChatId);
    assert.ok(still, "supplier chat must still exist");
  });

  test("fetching the session org's own chat succeeds", async () => {
    const res = await fetch(`${base}/api/ai/chats/${restaurantChatId}`, {
      headers: asRestaurant(),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.id, restaurantChatId);
  });

  test("a session whose org role is not restaurant/supplier is rejected", async () => {
    const res = await fetch(`${base}/api/ai/chats`, {
      headers: { "x-test-org": restaurantOrgId, "x-test-org-role": "weird" },
    });
    assert.equal(res.status, 401);
  });
});
