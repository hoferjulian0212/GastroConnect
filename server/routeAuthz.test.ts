// Route-level authorization regression tests.
//
// Verifies that protected API endpoints:
//   1. Return 401 when no session cookie is present
//   2. Return 403 when a session from the wrong org / wrong role is used
//   3. Return a 2xx status when the correct member calls the endpoint
//
// The PMS webhook endpoint is gated by a shared secret instead of a session;
// it returns 401 for a wrong/absent header and 200 for the correct one.
//
// The suite spawns the application server on TEST_PORT (5098) so it never
// conflicts with the dev server (5000) or the driver-lifecycle suite (5099).
//
// Endpoints covered:
//   PATCH  /api/orders/:id/status          (cancel)
//   POST   /api/orders/:id/confirm
//   PUT    /api/custom-prices
//   DELETE /api/custom-prices/:id
//   PUT    /api/custom-moq
//   DELETE /api/custom-moq/:id
//   POST   /api/complaints
//   POST   /api/push/subscribe
//   POST   /api/whatsapp/connection-requests
//   POST   /api/pms/webhooks/guest-count

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn, type ChildProcess } from "child_process";
import { eq, inArray, or } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { storage } from "./storage";
import {
  users,
  members,
  products,
  orders,
  orderItems,
  complaints,
  complaintStatusHistory,
  conversations,
  messages,
  platformAdmins,
} from "../shared/schema";

// ── Server ────────────────────────────────────────────────────────────────────
const TEST_PORT = 5098;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
// A per-run random secret so the PMS-webhook 200 path can be tested without
// relying on any env variable that might already be set in the environment.
const PMS_SECRET = `pms-authz-${crypto.randomBytes(8).toString("hex")}`;

let serverProcess: ChildProcess | null = null;

