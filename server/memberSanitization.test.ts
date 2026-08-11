// Regression tests: member credential/auth columns must NEVER leak through
// API payloads that join on the `members` table.
//
// Background: during verification of the driver module, two endpoints were
// found leaking `passwordHash`/`emailVerifiedAt`/`lastLoginAt` of members
// (internal chat sender, delivery assignment driver joins). Both were fixed by
// sanitizing the joins — these tests pin that behavior so a future join on
// `members` cannot silently reintroduce the leak.
//
// Two layers:
//  1. Storage-level — seeds a supplier org + driver + delivery assignment +
//     live location in the dev DB and deep-scans the exact objects returned by
//     hydrateDeliveryAssignments / getDriverLocationsForSupplier (the shapes
//     that are `res.json()`-ed verbatim by the routes).
//  2. HTTP-level smoke test — inserts a real session row into `user_sessions`,
//     signs a `gc.sid` cookie with SESSION_SECRET and hits the live endpoints
//     (/api/supplier/deliveries, /api/supplier/driver-locations,
//     /api/internal-chat/messages, /api/driver/deliveries[...]) on the running
//     dev server, grepping the raw JSON for the forbidden keys. Skipped with a
//     warning when the app server is not running.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { storage } from "./storage";
import {
  users,
  members,
  products,
  orders,
  orderItems,
  deliveryAssignments,
  driverLocations,
  internalMessages,
  internalChatReads,
  platformAdmins,
} from "../shared/schema";

// Keys that must never appear anywhere in a serialized member join.
const FORBIDDEN_KEYS = ["passwordHash", "emailVerifiedAt", "lastLoginAt"];

/** Recursively collects the paths of any forbidden keys in a JSON-safe value. */
function findForbiddenKeys(value: unknown, path = "$"): string[] {
  if (value === null || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => findForbiddenKeys(v, `${path}[${i}]`));
  }
  const hits: string[] = [];
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.includes(key)) hits.push(`${path}.${key}`);
    hits.push(...findForbiddenKeys(v, `${path}.${key}`));
  }
  return hits;
}

/** Serialize the way express `res.json()` does, then scan. */
function assertNoCredentialLeak(payload: unknown, label: string) {
  const serialized = JSON.parse(JSON.stringify(payload));
  const hits = findForbiddenKeys(serialized);
  assert.deepEqual(
    hits,
    [],
    `${label} leaks member credential/auth columns at: ${hits.join(", ")}`,
  );
}

// ── Test fixture ids (populated in before) ─────────────────────────────────
const RUN = crypto.randomUUID().slice(0, 8);
const TODAY = new Date().toISOString().slice(0, 10);
let supplierId = "";
let restaurantId = "";
let driverMemberId = "";
let adminMemberId = "";
let productId = "";
let orderId = "";
let assignmentId = "";
const sessionSids: string[] = [];

