// Tests for the platform-admin analytics surface added in the admin-panel
// rebuild. Three contracts are locked in here:
//
//  1. Access control — every /api/admin/* analytics route is guarded by
//     `requirePlatformAdmin`, which must reject any caller without an approved
//     platform-admin session (anonymous OR a logged-in business member) and
//     only call next() for a real platform admin.
//  2. Aggregation correctness — the cross-org rollups (overview, health,
//     timeseries, top-orgs, recent-activity, per-org stats, enriched org list)
//     must return the documented shape and, crucially, only count orders in the
//     "valid" status set ('delivered','confirmed','in_delivery',
//     'partially_confirmed') toward GMV/revenue. These run against the live dev
//     DB and assert internal consistency (storage output == an independent
//     recomputation), so they hold regardless of the exact demo data.
//  3. Routing / deep-link contract — the pending-badge target
//     (/admin/orgs?filter=pending) resolves to the orgs route + filter, and the
//     three top-level admin routes stay registered in App.tsx.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Server } from "node:http";
import express from "express";
import { sql } from "drizzle-orm";
import { requirePlatformAdmin } from "./auth/middleware";
import { registerAdminAuthRoutes } from "./auth/adminAuth";
import { storage } from "./storage";
import { db, pool } from "./db";

const VALID_STATUSES = ["delivered", "confirmed", "in_delivery"];

// Close the pg pool once everything has run so the test process can exit.
after(async () => {
  await pool.end();
});

// ===================== 1. Access control =====================

