---
name: No-auth architecture
description: GastroConnect has no login/session; endpoints trust caller-provided IDs by design.
---

# No authentication — caller-provided IDs are the design

GastroConnect has NO login/session auth. Role (restaurant/supplier/admin) is chosen via an
account switcher, and every API endpoint reads identity from `req.query.supplierId` /
`req.query.restaurantId` / request body with no ownership or session check (see the many
`req.query.supplierId` usages in `server/routes.ts`).

**Why:** It's a demo/B2B prototype without an auth layer. This is a deliberate, app-wide choice.

**How to apply:** When a code review flags an IDOR / "trusts caller-provided supplierId" issue on
a single endpoint, recognize it's identical to every other endpoint — it is NOT a regression and
can't be fixed in isolation without building an auth/identity system for the whole app. Note it as
a known limitation rather than special-casing one route.
