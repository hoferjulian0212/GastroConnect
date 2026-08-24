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
- `/health/metrics` provides low-cardinality, no-customer-data JSON for an
  external monitor: five-minute API 5xx rate, retry-outbox pending and recent
  terminal-failure counts, oldest pending item, process uptime, and PostgreSQL
  pool pressure/exhaustion. It collects API results before auth middleware,
  uses a 10-second shared snapshot/single-flight query, rate-limits scraping,
  keeps a fixed-size per-second request ring buffer, and bounds the database
  query to three seconds at both client and PostgreSQL levels. It returns `503`
  when the outbox schema/query cannot be completed; it never reports
  zero-valued healthy outbox metrics for a missing schema.
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
4. **Monitoring and alerting** — configure an external HTTP monitor for
   `/health/live`, `/health/ready`, and `/health/metrics`. Alert on non-2xx
   responses, `api.serverErrorRate`, `retryOutbox.pending`,
   `retryOutbox.terminalRecent` (a rolling 24-hour count), and
   `database.pool.exhausted`. The application
   exposes the signals; the monitor and delivery destination remain
   deployment-owned.
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

## End-to-end workflow audit

This section records the current application workflow after reviewing the
attached end-to-end specification, the shared status/permission definitions,
the route handlers, and the role-specific pages. It intentionally preserves
the existing business model and status names.

### Complete workflow map

- **Restaurant ordering:** authenticate → discover supplier/catalog → inspect
  unit and price → add/change/remove cart items → choose delivery details →
  submit checkout → receive a `pending` order number → monitor supplier
  confirmation → monitor planned/in-delivery delivery → view delivered history
  → optionally create a complaint.
- **Supplier order processing:** receive order notification → inspect items,
  customer, amount, and requested date → confirm all/part of the order (or
  reject all) → optionally set/change the active delivery date → assign or
  reassign a driver → driver starts the tour → driver completes delivery →
  delivery note is available → order remains historical.
- **Driver delivery:** assigned stop → driver marks en route (which transitions
  the order to `in_delivery`) → driver can report an existing delivery problem
  or complete the stop → completion transitions the order to `delivered`.
- **Complaint handling:** restaurant creates one complaint linked to one of its
  orders → supplier receives the complaint → supplier may start work, reject,
  partially resolve, resolve, comment, or create a follow-up order where
  supported → restaurant can comment, close with a note, or reopen terminal
  complaints where the current UI supports it.
- **Supporting workflows:** supplier catalog and pricing changes feed future
  discovery/cart operations; delivery zones control supplier availability;
  documents are attached to an order or complaint and are access-checked by
  the related parties; team invitations establish organization and role;
  admin routes are protected separately from business-member routes.

### Current status maps

- **Orders:** `pending`, `confirmed`, `partially_confirmed`, `scheduled`,
  `in_delivery`, `delivered`, `cancelled`, `to_review`.
- **Complaints:** `open`, `in_progress`, `resolved`, `closed`, `rejected`,
  `partially_resolved`.
- **Delivery assignments:** assignment lifecycle is separate from order
  status; driver departure is the source of the order's `in_delivery` state.

### Order action matrix

| Order status | Restaurant actions | Supplier actions |
| --- | --- | --- |
| `pending` | View, edit, reorder, report problem, cancel, message, upload document | **Confirm** (full/partial/reject), set date, cancel, message, upload document |
| `confirmed` / `partially_confirmed` | View, request change, reorder, report problem, cancel, message, documents | Set/change date, assign/reassign driver, cancel, message, documents |
| `scheduled` | View, request change, reorder, report problem, cancel, message, documents | Change date, assign/reassign driver, message, documents |
| `in_delivery` | View delivery tracking, request change, reorder, report problem, message, documents | Reassign driver where permitted, mark delivered through the existing UI path, message, documents |
| `delivered` | View, reorder, report problem, rate supplier, message, documents | View, message, documents |
| `cancelled` | View history, reorder, report problem, message, documents | View history, message, documents |
| `to_review` | View, request change, reorder, report problem, cancel, message, documents | Assign/reassign driver, message, documents; review-specific existing route/UI handles the delivery exception |

Actions that are irrelevant to a state are hidden. Actions that are relevant
but waiting on a real prerequisite remain disabled only where the current
workflow has an explicit prerequisite. Backend authorization and transition
checks remain authoritative.

### Complaint action matrix

| Complaint status | Restaurant | Supplier |
| --- | --- | --- |
| `open` | Comment, close with required note, message | Start work, partially resolve, reject with reason, comment, proposal/follow-up where applicable |
| `in_progress` | Comment, close with required note, message | Partially resolve, resolve, reject with reason, comment, proposal/follow-up |
| `partially_resolved` | Comment, close/reopen according to current UI, message | Continue the existing resolution actions, comment |
| `resolved` / `closed` | Reopen where supported, comment, message | View/comment; terminal resolution actions are unavailable |
| `rejected` | View/comment/message according to current page | View/comment/message; no duplicate resolution transition |

