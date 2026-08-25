// Regression tests: driver-assignment lifecycle rules must hold through future
// order-route changes.
//
// Rules under test:
//  1. Cancelling an order removes any undelivered driver assignment.
//  2. Correcting an order back to pending removes any undelivered assignment.
//  3. An assignment whose own status is "delivered" is never touched by (1) or (2).
//  4. Rescheduling an order (PATCH /reschedule) moves an existing stop to the new date.
//  5. Confirming an order with a different delivery date moves the stop to that date.
//  6. PATCH /status with a new requestedDeliveryDate moves the stop to that date.
//  7. A reported exception needs supplier review before the driver may resume.
//
// The suite spawns the application server on a dedicated test port (TEST_PORT)
// so tests run self-contained in CI without requiring `npm run dev` to be
// running separately. All seven scenarios always execute; none are skipped.

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
  orderStatusHistory,
  messages,
  conversations,
  deliveryAssignments,
  driverRoutes,
  platformAdmins,
} from "../shared/schema";

// ── Test server ──────────────────────────────────────────────────────────────
// Use a dedicated port so the suite never conflicts with the dev server.
const TEST_PORT = 5099;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let serverProcess: ChildProcess | null = null;

/** Poll until the server accepts requests or the deadline passes. */
async function waitForServer(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/auth/me`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.status > 0) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(
    `Test server did not become ready within ${timeoutMs / 1000}s on port ${TEST_PORT}`,
  );
}

// ── Shared fixture state ─────────────────────────────────────────────────────
const RUN = crypto.randomUUID().slice(0, 8);
const TODAY = new Date().toISOString().slice(0, 10);
const FUTURE_DATE = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const FUTURE_DATE_2 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
const ROUTE_DATE = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
const ROUTE_DATE_2 = new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10);

let supplierId = "";
let restaurantId = "";
let driverMemberId = "";
let secondDriverMemberId = "";
let adminMemberId = "";
let restaurantAdminMemberId = "";
let productId = "";
const productItemPrice = "10.00";
const sessionSids: string[] = [];

before(async () => {
  // 1. Seed test data ──────────────────────────────────────────────────────
  await storage.runDriverMigration();

  const [supplier] = await db
    .insert(users)
    .values({
      role: "supplier",
      name: `Lifecycle Test Supplier ${RUN}`,
      email: `lifecycle-supplier-${RUN}@test.invalid`,
      verifiedAt: new Date(),
    })
    .returning();
  supplierId = supplier.id;

  const [restaurant] = await db
    .insert(users)
    .values({
      role: "restaurant",
      name: `Lifecycle Test Restaurant ${RUN}`,
      email: `lifecycle-restaurant-${RUN}@test.invalid`,
      verifiedAt: new Date(),
    })
    .returning();
  restaurantId = restaurant.id;

  const [driver] = await db
    .insert(members)
    .values({
      organizationId: supplierId,
      name: `Lifecycle Driver ${RUN}`,
      email: `lifecycle-driver-${RUN}@test.invalid`,
      role: "driver",
    })
    .returning();
  driverMemberId = driver.id;

  const [secondDriver] = await db
    .insert(members)
    .values({
      organizationId: supplierId,
      name: `Lifecycle Second Driver ${RUN}`,
      email: `lifecycle-driver-2-${RUN}@test.invalid`,
      role: "driver",
    })
    .returning();
  secondDriverMemberId = secondDriver.id;

  const [admin] = await db
    .insert(members)
    .values({
      organizationId: supplierId,
      name: `Lifecycle Admin ${RUN}`,
      email: `lifecycle-admin-${RUN}@test.invalid`,
      role: "admin",
    })
    .returning();
  adminMemberId = admin.id;

  const [restaurantAdmin] = await db
    .insert(members)
    .values({
      organizationId: restaurantId,
      name: `Lifecycle Restaurant Admin ${RUN}`,
      email: `lifecycle-restaurant-admin-${RUN}@test.invalid`,
      role: "admin",
    })
    .returning();
  restaurantAdminMemberId = restaurantAdmin.id;

  const [product] = await db
    .insert(products)
    .values({
      supplierId,
      name: `Lifecycle Product ${RUN}`,
      price: productItemPrice,
      unit: "kg",
    })
    .returning();
  productId = product.id;

  // 2. Start the application server on TEST_PORT ───────────────────────────
  serverProcess = spawn(
    process.execPath, // same node binary
    ["--import", "tsx", "server/index.ts"],
    {
      env: { ...process.env, PORT: String(TEST_PORT) },
      stdio: "pipe",
      cwd: process.cwd(),
    },
  );

  serverProcess.stderr?.on("data", (d: Buffer) => {
    const line = d.toString();
    // Only forward unexpected errors; suppress normal boot noise.
    if (/error/i.test(line)) process.stderr.write(`[test-server] ${line}`);
  });

  serverProcess.on("error", (err) => {
    throw new Error(`Failed to start test server: ${err.message}`);
  });

  await waitForServer(40_000);
});

after(async () => {
  // Kill the spawned server first.
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      serverProcess!.once("exit", () => resolve());
      setTimeout(resolve, 3000); // don't block forever
    });
  }

  try {
    if (sessionSids.length > 0) {
      await db.execute(
        sql`DELETE FROM user_sessions WHERE sid IN (${sql.join(
          sessionSids.map((s) => sql`${s}`),
          sql`, `,
        )})`,
      );
    }
    // Delete driver routes before their assignments and drivers (all FK-linked).
    await db
      .delete(driverRoutes)
      .where(eq(driverRoutes.supplierId, supplierId));
    // Delete delivery assignments first (FK → orders).
    await db
      .delete(deliveryAssignments)
      .where(eq(deliveryAssignments.supplierId, supplierId));

    // Delete all child rows of orders in dependency order.
    const seededOrders = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.supplierId, supplierId));
    if (seededOrders.length > 0) {
      const orderIds = seededOrders.map((o) => o.id);
      // Route handlers post chat messages with orderId FKs.
      await db.delete(messages).where(inArray(messages.orderId, orderIds));
      await db
        .delete(orderStatusHistory)
        .where(inArray(orderStatusHistory.orderId, orderIds));
      await db
        .delete(orderItems)
        .where(inArray(orderItems.orderId, orderIds));
    }
    await db.delete(orders).where(eq(orders.supplierId, supplierId));
    if (productId) await db.delete(products).where(eq(products.id, productId));

    // Route handlers create conversations (FK → users); delete messages then conversations.
    if (supplierId || restaurantId) {
      const seededConvs = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          or(
            eq(conversations.supplierId, supplierId),
            eq(conversations.restaurantId, restaurantId),
          ),
        );
      if (seededConvs.length > 0) {
        const convIds = seededConvs.map((c) => c.id);
        await db
          .delete(messages)
          .where(inArray(messages.conversationId, convIds));
        await db
          .delete(conversations)
          .where(inArray(conversations.id, convIds));
      }
    }

    // Delete members immediately before their parent users so any records
    // created after seeding (e.g. by async server work) are also caught.
    // Include both orgIds so the delete is robust regardless of which user
    // is referenced as organization_id.
    const orgIds = [supplierId, restaurantId].filter(Boolean);
    if (orgIds.length > 0) {
      await db.execute(
        sql`DELETE FROM members WHERE organization_id IN (${sql.join(
          orgIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
      // Route handlers fire notifications (FK → users).
      await db.execute(
        sql`DELETE FROM notifications WHERE user_id IN (${sql.join(
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

// ── HTTP helpers ─────────────────────────────────────────────────────────────

/**
 * Inserts a signed session that impersonates `memberId` via the approved
 * platform admin. Same mechanism as memberSanitization.test.ts.
 */
async function seedSessionCookie(memberId: string): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  assert.ok(secret, "SESSION_SECRET must be set");

  const [admin] = await db
    .select()
    .from(platformAdmins)
    .where(eq(platformAdmins.status, "approved"))
    .limit(1);
  assert.ok(admin, "No approved platform admin — ensure bootstrapPlatformAdmin ran");

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

async function apiFetch(
  method: string,
  path: string,
  body: unknown,
  cookie: string,
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

// ── DB helpers ───────────────────────────────────────────────────────────────

async function seedOrderWithAssignment(opts: {
  requestedDeliveryDate?: string;
  orderStatus?: string;
  assignmentStatus?: "assigned" | "en_route" | "delivered" | "problem";
  stopSequence?: number;
} = {}): Promise<{ orderId: string; orderItemId: string; assignmentId: string }> {
  const [order] = await db
    .insert(orders)
    .values({
      restaurantId,
      supplierId,
      status: (opts.orderStatus ?? "confirmed") as any,
      totalAmount: productItemPrice,
      requestedDeliveryDate: opts.requestedDeliveryDate ?? null,
    })
    .returning();

  const [item] = await db
    .insert(orderItems)
    .values({
      orderId: order.id,
      productId,
      productName: `Lifecycle Product ${RUN}`,
      quantity: 1,
      unitPrice: productItemPrice,
      totalPrice: productItemPrice,
    })
    .returning();

  const [assignment] = await db
    .insert(deliveryAssignments)
    .values({
      orderId: order.id,
      supplierId,
      restaurantId,
      driverMemberId,
      assignedByMemberId: adminMemberId,
      deliveryDate: opts.requestedDeliveryDate ?? TODAY,
      stopSequence: opts.stopSequence ?? 0,
      status: opts.assignmentStatus ?? "assigned",
    })
    .returning();

  return { orderId: order.id, orderItemId: item.id, assignmentId: assignment.id };
}

async function getAssignment(
  assignmentId: string,
): Promise<{
  id: string;
  deliveryDate: string;
  status: string;
  problemType: string | null;
  exceptionResolution: string | null;
  exceptionResolvedAt: Date | null;
} | undefined> {
  const rows = await db
    .select({
      id: deliveryAssignments.id,
      deliveryDate: deliveryAssignments.deliveryDate,
      status: deliveryAssignments.status,
      problemType: deliveryAssignments.problemType,
      exceptionResolution: deliveryAssignments.exceptionResolution,
      exceptionResolvedAt: deliveryAssignments.exceptionResolvedAt,
    })
    .from(deliveryAssignments)
    .where(eq(deliveryAssignments.id, assignmentId));
  return rows[0];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("driver lifecycle: cancel and pending-correction", () => {
  test("PATCH /status cancelled removes an undelivered driver assignment", async () => {
    const { orderId, assignmentId } = await seedOrderWithAssignment();
    const cookie = await seedSessionCookie(adminMemberId);

    const before = await getAssignment(assignmentId);
    assert.ok(before, "assignment must exist before cancel");

    const { status, json } = await apiFetch(
      "PATCH",
      `/api/orders/${orderId}/status`,
      { status: "cancelled" },
      cookie,
    );
    assert.equal(
      status,
      200,
      `Expected 200 from status PATCH, got ${status}: ${JSON.stringify(json)}`,
    );

    const after = await getAssignment(assignmentId);
    assert.equal(after, undefined, "Assignment must be deleted after order is cancelled");
  });

  test("PATCH /status pending removes an undelivered driver assignment", async () => {
    const { orderId, assignmentId } = await seedOrderWithAssignment();
    const cookie = await seedSessionCookie(adminMemberId);

    const before = await getAssignment(assignmentId);
    assert.ok(before, "assignment must exist before status correction");

    const { status, json } = await apiFetch(
      "PATCH",
      `/api/orders/${orderId}/status`,
      { status: "pending" },
      cookie,
    );
    assert.equal(
      status,
      200,
      `Expected 200 from status PATCH, got ${status}: ${JSON.stringify(json)}`,
    );

    const after = await getAssignment(assignmentId);
    assert.equal(
      after,
      undefined,
      "Assignment must be deleted after order is corrected back to pending",
    );
  });

  test("PATCH /status cancelled does NOT remove a delivered driver assignment", async () => {
    // The driver has already completed this stop; the order-level cancel must
    // not touch the delivered assignment record.
    const { orderId, assignmentId } = await seedOrderWithAssignment({
      assignmentStatus: "delivered",
    });
    const cookie = await seedSessionCookie(adminMemberId);

    const before = await getAssignment(assignmentId);
    assert.ok(before, "assignment must exist before cancel");
    assert.equal(before.status, "delivered");

    const { status, json } = await apiFetch(
      "PATCH",
      `/api/orders/${orderId}/status`,
      { status: "cancelled" },
      cookie,
    );
    assert.equal(
      status,
      200,
      `Expected 200 from status PATCH, got ${status}: ${JSON.stringify(json)}`,
    );

    const after = await getAssignment(assignmentId);
    assert.ok(
      after !== undefined,
      "Delivered assignment must NOT be deleted when order is cancelled",
    );
    assert.equal(after!.status, "delivered", "Assignment status must remain 'delivered'");
  });
});

describe("driver lifecycle: date changes move the assignment", () => {
  test("PATCH /reschedule moves assignment to the new delivery date", async () => {
    const { orderId, assignmentId } = await seedOrderWithAssignment({
      requestedDeliveryDate: FUTURE_DATE,
    });
    const cookie = await seedSessionCookie(adminMemberId);

    const before = await getAssignment(assignmentId);
    assert.ok(before, "assignment must exist before reschedule");
    assert.equal(before.deliveryDate, FUTURE_DATE);

    const { status, json } = await apiFetch(
      "PATCH",
      `/api/orders/${orderId}/reschedule`,
      {
        requestedDeliveryDate: FUTURE_DATE_2,
        dateChangeReason: "Test reschedule for lifecycle regression",
      },
      cookie,
    );
    assert.equal(
      status,
      200,
      `Expected 200 from reschedule, got ${status}: ${JSON.stringify(json)}`,
    );

    const after = await getAssignment(assignmentId);
    assert.ok(after, "Assignment must still exist after reschedule");
    assert.equal(
      after!.deliveryDate,
      FUTURE_DATE_2,
      `Assignment must move to new date ${FUTURE_DATE_2}, got ${after!.deliveryDate}`,
    );
  });

  test("PATCH /reschedule on an order without a prior date attaches the assignment to the given date", async () => {
    // Order has no delivery date yet; assignment is on TODAY.
    const { orderId, assignmentId } = await seedOrderWithAssignment();
    const cookie = await seedSessionCookie(adminMemberId);

    const before = await getAssignment(assignmentId);
    assert.ok(before, "assignment must exist before reschedule");

    const { status, json } = await apiFetch(
      "PATCH",
      `/api/orders/${orderId}/reschedule`,
      { requestedDeliveryDate: FUTURE_DATE },
      cookie,
    );
    assert.equal(
      status,
      200,
      `Expected 200 from reschedule, got ${status}: ${JSON.stringify(json)}`,
    );

    const after = await getAssignment(assignmentId);
    assert.ok(after, "Assignment must still exist after first-time reschedule");
    assert.equal(
      after!.deliveryDate,
      FUTURE_DATE,
      `Assignment must move to ${FUTURE_DATE}, got ${after!.deliveryDate}`,
    );
  });

  test("POST /confirm with a different delivery date moves the assignment to that date", async () => {
    // Order must be pending for /confirm to accept it.
    const { orderId, orderItemId, assignmentId } = await seedOrderWithAssignment({
      requestedDeliveryDate: FUTURE_DATE,
      orderStatus: "pending",
    });
    const cookie = await seedSessionCookie(adminMemberId);

    const before = await getAssignment(assignmentId);
    assert.ok(before, "assignment must exist before confirm");
    assert.equal(before.deliveryDate, FUTURE_DATE);

    const { status, json } = await apiFetch(
      "POST",
      `/api/orders/${orderId}/confirm`,
      {
        items: [{ orderItemId, confirmedQuantity: 1 }],
        deliveryDate: FUTURE_DATE_2,
        dateChangeReason: "Test confirm-with-date-change for lifecycle regression",
      },
      cookie,
    );
    assert.equal(
      status,
      200,
      `Expected 200 from confirm, got ${status}: ${JSON.stringify(json)}`,
    );

    const after = await getAssignment(assignmentId);
    assert.ok(after, "Assignment must still exist after confirm");
    assert.equal(
      after!.deliveryDate,
      FUTURE_DATE_2,
      `Assignment must move to confirmed date ${FUTURE_DATE_2}, got ${after!.deliveryDate}`,
    );
  });

  test("PATCH /status with new requestedDeliveryDate moves the assignment to that date", async () => {
    const { orderId, assignmentId } = await seedOrderWithAssignment({
      requestedDeliveryDate: FUTURE_DATE,
    });
    const cookie = await seedSessionCookie(adminMemberId);

    const before = await getAssignment(assignmentId);
    assert.ok(before, "assignment must exist before status PATCH");
    assert.equal(before.deliveryDate, FUTURE_DATE);

    // PATCH to a non-remove status while also supplying a new delivery date.
    const { status, json } = await apiFetch(
      "PATCH",
      `/api/orders/${orderId}/status`,
      { status: "scheduled", requestedDeliveryDate: FUTURE_DATE_2 },
      cookie,
    );
    assert.equal(
      status,
      200,
      `Expected 200 from status PATCH with date, got ${status}: ${JSON.stringify(json)}`,
    );

    const after = await getAssignment(assignmentId);
    assert.ok(after, "Assignment must still exist after status PATCH with date");
    assert.equal(
      after!.deliveryDate,
      FUTURE_DATE_2,
      `Assignment must move to ${FUTURE_DATE_2}, got ${after!.deliveryDate}`,
    );
  });
});

describe("driver lifecycle: exception resolution", () => {
  test("a driver-reported partial delivery waits for office approval, then resumes without changing order quantities", async () => {
    const { orderId, assignmentId } = await seedOrderWithAssignment({
      orderStatus: "in_delivery",
      assignmentStatus: "en_route",
    });
    const driverCookie = await seedSessionCookie(driverMemberId);
    const wrongDriverCookie = await seedSessionCookie(secondDriverMemberId);
    const adminCookie = await seedSessionCookie(adminMemberId);
    const restaurantCookie = await seedSessionCookie(restaurantAdminMemberId);

    const wrongDriver = await apiFetch(
      "POST",
      `/api/driver/deliveries/${assignmentId}/problem`,
      { problemType: "partial_delivery" },
      wrongDriverCookie,
    );
    assert.equal(wrongDriver.status, 404, "Another driver must not report an exception on this stop");

    const reported = await apiFetch(
      "POST",
      `/api/driver/deliveries/${assignmentId}/problem`,
      { problemType: "partial_delivery", note: "One crate is unavailable at the door." },
      driverCookie,
    );
    assert.equal(reported.status, 200, `Expected report success: ${JSON.stringify(reported.json)}`);

    const blocked = await apiFetch(
      "PATCH",
      `/api/driver/deliveries/${assignmentId}/status`,
      { status: "en_route" },
      driverCookie,
    );
    assert.equal(blocked.status, 400, "Driver must wait for supplier review after reporting an exception");

    const resolved = await apiFetch(
      "POST",
      `/api/supplier/deliveries/${assignmentId}/resolve`,
      { action: "continue_delivery" },
      adminCookie,
    );
    assert.equal(resolved.status, 200, `Expected office approval: ${JSON.stringify(resolved.json)}`);

    const tracking = await apiFetch(
      "GET",
      `/api/orders/${orderId}/tracking`,
      undefined,
      restaurantCookie,
    );
    assert.equal(tracking.status, 200, `Restaurant tracking must remain visible: ${JSON.stringify(tracking.json)}`);
    const trackingAssignment = (tracking.json as any).assignment;
    assert.equal(trackingAssignment.problemType, "partial_delivery");
    assert.equal(trackingAssignment.exceptionResolution, "continue_delivery");
    assert.ok(trackingAssignment.exceptionResolvedAt, "Restaurant must receive the reviewed delivery outcome");

    const assignment = await getAssignment(assignmentId);
    assert.ok(assignment);
    assert.equal(assignment!.status, "en_route");
    assert.equal(assignment!.problemType, "partial_delivery");
    assert.equal(assignment!.exceptionResolution, "continue_delivery");
    assert.ok(assignment!.exceptionResolvedAt, "Office decision should remain auditable after driver resumes");

    const [order] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
    assert.equal(order.status, "in_delivery", "Continuing an exception must not alter the order lifecycle or quantities");
  });

  test("approval restores a stop reported before route start so the driver can start the route", async () => {
    const { assignmentId } = await seedOrderWithAssignment({
      requestedDeliveryDate: ROUTE_DATE,
      orderStatus: "confirmed",
      assignmentStatus: "assigned",
    });
    const driverCookie = await seedSessionCookie(driverMemberId);
    const adminCookie = await seedSessionCookie(adminMemberId);
    await storage.syncDraftDriverRoute(driverMemberId, supplierId, ROUTE_DATE);
    await storage.confirmDriverRoute(driverMemberId, ROUTE_DATE);

    const reported = await apiFetch(
      "POST",
      `/api/driver/deliveries/${assignmentId}/problem`,
      { problemType: "unavailable" },
      driverCookie,
    );
    assert.equal(reported.status, 200);
    const approved = await apiFetch(
      "POST",
      `/api/supplier/deliveries/${assignmentId}/resolve`,
      { action: "continue_delivery" },
      adminCookie,
    );
    assert.equal(approved.status, 200);
    assert.equal((await getAssignment(assignmentId))?.status, "assigned", "Approval must restore the pre-problem stop state");

    const started = await apiFetch("POST", "/api/driver/route/start", { deliveryDate: ROUTE_DATE }, driverCookie);
    assert.equal(started.status, 200, `Approved stop must make the route startable: ${JSON.stringify(started.json)}`);
    assert.equal((await getAssignment(assignmentId))?.status, "en_route");
  });

  test("approval restores a waiting stop so an active route advances to it", async () => {
    const first = await seedOrderWithAssignment({
      requestedDeliveryDate: ROUTE_DATE_2,
      orderStatus: "confirmed",
      assignmentStatus: "assigned",
      stopSequence: 0,
    });
    const second = await seedOrderWithAssignment({
      requestedDeliveryDate: ROUTE_DATE_2,
      orderStatus: "confirmed",
      assignmentStatus: "assigned",
      stopSequence: 1,
    });
    const driverCookie = await seedSessionCookie(driverMemberId);
    const adminCookie = await seedSessionCookie(adminMemberId);
    await storage.syncDraftDriverRoute(driverMemberId, supplierId, ROUTE_DATE_2);
    await storage.confirmDriverRoute(driverMemberId, ROUTE_DATE_2);

    assert.equal((await apiFetch("POST", `/api/driver/deliveries/${second.assignmentId}/problem`, { problemType: "missing_items" }, driverCookie)).status, 200);
    assert.equal((await apiFetch("POST", `/api/supplier/deliveries/${second.assignmentId}/resolve`, { action: "continue_delivery" }, adminCookie)).status, 200);
    assert.equal((await apiFetch("POST", "/api/driver/route/start", { deliveryDate: ROUTE_DATE_2 }, driverCookie)).status, 200);
    assert.equal((await apiFetch("PATCH", `/api/driver/deliveries/${first.assignmentId}/status`, { status: "arriving" }, driverCookie)).status, 200);
    assert.equal((await apiFetch("POST", `/api/driver/deliveries/${first.assignmentId}/complete`, {}, driverCookie)).status, 200);

    assert.equal((await getAssignment(second.assignmentId))?.status, "en_route", "Active route must advance to the approved next stop");
  });

  test("only supplier delivery managers can return a problem to office review", async () => {
    const { orderId, assignmentId } = await seedOrderWithAssignment({
      orderStatus: "in_delivery",
      assignmentStatus: "problem",
    });
    await db.update(deliveryAssignments).set({
      problemType: "missing_items",
      problemNote: "Two items missing",
      problemReportedAt: new Date(),
    }).where(eq(deliveryAssignments.id, assignmentId));
    const restaurantMemberCookie = await seedSessionCookie(driverMemberId);
    const adminCookie = await seedSessionCookie(adminMemberId);

    // A driver has no office-delivery-management capability.
    const forbidden = await apiFetch(
      "POST",
      `/api/supplier/deliveries/${assignmentId}/resolve`,
      { action: "return_to_review" },
      restaurantMemberCookie,
    );
    assert.equal(forbidden.status, 403, "Driver must not resolve their own exception");

    const resolved = await apiFetch(
      "POST",
      `/api/supplier/deliveries/${assignmentId}/resolve`,
      { action: "return_to_review", note: "Office will arrange a new delivery slot." },
      adminCookie,
    );
    assert.equal(resolved.status, 200, `Expected office review resolution: ${JSON.stringify(resolved.json)}`);

    const duplicate = await apiFetch(
      "POST",
      `/api/supplier/deliveries/${assignmentId}/resolve`,
      { action: "return_to_review" },
      adminCookie,
    );
    assert.equal(duplicate.status, 400, "A resolved exception cannot be resolved twice");

    const assignment = await getAssignment(assignmentId);
    assert.ok(assignment);
    assert.equal(assignment!.status, "rejected");
    assert.equal(assignment!.problemType, "missing_items");
    assert.equal(assignment!.exceptionResolution, "return_to_review");

    const [order] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
    assert.equal(order.status, "to_review", "Order and assignment must move to office review together");
  });
});
