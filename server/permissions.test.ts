import { test } from "node:test";
import assert from "node:assert/strict";
import { can, MEMBER_ROLE_VALUES, isWarehousePathAllowed } from "../shared/permissions";

test("admin can do everything", () => {
  for (const cap of [
    "team.view",
    "team.manage",
    "org.edit",
    "orders.create",
    "orders.manage",
    "products.manage",
    "vertreter.assign",
    "chat",
  ] as const) {
    assert.equal(can("admin", cap), true, `admin should have ${cap}`);
  }
});

test("manager can manage orders/products but not the team or org", () => {
  assert.equal(can("manager", "orders.manage"), true);
  assert.equal(can("manager", "products.manage"), true);
  assert.equal(can("manager", "orders.create"), true);
  assert.equal(can("manager", "chat"), true);
  assert.equal(can("manager", "team.manage"), false);
  assert.equal(can("manager", "org.edit"), false);
  assert.equal(can("manager", "vertreter.assign"), false);
});

test("staff can only create orders / chat / view team", () => {
  assert.equal(can("staff", "orders.create"), true);
  assert.equal(can("staff", "chat"), true);
  assert.equal(can("staff", "team.view"), true);
  assert.equal(can("staff", "orders.manage"), false);
  assert.equal(can("staff", "products.manage"), false);
  assert.equal(can("staff", "team.manage"), false);
});

test("vertreter can manage orders and chat but not catalog/products", () => {
  assert.equal(can("vertreter", "orders.manage"), true);
  assert.equal(can("vertreter", "chat"), true);
  assert.equal(can("vertreter", "products.manage"), false);
  assert.equal(can("vertreter", "orders.create"), false);
});

test("null / unknown role has no capabilities", () => {
  assert.equal(can(null, "chat"), false);
  assert.equal(can(undefined, "orders.create"), false);
  // @ts-expect-error intentionally invalid role
  assert.equal(can("ghost", "chat"), false);
});

test("no role grants products.manage except admin and manager", () => {
  const allowed = MEMBER_ROLE_VALUES.filter((r) => can(r, "products.manage"));
  assert.deepEqual(allowed.sort(), ["admin", "manager"]);
});

test("sustainability capabilities follow the approved preset roles", () => {
  assert.deepEqual(
    MEMBER_ROLE_VALUES.filter((r) => can(r, "sustainability.view")).sort(),
    ["admin", "manager"],
  );
  assert.deepEqual(
    MEMBER_ROLE_VALUES.filter((r) => can(r, "sustainability.manage")).sort(),
    ["admin", "manager"],
  );
});

test("no role grants team.manage / org.edit except admin", () => {
  assert.deepEqual(
    MEMBER_ROLE_VALUES.filter((r) => can(r, "team.manage")),
    ["admin"],
  );
  assert.deepEqual(
    MEMBER_ROLE_VALUES.filter((r) => can(r, "org.edit")),
    ["admin"],
  );
});

test("warehouse can flag at-risk stock but cannot manage risks or products", () => {
  assert.equal(can("warehouse", "inventory_risk.create"), true);
  assert.equal(can("warehouse", "team.view"), true);
  assert.equal(can("warehouse", "inventory_risk.manage"), false);
  assert.equal(can("warehouse", "promotions.manage"), false);
  assert.equal(can("warehouse", "products.manage"), false);
  assert.equal(can("warehouse", "orders.create"), false);
});

test("inventory_risk.create is granted to admin, manager, vertreter, warehouse", () => {
  assert.deepEqual(
    MEMBER_ROLE_VALUES.filter((r) => can(r, "inventory_risk.create")).sort(),
    ["admin", "manager", "vertreter", "warehouse"],
  );
});

test("inventory_risk.manage (turn risk into promotion) excludes warehouse and staff", () => {
  assert.deepEqual(
    MEMBER_ROLE_VALUES.filter((r) => can(r, "inventory_risk.manage")).sort(),
    ["admin", "manager", "vertreter"],
  );
});

test("promotions.manage is granted to admin, manager, vertreter", () => {
  assert.deepEqual(
    MEMBER_ROLE_VALUES.filter((r) => can(r, "promotions.manage")).sort(),
    ["admin", "manager", "vertreter"],
  );
});

// ── Warehouse API allow-list (server-side hard limit) ────────────────────────