async function waitForServer(timeoutMs = 40_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/auth/me`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.status > 0) return;
    } catch {
      // not ready yet — keep polling
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(
    `Test server did not become ready within ${timeoutMs / 1000}s on port ${TEST_PORT}`,
  );
}

// ── Fixture state ─────────────────────────────────────────────────────────────
const RUN = crypto.randomUUID().slice(0, 8);

let supplierId = "";
let restaurantId = "";
/** Completely unrelated supplier — used for the cross-org cancel 403 test. */
let otherSupplierId = "";
let supplierAdminId = "";
let restaurantAdminId = "";
let otherSupplierAdminId = "";
let productId = "";
/** "pending" order: used for the confirm auth tests; never actually confirmed. */
let pendingOrderId = "";
let pendingOrderItemId = "";
/** "confirmed" order: used for the cancel auth tests; never actually cancelled. */
let confirmedOrderId = "";
let confirmedOrderItemId = "";
let customPriceId = "";
let customMoqId = "";

const sessionSids: string[] = [];

before(async () => {
  await storage.runDriverMigration();

  // ── Orgs ────────────────────────────────────────────────────────────────────
  const [supplier] = await db
    .insert(users)
    .values({
      role: "supplier",
      name: `Authz Supplier ${RUN}`,
      email: `authz-supplier-${RUN}@test.invalid`,
      verifiedAt: new Date(),
    })
    .returning();
  supplierId = supplier.id;

  const [restaurant] = await db
    .insert(users)
    .values({
      role: "restaurant",
      name: `Authz Restaurant ${RUN}`,
      email: `authz-restaurant-${RUN}@test.invalid`,
      verifiedAt: new Date(),
    })
    .returning();
  restaurantId = restaurant.id;

  const [otherSupplier] = await db
    .insert(users)
    .values({
      role: "supplier",
      name: `Authz Other Supplier ${RUN}`,
      email: `authz-other-supplier-${RUN}@test.invalid`,
      verifiedAt: new Date(),
    })
    .returning();
  otherSupplierId = otherSupplier.id;

  // ── Members ──────────────────────────────────────────────────────────────────
  const [supplierAdmin] = await db
    .insert(members)
    .values({
      organizationId: supplierId,
      name: `Authz SupplierAdmin ${RUN}`,
      email: `authz-supplier-admin-${RUN}@test.invalid`,
      role: "admin",
    })
    .returning();
  supplierAdminId = supplierAdmin.id;

  const [restaurantAdmin] = await db
    .insert(members)
    .values({
      organizationId: restaurantId,
      name: `Authz RestaurantAdmin ${RUN}`,
      email: `authz-restaurant-admin-${RUN}@test.invalid`,
      role: "admin",
    })
    .returning();
  restaurantAdminId = restaurantAdmin.id;

  const [otherSupplierAdmin] = await db
    .insert(members)
    .values({
      organizationId: otherSupplierId,
      name: `Authz OtherSupplierAdmin ${RUN}`,
      email: `authz-other-supplier-admin-${RUN}@test.invalid`,
      role: "admin",
    })
    .returning();
  otherSupplierAdminId = otherSupplierAdmin.id;

  // ── Product ───────────────────────────────────────────────────────────────────
  const [product] = await db
    .insert(products)
    .values({
      supplierId,
      name: `Authz Product ${RUN}`,
      price: "10.00",
      unit: "kg",
    })
    .returning();
  productId = product.id;

  // ── Orders ────────────────────────────────────────────────────────────────────
  const [pendingOrder] = await db
    .insert(orders)
    .values({ restaurantId, supplierId, status: "pending", totalAmount: "10.00" })
    .returning();
  pendingOrderId = pendingOrder.id;

  const [pendingItem] = await db
    .insert(orderItems)
    .values({
      orderId: pendingOrderId,
      productId,
      productName: `Authz Product ${RUN}`,
      quantity: 1,
      unitPrice: "10.00",
      totalPrice: "10.00",
    })
    .returning();
  pendingOrderItemId = pendingItem.id;

  const [confirmedOrder] = await db
    .insert(orders)
    .values({ restaurantId, supplierId, status: "confirmed", totalAmount: "10.00" })
    .returning();
  confirmedOrderId = confirmedOrder.id;

  const [confirmedItem] = await db
    .insert(orderItems)
    .values({
      orderId: confirmedOrderId,
      productId,
      productName: `Authz Product ${RUN}`,
      quantity: 1,
      unitPrice: "10.00",
      totalPrice: "10.00",
    })
    .returning();
  confirmedOrderItemId = confirmedItem.id;

  // ── Custom pricing/MOQ fixtures (used in DELETE auth tests) ──────────────────
  const cp = await storage.setCustomPrice({
    supplierId,
    restaurantId,
    productId,
    customPrice: "8.00",
  });
  customPriceId = cp.id;

  const moq = await storage.setCustomMinOrderQuantity({
    supplierId,
    restaurantId,
    productId,
    minOrderQuantity: 3,
  });
  customMoqId = moq.id;

  // ── Start test server ─────────────────────────────────────────────────────────
  serverProcess = spawn(
    process.execPath,
    ["--import", "tsx", "server/index.ts"],
    {
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        PMS_WEBHOOK_SECRET: PMS_SECRET,
      },
      stdio: "pipe",
      cwd: process.cwd(),
    },
  );

  serverProcess.stderr?.on("data", (d: Buffer) => {
    const line = d.toString();
    if (/error/i.test(line)) process.stderr.write(`[authz-server] ${line}`);
  });

  serverProcess.on("error", (err) => {
    throw new Error(`Failed to start test server: ${err.message}`);
  });

  await waitForServer(40_000);
});

after(async () => {
  // ── Kill server ───────────────────────────────────────────────────────────────
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      serverProcess!.once("exit", () => resolve());
      setTimeout(resolve, 3_000);
    });
  }

  try {
    // ── Sessions ─────────────────────────────────────────────────────────────────
    if (sessionSids.length > 0) {
      await db.execute(
        sql`DELETE FROM user_sessions WHERE sid IN (${sql.join(
          sessionSids.map((s) => sql`${s}`),
          sql`, `,
        )})`,
      );
    }

    // ── Push subscriptions (from the 200 subscribe test) ─────────────────────────
    await db.execute(
      sql`DELETE FROM push_subscriptions WHERE endpoint LIKE 'https://push.example.com/authz-test-%'`,
    );

    // ── Guest count imports (from the 200 webhook test) ──────────────────────────
    await db.execute(
      sql`DELETE FROM guest_count_imports WHERE restaurant_id = ${restaurantId}`,
    );

    // ── Custom prices / MOQ ──────────────────────────────────────────────────────
    await db.execute(
      sql`DELETE FROM custom_prices WHERE supplier_id = ${supplierId}`,
    );
    await db.execute(
      sql`DELETE FROM custom_min_order_quantities WHERE supplier_id = ${supplierId}`,
    );

    const orgIds = [supplierId, restaurantId, otherSupplierId].filter(Boolean);

    // ── Notifications ────────────────────────────────────────────────────────────
    if (orgIds.length > 0) {
      await db.execute(
        sql`DELETE FROM notifications WHERE user_id IN (${sql.join(
          orgIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
    }

    // ── Order FK chain ────────────────────────────────────────────────────────────
    const seededOrders = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.supplierId, supplierId));
    if (seededOrders.length > 0) {
      const orderIds = seededOrders.map((o) => o.id);
      await db.delete(messages).where(inArray(messages.orderId, orderIds));
      await db.execute(
        sql`DELETE FROM order_status_history WHERE order_id IN (${sql.join(
          orderIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
      await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
    }
    await db.delete(orders).where(eq(orders.supplierId, supplierId));

    // ── Conversations + messages ──────────────────────────────────────────────────
    if (supplierId && restaurantId) {
      const convs = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          or(
            eq(conversations.supplierId, supplierId),
            eq(conversations.restaurantId, restaurantId),
          ),
        );
      if (convs.length > 0) {
        const convIds = convs.map((c) => c.id);
        await db.delete(messages).where(inArray(messages.conversationId, convIds));
        await db.delete(conversations).where(inArray(conversations.id, convIds));
      }
    }

    // ── Products ──────────────────────────────────────────────────────────────────
    if (productId) await db.delete(products).where(eq(products.id, productId));

    // ── Members then users ────────────────────────────────────────────────────────
    if (orgIds.length > 0) {
      await db.execute(
        sql`DELETE FROM members WHERE organization_id IN (${sql.join(
          orgIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
      await db.delete(users).where(inArray(users.id, orgIds));
    }
  } finally {
    await pool.end();
  }
});

// ── HTTP helpers ──────────────────────────────────────────────────────────────

/**
 * Seeds a signed express-session row that impersonates `memberId` via the
 * approved platform admin. Returns a `gc.sid` cookie string.
 */
async function seedSessionCookie(memberId: string): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  assert.ok(secret, "SESSION_SECRET must be set");

  const [admin] = await db
    .select()
    .from(platformAdmins)
    .where(eq(platformAdmins.status, "approved"))
    .limit(1);
  assert.ok(admin, "No approved platform admin found — ensure bootstrapPlatformAdmin ran");

  const sid = crypto.randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000);
  const sess = {
    cookie: {
      originalMaxAge: 60 * 60 * 1000,
      expires: expires.toISOString(),
      httpOnly: true,
      path: "/",
      sameSite: "lax",
    },
    adminId: admin.id,
    impersonatedMemberId: memberId,
  };
  await db.execute(sql`
    INSERT INTO user_sessions (sid, sess, expire)
    VALUES (${sid}, ${JSON.stringify(sess)}::json, ${expires})
    ON CONFLICT (sid) DO NOTHING
  `);
  sessionSids.push(sid);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(sid)
    .digest("base64")
    .replace(/=+$/, "");
  return `gc.sid=${encodeURIComponent(`s:${sid}.${signature}`)}`;
}

