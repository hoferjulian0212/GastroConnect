---
name: ERP catalog sync engine
description: How automatic ERP→catalog sync reconciles products and which fields are off-limits.
---

# ERP → GastroConnect catalog sync

The sync engine (`server/erpSync.ts`) treats the supplier's ERP as the **source of truth** for product catalog data. It ingests rows two ways — REST/JSON (stored apiKey/apiBaseUrl) and Excel/CSV pulled from an IMAP mailbox — normalizes them, and reconciles against existing products.

## Reconciliation rule
Match priority: `erpExternalId` → `gtin` → `articleNumber` → `name+unit` (reuses `shared/productMatch`). Create new, update changed, soft-deactivate (set `discontinued=true`, never hard-delete) products missing from the feed. Price changes write `priceChangeLog(source="erp")`; stock changes write `stockMovements(type="erp_sync")` — both inside one transaction.

**Why:** order history references products, so deletion would corrupt past orders; deactivation preserves history while removing them from ordering.

## Fields the sync must NEVER overwrite
`imageUrl`, `lowStockThreshold`, promotions, per-restaurant `customPrices`, and `customMinOrderQuantities` are **GastroConnect-owned**. ERP only owns name/description/price/unit/category/articleNumber/gtin/base stock/default MOQ. The supplier Products edit dialog locks the ERP-owned inputs (`erpLocked`) for `erpManaged` products but keeps image + lowStockThreshold editable.

**How to apply:** when extending the sync or adding product fields, decide ownership first; if a field is user-customizable per-restaurant or visual, keep it out of the ERP update set and out of the `erpLocked` set only if it must stay editable.

## Field alias normalization
`FIELD_ALIASES` in `erpSync.ts` maps canonicalized headers (lowercase, accent-stripped, alnum-only) to normalized fields, supporting German + Italian column names. When a feed column isn't picked up, add its canonical form to the alias list (e.g. `mindestbestellmenge`, `minimoordine` for MOQ). Prices use German decimal handling (comma decimal, dot thousands).
