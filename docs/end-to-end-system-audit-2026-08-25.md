# GastroConnect end-to-end system audit

**Audit date:** 2026-08-25  
**Method:** Compared the supplied end-to-end audit against the current routes,
data model, permissions, UI, migrations, and automated tests. Findings marked
as missing or partial are not treated as defects without implementation evidence.

## A. Verified findings

### Critical — fixed

- **Platform GMV used an inconsistent valid-order definition.** The admin
  overview, time series, organization rollups, and top-organization reports
  counted `scheduled` orders, while the documented/report-tested definition did
  not. Platform reporting now uses the same valid set everywhere:
  `confirmed`, `partially_confirmed`, `in_delivery`, and `delivered`.

### High

- **Driver delivery details had a recovery dead end.** A failed or missing
  delivery request was rendered as a permanent loading skeleton. This is fixed:
  the page now distinguishes loading, retryable load failure, and unavailable
  delivery.
- **Failed-delivery resolution is only partial.** Drivers can report a problem,
  reject, or delay a stop. There is no verified end-to-end resolution path for
  partial, damaged, missing, unavailable-customer, and reusable-packaging
  outcomes through supplier review, restaurant visibility, and order history.
- **Delivery constraints are incomplete.** The application supports requested
  dates and recurring schedules, but does not have an authoritative,
  timezone-aware restaurant availability / exception / delivery-zone model.
  Route optimization is distance-based and cannot prove compliance with all
  restaurant, supplier, or driver constraints.
- **Order and driver delivery status are coordinated but separate.** Guards and
  lifecycle tests prevent common impossible transitions, but order status and
  assignment status remain two state vocabularies without a single published
  transition contract.

### Medium

- **Local impact is a real product-data foundation, not a complete logistics
  intelligence system.** Product provenance, evidence freshness, current-season
  and packaging scoring, guarded supplier editing, compact catalog/cart signals,
  order snapshots, and monthly reporting are present. CO₂, delivery
  consolidation, route fill, vehicle factors, package-return custody, and
  authoritative availability/zones are not implemented and must not be implied.
- **Current and historical impact views need clearer context.** Cart impact is
  calculated from current product metadata, while reports use immutable
  order-time snapshots. Both are valid, but the UI does not clearly communicate
  that distinction everywhere, and order detail has no impact context.
- **Local provenance is simplified in aggregate DTOs.** ERP/admin source data is
  collapsed to a generic system source in impact aggregation, which loses detail
  needed for future explainability.
- **Query recovery is uneven outside the repaired driver detail screen.** Many
  screens expose loading states but not a clear retry/error state. Generic
  driver action errors also do not consistently give a recovery next step.
- **History typing is looser than current order typing.** Current order status is
  an enum, while historical `from`/`to` values are text. This is a data-quality
  risk rather than proof of corrupt records.

### Low / verify before changing

- Separate mobile and desktop implementations create regression risk, but were
  not proven broken and should not be deleted without visual/behavioral review.
- Manual and full cost-analysis views are parallel workflows, not proven dead
  code. Confirm their intended user distinction before consolidation.
- Route ETA/distance is stored on assignments and calculated from routing
  endpoints. No contradictory values were verified, but a future source-of-
  truth contract and regression test would reduce drift risk.

## B. Fixes implemented

1. Centralized the platform-admin GMV status definition and applied it across
   overview, organization, time-series, top-partner, and organization-detail
   reporting.
2. Repaired driver delivery-detail recovery states:
   - loading skeleton only while loading;
   - retryable error card on request failure;
   - clear unavailable-delivery state with a return action.
3. Earlier Local/Rescue verification remains in place:
   - Local claims use product metadata, coverage, evidence freshness, and a
     versioned server calculation;
   - order impact is snapshotted at checkout;
   - Rescue allocation is transactional and has a real concurrent-checkout
     regression test.

## C. Remaining issues requiring planned work

The highest-value remaining work is:

1. A complete driver exception-resolution workflow.
2. Authoritative availability, delivery zones, and constraint-safe route
   planning.
3. A documented, enforceable cross-role order/delivery transition contract.

Broader CO₂, vehicle, returnable-packaging, route-fill, and consolidation work
depends on the availability/zone/operational-data foundation. It should not be
implemented as display-only estimates.

