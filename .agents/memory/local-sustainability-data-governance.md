---
name: Local sustainability data governance
description: Durable evidence, ownership, and sequencing rules for Local, impact, Rescue, routing, and packaging features.
---

Local, sustainability, and impact claims must come from one shared, versioned calculation layer over existing operational sources. Every result carries provenance, period/snapshot, coverage, calculation version, missing inputs, and `verified | estimated | unknown`; unknown is never converted to zero, and an aggregate score stays hidden below the agreed coverage threshold.

**Why:** The current app has strong product, order, risk, route, and report foundations but lacks reliable product origin, season, packaging, vehicle/emission, physical-load, waste, and return-custody data. Independent UI calculations would create contradictory or invented claims.

**How to apply:** Extend existing products, orders, risk records, promotions, routes, dashboards, and reports rather than creating parallel systems. Supplier headquarters is not product origin; risk quantity is not authoritative stock; route distance/ETA is an estimate, not actual travel. Require restaurant availability and supplier delivery-zone compatibility before consolidation. Record returnable-packaging custody separately from delivery/POD. Use the same calculation DTO for catalog, cart, dashboards, reports, AI, and approved marketing.