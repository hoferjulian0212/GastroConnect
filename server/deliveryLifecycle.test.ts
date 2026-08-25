import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DELIVERY_ORDER_BRIDGES,
  LifecycleTransitionError,
  assertOrderTransition,
  canAdvanceDriverStatus,
  canCompleteDelivery,
  canTransitionOrderStatus,
  isDriverRecoveryToArrival,
} from "@shared/deliveryLifecycle";

describe("cross-role delivery lifecycle policy", () => {
  test("allows the commercial hand-offs between order processing and delivery", () => {
    assert.equal(canTransitionOrderStatus("pending", "confirmed"), true);
    assert.equal(canTransitionOrderStatus("confirmed", DELIVERY_ORDER_BRIDGES.assignment), true);
    assert.equal(canTransitionOrderStatus("scheduled", DELIVERY_ORDER_BRIDGES.departure), true);
    assert.equal(canTransitionOrderStatus("in_delivery", DELIVERY_ORDER_BRIDGES.delivery), true);
    assert.equal(canTransitionOrderStatus("in_delivery", DELIVERY_ORDER_BRIDGES.officeReview), true);
  });

  test("rejects backwards and terminal commercial transitions", () => {
    assert.equal(canTransitionOrderStatus("delivered", "scheduled"), false);
    assert.equal(canTransitionOrderStatus("cancelled", "scheduled"), false);
    assert.throws(
      () => assertOrderTransition("delivered", "scheduled"),
      LifecycleTransitionError,
    );
  });

  test("keeps driver progress forward-only and completion arrival-only", () => {
    assert.equal(canAdvanceDriverStatus("assigned", "picked_up"), true);
    assert.equal(canAdvanceDriverStatus("picked_up", "arriving"), true);
    assert.equal(canAdvanceDriverStatus("arriving", "en_route"), false);
    assert.equal(canAdvanceDriverStatus("problem", "en_route"), false);
    assert.equal(canCompleteDelivery("arriving"), true);
    assert.equal(canCompleteDelivery("en_route"), false);
  });

  test("identifies only skipped departure steps as recovery", () => {
    assert.equal(isDriverRecoveryToArrival("assigned", "arriving"), true);
    assert.equal(isDriverRecoveryToArrival("picked_up", "arriving"), true);
    assert.equal(isDriverRecoveryToArrival("en_route", "arriving"), false);
    assert.equal(isDriverRecoveryToArrival("assigned", "en_route"), false);
  });
});