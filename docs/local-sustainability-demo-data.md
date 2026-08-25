# Local Sustainability demo-data policy

## Purpose

`npm run seed:sustainability-demo` is a targeted development seed that makes
the existing Local Impact interfaces demonstrable without resetting the
database. It updates only a named subset of the Frische Produkte GmbH demo
catalog, creates four idempotently tagged current-period orders through the
normal order storage workflow, and regenerates the current month report.

## Provenance and safety

- Seeded records use the canonical sustainability columns only.
- Every seeded record is marked by a `GastroConnect demo/test sustainability
  dataset v1` evidence note and source `admin`. The note explicitly says it is
  curated development data, not a supplier claim.
- The seed refuses to overwrite existing non-demo sustainability metadata.
- It never deletes users, products, suppliers, orders, or historical reports.
- It is development-only and can safely be rerun. Existing tagged products and
  orders are retained rather than duplicated.

## Historical-order policy

Historical order items retain `local_impact_snapshot = null`. They predate the
snapshot contract and must not be retrospectively scored from mutable product
metadata. Unknown remains unavailable.

Only new orders created after metadata is present receive an immutable
order-time snapshot through `storage.createOrder()`. Monthly reports aggregate
those snapshots, not today’s product metadata.

## Scenarios

The fixtures include South Tyrol verified-local, regional Northern Italy,
non-local import, in-season/out-of-season, returnable/recyclable/compostable,
mixed, and single-use packaging conditions. This gives the existing score,
catalog filters, cart summary, dashboard, and report calculations meaningful
positive, mixed, and low-impact inputs without treating unknowns as zero.