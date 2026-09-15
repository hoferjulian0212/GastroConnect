/**
 * The commercial order and the operational delivery assignment intentionally
 * have separate lifecycles. This module is the single contract for transitions
 * and for the points where one lifecycle must advance the other.
 */
export const ORDER_LIFECYCLE_STATUSES = [
  "pending",
  "confirmed",
  "scheduled",
  "in_delivery",
  "delivered",
  "cancelled",
  "not_deliverable",
] as const;

export type OrderLifecycleStatus = typeof ORDER_LIFECYCLE_STATUSES[number];

export const DELIVERY_ASSIGNMENT_LIFECYCLE_STATUSES = [
  "assigned",
  "picked_up",
  "en_route",
  "arriving",
  "delivered",
  "problem",
  "rejected",
] as const;

export type DeliveryAssignmentLifecycleStatus =
  typeof DELIVERY_ASSIGNMENT_LIFECYCLE_STATUSES[number];

const ORDER_TRANSITIONS: Record<OrderLifecycleStatus, readonly OrderLifecycleStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["pending", "scheduled", "in_delivery", "cancelled"],
  scheduled: ["pending", "confirmed", "in_delivery", "cancelled"],
  in_delivery: ["scheduled", "delivered", "cancelled", "not_deliverable"],
  delivered: [],
  cancelled: ["pending"],
  not_deliverable: [],
};

const DRIVER_PROGRESS_RANK: Partial<Record<DeliveryAssignmentLifecycleStatus, number>> = {
  assigned: 0,
  picked_up: 1,
  en_route: 2,
  arriving: 3,
};

export class LifecycleTransitionError extends Error {
  constructor(
    public readonly lifecycle: "order" | "delivery",
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Invalid ${lifecycle} transition: ${from} → ${to}`);
    this.name = "LifecycleTransitionError";
  }
}

export function isOrderLifecycleStatus(status: string): status is OrderLifecycleStatus {
  return (ORDER_LIFECYCLE_STATUSES as readonly string[]).includes(status);
}

export function canTransitionOrderStatus(from: string, to: string): boolean {
  if (from === to) return isOrderLifecycleStatus(from);
  return isOrderLifecycleStatus(from) && isOrderLifecycleStatus(to)
    && ORDER_TRANSITIONS[from].includes(to);
}

export function assertOrderTransition(from: string, to: string): void {
  if (!canTransitionOrderStatus(from, to)) {
    throw new LifecycleTransitionError("order", from, to);
  }
}

/**
 * Driver UI advances one visible step at a time. The server accepts forward
 * recovery from a stale screen, but never a backward move or terminal branch.
 * `problem` and `rejected` are handled by their dedicated office/replan paths.
 */
export function canAdvanceDriverStatus(from: string, to: string): boolean {
  const currentRank = DRIVER_PROGRESS_RANK[from as DeliveryAssignmentLifecycleStatus];
  const nextRank = DRIVER_PROGRESS_RANK[to as DeliveryAssignmentLifecycleStatus];
  return currentRank !== undefined && nextRank !== undefined && nextRank > currentRank;
}

export function canCompleteDelivery(status: string): boolean {
  return status === "arriving";
}

/**
 * A stale driver screen may skip the visible departure step. The restaurant
 * must still receive that step before an arrival or completion update.
 */
export function isDriverRecoveryToArrival(from: string, to: string): boolean {
  return to === "arriving" && ["assigned", "picked_up"].includes(from);
}

/**
 * Cross-entity bridges. Callers retain their own authorization, stock,
 * notification and route effects, but may not contradict these relationships.
 */
export const DELIVERY_ORDER_BRIDGES = {
  assignment: "scheduled",
  departure: "in_delivery",
  delivery: "delivered",
  notDeliverable: "not_deliverable",
  unassignment: "confirmed",
} as const;