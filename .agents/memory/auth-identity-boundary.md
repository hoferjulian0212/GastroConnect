---
name: Auth identity & authz boundary
description: How acting identity is resolved and how non-session callers (webhooks) are authenticated in GastroConnect.
---

# Identity & authorization boundary

**Rule:** Protected API routes must resolve the acting identity (member + organizationId + role) from the server session (`req.auth`), never from client-supplied ids (`req.body.userId`, `req.query.restaurantId/supplierId`, `actingMemberId`). Capability checks use `can(role, capability)` from `shared/permissions.ts`; route guards/helpers live in `server/routes.ts` and `server/auth/middleware.ts`.

**Why:** Client-supplied identity is spoofable; the demo model used to trust it, which allowed cross-org access. T6 of the Member Authentication & Security work closed this across all mutating routes.

**How to apply:** When adding or editing a mutating route, derive org/role from `req.auth` and reject with 401 if absent. `shared/permissions.ts` is now a real security boundary, not just UX — keep the role→capability matrix authoritative on the server.

# External webhooks (no user session)

**Rule:** Machine-to-machine endpoints with no user session (e.g. PMS webhooks `POST /api/pms/webhooks/guest-count` and `/occupancy`) are gated by a shared-secret header `x-webhook-secret`, compared with `timingSafeEqual` (length-checked first). Design is **fail-closed**: if `PMS_WEBHOOK_SECRET` is unset, return 503 (no legitimate caller exists yet — all PMS providers are stubs with no live sender).

**Why:** These webhooks accept an arbitrary `restaurantId`; without a secret any caller could inject occupancy/guest-count data for any org.

**How to apply:** Before onboarding a real PMS sender, set `PMS_WEBHOOK_SECRET` and document the contract (required header, 401 on mismatch, 503 when unconfigured). Consider rate limiting / IP allowlist at that point.