before(async () => {
  // Driver-module tables are created idempotently at startup; make sure they
  // exist even on a fresh test database.
  await storage.runDriverMigration();

  const [supplier] = await db.insert(users).values({
    role: "supplier",
    name: `Sanitize Test Supplier ${RUN}`,
    email: `sanitize-supplier-${RUN}@test.invalid`,
    verifiedAt: new Date(),
  }).returning();
  supplierId = supplier.id;

  const [restaurant] = await db.insert(users).values({
    role: "restaurant",
    name: `Sanitize Test Restaurant ${RUN}`,
    email: `sanitize-restaurant-${RUN}@test.invalid`,
    verifiedAt: new Date(),
  }).returning();
  restaurantId = restaurant.id;

  // The driver member carries ALL the sensitive columns — if any join leaks,
  // these exact values would show up in the payloads below.
  const [driver] = await db.insert(members).values({
    organizationId: supplierId,
    name: `Sanitize Driver ${RUN}`,
    email: `sanitize-driver-${RUN}@test.invalid`,
    role: "driver",
    passwordHash: "$2a$10$LEAKCANARY.hash.value.that.must.never.appear",
    emailVerifiedAt: new Date(),
    lastLoginAt: new Date(),
  }).returning();
  driverMemberId = driver.id;

  const [admin] = await db.insert(members).values({
    organizationId: supplierId,
    name: `Sanitize Admin ${RUN}`,
    email: `sanitize-admin-${RUN}@test.invalid`,
    role: "admin",
    passwordHash: "$2a$10$LEAKCANARY.admin.hash.value",
    emailVerifiedAt: new Date(),
    lastLoginAt: new Date(),
  }).returning();
  adminMemberId = admin.id;

  const [product] = await db.insert(products).values({
    supplierId,
    name: `Sanitize Product ${RUN}`,
    price: "9.99",
    unit: "kg",
  }).returning();
  productId = product.id;

  const [order] = await db.insert(orders).values({
    restaurantId,
    supplierId,
    status: "confirmed",
    totalAmount: "9.99",
  }).returning();
  orderId = order.id;

  await db.insert(orderItems).values({
    orderId,
    productId,
    productName: product.name,
    quantity: 1,
    unitPrice: "9.99",
    totalPrice: "9.99",
  });

  const [assignment] = await db.insert(deliveryAssignments).values({
    orderId,
    supplierId,
    restaurantId,
    driverMemberId,
    assignedByMemberId: adminMemberId,
    deliveryDate: TODAY,
  }).returning();
  assignmentId = assignment.id;

  await db.insert(driverLocations).values({
    driverMemberId,
    supplierId,
    latitude: "41.9027835",
    longitude: "12.4963655",
  });

  // Internal chat is 1:1 (DMs): the message must carry a recipient, and the
  // HTTP test below fetches the thread via ?with=<partner>.
  await db.insert(internalMessages).values({
    supplierId,
    senderMemberId: driverMemberId,
    recipientMemberId: adminMemberId,
    content: `sanitization test message ${RUN}`,
  });
});

after(async () => {
  // Remove fixtures in FK order; best-effort so a mid-seed failure still cleans.
  try {
    if (sessionSids.length > 0) {
      await db.execute(sql`DELETE FROM user_sessions WHERE sid IN (${sql.join(sessionSids.map((s) => sql`${s}`), sql`, `)})`);
    }
    if (supplierId) {
      await db.delete(internalChatReads).where(eq(internalChatReads.supplierId, supplierId));
      await db.delete(internalMessages).where(eq(internalMessages.supplierId, supplierId));
      await db.delete(driverLocations).where(eq(driverLocations.supplierId, supplierId));
      await db.delete(deliveryAssignments).where(eq(deliveryAssignments.supplierId, supplierId));
    }
    if (orderId) {
      await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
      await db.delete(orders).where(eq(orders.id, orderId));
    }
    if (productId) await db.delete(products).where(eq(products.id, productId));
    // Delete members for ALL seeded orgs (defensive: though this test only
    // creates members under supplierId, other concurrent test processes that
    // share the DB may have created members under restaurantId as a side-effect,
    // causing a FK violation when we try to delete the restaurant user row).
    const orgIds = [supplierId, restaurantId].filter(Boolean);
    if (orgIds.length > 0) {
      await db.execute(
        sql`DELETE FROM members WHERE organization_id IN (${sql.join(orgIds.map((id) => sql`${id}`), sql`, `)})`,
      );
      await db.delete(users).where(inArray(users.id, orgIds));
    }
  } finally {
    await pool.end();
  }
});

// ── Self-test: the scanner itself must catch a leak ─────────────────────────

describe("leak scanner self-test", () => {
  test("detects forbidden keys at any nesting depth", () => {
    const leaky = {
      ok: true,
      rows: [{ driver: { id: "1", passwordHash: "x" } }],
      nested: { deep: { sender: { lastLoginAt: "2026-01-01" } } },
    };
    const hits = findForbiddenKeys(leaky);
    assert.equal(hits.length, 2, `expected 2 hits, got: ${hits.join(", ")}`);
    assert.throws(() => assertNoCredentialLeak(leaky, "self-test"));
  });

  test("passes clean payloads", () => {
    assertNoCredentialLeak({ driver: { id: "1", name: "ok", email: "a@b.c" } }, "clean");
  });
});

// ── 1. Storage-level payload shapes ─────────────────────────────────────────

