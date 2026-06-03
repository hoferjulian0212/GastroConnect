---
name: Three-bucket warehouse stock model
description: How per-product stock is split across MAIN/ITI/Outbounded and the invariants any order lifecycle change must preserve.
---

# Three-bucket warehouse stock model

Per supplier product, stock lives in three buckets:
- **MAIN** = `products.stockQuantity` (available to sell).
- **ITI** (reserved/temporary) = `products.reservedQuantity` (allocated to open orders).
- **Outbounded** = goods gone after delivery — NOT a column, derived from `stock_movements` only.

Movement types driving the buckets: `order_reserved` (MAIN→ITI), `order_returned` (ITI→MAIN), `order_outbounded` (ITI→gone). Legacy `order_confirmed`/`manual_*` types still exist in history.

Lifecycle: order placed (pending) reserves MAIN→ITI; delivered outbounds ITI; cancelled-before-delivered returns ITI→MAIN. Partial-confirm returns the rejected portion (reserved−confirmed) ITI→MAIN. Pending-order edits apply the per-product reservation *diff*. Change-request-approved makes NO stock movement (stays reserved).

**Why:** the old model deducted MAIN at confirm-time, which lost visibility of "ordered but not yet delivered". The bucket split makes reserved stock explicit and keeps MAIN = truly sellable.

**How to apply / invariants for any new order-state code:**
- Products with `stockQuantity = NULL` are *untracked* — skip all bucket movements for them.
- Returns/outbounds must use `getReservedRemainingByProduct(orderId)` so they release *exactly* what is still reserved for that order (idempotent: 0 remaining → no-op). Never release a flat ordered qty.
- `order_returned` credits MAIN only by the amount actually removed from ITI (clamp to current reserved), never the requested qty — otherwise MAIN inflates in corrupted/edited states.
- Reserve is strict by default (throws `InsufficientStockError` → map to HTTP 400); follow-up orders reserve leniently (clamp, never drive MAIN negative).
- Any flow that changes order items AND stock must do both in ONE `db.transaction` that first locks the order row (`SELECT … FOR UPDATE`) and re-checks status, or a concurrent cancel/deliver can race between diff-computation and apply. See the items PATCH route as the reference pattern.
- `editOrderItemsSchema` caps quantity at 9999 (Zod) — over-cap edits 500 via the generic Zod handler before stock logic runs; that is expected, not a stock bug.
