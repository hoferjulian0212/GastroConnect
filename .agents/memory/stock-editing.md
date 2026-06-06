---
name: Supplier stock editing — single source of truth
description: Where stockQuantity may be changed and why the product editor must not.
---

# Supplier stock editing

`stockQuantity` for a supplier product has ONE editable path after creation: the
Inventory page's "Bestand anpassen" dialog, which writes an audited
`POST /api/stock-movements` (recorded in `stockMovements`, viewable via history).

The supplier Products "Edit Product" dialog must NOT send `stockQuantity` on edit —
it only sets the *initial* stock at creation. On edit the field is shown read-only
with a hint pointing to the Inventory page.

**Why:** previously the product editor did a direct `PATCH /api/products/:id`
overwrite of `stockQuantity`, silently bypassing the stock-movement audit trail.
Two editable paths for the same value → inconsistent history and confusing UX.

**How to apply:** keep `lowStockThreshold` and `inStock` editable in the product
editor (they are not quantity movements). Any new stock-quantity mutation must go
through stock movements, never a raw product PATCH.