## D. Actual end-to-end flow map

```text
RESTAURANT
Catalog/search → product → cart
  → choose ASAP or requested supplier date
  → place order (idempotency key + transaction)
  → pending order

SUPPLIER
Receive pending order
  → confirm all items / partially confirm / cancel
  → confirmed | partially_confirmed | cancelled
  → reschedule with reason where allowed
  → scheduled / in_delivery

WAREHOUSE
View stock → report inventory risk
  → supplier manager reviews risk
  → optional typed Rescue promotion with a capped allocation
  → restaurant checkout reserves Rescue quota transactionally

DRIVER
Supplier assigns one delivery assignment per order
  → assigned → picked_up → en_route → arriving
  → complete proof of delivery
  → order delivered, assignment delivered, route advances

EXCEPTION BRANCHES
Driver: delay | problem | reject
Order: cancellation / reschedule requests are server-guarded
Rescue: capacity conflict rolls back checkout; pre-delivery cancellation releases allocation

LOCAL IMPACT
Supplier maintains optional product origin/season/packaging/evidence
  → server calculates current Local impact
  → catalog/product/cart show compact current signals
  → checkout persists an immutable item snapshot
  → monthly report aggregates order-time snapshots
```

## E. Architectural and data-model concerns

- Keep product-local calculation, product response enrichment, cart aggregation,
  and report aggregation on one versioned DTO contract. Do not recompute
  historical orders from mutable product metadata.
- Preserve stable promotion locking before order-item insertion in checkout;
  foreign-key lock upgrades otherwise deadlock concurrent Rescue allocations.
- Keep physical stock authoritative. Inventory risk and Rescue capacity are
  overlays with explicit reconciliation rules, not alternative stock stores.
- Do not add CO₂, Local-distance, availability, delivery-zone, or packaging
  return claims until their authoritative inputs and versioned methodology exist.
- Align order history typing with the current status vocabulary in a carefully
  migrated change; do not silently rewrite historical data.

## F. Local/Sustainability regression check

No verified regression was found in the current Local implementation:

- supplier headquarters is not used as product origin;
- source and verification timestamps cannot be spoofed by a client;
- stale or insufficient evidence suppresses a score/badge;
- cart uses current product impact while reports preserve an order-time snapshot;
- Rescue capacity remains separate from physical stock and is protected under
  concurrent checkout.

Gaps are intentionally visible rather than fabricated: current product impact
does not claim route distance, CO₂, delivery consolidation, or packaging-return
custody.

## G. System scorecard

| Area | Score | Rationale |
| --- | ---: | --- |
| Ordering | 8/10 | Transactional checkout, stock checks, idempotency, and recovery are strong; authoritative delivery constraints are incomplete. |
| Supplier processing | 7/10 | Confirm/partial/cancel and guarded date changes work; action surfaces need simplification. |
| Warehouse | 7/10 | Role boundary and risk reporting are clear; risk-to-stock reconciliation is still an overlay. |
| Driver | 7/10 | Route, status, proof, delay/problem/reject paths exist; complete exception resolution is missing. |
| Delivery | 7/10 | Synchronization is guarded and tested; availability/zones and exception closure are incomplete. |
| Routing | 6/10 | Road-aware optimization and ETA exist; no authoritative windows, zones, capacity, or route snapshots. |
| Local/Sustainability | 7/10 | Product-level evidence-backed calculation and snapshots are sound; logistics and CO₂ claims are deliberately not implemented. |
| Role separation | 8/10 | Central server/client capabilities and deny-by-default warehouse/driver surfaces are strong. |
| UX simplicity | 7/10 | Clear primary flows in cart and driver actions; some supplier action duplication and uneven recovery remain. |
| Data consistency | 8/10 | Atomic checkout, idempotency, stock movements, Rescue ledgers, and impact snapshots are strong; dual statuses/history typing need governance. |
| Error handling | 7/10 | Main order flows recover well; query/mutation recovery is not uniform across all pages. |
| Performance | 7/10 | No verified blocking issue; Local enrichment and large-catalog behavior need profiling before scale claims. |
| Overall | **7.3/10** | A sound transactional marketplace and delivery base with a trustworthy Local-data foundation; the next gains require operational constraint and exception-lifecycle work, not more display-only intelligence. |