describe("storage: delivery assignment joins are sanitized", () => {
  test("getDeliveriesForSupplier strips driver credentials", async () => {
    const rows = await storage.getDeliveriesForSupplier(supplierId);
    assert.ok(rows.length >= 1, "expected the seeded assignment to be returned");
    const mine = rows.find((r) => r.id === assignmentId);
    assert.ok(mine, "seeded assignment missing from supplier deliveries");
    // Non-vacuous: the driver join IS present with its public fields…
    assert.equal(mine!.driver.id, driverMemberId);
    assert.equal(typeof mine!.driver.name, "string");
    // …but never the credential columns.
    assertNoCredentialLeak(rows, "getDeliveriesForSupplier");
  });

  test("getDeliveriesForDriver strips driver credentials", async () => {
    const rows = await storage.getDeliveriesForDriver(driverMemberId, TODAY);
    assert.ok(rows.some((r) => r.id === assignmentId), "seeded assignment missing from driver tour");
    assertNoCredentialLeak(rows, "getDeliveriesForDriver");
  });

  test("getDriverDeliveryHistory strips driver credentials", async () => {
    // History only returns delivered/problem stops — flip the seeded one.
    await storage.updateDeliveryAssignment(assignmentId, { status: "delivered", deliveredAt: new Date() });
    const rows = await storage.getDriverDeliveryHistory(driverMemberId);
    assert.ok(rows.some((r) => r.id === assignmentId), "seeded assignment missing from history");
    assertNoCredentialLeak(rows, "getDriverDeliveryHistory");
  });

  test("getDriverLocationsForSupplier strips driver credentials", async () => {
    const rows = await storage.getDriverLocationsForSupplier(supplierId);
    assert.ok(rows.length >= 1, "expected the seeded driver location");
    assert.equal(rows[0].driver.id, driverMemberId);
    assertNoCredentialLeak(rows, "getDriverLocationsForSupplier");
  });
});

// ── 2. HTTP-level smoke test against the live dev server ───────────────────
//
// getInternalMessages intentionally returns the full sender at storage level;
// the sanitization happens in the /api/internal-chat/messages route mapping.
// So the internal-chat guarantee (and the end-to-end res.json() shape of the
// delivery endpoints) can only be verified over HTTP.

const BASE_URL = process.env.SANITIZE_TEST_BASE_URL ?? "http://127.0.0.1:5000";

