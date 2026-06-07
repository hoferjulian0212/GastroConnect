---
name: Org/member preset-role permissions
description: How preset member roles gate actions in the no-auth "pick an account" model — best-effort, not a security boundary.
---

In this app a `users` row is an Organization and the `members` table holds people.
The active person is `currentMember` (client `UserContext`), spoofable like the
rest of the no-auth model.

`shared/permissions.ts` defines `Capability`, `ROLE_CAPABILITIES`, and `can(role, capability)`.
Preset roles: admin (all), manager (orders.create/manage, products.manage, chat, team.view),
staff (orders.create, chat, team.view), vertreter (orders.manage, chat, team.view).

Server (`server/routes.ts`):
- `checkActingCapability(orgId, actingMemberId, capability)` — STRICT: 403 when
  actingMemberId missing / member not in org / lacks capability. Used for
  team/org management and vertreter assignment (org.edit, team.manage, vertreter.assign).
- `checkActingCapabilityIfProvided(orgIds, actingMemberId, capability)` — LENIENT:
  only enforces when the client supplies the actor id, so legacy flows never break.
  Used on high-traffic core flows: order placement (orders.create against the
  RESTAURANT org), order status (orders.manage against [restaurantId, supplierId]),
  chat send (chat against senderId).

**Why:** strict checks on order/chat would 403 legacy/unattributed requests and
break core flows; the model is workflow control, not authz.

**How to apply:** order create AND `/api/orders/direct` are placed by the
RESTAURANT member → validate against `restaurantId` with `orders.create` (NOT the
supplier org). Status changes can come from either side → pass both org ids.
Client gates (Cart place-order, supplier Products add/edit/delete) treat a null
currentMember as full access to mirror the lenient server behavior.

**Org/business settings gating gotcha:** business-profile edits flow through the
legacy `PATCH /api/users/:id` route (a `users` row IS the org), NOT only through
`/api/orgs/:id`. That route must also enforce `org.edit`, or staff/manager bypass
the permission model via the Profile pages. It does so leniently: strip
`actingMemberId` before the strict `updateUserSchema.parse` (schema is `.strict()`),
then require `org.edit` only when the update touches a non-`language` field (so the
LanguageSync `{language}` PATCH and legacy callers stay unaffected). Both Profile
pages send `actingMemberId` and gate save/upload UI via `can(role, "org.edit")`.
