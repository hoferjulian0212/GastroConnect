import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, pool } from "./db";
import { validateDeliveryPromise, dateInZone } from "./deliveryConstraints";
import { storage } from "./storage";
import {
  deliverySchedules,
  restaurantAvailability,
  restaurantAvailabilityExceptions,
  supplierDeliveryZones,
  users,
} from "../shared/schema";

const RUN = crypto.randomUUID().slice(0, 8);
const DATE = "2099-06-15";
const DAY = new Date(`${DATE}T12:00:00.000Z`).getUTCDay();
let supplierId = "";
let restaurantId = "";

before(async () => {
  await storage.runDeliveryConstraintsMigration();
  const [supplier] = await db.insert(users).values({
    role: "supplier", name: `Constraint Supplier ${RUN}`, email: `constraint-supplier-${RUN}@test.invalid`, verifiedAt: new Date(),
  }).returning();
  supplierId = supplier.id;
  const [restaurant] = await db.insert(users).values({
    role: "restaurant", name: `Constraint Restaurant ${RUN}`, email: `constraint-restaurant-${RUN}@test.invalid`,
    postalCode: "39100", timeZone: "Europe/Rome", verifiedAt: new Date(),
  }).returning();
  restaurantId = restaurant.id;
  await db.insert(restaurantAvailability).values({ restaurantId, dayOfWeek: DAY, opensAt: "08:00", closesAt: "18:00" });
  await db.insert(deliverySchedules).values({
    supplierId, restaurantId, dayOfWeek: DAY, deliveryTimeFrom: "09:00", deliveryTimeTo: "12:00",
  });
});

after(async () => {
  await db.delete(restaurantAvailabilityExceptions).where(eq(restaurantAvailabilityExceptions.restaurantId, restaurantId));
  await db.delete(restaurantAvailability).where(eq(restaurantAvailability.restaurantId, restaurantId));
  await db.delete(deliverySchedules).where(and(eq(deliverySchedules.supplierId, supplierId), eq(deliverySchedules.restaurantId, restaurantId)));
  await db.delete(supplierDeliveryZones).where(eq(supplierDeliveryZones.supplierId, supplierId));
  await db.delete(users).where(eq(users.id, restaurantId));
  await db.delete(users).where(eq(users.id, supplierId));
  await pool.end();
});

describe("delivery promise constraints", () => {
  test("uses the restaurant time zone at a date boundary", () => {
    assert.equal(dateInZone(new Date("2030-01-01T00:30:00.000Z"), "America/Los_Angeles"), "2029-12-31");
  });

  test("accepts an overlapping committed opening window", async () => {
    const result = await validateDeliveryPromise(supplierId, restaurantId, DATE);
    assert.deepEqual(result, {
      valid: true,
      timeZone: "Europe/Rome",
      timeWindow: { from: "09:00", to: "12:00" },
    });
  });

  test("keeps a committed date usable when opening hours are not configured yet", async () => {
    await db.delete(restaurantAvailability).where(eq(restaurantAvailability.restaurantId, restaurantId));
    const result = await validateDeliveryPromise(supplierId, restaurantId, DATE);
    assert.deepEqual(result, {
      valid: true,
      timeZone: "Europe/Rome",
      timeWindow: { from: "09:00", to: "12:00" },
    });
    await db.insert(restaurantAvailability).values({ restaurantId, dayOfWeek: DAY, opensAt: "08:00", closesAt: "18:00" });
  });

  test("rejects a holiday closure and an excluded delivery zone", async () => {
    await db.insert(restaurantAvailabilityExceptions).values({ restaurantId, date: DATE, isClosed: true, note: "Holiday" });
    const closed = await validateDeliveryPromise(supplierId, restaurantId, DATE);
    assert.equal(closed.code, "restaurant_closed");
    await db.delete(restaurantAvailabilityExceptions).where(and(
      eq(restaurantAvailabilityExceptions.restaurantId, restaurantId),
      eq(restaurantAvailabilityExceptions.date, DATE),
    ));

    await db.insert(supplierDeliveryZones).values({ supplierId, postalCodePrefix: "999" });
    const outsideZone = await validateDeliveryPromise(supplierId, restaurantId, DATE);
    assert.equal(outsideZone.code, "outside_zone");
    await db.delete(supplierDeliveryZones).where(eq(supplierDeliveryZones.supplierId, supplierId));
  });

  test("rejects a supplier window that does not fit opening hours", async () => {
    await db.update(restaurantAvailability).set({ opensAt: "10:00", closesAt: "11:00" }).where(and(
      eq(restaurantAvailability.restaurantId, restaurantId),
      eq(restaurantAvailability.dayOfWeek, DAY),
    ));
    const result = await validateDeliveryPromise(supplierId, restaurantId, DATE);
    assert.equal(result.code, "window_mismatch");
    await db.update(restaurantAvailability).set({ opensAt: "08:00", closesAt: "18:00" }).where(and(
      eq(restaurantAvailability.restaurantId, restaurantId),
      eq(restaurantAvailability.dayOfWeek, DAY),
    ));
  });
});