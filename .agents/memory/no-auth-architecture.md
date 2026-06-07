---
name: No-auth architecture (trusted caller IDs)
description: GastroConnect has no login/session; every endpoint trusts client-supplied userId/role/supplierId/restaurantId by design. Don't "fix" missing per-endpoint authz.
aliases: no auth by design, trusted identity, no-login auth model, no server auth, IDOR, cross-tenant
---

# No authentication — caller-provided IDs are the design

GastroConnect has NO login/session auth. The "current user" is chosen client-side
(`UserContext` + an account/role switcher; switching users via a button is a core
demo workflow). Every API endpoint reads identity from `req.query.supplierId` /
`req.query.restaurantId` / `userId` / request body and scopes data by it, with no
check that the caller actually "owns" that identity.

Resource-ownership checks DO exist (e.g. `WHERE supplier_id = $supplierId`, verifying
an order belongs to the passed id), but they are anchored to the *client-supplied*
identity, so they are workflow correctness, not a security boundary.

**Why:** It's a demo/B2B prototype and the spec explicitly requires it — "keinen Login
machen. Der Wechsel zwischen den Usern sollte per Button funktionieren." The auth/
permission model is deliberately out of scope.

**How to apply:** A code review / architect run will reliably flag order, delivery-note,
document, and search routes as critical IDOR / cross-tenant / "trusts caller-provided
supplierId" violations. In isolation that's correct, but it is the documented app-wide
architecture — identical on every endpoint. Do NOT add session auth / ownership checks
to a single route as part of an unrelated task; it would be inconsistent and give no real
protection while siblings stay open. Treat it as a known limitation / follow-up unless a
task explicitly asks for an app-wide auth model. The one place worth hardening is
endpoints with real per-call cost (e.g. the AI price-list parse), which get a dedicated
rate limiter rather than auth.

Note: the org/member "preset roles" added later are also best-effort workflow control on
top of this model (spoofable), NOT authz — see `org-member-permissions.md`.