### Verified bugs corrected

1. **Medium — impossible order-detail actions were displayed as disabled.**
   Supplier confirmation, delivery completion, delivery-note creation,
   cancellation, and restaurant edit/change actions were presented even when
   the backend could not accept them. The detail page now hides irrelevant
   actions and keeps only state-valid actions visible.
2. **Medium — `to_review` driver assignment was omitted from the supplier
   action UI.** The backend already accepted assignment in that state; the
   detail page now exposes the existing assignment flow.
3. **High — complaint creation trusted client-supplied order relationships.**
   The server now verifies the authenticated restaurant owns the order and
   that the submitted supplier is the order's supplier.
4. **Medium — duplicate complaints could be created for one order.** The
   server now returns a conflict with the existing complaint identifier rather
   than creating a second workflow record.

### Backend/state and cross-user evidence

- Supplier confirmation is restricted to `pending`; partial confirmation
  produces `confirmed`, `partially_confirmed`, or `cancelled` according to the
  submitted quantities.
- Driver assignment is restricted to the established confirmed/planned/
  review states and assignment plans the delivery; departure, not a generic
  status edit, creates `in_delivery`.
- Delivery completion is restricted to the driver lifecycle and results in
  `delivered`; terminal orders cannot be restarted through the detail actions.
- Open change requests block conflicting order status transitions until the
  request is answered.
- Session-derived organization and role checks prevent restaurants from
  confirming orders, suppliers from creating complaints, unrelated
  organizations from changing orders, and direct-ID access across tenants.
- Cache invalidation refreshes the order, history, list, action-required,
  delivery, and counterparty views after mutations. Notifications and chat
  cards carry the cross-user update for the existing workflow.

### Edge-case and failure matrix

| Scenario | Evidence/result |
| --- | --- |
| Wrong role / wrong organization | Automated 401/403 route tests pass; no data mutation |
| Skipped order step | Generic status and driver routes reject driver-only delivery and invalid lifecycle entry points |
| Repeated checkout | Durable idempotency key/fingerprint and transactional stock reservation prevent duplicates |
| Repeated complaint | New regression test returns `409 complaint_already_exists` |
| Concurrent order transition | Row lock and conflict error prevent stale transitions |
| Stale detail page | Server re-reads state and rejects conflicting transition; client invalidates affected queries |
| Browser refresh / navigation | State comes from server queries; checkout identity persists locally for safe retry |
| Empty / loading / mutation failure | Existing pages provide skeleton, empty, disabled-pending, toast/error, and retry-safe mutation behavior |
| Direct URL / missing object | Protected routes derive identity from the session; missing records return not-found responses |
| Database/provider failure | Generic public errors, readiness checks, and checkout notification outbox preserve business state |

### Dead code and duplicate-path decisions

No component or endpoint was removed solely because its purpose was not
obvious. The order detail and delivery pages intentionally share delivery-date
and driver workflows, and both reach the same backend guards. Historical
notification rows, order history, complaint history, and uploaded documents are
retained for auditability. No clearly orphaned handler was found during this
pass.

### Manual tests still required

These cannot be truthfully completed from the development workspace alone:

1. Test the full restaurant → supplier → driver → restaurant journey with real
   browser sessions and verify notification timing on production-like devices.
2. Exercise offline/reconnect behavior, object storage failure, email/push
   provider failure, ERP/PMS failure, and Clerk outage in a controlled
   non-production environment.
3. Run production-like concurrent checkout and delivery load/race tests.
4. Verify backups, restore drills, deployment rollback, external monitoring,
   alert routing, and operational ownership.

### Ambiguous business rules requiring manual decision

- Whether restaurants may create complaints for `pending`, `confirmed`, or
  `cancelled` orders, since the current API supports order-linked complaints
  without a status deadline and the specification does not establish one.
- Whether a complaint should permit more than one complaint record per order
  after a previous complaint is rejected or closed. The implementation now
  enforces the existing one-complaint lookup contract; changing that policy
  would be a business decision.
- Whether `to_review` orders should expose a dedicated review action in the
  supplier UI; the current implementation exposes the existing assignment and
  exception paths without inventing a new action.

## End-to-end audit validation

| Check | Result |
| --- | --- |
| `npm run check` | passed |
| `node --import tsx --test server/*.test.ts` | passed: 185 tests |
| `npx vitest run` | passed: 18 tests |
| `git diff --check` | passed |
| `Start application` workflow restart | serving on port 5000 |
| Runtime logs | clean startup; no application crash |