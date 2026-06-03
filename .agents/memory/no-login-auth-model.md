---
name: No-login auth model
description: Why GastroConnect has no authentication and IDs are trusted from requests
---

GastroConnect deliberately has **no login / no session auth**. The "current user" is
chosen client-side (UserContext + an account switcher) and the relevant
`userId` / `supplierId` / `restaurantId` is passed on every request via query string
(GET) or JSON body (POST/PATCH/DELETE). The server trusts these IDs.

**Why:** The original project spec requires it ("keinen Login machen. Der Wechsel
zwischen den Usern sollte per Button funktionieren") — switching users via a button is
a core dev/demo workflow.

**How to apply:** Endpoints verify the *resource* belongs to the passed ID (e.g.
`WHERE supplier_id = $supplierId`), but do NOT verify the caller "owns" that ID. A code
review may flag this as IDOR/cross-tenant exposure — that is expected and intentional;
do not add session auth to individual endpoints (it would be inconsistent with the
entire app and contradicts the spec). The one place worth hardening is endpoints with
real per-call cost (e.g. the AI price-list parse), which get a dedicated rate limiter.
