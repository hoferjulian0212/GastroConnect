---
name: No server-side auth
description: This app has no server-side authentication/authorization layer
---
The GastroConnect Express backend has NO session, auth middleware, or ownership
checks. All `/api/*` routes (e.g. order-templates GET/:id, POST, PATCH, DELETE)
trust the client, which passes `restaurantId`/`currentUser.id` from React context.

**Why:** It's a demo/B2B prototype with an AccountSwitcher; auth was never built.

**How to apply:** Adding ownership/authz to a single new route is inconsistent and
gives no real protection while siblings stay open. Match the existing pattern; if
real security is needed, it must be an app-wide change (flagged as follow-up).
