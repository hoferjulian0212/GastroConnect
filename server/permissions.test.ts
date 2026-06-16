import { test } from "node:test";
import assert from "node:assert/strict";
import { can, MEMBER_ROLE_VALUES } from "../shared/permissions";

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