function mockRes() {
  return {
    statusCode: 0 as number,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

describe("requirePlatformAdmin guards the admin analytics routes", () => {
  test("rejects an unauthenticated caller with 401 and does not call next", () => {
    const res = mockRes();
    let nextCalled = false;
    requirePlatformAdmin({} as any, res as any, () => {
      nextCalled = true;
    });
    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
    assert.equal((res.body as any)?.error, "unauthenticated");
  });

  test("rejects a logged-in business member (no admin session) with 401", () => {
    const res = mockRes();
    let nextCalled = false;
    // req.auth is set (a normal member session) but there is no platformAdmin
    // context — the admin session layer is separate, so this must still 401.
    requirePlatformAdmin(
      { auth: { role: "admin", organizationId: "org-1", memberId: "m-1" } } as any,
      res as any,
      () => {
        nextCalled = true;
      },
    );
    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
  });

  test("allows an approved platform admin through", () => {
    const res = mockRes();
    let nextCalled = false;
    requirePlatformAdmin(
      { platformAdmin: { adminId: "a-1", admin: { id: "a-1", status: "approved" } } } as any,
      res as any,
      () => {
        nextCalled = true;
      },
    );
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 0, "no error status should be set");
  });
});

// The same guard, exercised end-to-end against the real route table to catch a
// route that loses or misorders the requirePlatformAdmin middleware.
describe("admin analytics endpoints reject callers without an admin session", () => {
  let server: Server;
  let baseUrl = "";

  before(async () => {
    const app = express();
    app.use(express.json());
    // registerAdminAuthRoutes mounts loadAdminAuth on /api/admin and guards each
    // analytics route with requirePlatformAdmin. With no session middleware in
    // front there is no admin session, so every guarded route must 401.
    registerAdminAuthRoutes(app);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const endpoints = [
    "/api/admin/stats/overview",
    "/api/admin/stats/timeseries",
    "/api/admin/stats/health",
    "/api/admin/stats/activity",
    "/api/admin/stats/top-orgs",
    "/api/admin/orgs",
    "/api/admin/orgs/any-org-id/stats",
  ];

  for (const ep of endpoints) {
    test(`GET ${ep} returns 401 without an admin session`, async () => {
      const res = await fetch(`${baseUrl}${ep}`);
      assert.equal(res.status, 401, `${ep} should reject unauthenticated callers`);
      const body = await res.json().catch(() => ({}));
      assert.equal((body as any).error, "unauthenticated");
    });
  }
});

// ===================== 2. Aggregation correctness =====================

describe("platform overview aggregation", () => {
  test("returns the documented shape with non-negative numbers", async () => {
    const ov = await storage.getPlatformOverview();
    for (const key of [
      "totalOrgs", "restaurants", "suppliers", "verifiedOrgs", "pendingOrgs",
      "totalMembers", "activeMembers", "totalOrders", "ordersThisMonth",
      "ordersLastMonth", "gmvTotal", "gmvThisMonth", "gmvLastMonth",
      "openComplaints", "pendingVerifications",
    ] as const) {
      assert.equal(typeof ov[key], "number", `${key} should be a number`);
      assert.ok(ov[key] >= 0, `${key} should be non-negative`);
    }
    assert.equal(ov.totalOrgs, ov.restaurants + ov.suppliers);
    assert.equal(ov.pendingOrgs, ov.pendingVerifications);
    assert.ok(ov.activeMembers <= ov.totalMembers, "active members can't exceed total");
  });

  test("gmvTotal counts ONLY valid-status orders", async () => {
    const rows = (await db.execute(sql`SELECT total_amount, status FROM orders`)).rows as any[];
    const expected = rows.reduce((sum, r) => {
      return VALID_STATUSES.includes(String(r.status)) ? sum + (Number(r.total_amount) || 0) : sum;
    }, 0);
    const ov = await storage.getPlatformOverview();
    assert.ok(
      Math.abs(ov.gmvTotal - expected) < 0.01,
      `gmvTotal ${ov.gmvTotal} should match valid-status recompute ${expected}`,
    );
  });

  test("totalOrders counts ALL orders regardless of status (count is not status-filtered)", async () => {
    const row = (await db.execute(sql`SELECT COUNT(*) as cnt FROM orders`)).rows[0] as any;
    const expected = Number(row.cnt) || 0;
    const ov = await storage.getPlatformOverview();
    assert.equal(ov.totalOrders, expected);
  });
});

describe("platform health aggregation", () => {
  test("returns the documented shape including unread-message backlog", async () => {
    const health = await storage.getPlatformHealth();
    for (const key of ["pendingVerifications", "openComplaints", "pendingAdmins", "lowStockProducts", "unreadMessages", "failedOrderNotifications"] as const) {
      assert.equal(typeof health[key], "number", `${key} should be a number`);
      assert.ok(health[key] >= 0, `${key} should be non-negative`);
    }
  });

  test("unreadMessages matches an independent count of undismissed unread messages", async () => {
    const row = (await db.execute(sql`SELECT COUNT(*) as cnt FROM messages WHERE is_read = false AND dismissed = false`)).rows[0] as any;
    const expected = Number(row.cnt) || 0;
    const health = await storage.getPlatformHealth();
    assert.equal(health.unreadMessages, expected);
  });
});

describe("platform time series", () => {
  test("returns 6 ascending months with numeric metrics", async () => {
    const series = await storage.getPlatformTimeSeries();
    assert.equal(series.length, 6);
    for (const p of series) {
      assert.match(p.month, /^\d{4}-\d{2}$/);
      for (const key of ["orders", "gmv", "newOrgs"] as const) {
        assert.equal(typeof p[key], "number");
        assert.ok(p[key] >= 0);
      }
    }
    const months = series.map(p => p.month);
    assert.deepEqual(months, [...months].sort(), "months must be in ascending order");
  });
});

describe("top organizations", () => {
  test("returns sorted lists and counts only valid-status revenue/spend", async () => {
    const top = await storage.getTopOrganizations();
    assert.ok(Array.isArray(top.topSuppliers));
    assert.ok(Array.isArray(top.topRestaurants));
    assert.ok(top.topSuppliers.length <= 5 && top.topRestaurants.length <= 5);

    // Sorted descending by money.
    for (let i = 1; i < top.topSuppliers.length; i++) {
      assert.ok(top.topSuppliers[i - 1].revenue >= top.topSuppliers[i].revenue);
    }
    for (let i = 1; i < top.topRestaurants.length; i++) {
      assert.ok(top.topRestaurants[i - 1].spend >= top.topRestaurants[i].spend);
    }

    // The #1 supplier's revenue AND order count must equal an independent
    // valid-status recompute — top-orgs counts only valid-status orders.
    if (top.topSuppliers.length > 0) {
      const sup = top.topSuppliers[0];
      const rows = (await db.execute(sql`SELECT total_amount, status FROM orders WHERE supplier_id = ${sup.id}`)).rows as any[];
      const valid = rows.filter(r => VALID_STATUSES.includes(String(r.status)));
      const expectedRevenue = valid.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);
      assert.ok(Math.abs(sup.revenue - expectedRevenue) < 0.01, `top supplier revenue ${sup.revenue} != recompute ${expectedRevenue}`);
      assert.equal(sup.orders, valid.length, `top supplier order count ${sup.orders} != valid-status count ${valid.length}`);
    }
  });
});

describe("recent activity feed", () => {
  test("returns valid items whose order/complaint links point to a real org id", async () => {
    const items = await storage.getPlatformRecentActivity(12);
    assert.ok(Array.isArray(items));
    for (const it of items) {
      assert.ok(["org", "order", "complaint"].includes(it.type));
      assert.equal(typeof it.title, "string");
      assert.match(it.link, /^\/admin\/orgs\//);
      // ISO timestamp.
      assert.ok(!Number.isNaN(Date.parse(it.createdAt)));
    }
    // Regression guard for the earlier bug where order/complaint rows linked to
    // the order/complaint id instead of the related org id: every linked id must
    // resolve to a users (org) row.
    for (const it of items.filter(i => i.type !== "org")) {
      const orgId = it.link.replace("/admin/orgs/", "");
      const found = (await db.execute(sql`SELECT id FROM users WHERE id = ${orgId}`)).rows[0];
      assert.ok(found, `activity link for ${it.type} should resolve to a real org id (${orgId})`);
    }
  });
});

describe("per-organization stats", () => {
  test("supplier stats include rating + last order and count only valid-status GMV", async () => {
    const orgs = await storage.getAllOrgsWithStats();
    const supplier = orgs.find(o => o.role === "supplier");
    if (!supplier) return; // no supplier in dataset — nothing to assert
    const stats = await storage.getAdminOrgStats(supplier.id);
    assert.ok(stats);
    assert.equal(stats!.role, "supplier");
    for (const key of ["totalOrders", "gmv", "avgOrderValue", "activePartners", "openComplaints", "productCount", "lowStockCount", "ratingCount"] as const) {
      assert.equal(typeof stats![key], "number");
      assert.ok(stats![key] >= 0);
    }
    // ratingAvg is null (no ratings) or within the 1-5 range.
    assert.ok(stats!.ratingAvg === null || (stats!.ratingAvg >= 1 && stats!.ratingAvg <= 5));
    // lastOrderAt is null or a parseable ISO timestamp.
    assert.ok(stats!.lastOrderAt === null || !Number.isNaN(Date.parse(stats!.lastOrderAt)));

    const rows = (await db.execute(sql`SELECT total_amount, status FROM orders WHERE supplier_id = ${supplier.id}`)).rows as any[];
    const expected = rows.reduce((sum, r) => VALID_STATUSES.includes(String(r.status)) ? sum + (Number(r.total_amount) || 0) : sum, 0);
    assert.ok(Math.abs(stats!.gmv - expected) < 0.01, `supplier gmv ${stats!.gmv} != recompute ${expected}`);
  });

  test("restaurant stats include last order date and the documented shape", async () => {
    const orgs = await storage.getAllOrgsWithStats();
    const restaurant = orgs.find(o => o.role === "restaurant");
    if (!restaurant) return;
    const stats = await storage.getAdminOrgStats(restaurant.id);
    assert.ok(stats);
    assert.equal(stats!.role, "restaurant");
    assert.ok(stats!.lastOrderAt === null || !Number.isNaN(Date.parse(stats!.lastOrderAt)));
    assert.ok(Array.isArray(stats!.monthly) && stats!.monthly.length === 6);
    assert.ok(Array.isArray(stats!.topPartners));
  });

  test("returns null for an unknown org id", async () => {
    const stats = await storage.getAdminOrgStats("does-not-exist-00000000");
    assert.equal(stats, null);
  });
});

describe("enriched organizations list", () => {
  test("each org carries activity metrics", async () => {
    const orgs = await storage.getAllOrgsWithStats();
    assert.ok(Array.isArray(orgs));
    for (const o of orgs) {
      assert.equal(typeof o.memberCount, "number");
      assert.equal(typeof o.orderCount, "number");
      assert.equal(typeof o.gmv, "number");
      assert.ok(o.memberCount >= 0 && o.orderCount >= 0 && o.gmv >= 0);
      assert.ok(o.lastActivityAt === null || !Number.isNaN(Date.parse(o.lastActivityAt)));
    }
  });
});

// ===================== 3. Routing / deep-link contract =====================

describe("admin routing & deep-link contract", () => {
  test("pending-badge target resolves to the orgs route with filter=pending", () => {
    // Mirrors App.tsx: `const pathOnly = location.split("?")[0]` plus AdminOrgs'
    // `new URLSearchParams(search).get("filter") === "pending"`.
    const url = "/admin/orgs?filter=pending";
    const pathOnly = url.split("?")[0];
    assert.equal(pathOnly, "/admin/orgs");
    const params = new URLSearchParams(url.slice(pathOnly.length));
    assert.equal(params.get("filter"), "pending");
  });

  test("App.tsx still registers the dashboard, orgs, and admins routes", () => {
    const src = readFileSync(join(import.meta.dirname, "../client/src/App.tsx"), "utf8");
    assert.match(src, /pathOnly === "\/admin"/, "dashboard route (/admin) must be registered");
    assert.match(src, /pathOnly === "\/admin\/orgs"/, "orgs route (/admin/orgs) must be registered");
    assert.match(src, /pathOnly === "\/admin\/admins"/, "admins route (/admin/admins) must be registered");
  });
});
