import assert from "node:assert/strict";
import test from "node:test";
import type { Promotion } from "@shared/schema";
import {
  getRescueAllocationTarget,
  getRescuePromotionState,
  wouldIntroduceRescuePromotion,
} from "./rescuePromotion";

function rescuePromotion(overrides: Partial<Promotion> = {}): Promotion {
  return {
    id: "promo-1",
    productId: "product-1",
    supplierId: "supplier-1",
    discountPercent: 25,
    startDate: new Date("2026-08-01T00:00:00.000Z"),
    endDate: new Date("2026-08-31T23:59:59.000Z"),
    isActive: true,
    name: "Rescue",
    description: null,
    groupId: null,
    targetRestaurantIds: null,
    promotionType: "rescue",
    sourceRiskId: "risk-1",
    quantityCap: 10,
    rescueQuality: "OK",
    rescueReservedQuantity: 2,
    rescueSoldQuantity: 3,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

test("Rescue state reports capacity without changing date-derived expiry", () => {
  const now = new Date("2026-08-25T12:00:00.000Z");
  assert.deepEqual(getRescuePromotionState(rescuePromotion(), now), {
    availableQuantity: 5,
    lifecycle: "active",
  });
  assert.deepEqual(
    getRescuePromotionState(
      rescuePromotion({
        endDate: new Date("2026-08-20T00:00:00.000Z"),
        rescueReservedQuantity: 0,
        rescueSoldQuantity: 0,
      }),
      now,
    ),
    { availableQuantity: 10, lifecycle: "expired" },
  );
});

test("Rescue state reports sold out from reserved plus sold quota", () => {
  assert.deepEqual(
    getRescuePromotionState(
      rescuePromotion({ rescueReservedQuantity: 6, rescueSoldQuantity: 4 }),
      new Date("2026-08-25T12:00:00.000Z"),
    ),
    { availableQuantity: 0, lifecycle: "sold_out" },
  );
});

test("confirmation consumes accepted Rescue units and releases the rest", () => {
  assert.deepEqual(
    getRescueAllocationTarget({
      status: "partially_confirmed",
      previousStatus: "pending",
      itemQuantity: 8,
      confirmedQuantity: 5,
      currentReserved: 8,
      currentSold: 0,
    }),
    { reserved: 0, sold: 5 },
  );
});

test("a later confirmed status keeps the persisted partial quantity", () => {
  assert.deepEqual(
    getRescueAllocationTarget({
      status: "confirmed",
      previousStatus: "partially_confirmed",
      itemQuantity: 8,
      confirmedQuantity: 5,
      currentReserved: 0,
      currentSold: 5,
    }),
    { reserved: 0, sold: 5 },
  );
});

test("cancellation releases quota before delivery but never after delivery", () => {
  assert.deepEqual(
    getRescueAllocationTarget({
      status: "cancelled",
      previousStatus: "confirmed",
      itemQuantity: 5,
      currentReserved: 0,
      currentSold: 5,
    }),
    { reserved: 0, sold: 0 },
  );
  assert.equal(
    getRescueAllocationTarget({
      status: "cancelled",
      previousStatus: "delivered",
      itemQuantity: 5,
      currentReserved: 0,
      currentSold: 5,
    }),
    null,
  );
});

test("pending edits detect a newly introduced Rescue product", () => {
  const promotionTypes = new Map([
    ["existing-product", "rescue"],
    ["new-rescue-product", "rescue"],
    ["new-generic-product", "generic"],
  ]);
  assert.equal(
    wouldIntroduceRescuePromotion(
      ["existing-product"],
      ["existing-product", "new-generic-product"],
      promotionTypes,
    ),
    false,
  );
  assert.equal(
    wouldIntroduceRescuePromotion(
      ["existing-product"],
      ["existing-product", "new-rescue-product"],
      promotionTypes,
    ),
    true,
  );
});