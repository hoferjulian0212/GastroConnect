---
name: Inventory Risk Management feature
description: Supplier-only at-risk-stock flagging that warehouse staff create and Product Managers turn into promotions.
---

# Inventory Risk Management (supplier-only)

Supplier-only feature (no restaurant mirror — the replit.md mirroring rule does NOT apply).
Warehouse staff *flag* at-risk stock; Product Managers (vertreter) / managers / admin *manage*
the lifecycle and turn a flag into a promotion via the existing promotions system.

## Capability split (the important rule)
- `inventory_risk.create` (admin, manager, vertreter, warehouse): create a record + edit OWN record details.
- `inventory_risk.manage` (admin, manager, vertreter — NOT warehouse): edit any record, change `status`, and run the "turn into promotion" action.
- **Why:** keeps warehouse from advancing lifecycle. The PATCH route must reject any payload containing `status` when the caller lacks `inventory_risk.manage`, even on their own record — the schema allows `status`, so field-level gating lives in the route, not the zod schema.
- **How to apply:** if you add manager-only fields to `updateInventoryRiskSchema`, gate them the same way in `PATCH /api/inventory-risks/:id`.

## created_by is a MEMBER id
`inventory_risk_records.created_by` stores `req.auth.memberId` (members.id), NOT users.id.
- **Why:** the table originally shipped with a FK to users(id), which made every insert fail (the wizard's "Meldung konnte nicht gespeichert werden" bug). FK now points to members(id) via an idempotent startup migration; creator hydration reads from `members`.
- **How to apply:** any new table whose "who did it" column is filled from `req.auth.memberId` must reference `members.id`; columns filled with organization ids reference `users.id`.

## Promotion guards moved
Promotion routes are gated by `promotions.manage` (not `products.manage`) so vertreter can run promotions without catalog write access.
