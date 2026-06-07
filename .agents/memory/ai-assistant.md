---
name: AI data assistant (aiSearch)
description: How the in-app AI assistant answers data questions, and the overdue-date consistency rule
---

# AI data assistant

The in-app AI assistant ("KI-Assistent") is backed by `server/aiSearch.ts`, NOT by routes.ts.
It is a tool-calling loop (OpenAI via AI integration) where each tool is a read-only,
role-scoped DB lookup built in `buildTools(userId, role)`. To let the assistant answer a
new kind of data question, add a tool there: implement a handler, add it to the `handlers`
record AND the `definitions` array, then (if it should be used proactively) mention it in
`systemPrompt`. The model must always end by calling the `respond` tool.

**Tenant scoping rule:** every tool query must filter by `eq(ownOrderCol, userId)`
(`ownOrderCol` = restaurantId for restaurants, supplierId for suppliers). There is no auth —
the caller-supplied userId/role is trusted — so the WHERE clause is the only tenant boundary.
Any orderId returned to the model is re-validated server-side by `resolveAction` before it
becomes a deep link, so returning raw `orders.id` is safe.

## Overdue-delivery date rule
**Rule:** when computing whether a delivery is overdue, compare the `requestedDeliveryDate`
("YYYY-MM-DD" string) against the **local** date, not UTC.
**Why:** the app runs in CET/CEST (UTC+1/+2). Using `new Date().toISOString().slice(0,10)`
yields the UTC date, which around local midnight is the *previous* day and mis-flags
deliveries by one day. The restaurant Home page overdue logic compares against local
midnight, so any other overdue computation must match it to stay consistent.
**How to apply:** build today as `${y}-${MM}-${DD}` from local getFullYear/getMonth/getDate.
