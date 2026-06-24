import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WAREHOUSE_ALLOWED_PATHS,
  isWarehouseAllowedPath,
  isWarehouseRole,
} from "../shared/permissions";

// These tests pin the warehouse routing restriction. WarehouseRouter in
// client/src/App.tsx is built directly from WAREHOUSE_ALLOWED_PATHS: every
// listed path renders its focused page, and anything NOT listed falls through to
// a <Redirect to="/supplier" />. So "isWarehouseAllowedPath(path) === false" is a
// faithful unit-level proxy for "a warehouse member is redirected to /supplier".

const FOCUSED_PAGES = [
  "/supplier",
  "/supplier/inventory-risk",
  "/supplier/inventory",
  "/supplier/settings",
  "/supplier/profile",
  "/supplier/team",
  "/supplier/help",
];

// Full supplier routes a warehouse member must NOT reach directly.
const DISALLOWED_SUPPLIER_ROUTES = [
  "/supplier/orders",
  "/supplier/products",
  "/supplier/inbox",
  "/supplier/complaints",
  "/supplier/promotions",
  "/supplier/restaurants",
  "/supplier/calendar",
  "/supplier/documents",
];

test("warehouse allow-list contains exactly the focused pages", () => {
  assert.deepEqual([...WAREHOUSE_ALLOWED_PATHS].sort(), [...FOCUSED_PAGES].sort());
});

test("focused pages are allowed for warehouse members", () => {
  for (const path of FOCUSED_PAGES) {
    assert.equal(isWarehouseAllowedPath(path), true, `${path} should be allowed`);
  }
});

test("disallowed supplier routes redirect warehouse members to /supplier", () => {
  for (const path of DISALLOWED_SUPPLIER_ROUTES) {
    assert.equal(
      isWarehouseAllowedPath(path),
      false,
      `${path} should NOT be allowed (warehouse user must be redirected to /supplier)`,
    );
  }
});

test("deep-linked / bookmarked URLs with query or hash still match the allow-list", () => {
  assert.equal(isWarehouseAllowedPath("/supplier/inventory?search=tomato"), true);
  assert.equal(isWarehouseAllowedPath("/supplier/inventory-risk#open"), true);
  // A disallowed route stays disallowed even with a query string.
  assert.equal(isWarehouseAllowedPath("/supplier/orders?status=open"), false);
});

test("unknown / nested paths are not allowed", () => {
  assert.equal(isWarehouseAllowedPath("/supplier/inventory/extra"), false);
  assert.equal(isWarehouseAllowedPath("/restaurant"), false);
  assert.equal(isWarehouseAllowedPath("/random"), false);
});

test("isWarehouseRole derives the flag from the member role", () => {
  assert.equal(isWarehouseRole("warehouse"), true);
  for (const role of ["admin", "manager", "staff", "vertreter"] as const) {
    assert.equal(isWarehouseRole(role), false, `${role} is not warehouse`);
  }
  assert.equal(isWarehouseRole(null), false);
  assert.equal(isWarehouseRole(undefined), false);
});
