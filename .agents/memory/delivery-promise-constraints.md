---
name: Delivery promise constraints
description: The authoritative delivery-date eligibility policy and how it applies across order and driver flows.
---

Any explicit delivery promise must be checked server-side against the receiving restaurant's IANA timezone, calendar-valid date, supplier postal-prefix zones, committed delivery window, restaurant opening window, and date exception. This applies when checkout, confirming/changing/rescheduling, assigning a driver, confirming/starting a route, and optimizing stops.

**Why:** Browser weekday calculations, free-text time windows, and raw addresses cannot establish that a delivery is actually serviceable. A server-owned common validator keeps every delivery flow consistent while preserving the existing distance-based route planner.

**How to apply:** Treat ASAP as an unpromised option. Expose optional dates only from server-generated candidates. For supplier dispatch, candidate access must be bound to an order owned by the supplier; never accept a client-supplied restaurant identity. Invalid stops stay out of route optimization and route confirmation/start must refuse an invalid open stop.