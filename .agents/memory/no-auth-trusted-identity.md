---
name: No-auth trusted userId/role model
description: This app has NO login/auth — every API trusts client-supplied userId/role. Don't "fix" this per-endpoint.
---

GastroConnect intentionally has **no authentication**. Every endpoint (e.g. `GET /api/search`,
`POST /api/search/ai`) takes `userId` and `role` from the client request and scopes data by them.
Server-side ownership checks (e.g. verifying an order belongs to the given userId) ARE done, but
they are anchored to the client-supplied identity by design.

**Why this matters:** A code reviewer/architect will flag this as a critical IDOR/access-control
vulnerability. In isolation that's correct, but it is the documented app-wide architecture. Do NOT
add auth to a single new endpoint — that would be inconsistent and out of scope. Any real fix must
be an app-wide auth introduction, which is a separate, explicit task.
