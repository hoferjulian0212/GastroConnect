---
name: Order status driver flow
description: Rules for scheduled/in_delivery order statuses and who may set them
---
Rule: Commercial order state and driver-assignment state are separate, centrally validated lifecycles. `in_delivery` (Unterwegs) is set only by the driver flow—normal en-route progression, or the recovery bridge immediately before an arriving stop completes; the generic `PATCH /api/orders/:id/status` route rejects it. `scheduled` (Geplant) = driver assigned; unassign → back to `confirmed`. Completion may mark an assignment delivered only while the linked order is locked and already delivered. Setting a delivery date must never change order status — use the `/reschedule` endpoint, which takes `dateChangeReason` (localized label composed from the `DATE_CHANGE_REASONS` dropdown, free text only for "other").

**Why:** "Unterwegs" must reflect the driver actually being on the road, not the supplier planning a date. Separate state machines prevent commercial status changes from moving driver stops; locking the terminal bridge prevents cancellation/completion races from leaving contradictory delivery records.

**How to apply:** Any new supplier UI action that touches delivery dates must call reschedule, not the status route. New state-changing routes must use the shared lifecycle policy, keep role authorization at the route, and preserve the order/assignment bridge atomically for terminal delivery outcomes.