test("warehouse may reach its app-shell + stock + inventory-risk endpoints", () => {
  const allowed: [string, string][] = [
    // session / auth
    ["GET", "/api/auth/me"],
    ["POST", "/api/auth/login"],
    ["POST", "/api/auth/logout"],
    // own account / profile / settings
    ["GET", "/api/users"],
    ["GET", "/api/users/abc"],
    ["PATCH", "/api/users/abc"],
    ["GET", "/api/users/abc/notification-prefs"],
    ["PATCH", "/api/users/abc/notification-prefs"],
    ["GET", "/api/users/abc/dashboard"],
    ["POST", "/api/uploads/request-url"],
    // team view
    ["GET", "/api/orgs"],
    ["GET", "/api/orgs/abc/members"],
    ["GET", "/api/members/abc"],
    // presence / notifications / push
    ["POST", "/api/heartbeat"],
    ["GET", "/api/notifications"],
    ["GET", "/api/notifications/count"],
    ["PATCH", "/api/notifications/abc/read"],
    ["GET", "/api/push/vapid-key"],
    ["POST", "/api/push/subscribe"],
    // stock list (read-only products)
    ["GET", "/api/supplier/products"],
    // inventory-risk flagging
    ["GET", "/api/inventory-risks"],
    ["GET", "/api/inventory-risks/open-count"],
    ["POST", "/api/inventory-risks"],
    ["PATCH", "/api/inventory-risks/abc"],
    // best-effort error reporting
    ["POST", "/api/client-errors"],
  ];
  for (const [method, path] of allowed) {
    assert.equal(
      isWarehousePathAllowed(method, path),
      true,
      `warehouse should be allowed: ${method} ${path}`,
    );
  }
});

test("warehouse is denied all supplier business data endpoints", () => {
  const denied: [string, string][] = [
    // orders & order data
    ["GET", "/api/orders"],
    ["GET", "/api/orders/history"],
    ["GET", "/api/orders/pending-count"],
    ["GET", "/api/orders/abc"],
    ["POST", "/api/orders"],
    ["GET", "/api/orders/export"],
    // pricing / MOQ / MOV
    ["GET", "/api/custom-prices"],
    ["GET", "/api/custom-min-order-quantities"],
    ["GET", "/api/minimum-order-values"],
    // catalog management & global products
    ["GET", "/api/products"],
    ["POST", "/api/supplier/products"],
    ["PATCH", "/api/supplier/products/abc"],
    ["DELETE", "/api/supplier/products/abc"],
    ["GET", "/api/supplier/products/csv-export"],
    ["POST", "/api/supplier/price-list/parse"],
    ["POST", "/api/supplier/price-list/import"],
    // documents / stats / customers / complaints / chat
    ["GET", "/api/documents"],
    ["GET", "/api/supplier/stats"],
    ["GET", "/api/supplier/customers"],
    ["GET", "/api/complaints"],
    ["GET", "/api/conversations"],
    ["GET", "/api/conversations/unread"],
    ["GET", "/api/messages/abc"],
    // delivery schedules / stock movements / promotions / search / suppliers
    ["GET", "/api/delivery-schedules"],
    ["GET", "/api/stock-movements"],
    ["GET", "/api/promotions"],
    ["POST", "/api/search/ai"],
    ["GET", "/api/ai/chats"],
    ["POST", "/api/ai/chat"],
    ["GET", "/api/suppliers"],
    // inventory-risk "turn into promotion" is allow-listed at the path level but
    // remains capability-gated (inventory_risk.manage) inside the route, so the
    // path guard intentionally lets it through here.
  ];
  for (const [method, path] of denied) {
    assert.equal(
      isWarehousePathAllowed(method, path),
      false,
      `warehouse should be denied: ${method} ${path}`,
    );
  }
});

test("warehouse stock route is read-only (no writes to /api/supplier/products)", () => {
  assert.equal(isWarehousePathAllowed("GET", "/api/supplier/products"), true);
  for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
    assert.equal(
      isWarehousePathAllowed(method, "/api/supplier/products"),
      false,
      `warehouse must not ${method} /api/supplier/products`,
    );
  }
});

test("warehouse uploads are limited to POST presign requests", () => {
  assert.equal(isWarehousePathAllowed("POST", "/api/uploads/request-url"), true);
  assert.equal(isWarehousePathAllowed("GET", "/api/uploads/request-url"), false);
});
