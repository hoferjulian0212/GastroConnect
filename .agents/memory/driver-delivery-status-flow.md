---
name: Driver delivery status flow guards
description: Delivery assignment status transitions are enforced server-side; forward-only with a problem branch.
---

Delivery assignment statuses: assigned → picked_up → en_route → arriving →
delivered, plus a `problem` branch. Server enforces: `/status` accepts only
forward transitions (rank must increase; skipping ahead allowed, regression
400s), from `problem` the driver may resume at any active step, `/complete`
is blocked while still `assigned` (must be picked up first) and after
`delivered`. Going en_route moves the ORDER to in_delivery; delivered
outbounds stock.

**Why:** clients drive the flow sequentially, but unguarded endpoints let
crafted calls regress/skip states and double-outbound stock.

**How to apply:** any new driver-side status endpoint must check the current
assignment state first; demo/test scripts must follow the legal order (a
completed test delivery cannot be reassigned once the order is delivered).
