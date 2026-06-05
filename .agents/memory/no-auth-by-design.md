---
name: No auth by design
description: GastroConnect has no login/auth; endpoints trust caller-provided IDs. Don't "fix" missing authorization.
---

GastroConnect intentionally has NO login/authentication. API endpoints trust caller-provided restaurant/supplier IDs. There is an account/role switcher in the UI for testing instead of real auth.

**Why:** It's a demo/B2B prototype where the auth/permission model is explicitly out of scope (see task specs). Code review / architect runs will reliably flag delivery-note, order, and document routes as "serious authorization violations" because anyone with an order ID can act on it. This is by design, not a regression.

**How to apply:** Do not add per-user ownership/role checks to routes as part of unrelated tasks — it would be inconsistent with the whole app and out of scope. Only treat it as a real bug if a task explicitly asks for an auth/permission model.
