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

### Versioned checkout migration rollout

Checkout schema work is no longer performed by the application boot path. The
numbered checkout migrations own the checkout idempotency key and request
fingerprint columns, the supplier-notification outbox, and the order-card and
checkout-delivery notification uniqueness guards. `npm run db:migrate` runs a
read-only preflight before applying the reviewed checkout migrations through its
versioned deployment ledger and verifies the resulting schema and index
definitions afterward.

The preflight reports duplicate legacy order cards, duplicate new-order
notifications, duplicate checkout keys, and duplicate outbox rows. It exits
non-zero and never deletes or selects a “winning” business record. An operator
must reconcile any reported records under an approved retention/audit plan
before rerunning the command. The SQL migration repeats the duplicate checks
inside its transaction so calling the underlying migrator directly is also
fail-closed.

Production sequence:

1. Take/confirm a database backup and deploy the migration files and migration
   runner without routing checkout traffic to code that requires the new schema.
2. Run `npm run db:migrate -- --preflight-only` and stop if it reports any
   duplicate group. Do not solve the warning by deleting order cards or
   notifications automatically.
3. Run `npm run db:migrate`. The migration is tracked in the deployment
   migration ledger, and the verification step must pass before the application
   is marked ready. It sets a 5-second lock timeout and a 2-minute statement
   timeout by default (override with
   `CHECKOUT_MIGRATION_LOCK_TIMEOUT_MS` and
   `CHECKOUT_MIGRATION_STATEMENT_TIMEOUT_MS`, both bounded to 1 second–15
   minutes). The indexes are created inside one transaction, not concurrently:
   schedule the run during a low-write window because a successful run can
   briefly wait on or block writes; a timeout aborts and rolls back the whole
   migration without recording it.
4. Start/shift application traffic only after verification succeeds. A failed
   transactional migration can be retried after the underlying issue is
   resolved; no application boot retry performs schema changes.

Rollback plan:

- If the migration fails, keep the application on the previous compatible
  release and inspect the database; do not manually delete partially retained
  business records. The migration transaction rolls back its DDL, and the
  preflight can be rerun after remediation.
- If a post-deploy rollback is required, first stop code that writes the new
  idempotency/outbox fields, preserve any pending outbox rows for audit, and
  restore from the verified backup or use a reviewed reverse migration. Do not
  drop the checkout idempotency/fingerprint columns or the outbox table while
  any deployed writer or retry worker can still reference them.
- After restoring/reversing to the pre-migration release, validate that
  release’s own readiness and checkout checks. Do not run this migration
  runner’s `--verify-only` mode against a deliberately pre-0009 schema: that
  mode correctly requires the new checkout objects.

## Automated validation

Executed after this audit:

| Check | Result |
| --- | --- |
| `npm run check` | passed |
| `node --import tsx --test server/*.test.ts` | passed: 182 tests |
| `npx vitest run` | passed: 18 tests |
| `npm run db:migrate -- --preflight-only` | passed: no duplicate checkout artifacts found |
| `npm run db:migrate -- --verify-only` | passed: exact checkout schema/index catalog verified |
| `npm run db:migrate` | passed: migration applied and then rerun idempotently from the deployment ledger |
| `/health/live` | manually verified: HTTP 200, `{"status":"ok"}`, request ID header |
| `/health/ready` | manually verified: HTTP 200, database dependency reported `ok`, request ID header |

Focused resilience tests cover safe request IDs, rejection of malformed
idempotency keys and fingerprints, key-reuse rejection for changed checkout
requests, and generic public error messages.
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

 - Checkout schema/index changes now use the versioned, preflighted migration
   process above. Production acceptance still requires an operator to run the
   migration, verify index presence, and exercise the rollback plan.
- A checkout key is intentionally scoped to a restaurant and supplier so one
  multi-supplier basket can share one key. A client must not reuse a key for a
  different checkout.
- Application health checks report process and database availability; they do
  not prove external provider availability or data recoverability.
- Production observability, backup policy, failover, and rollback require
  operations-level implementation and acceptance evidence.