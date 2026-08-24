# Business Logic & Resilience Audit

## Scope and evidence

This audit covers the high-risk order, authorization, credential-exposure, and
service-resilience scenarios from the supplied business-logic and infrastructure
specifications. It distinguishes automated evidence from code review and from
infrastructure responsibilities that cannot be verified from an application
workspace.

## Implemented hardening

### Orders and duplicate submissions

- Cart checkout creates all supplier orders, their order items, initial status
  history, stock reservations, and cart removal in one database transaction.
- `POST /api/orders` and `POST /api/orders/direct` now accept a bounded
  required `Idempotency-Key`; missing or malformed keys are rejected. The key is persisted with the order and constrained by
  restaurant, key, and supplier. A repeat returns the original order response
  with `Idempotent-Replay: true` instead of creating or reserving stock again.
- Each checkout also has a required request fingerprint, persisted alongside
  the key. Reusing a key with a changed basket, supplier, note, or delivery
  date is rejected with `409 idempotency_key_reused`, never silently replayed
  as an earlier order.
- The restaurant cart and direct inbox checkout generate a key per submission.
  Pending keys are persisted locally with a cart/request fingerprint, so a
  browser refresh or lost response safely reuses the original checkout identity;
  a changed basket starts a new identity. A successful submission clears it.
- A unique-index conflict caused by two simultaneous submissions is recovered
  by loading and returning the already-created order.
- Notification/chat failures after a successful checkout do not turn the
  checkout into an error response. Failed supplier notifications are queued in
  the durable retry outbox, which is attempted on startup and on a 30-second
  schedule. A per-attempt lease and database uniqueness guard against duplicate
  order cards and `new_order` notifications.
- Retries stop after ten unsuccessful attempts and retain their final error and
  terminal timestamp. The failed-delivery count is included in platform admin
  health data, and a terminal failure emits an explicit server error log.

### Request resilience and observability

- Every response has `X-Request-ID`; valid caller-provided IDs are preserved
  and invalid/oversized values are replaced.
- `/health/live` is an unauthenticated process liveness endpoint.
- `/health/ready` checks PostgreSQL with three-second connection-acquisition,
  client query, and server-side query timeouts. A failed probe discards its
  database client rather than returning a potentially stale connection to the
  pool.
  It returns `503` with no-store caching when the database cannot be reached or
  does not answer in time.
- Unexpected global errors receive a generic client response with the request
  ID. Raw database/provider error text is not sent to the client.
- API request logs no longer serialize arbitrary JSON response bodies. This
  avoids copying customer data into normal access logs while retaining method,
  route, status, duration, and request correlation.
- `SIGTERM` and `SIGINT` stop new HTTP work, drain the server and close the
  PostgreSQL pool within one 15-second overall deadline, then force exit if a
  stuck dependency prevents clean pool shutdown.
- Clerk-context access in the session endpoint is treated as unavailable
  authentication rather than an internal server error in standalone/test
  contexts.

### Existing verified controls retained

- Session-derived organization identity and role checks are used for protected
  routes; client-supplied organization identifiers do not establish authority.
- Cross-organization order, price, complaint, AI, and role access has
  regression coverage.
- Joined member views exclude password hashes and authentication timestamps.
- Registration requires both email verification and platform approval.
- Driver and order transitions enforce their documented forward-only workflow.

## Automated validation

Executed after this audit:

| Check | Result |
| --- | --- |
| `npm run check` | passed |
| `node --import tsx --test server/*.test.ts` | passed: 183 tests |
| `npx vitest run` | passed: 18 tests |
| `/health/live` | manually verified: HTTP 200, `{"status":"ok"}`, request ID header |
| `/health/ready` | manually verified: HTTP 200, database dependency reported `ok`, request ID header |

Focused resilience tests cover safe request IDs, rejection of malformed
idempotency keys, required checkout keys, and generic public error messages.
Existing server tests
cover authorization, cross-tenant isolation, registration approval, member
credential sanitization, driver lifecycle, and stock/order behavior.

## Manual or infrastructure-owned scenarios

The following must be configured and exercised in the deployment environment;
they cannot be truthfully marked complete through application code alone:

1. **Backups and restore drills** — define PostgreSQL/object-storage retention,
   restore ownership, recovery point/time objectives, and test a full restore.
2. **Platform outage and failover** — hosting-region failure, DNS/CDN behavior,
   multi-region strategy, and provider incident runbook.
3. **Deployment safety** — production migration sequencing, canary/rollback
   process, and a verified rollback drill.
4. **Monitoring and alerting** — run uptime checks against both health
   endpoints and alert on readiness failures, error-rate increases, queue
   backlog, terminal checkout-delivery failures, and database resource
   exhaustion. The app exposes a terminal failure count but does not configure
   an external alert destination.
5. **External provider failure drills** — force object storage, email, push,
   ERP/PMS, and Clerk failures in a non-production environment and confirm
   business-facing recovery messaging and outbox/retry behavior.
6. **Load and race testing** — run concurrent duplicate checkouts using a
   single idempotency key and different keys, then confirm exact order and
   stock counts under production-like database load.

## Residual risks and next verification

- Checkout-critical schema is applied through
  `npm run db:migrate-checkout-resilience`, which records the migration,
  preflights duplicate order-card history without deleting it, and creates
  checkout indexes concurrently. Application startup only verifies this
  migration; it does not modify checkout tables or indexes. Other legacy
  startup migrations remain outside this checkout-specific scope.
- A checkout key is intentionally scoped to a restaurant and supplier so one
  multi-supplier basket can share one key. A client must not reuse a key for a
  different checkout.
- Application health checks report process and database availability; they do
  not prove external provider availability or data recoverability.
- Production observability, backup policy, failover, and rollback require
  operations-level implementation and acceptance evidence.