async function serverIsUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/me`, { signal: AbortSignal.timeout(3000) });
    return res.status > 0;
  } catch {
    return false;
  }
}

/**
 * Seeds a real express-session row that impersonates the given member via an
 * approved platform admin. Returns a signed `gc.sid` cookie header value.
 *
 * Uses the admin-impersonation path in loadAuth (adminId + impersonatedMemberId)
 * rather than the retired member-session memberId field.
 */
async function seedSessionCookie(memberId: string): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  assert.ok(secret, "SESSION_SECRET must be set to seed a session");

  // Find an approved platform admin bootstrapped at startup.
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
    // Admin-impersonation path: loadAuth resolves adminId → approved admin,
    // then loads impersonatedMemberId as the effective AuthContext.
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
    .createHmac("sha256", secret!)
    .update(sid)
    .digest("base64")
    .replace(/=+$/, "");
  return `gc.sid=${encodeURIComponent(`s:${sid}.${signature}`)}`;
}

async function fetchJsonText(path: string, cookie: string): Promise<{ status: number; text: string }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { cookie },
    signal: AbortSignal.timeout(10000),
  });
  return { status: res.status, text: await res.text() };
}

function assertRawJsonClean(text: string, label: string) {
  for (const key of FORBIDDEN_KEYS) {
    assert.ok(
      !text.includes(`"${key}"`),
      `${label}: raw response contains forbidden key "${key}"`,
    );
  }
  assert.ok(!text.includes("LEAKCANARY"), `${label}: raw response contains a seeded credential value`);
}

describe("HTTP: live endpoints never expose member credentials", async () => {
  const up = await serverIsUp();

  test("supplier office endpoints (deliveries, driver-locations, internal chat)", { skip: !up && "dev server not running on port 5000" }, async () => {
    const cookie = await seedSessionCookie(adminMemberId);

    const deliveries = await fetchJsonText("/api/supplier/deliveries", cookie);
    assert.equal(deliveries.status, 200, `supplier/deliveries -> ${deliveries.status}: ${deliveries.text.slice(0, 200)}`);
    assert.ok(deliveries.text.includes(assignmentId), "seeded assignment missing in HTTP payload");
    assertRawJsonClean(deliveries.text, "GET /api/supplier/deliveries");

    const locations = await fetchJsonText("/api/supplier/driver-locations", cookie);
    assert.equal(locations.status, 200, `driver-locations -> ${locations.status}`);
    assert.ok(locations.text.includes(driverMemberId), "seeded driver location missing in HTTP payload");
    assertRawJsonClean(locations.text, "GET /api/supplier/driver-locations");

    const chat = await fetchJsonText(`/api/internal-chat/messages?with=${driverMemberId}`, cookie);
    assert.equal(chat.status, 200, `internal-chat/messages -> ${chat.status}`);
    assert.ok(chat.text.includes(`sanitization test message ${RUN}`), "seeded internal message missing in HTTP payload");
    assertRawJsonClean(chat.text, "GET /api/internal-chat/messages?with=");

    const threads = await fetchJsonText("/api/internal-chat/threads", cookie);
    assert.equal(threads.status, 200, `internal-chat/threads -> ${threads.status}`);
    assertRawJsonClean(threads.text, "GET /api/internal-chat/threads");
  });

  test("driver endpoints (tour + history)", { skip: !up && "dev server not running on port 5000" }, async () => {
    const cookie = await seedSessionCookie(driverMemberId);

    const tour = await fetchJsonText(`/api/driver/deliveries?date=${TODAY}`, cookie);
    assert.equal(tour.status, 200, `driver/deliveries -> ${tour.status}: ${tour.text.slice(0, 200)}`);
    assertRawJsonClean(tour.text, "GET /api/driver/deliveries");

    const history = await fetchJsonText("/api/driver/deliveries/history", cookie);
    assert.equal(history.status, 200, `driver/deliveries/history -> ${history.status}`);
    assert.ok(history.text.includes(assignmentId), "seeded delivered assignment missing in history payload");
    assertRawJsonClean(history.text, "GET /api/driver/deliveries/history");
  });

  test("team member list (GET /api/orgs/:id/members) strips all auth columns", { skip: !up && "dev server not running on port 5000" }, async () => {
    // Uses the toSafeMember allowlist in routes.ts. The seeded admin and driver
    // both carry LEAKCANARY credential values — any leak would surface here.
    const cookie = await seedSessionCookie(adminMemberId);

    const res = await fetchJsonText(`/api/orgs/${supplierId}/members`, cookie);
    assert.equal(res.status, 200, `GET /api/orgs/:id/members -> ${res.status}: ${res.text.slice(0, 200)}`);

    // Non-vacuous: both seeded members must appear in the response.
    assert.ok(res.text.includes(adminMemberId), "seeded admin member missing from team list");
    assert.ok(res.text.includes(driverMemberId), "seeded driver member missing from team list");

    // The auth columns and the sentinel value must never appear.
    assertRawJsonClean(res.text, "GET /api/orgs/:id/members");
  });

  test("driver roster (GET /api/supplier/drivers) strips all auth columns", { skip: !up && "dev server not running on port 5000" }, async () => {
    // /api/supplier/drivers previously only stripped passwordHash; emailVerifiedAt
    // and lastLoginAt were leaked. The fix adds them to the destructuring.
    const cookie = await seedSessionCookie(adminMemberId);

    const res = await fetchJsonText("/api/supplier/drivers", cookie);
    assert.equal(res.status, 200, `GET /api/supplier/drivers -> ${res.status}: ${res.text.slice(0, 200)}`);

    // Non-vacuous: the seeded driver must be in the list.
    assert.ok(res.text.includes(driverMemberId), "seeded driver missing from /api/supplier/drivers");

    // All three auth columns and the sentinel value must be absent.
    assertRawJsonClean(res.text, "GET /api/supplier/drivers");
  });
});