interface FetchResult {
  status: number;
  json: unknown;
}

async function api(
  method: string,
  path: string,
  body?: unknown,
  opts: { cookie?: string; headers?: Record<string, string> } = {},
): Promise<FetchResult> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...(opts.headers ?? {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  let json: unknown = null;
  try { json = await res.json(); } catch { /* non-JSON body */ }
  return { status: res.status, json };
}

describe("public stats cache safety", () => {
  test("GET /api/public/stats is cacheable without refreshing a signed session", async () => {
    const cookie = await seedSessionCookie(supplierAdminId);
    const res = await fetch(`${BASE_URL}/api/public/stats`, {
      headers: { cookie },
      signal: AbortSignal.timeout(15_000),
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("set-cookie"), null, "public response must not carry a session cookie");
    assert.match(
      res.headers.get("cache-control") ?? "",
      /^public, max-age=3600, stale-while-revalidate=600$/,
    );
    assert.equal(res.headers.get("pragma"), null);
    assert.equal(res.headers.get("expires"), null);

    const stats = await res.json() as Record<string, unknown>;
    for (const key of [
      "avgSavingsPercent",
      "businesses",
      "ordersLast12Months",
      "complaintsResolvedPercent",
    ]) {
      assert.equal(typeof stats[key], "number", `${key} should be numeric`);
      assert.ok(Number.isFinite(stats[key]), `${key} should be finite`);
      assert.ok((stats[key] as number) >= 0, `${key} should be non-negative`);
    }
  });
});

// ── 1. Unauthenticated → 401 ──────────────────────────────────────────────────
//
// Every endpoint below must reject requests that carry no session cookie with
// HTTP 401, regardless of the request body.
//
// Note: some endpoints (PUT /api/custom-prices, PUT /api/custom-moq,
// POST /api/orders/:id/confirm) parse the body before the auth check, so the
// tests send a structurally valid body to ensure the 401 path is reached.

describe("route authz: unauthenticated requests → 401", () => {
  test("PATCH /api/orders/:id/status — no cookie → 401", async () => {
    const { status } = await api("PATCH", `/api/orders/${confirmedOrderId}/status`, {
      status: "cancelled",
    });
    assert.equal(status, 401, "expected 401 without session");
  });

  test("POST /api/orders/:id/confirm — no cookie → 401", async () => {
    const { status } = await api("POST", `/api/orders/${pendingOrderId}/confirm`, {
      items: [{ orderItemId: pendingOrderItemId, confirmedQuantity: 1 }],
    });
    assert.equal(status, 401, "expected 401 without session");
  });

  test("PUT /api/custom-prices — no cookie → 401", async () => {
    const { status } = await api("PUT", "/api/custom-prices", {
      supplierId,
      restaurantId,
      productId,
      customPrice: "7.50",
    });
    assert.equal(status, 401, "expected 401 without session");
  });

  test("DELETE /api/custom-prices/:id — no cookie → 401", async () => {
    // Auth is checked before the record is fetched, so any UUID works.
    const { status } = await api("DELETE", `/api/custom-prices/${customPriceId}`);
    assert.equal(status, 401, "expected 401 without session");
  });

  test("PUT /api/custom-moq — no cookie → 401", async () => {
    const { status } = await api("PUT", "/api/custom-moq", {
      supplierId,
      restaurantId,
      productId,
      minOrderQuantity: 5,
    });
    assert.equal(status, 401, "expected 401 without session");
  });

  test("DELETE /api/custom-moq/:id — no cookie → 401", async () => {
    const { status } = await api("DELETE", `/api/custom-moq/${customMoqId}`);
    assert.equal(status, 401, "expected 401 without session");
  });

  test("POST /api/complaints — no cookie → 401", async () => {
    // Auth is the very first check in the handler.
    const { status } = await api("POST", "/api/complaints", {});
    assert.equal(status, 401, "expected 401 without session");
  });

  test("POST /api/push/subscribe — no cookie → 401", async () => {
    const { status } = await api("POST", "/api/push/subscribe", {});
    assert.equal(status, 401, "expected 401 without session");
  });

  test("POST /api/whatsapp/connection-requests — no cookie → 401", async () => {
    const { status } = await api("POST", "/api/whatsapp/connection-requests", {});
    assert.equal(status, 401, "expected 401 without session");
  });

  test("POST /api/pms/webhooks/guest-count — no x-webhook-secret header → 401", async () => {
    // PMS_WEBHOOK_SECRET is set; supplying no header means empty string which
    // has a different length from the secret → 401 (not 503).
    const { status } = await api("POST", "/api/pms/webhooks/guest-count", {
      restaurantId,
      counts: [{ date: "2026-01-01", guestCount: 10 }],
    });
    assert.equal(status, 401, "expected 401 for missing webhook secret header");
  });

  test("POST /api/pms/webhooks/guest-count — wrong x-webhook-secret → 401", async () => {
    const { status } = await api(
      "POST",
      "/api/pms/webhooks/guest-count",
      { restaurantId, counts: [{ date: "2026-01-01", guestCount: 10 }] },
      { headers: { "x-webhook-secret": "definitely-not-the-right-secret" } },
    );
    assert.equal(status, 401, "expected 401 for wrong webhook secret");
  });
});

// ── 2. Cross-org / wrong role → 403 ──────────────────────────────────────────
//
// Authenticated members from the wrong org, or the wrong role on the correct
// org, must be rejected with HTTP 403.

describe("route authz: cross-org / wrong-role requests → 403", () => {
  test("PATCH /api/orders/:id/status — unrelated supplier org cannot cancel", async () => {
    // otherSupplierId is not a party to the order (restaurantId ↔ supplierId).
    const cookie = await seedSessionCookie(otherSupplierAdminId);
    const { status } = await api(
      "PATCH",
      `/api/orders/${confirmedOrderId}/status`,
      { status: "cancelled" },
      { cookie },
    );
    assert.equal(status, 403, "unrelated org must be rejected with 403");
  });

  test("POST /api/orders/:id/confirm — restaurant cannot confirm a supplier's order", async () => {
    // /confirm is gated by checkActingCapability(req, order.supplierId, "orders.manage").
    // The restaurant's orgId ≠ order.supplierId → 403.
    const cookie = await seedSessionCookie(restaurantAdminId);
    const { status } = await api(
      "POST",
      `/api/orders/${pendingOrderId}/confirm`,
      { items: [{ orderItemId: pendingOrderItemId, confirmedQuantity: 1 }] },
      { cookie },
    );
    assert.equal(status, 403, "restaurant must be rejected with 403 on supplier confirm");
  });

  test("PUT /api/custom-prices — restaurant cannot set supplier custom prices", async () => {
    // checkActingCapability(req, validated.supplierId, "products.manage"):
    // restaurant's orgId ≠ supplierId → 403.
    const cookie = await seedSessionCookie(restaurantAdminId);
    const { status } = await api(
      "PUT",
      "/api/custom-prices",
      { supplierId, restaurantId, productId, customPrice: "7.50" },
      { cookie },
    );
    assert.equal(status, 403, "restaurant must be rejected with 403 on PUT /api/custom-prices");
  });

  test("DELETE /api/custom-prices/:id — restaurant cannot delete supplier custom price", async () => {
    const cookie = await seedSessionCookie(restaurantAdminId);
    const { status } = await api(
      "DELETE",
      `/api/custom-prices/${customPriceId}`,
      undefined,
      { cookie },
    );
    assert.equal(status, 403, "restaurant must be rejected with 403 on DELETE /api/custom-prices/:id");
  });

  test("PUT /api/custom-moq — restaurant cannot set supplier custom MOQ", async () => {
    const cookie = await seedSessionCookie(restaurantAdminId);
    const { status } = await api(
      "PUT",
      "/api/custom-moq",
      { supplierId, restaurantId, productId, minOrderQuantity: 5 },
      { cookie },
    );
    assert.equal(status, 403, "restaurant must be rejected with 403 on PUT /api/custom-moq");
  });

  test("DELETE /api/custom-moq/:id — restaurant cannot delete supplier custom MOQ", async () => {
    const cookie = await seedSessionCookie(restaurantAdminId);
    const { status } = await api(
      "DELETE",
      `/api/custom-moq/${customMoqId}`,
      undefined,
      { cookie },
    );
    assert.equal(status, 403, "restaurant must be rejected with 403 on DELETE /api/custom-moq/:id");
  });

  test("POST /api/complaints — supplier admin cannot create a complaint (restaurant-only)", async () => {
    // The handler parses the body with insertComplaintSchema BEFORE the role
    // check (line: if (req.auth.org.role !== "restaurant") return 403). The body
    // must therefore pass Zod validation to reach the 403 branch.
    const cookie = await seedSessionCookie(supplierAdminId);
    const { status } = await api(
      "POST",
      "/api/complaints",
      {
        supplierId,
        orderId: confirmedOrderId,
        title: "Cross-org complaint authz test",
        description: "This must fail with 403",
        reason: "quality", // required enum field in insertComplaintSchema
      },
      { cookie },
    );
    assert.equal(status, 403, "supplier must be rejected with 403 on POST /api/complaints");
  });

  test("POST /api/complaints — restaurant cannot attach a complaint to another supplier's order", async () => {
    const cookie = await seedSessionCookie(restaurantAdminId);
    const { status, json } = await api(
      "POST",
      "/api/complaints",
      {
        supplierId: otherSupplierId,
        orderId: confirmedOrderId,
        title: "Mismatched order complaint",
        description: "This must not be attached to an unrelated supplier.",
        reason: "quality",
      },
      { cookie },
    );
    assert.equal(status, 403, "supplier/order mismatch must be rejected");
    assert.deepEqual(json, { error: "order_party_mismatch" });
  });
});

// ── 3. Correct member → 2xx ───────────────────────────────────────────────────
//
// Confirms that the auth gates do not over-block legitimate callers.
// State-mutating tests create fresh order rows so the shared fixtures
// (pendingOrderId / confirmedOrderId) remain unmodified.

describe("route authz: correct member → 2xx", () => {
  test("PATCH /api/orders/:id/status — supplier admin can cancel their own order", async () => {
    const cookie = await seedSessionCookie(supplierAdminId);
    // Fresh order so we don't touch confirmedOrderId.
    const [freshOrder] = await db
      .insert(orders)
      .values({ restaurantId, supplierId, status: "confirmed", totalAmount: "10.00" })
      .returning();
    await db.insert(orderItems).values({
      orderId: freshOrder.id,
      productId,
      productName: `Authz Product ${RUN}`,
      quantity: 1,
      unitPrice: "10.00",
      totalPrice: "10.00",
    });
    const { status, json } = await api(
      "PATCH",
      `/api/orders/${freshOrder.id}/status`,
      { status: "cancelled" },
      { cookie },
    );
    assert.equal(
      status,
      200,
      `supplier admin cancel must succeed; got ${status}: ${JSON.stringify(json)}`,
    );
    // Inline cleanup so the fixture doesn't pollute the after() delete loop.
    await db.execute(
      sql`DELETE FROM order_status_history WHERE order_id = ${freshOrder.id}`,
    );
    await db.delete(orderItems).where(eq(orderItems.orderId, freshOrder.id));
    await db.delete(orders).where(eq(orders.id, freshOrder.id));
  });

  test("POST /api/orders/:id/confirm — supplier admin can confirm a pending order", async () => {
    const cookie = await seedSessionCookie(supplierAdminId);
    const [freshOrder] = await db
      .insert(orders)
      .values({ restaurantId, supplierId, status: "pending", totalAmount: "10.00" })
      .returning();
    const [freshItem] = await db
      .insert(orderItems)
      .values({
        orderId: freshOrder.id,
        productId,
        productName: `Authz Product ${RUN}`,
        quantity: 1,
        unitPrice: "10.00",
        totalPrice: "10.00",
      })
      .returning();
    const { status, json } = await api(
      "POST",
      `/api/orders/${freshOrder.id}/confirm`,
      { items: [{ orderItemId: freshItem.id, confirmedQuantity: 1 }] },
      { cookie },
    );
    assert.equal(
      status,
      200,
      `supplier admin confirm must succeed; got ${status}: ${JSON.stringify(json)}`,
    );
    // Inline cleanup: the confirm endpoint auto-posts a conversation message
    // with orderId set on it, so messages must be deleted before orderItems
    // (FK: messages.order_id → orders.id).
    await db.delete(messages).where(eq(messages.orderId, freshOrder.id));
    await db.execute(
      sql`DELETE FROM order_status_history WHERE order_id = ${freshOrder.id}`,
    );
    await db.delete(orderItems).where(eq(orderItems.orderId, freshOrder.id));
    await db.delete(orders).where(eq(orders.id, freshOrder.id));
  });

  test("POST /api/complaints — duplicate complaint for one order is rejected", async () => {
    const cookie = await seedSessionCookie(restaurantAdminId);
    const [freshOrder] = await db
      .insert(orders)
      .values({ restaurantId, supplierId, status: "delivered", totalAmount: "10.00" })
      .returning();
    const body = {
      supplierId,
      orderId: freshOrder.id,
      title: "Duplicate complaint test",
      description: "Only one complaint may be opened for this order.",
      reason: "quality",
    };
    const first = await api("POST", "/api/complaints", body, { cookie });
    assert.equal(first.status, 201, `first complaint must succeed: ${JSON.stringify(first.json)}`);
    const second = await api("POST", "/api/complaints", body, { cookie });
    assert.equal(second.status, 409, "second complaint for the same order must be rejected");
    assert.equal((second.json as { error?: string }).error, "complaint_already_exists");

    const complaintId = (first.json as { id: string }).id;
    await db.delete(messages).where(eq(messages.orderId, freshOrder.id));
    await db.delete(complaintStatusHistory).where(eq(complaintStatusHistory.complaintId, complaintId));
    await db.delete(complaints).where(eq(complaints.id, complaintId));
    await db.delete(orders).where(eq(orders.id, freshOrder.id));
  });

  test("POST /api/push/subscribe — any authenticated member → 200", async () => {
    const cookie = await seedSessionCookie(supplierAdminId);
    const endpoint = `https://push.example.com/authz-test-${RUN}`;
    const { status, json } = await api(
      "POST",
      "/api/push/subscribe",
      {
        subscription: {
          endpoint,
          keys: { p256dh: "authz-test-p256dh", auth: "authz-test-auth" },
        },
      },
      { cookie },
    );
    assert.equal(
      status,
      200,
      `authenticated member must be able to subscribe to push; got ${status}: ${JSON.stringify(json)}`,
    );
  });

  test("POST /api/pms/webhooks/guest-count — correct secret → 200", async () => {
    const { status, json } = await api(
      "POST",
      "/api/pms/webhooks/guest-count",
      { restaurantId, counts: [{ date: "2026-01-01", guestCount: 42 }] },
      { headers: { "x-webhook-secret": PMS_SECRET } },
    );
    assert.equal(
      status,
      200,
      `correct PMS secret must allow webhook access; got ${status}: ${JSON.stringify(json)}`,
    );
  });
});
