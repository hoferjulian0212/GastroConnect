---
name: Driver delivery status flow guards
description: Delivery assignment transitions are forward-only; reported problems require an office decision.
---

Delivery assignment statuses: assigned → picked_up → en_route → arriving →
delivered, plus a `problem` branch. Server enforces: `/status` accepts only
forward transitions (rank must increase; skipping ahead allowed, regression
400s). A problem is frozen until an authorized supplier manager explicitly
approves continuation or replans it; the driver may then resume at an active
step. `/complete` is blocked while still `assigned` (must be picked up first) and after
`delivered`. Going en_route moves the ORDER to in_delivery; delivered
outbounds stock.

**Why:** clients drive the flow sequentially, but unguarded endpoints let
crafted calls regress/skip states, bypass office review, or double-outbound
stock.

**How to apply:** any new driver-side status endpoint must check the current
assignment state first; demo/test scripts must follow the legal order (a
completed test delivery cannot be reassigned once the order is delivered).
