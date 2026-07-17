---
name: Order status driver flow
description: Rules for scheduled/in_delivery order statuses and who may set them
---
Rule: `in_delivery` (Unterwegs) is set ONLY by the driver flow (driver marks en_route); the generic `PATCH /api/orders/:id/status` route rejects it with 400 `in_delivery_via_driver_only`. `scheduled` (Geplant) = driver assigned; unassign → back to `confirmed`. Setting a delivery date must never change order status — use the `/reschedule` endpoint, which takes `dateChangeReason` (localized label composed from the `DATE_CHANGE_REASONS` dropdown, free text only for "other").

**Why:** Business rule from the user: "Unterwegs" must reflect the driver actually being on the road, not the supplier planning a date; a previous UI path silently flipped orders to in_delivery when picking a date.

**How to apply:** Any new supplier UI action that touches delivery dates must call reschedule, not the status route. Side effects of shipping start (delivery-status chat card, auto delivery note) live in the driver en_route transition, with a delivered-fallback in the status route.
