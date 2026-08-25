---
name: Local sustainability data governance
description: Durable evidence, ownership, and sequencing rules for Local, impact, Rescue, routing, and packaging features.
---

Local, sustainability, and impact claims must come from one shared, versioned calculation layer over existing operational sources. Every result carries provenance, period/snapshot, coverage, calculation version, missing inputs, and `verified | estimated | unknown`; unknown is never converted to zero, and an aggregate score stays hidden below the agreed coverage threshold.

**Why:** The current app has strong product, order, risk, route, and report foundations but lacks reliable product origin, season, packaging, vehicle/emission, physical-load, waste, and return-custody data. Independent UI calculations would create contradictory or invented claims.

**How to apply:** Extend existing products, orders, risk records, promotions, routes, dashboards, and reports rather than creating parallel systems. Supplier headquarters is not product origin; risk quantity is not authoritative stock; route distance/ETA is an estimate, not actual travel. Require restaurant availability and supplier delivery-zone compatibility before consolidation. Record returnable-packaging custody separately from delivery/POD. Use the same calculation DTO for catalog, cart, dashboards, reports, AI, and approved marketing.

The first Product Local methodology is fixed as `local-product-v1.0.0`: verified Local means explicit product origin `IT` with a 39000–39999 postal code. South Tyrol region-name aliases without a postal code are estimated only. Origin, current season, and packaging carry weights 0.5/0.3/0.2; a score requires at least 0.8 coverage plus fresh evidence, while a Local badge requires verified-local origin and fresh evidence. Evidence expires after 365 days, and commercial-only product edits must never refresh its verification timestamp.

**Why:** This prevents supplier headquarters, a loose region label, stale paperwork, or an unrelated price edit from laundering an unverified product into a visible Local claim.

**How to apply:** New calculation versions may change these definitions, but historical outputs keep their version. Admin/Manager product owners maintain the optional metadata; null remains unknown. Any future catalog/report UI consumes the server calculation rather than recomputing eligibility. Historical order and report impact must aggregate immutable order-time snapshots; never recalculate history from mutable product metadata or today's season.