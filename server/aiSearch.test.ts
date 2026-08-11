// Targeted regression tests for aiSearch tool helpers.
//
// Suite 1 — periodBounds: verifies that last_month carries an explicit upper
//   bound so current-month orders are never included in historical queries.
//
// Suite 2 — getEffectiveGuestCountsByDate: verifies that PMS/API-imported
//   guest counts override manual overnightStays entries for the same date,
//   matching the behaviour of /api/restaurant/cost-analysis.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { periodBounds, priorPeriodBounds } from "./aiSearch";
import { storage } from "./storage";
import { db } from "./db";
import { overnightStays, guestCountImports } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { pool } from "./db";

// ────────────────────────────────────────────────────────────────────────────
// Suite 1: periodBounds unit tests
// ────────────────────────────────────────────────────────────────────────────

describe("periodBounds — last_month must have an exclusive upper bound", () => {
  // Fixed reference point: 15 March 2026 noon UTC
  const now = new Date("2026-03-15T12:00:00Z");

  test("last_month fromDate is the first of February 2026", () => {
    const { fromDate } = periodBounds("last_month", now);
    assert.equal(fromDate.getFullYear(), 2026);
    assert.equal(fromDate.getMonth(), 1); // 0-indexed: 1 = February
    assert.equal(fromDate.getDate(), 1);
  });

  test("last_month toDate is the last instant of February 2026 (not null)", () => {
    const { toDate } = periodBounds("last_month", now);
    assert.ok(toDate !== null, "toDate must not be null for last_month");
    assert.equal(toDate!.getFullYear(), 2026);
    assert.equal(toDate!.getMonth(), 1); // February
    assert.equal(toDate!.getDate(), 28); // 2026 is not a leap year
    assert.equal(toDate!.getHours(), 23);
    assert.equal(toDate!.getMinutes(), 59);
    assert.equal(toDate!.getSeconds(), 59);
  });

  test("last_month toDate is strictly before the first of March 2026", () => {
    const { toDate } = periodBounds("last_month", now);
    const marchFirst = new Date("2026-03-01T00:00:00.000Z");
    // Compare as local dates: toDate must be before the 1st of the reference month.
    assert.ok(toDate !== null);
    assert.ok(
      toDate! < new Date(now.getFullYear(), now.getMonth(), 1),
      "toDate must be before the first day of the current month",
    );
  });

  test("this_month has no upper bound (toDate is null)", () => {
    const { toDate } = periodBounds("this_month", now);
    assert.equal(toDate, null);
  });

  test("30d has no upper bound (toDate is null)", () => {
    const { toDate } = periodBounds("30d", now);
    assert.equal(toDate, null);
  });

  test("90d has no upper bound (toDate is null)", () => {
    const { toDate } = periodBounds("90d", now);
    assert.equal(toDate, null);
  });

  test("last_month spanning a year boundary (January → December) is correct", () => {
    const janNow = new Date("2026-01-20T10:00:00Z");
    const { fromDate, toDate } = periodBounds("last_month", janNow);
    assert.equal(fromDate.getFullYear(), 2025);
    assert.equal(fromDate.getMonth(), 11); // December
    assert.equal(fromDate.getDate(), 1);
    assert.ok(toDate !== null);
    assert.equal(toDate!.getFullYear(), 2025);
    assert.equal(toDate!.getMonth(), 11); // December
    assert.equal(toDate!.getDate(), 31);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Suite 2: priorPeriodBounds unit tests
// ────────────────────────────────────────────────────────────────────────────

describe("priorPeriodBounds — comparison window aligns with the current period", () => {
  // Fixed reference point: 15 March 2026 noon UTC
  const now = new Date("2026-03-15T12:00:00Z");

  test("this_month prior is the previous calendar month (February 2026)", () => {
    const { fromDate, toDate } = priorPeriodBounds("this_month", now);
    assert.equal(fromDate.getFullYear(), 2026);
    assert.equal(fromDate.getMonth(), 1); // 0-indexed: 1 = February
    assert.equal(fromDate.getDate(), 1);
    assert.equal(toDate.getFullYear(), 2026);
    assert.equal(toDate.getMonth(), 1); // February
    assert.equal(toDate.getDate(), 28); // 2026 is not a leap year
    assert.equal(toDate.getHours(), 23);
    assert.equal(toDate.getMinutes(), 59);
  });

  test("last_month prior is two calendar months ago (January 2026)", () => {
    const { fromDate, toDate } = priorPeriodBounds("last_month", now);
    assert.equal(fromDate.getFullYear(), 2026);
    assert.equal(fromDate.getMonth(), 0); // January
    assert.equal(fromDate.getDate(), 1);
    assert.equal(toDate.getFullYear(), 2026);
    assert.equal(toDate.getMonth(), 0); // January
    assert.equal(toDate.getDate(), 31);
  });

  test("30d prior window runs from 60 days to 30 days before now", () => {
    const { fromDate, toDate } = priorPeriodBounds("30d", now);
    const expectedFrom = new Date(now.getTime() - 60 * 86400000);
    const expectedTo = new Date(now.getTime() - 30 * 86400000);
    assert.equal(fromDate.toISOString().slice(0, 10), expectedFrom.toISOString().slice(0, 10));
    assert.equal(toDate.toISOString().slice(0, 10), expectedTo.toISOString().slice(0, 10));
  });

  test("90d prior window runs from 180 days to 90 days before now", () => {
    const { fromDate, toDate } = priorPeriodBounds("90d", now);
    const expectedFrom = new Date(now.getTime() - 180 * 86400000);
    const expectedTo = new Date(now.getTime() - 90 * 86400000);
    assert.equal(fromDate.toISOString().slice(0, 10), expectedFrom.toISOString().slice(0, 10));
    assert.equal(toDate.toISOString().slice(0, 10), expectedTo.toISOString().slice(0, 10));
  });

  test("prior window never overlaps the current window (30d)", () => {
    const { toDate: priorTo } = priorPeriodBounds("30d", now);
    // The current 30d window starts exactly 30 days before `now`.
    const currentFrom = new Date(now.getTime() - 30 * 86400000);
    assert.ok(priorTo <= currentFrom, "prior toDate must not exceed current fromDate");
  });

  test("this_month prior spanning a year boundary (January → December) is correct", () => {
    const janNow = new Date("2026-01-15T10:00:00Z");
    const { fromDate, toDate } = priorPeriodBounds("this_month", janNow);
    assert.equal(fromDate.getFullYear(), 2025);
    assert.equal(fromDate.getMonth(), 11); // December
    assert.equal(fromDate.getDate(), 1);
    assert.equal(toDate.getFullYear(), 2025);
    assert.equal(toDate.getMonth(), 11); // December
    assert.equal(toDate.getDate(), 31);
  });

  test("last_month prior spanning a year boundary (January → November) is correct", () => {
    const janNow = new Date("2026-01-20T10:00:00Z");
    const { fromDate, toDate } = priorPeriodBounds("last_month", janNow);
    // last_month = December 2025, so prior = November 2025
    assert.equal(fromDate.getFullYear(), 2025);
    assert.equal(fromDate.getMonth(), 10); // November
    assert.equal(fromDate.getDate(), 1);
    assert.equal(toDate.getFullYear(), 2025);
    assert.equal(toDate.getMonth(), 10); // November
    assert.equal(toDate.getDate(), 30);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Suite 3: getEffectiveGuestCountsByDate — PMS overrides manual entries
// ────────────────────────────────────────────────────────────────────────────

describe("getEffectiveGuestCountsByDate — PMS imports override manual overnightStays", () => {
  let restaurantId: string;
  const testDate = "2026-01-10";
  const manualCount = 40;
  const pmsCount = 75; // deliberately different to detect which source wins

  before(async () => {
    const restaurants = await storage.getUsersByRole("restaurant");
    assert.ok(restaurants.length > 0, "seeded restaurant org required");
    restaurantId = restaurants[0].id;

    // Clean up any pre-existing test fixtures for our test date.
    await db.delete(overnightStays).where(
      and(eq(overnightStays.restaurantId, restaurantId), eq(overnightStays.date, testDate)),
    );
    await db.delete(guestCountImports).where(
      and(eq(guestCountImports.restaurantId, restaurantId), eq(guestCountImports.date, testDate)),
    );

    // Insert a manual overnight-stay entry.
    await db.insert(overnightStays).values({
      restaurantId,
      date: testDate,
      overnightStays: manualCount,
    });
  });

  after(async () => {
    await db.delete(overnightStays).where(
      and(eq(overnightStays.restaurantId, restaurantId), eq(overnightStays.date, testDate)),
    );
    await db.delete(guestCountImports).where(
      and(eq(guestCountImports.restaurantId, restaurantId), eq(guestCountImports.date, testDate)),
    );
    await pool.end();
  });

  test("without a PMS import, the manual count is returned", async () => {
    const map = await storage.getEffectiveGuestCountsByDate(restaurantId);
    assert.equal(
      map.get(testDate),
      manualCount,
      "manual overnight-stay count must be used when no PMS import exists",
    );
  });

  test("a PMS import for the same date overrides the manual count", async () => {
    // Insert the PMS-imported count — same date, different (higher) number.
    await db.insert(guestCountImports).values({
      restaurantId,
      date: testDate,
      guestCount: pmsCount,
      source: "pms",
    });

    const map = await storage.getEffectiveGuestCountsByDate(restaurantId);
    assert.equal(
      map.get(testDate),
      pmsCount,
      "PMS-imported count must override the manual overnightStay entry for the same date",
    );
    assert.notEqual(
      map.get(testDate),
      manualCount,
      "manual count must NOT be returned when a PMS import exists for that date",
    );
  });
});
