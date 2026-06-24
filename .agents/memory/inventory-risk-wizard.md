---
name: Inventory risk reporting wizard
description: How the warehouse "Risiko melden" create flow is structured (wizard vs dialog) and where reasons live.
---
Create-time inventory risk reporting uses a mobile step-by-step `InventoryRiskWizard` (vaul Drawer), NOT the old `InventoryRiskFormDialog`. The dialog is now EDIT-only (still used for editing existing records). Both share the same de/it translations under the `inventoryRisk` namespace.

Wizard steps: photo (skippable, camera capture) → product → reason → details (quality/qty/expiry) → note+review+send.

**Reasons:** predefined canonical English tokens in `shared/schema.ts` (`INVENTORY_RISK_REASONS`); rendered via `reason_<Token>` translation keys (keys with spaces are quoted). Stored in the `risk_reason` nullable column (added via idempotent ALTER in `runAdminMigration`, NOT drizzle push). Validated server-side by zod enum in BOTH insert and the route's separate `updateInventoryRiskSchema`.

**Why:** the warehouse worker flow needed a guided mobile experience; keeping the dialog for edit avoided rewriting the edit/manage path.

**How to apply:** if changing the create flow, edit the wizard; if changing edit, edit the dialog — keep both in sync. Photo upload uses `POST /api/uploads/request-url` (accepts a `prefix`) then PUT to the signed URL.
