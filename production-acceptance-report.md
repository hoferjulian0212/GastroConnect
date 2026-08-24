# GastroConnect production-like acceptance report

**Run date:** 2026-08-24  
**Environment:** Replit development workflow (`Start application`, port 5000), shared
development database, seeded demo data  
**Release decision:** **Blocked / not production sign-off**

This report records executable acceptance evidence from the application workspace.
It does not present local or simulated checks as proof of production backups,
provider delivery, or deployment rollback.

## Evidence summary

| Area | Status | Evidence |
| --- | --- | --- |
| Restaurant order creation and order-state protections | **Verified by automated tests** | `node --import tsx --test server/*.test.ts` — 188 passed |
| Supplier confirmation and role boundaries | **Verified by automated tests** | Authz suite covers supplier confirmation, restaurant rejection, and cross-organization rejection |
| Complaint creation and duplicate prevention | **Verified by automated tests** | First complaint succeeds; repeated complaint returns `409 complaint_already_exists` |
| Driver/order lifecycle guards | **Verified by automated tests** | Driver lifecycle, warehouse routing, and order transition tests pass |
| Admin reporting and health aggregation | **Verified by automated tests** | Admin analytics suite passes, including health and activity shapes |
| Database migration readiness | **Verified** | `npm run db:migrate -- --preflight-only` and `--verify-only` pass |
| Application liveness | **Verified in running workflow** | `GET /health/live` → 200, `{"status":"ok"}`, `X-Request-ID` present |
| Database readiness | **Verified in running workflow** | `GET /health/ready` → 200, database dependency `ok`, `X-Request-ID` present |
| Frontend runtime smoke check | **Verified** | Landing page rendered in `screenshots/task-248-runtime-home.jpg`; browser reported no application errors |
| Type safety | **Verified** | `npm run check` passes |
| Frontend tests | **Verified** | `npx vitest run` — 5 files / 18 tests passed |
| Refresh, stale state, duplicate actions, and concurrency controls | **Partially verified** | Server tests cover idempotency, stale-transition rejection, row locking, and safe retry semantics; real multi-device browser drills remain open |
| Offline/reconnect on supported devices | **Not verified** | Requires controlled browser/device testing |
| Email delivery and recovery | **Partially verified** | Checkout/authz paths do not fail when notification delivery fails; Resend rejected test-recipient addresses with its sandbox restriction, so delivery was not proven |
| Push subscription | **Verified at API boundary** | Authenticated push subscription test returns 200; device delivery was not proven |
| Object storage | **Not verified end-to-end** | Requires a real upload/download/failure drill |
| PMS/ERP | **Partially verified** | Correct-secret PMS webhook returns 200 and ERP adapter/sync tests pass; live provider import and outage recovery were not proven |
| Backup/restore | **Not verified** | Requires an operator-owned database and object-storage restore drill |
| Monitoring and alert routing | **Configured in development; production route check failed** | Development endpoints are pollable without session state; metrics are rate-limited, time-bounded, short-cached, fail closed on outbox-query/schema errors, and include five-minute API 5xx rate, retry-outbox backlog/recent terminal failures, oldest pending age, process uptime, and PostgreSQL pool exhaustion. At 2026-08-24T10:56:57Z the published URL returned SPA HTML, not health JSON, for all three health paths. |
| Deployment rollback | **Not verified / blocked** | Requires a deployed server release exposing the health contract, then an operator-owned canary/rollback drill with attached deployment evidence |

## Role-path acceptance coverage

The automated acceptance fixtures use separate restaurant, supplier, unrelated
supplier, driver, warehouse, and platform-admin identities. They verify:

- protected requests are rejected without a session;
- wrong organization and wrong role cannot mutate orders, complaints, pricing,
  or MOQ;
- the supplier can confirm its pending order;
- the restaurant can create a complaint only for its order;
- a second complaint for the same order is rejected;
- authenticated push subscription is accepted;
- the PMS guest-count webhook requires the configured shared secret;
- admin analytics routes require a platform-admin session.

These are service-level multi-identity checks, not a claim that four browser
sessions were exercised against a deployed production URL.

## Resilience and recovery observations

The first full server run exposed test-only rate-limit exhaustion: the authz
suite makes more than 40 writes from one loopback address while covering many
role cases. The test server now raises its write limit only through its spawned
test-process environment; production keeps the default limit of 40 writes per
minute. The rerun passed all 185 server tests.

The application code and existing tests provide evidence for:

- transactional checkout and stock reservation;
- idempotent repeat checkout;
- stale transition rejection;
- durable supplier-notification retry behavior;
- generic provider/database error responses;
- readiness failure signaling and graceful shutdown.

They do not replace provider outage, device offline, data restore, external
monitoring, or deployment rollback drills.

## Recovery and rollback evidence ledger

This ledger records both the evidence available in the application workspace and
the operator-owned evidence that is still absent. A blank measurement is not a
successful drill: it means the drill was not run from an environment with
production database, object-storage, and deployment controls.

| Check | Timestamp (UTC) | Result | Recovery measurement / readiness |
| --- | --- | --- | --- |
| Development checkout migration preflight | 2026-08-24T10:56:16Z | Passed | No duplicate checkout artifacts found; read-only preflight completed. |
| Development checkout migration catalog verification | 2026-08-24T10:56:16Z | Passed | Required checkout schema and indexes are present. This is migration readiness, not a restore. |
| Development liveness, readiness, and metrics checks | 2026-08-24T11:07:30Z | Passed | All returned HTTP 200 with `application/json`; live returned `{"status":"ok"}`, ready returned database `ok`, and metrics reported no pending/recent-terminal retry records and a non-exhausted pool. |
| Published health-route inspection | 2026-08-24T10:56:57Z | **Failed** | `/health/live`, `/health/ready`, and `/health/metrics` each returned HTTP 200 with `text/html` SPA content instead of the expected JSON health response. External monitoring must not be enabled against this deployment until the corrected server release is published and rechecked. |
| PostgreSQL backup and isolated restore | Not executed | **Not proven** | RPO: not measured. RTO: not measured. Post-restore readiness: not measured. Requires an operations owner, production backup inventory, and an isolated restore target. |
| Object-storage backup and isolated restore | Not executed | **Not proven** | RPO: not measured. RTO: not measured. Object count/checksum and signed-download validation: not measured. Requires an operations owner and isolated restore bucket. |
| Canary deployment and rollback | Not executed | **Blocked** | Canary start/end, rollback start/end, and post-rollback readiness: not measured. The current published route mismatch must be fixed before this drill. |

### Operator-owned production drill record

This section is intentionally blank until an operator with production backup,
object-storage, and deployment access performs the drill. Do not replace
`Not recorded` with an estimate. Attach provider exports, deployment event
links, command output, and timestamps in UTC to this report.

#### Backup inventory and isolated restore

| System | Backup identifier / immutable version | Completed (UTC) | Retention | Accountable owner | Restore target | Restore start (UTC) | Restore end (UTC) | RPO | RTO |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PostgreSQL | Not recorded | Not recorded | Not recorded | Not recorded | Not recorded | Not recorded | Not recorded | Not measured | Not measured |
| Object storage | Not recorded | Not recorded | Not recorded | Not recorded | Not recorded | Not recorded | Not recorded | Not measured | Not measured |

Record the PostgreSQL row count for the order, order-items, order-status-history,
checkout-idempotency, and `order_notification_retries` tables before and after
restore. For object storage, record object count, total bytes, and checksums
for a representative order document and complaint document, then perform a
read-only download from the isolated target. Record the restored application's
`/health/ready` status and JSON body; a successful database connection alone
does not prove application readiness.

#### Canary and rollback

| Event | Release / deployment ID | Start (UTC) | End (UTC) | Readiness HTTP/body | Error-rate evidence | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| Canary deployment | Not recorded | Not recorded | Not recorded | Not recorded | Not recorded | Not recorded |
| Rollback to known-good | Not recorded | Not recorded | Not recorded | Not recorded | Not recorded | Not recorded |

The canary record must include migration preflight output and the observed
five-minute API error rate. The rollback record must include post-rollback
`/health/live`, `/health/ready`, and `/health/metrics` status, content type,
and JSON bodies, plus measured recovery time. Any `200` response containing
SPA HTML fails the health-contract check.

#### Read-only business-integrity check

Capture these values immediately before the canary and after rollback from the
same production database snapshot/window:

| Check | Before canary | After rollback | Result / evidence |
| --- | --- | --- | --- |
| Order count and checksum of immutable order IDs | Not recorded | Not recorded | Not recorded |
| Order-item count and quantity/value checksum | Not recorded | Not recorded | Not recorded |
| Status-history count and latest-event checksum | Not recorded | Not recorded | Not recorded |
| Checkout idempotency records and key/fingerprint checksum | Not recorded | Not recorded | Not recorded |
| Notification-outbox count, pending count, and terminal-failure count | Not recorded | Not recorded | Not recorded |
| Read-only order detail and checkout-history smoke check | Not recorded | Not recorded | Not recorded |

The smoke check must use a known existing order and must not create, cancel,
reprice, or otherwise mutate business data. Matching counts/checksums and
preserved outbox history are required; a code rollback must never be
implemented as a destructive data rollback.

### Required operator drill evidence before sign-off

1. Record backup identifiers, completion timestamps, retention policy, and
   accountable operations owner for PostgreSQL and object storage.
2. Restore each backup into isolated targets; record restore start/end, measured
   RPO and RTO, row/object counts, checksum or sample-download verification,
   and `/health/ready` response from the restored application.
3. Publish the server release that exposes the JSON health endpoints, then
   verify status code **and** `application/json` content type on all three
   production health paths. A 200 HTML SPA fallback is a failure.
4. Route a canary to the new release. Record deployment ID, start/end time,
   migration preflight result, canary error rate, and readiness result.
5. Roll back to the previously known-good release. Record rollback start/end,
   measured recovery time, post-rollback `/health/live` and `/health/ready`
   bodies, and a read-only order/checkout smoke check. Preserve business data
   and outbox records; do not treat a code rollback as permission to delete
   records or reverse schema destructively.

## Release checklist and remaining owners

Before production sign-off, attach evidence for:

1. **Operations:** verified PostgreSQL and object-storage backup retention,
   restore result, recovery point/time measurements, and named ownership.
2. **Release engineering:** production migration preflight, canary result,
   rollback result, and post-rollback readiness checks.
3. **Monitoring:** create external HTTP checks for the following production
   URLs (the deployment's public origin, not the development domain):
   `/health/live`, `/health/ready`, and `/health/metrics`.
   Configure alert delivery as follows:

   | Check/alert | Trigger | Delivery | Owner |
   | --- | --- | --- | --- |
   | Liveness | non-2xx for 2 consecutive checks | external monitor's incident channel | Platform operations |
   | Readiness | non-2xx for 2 consecutive checks | external monitor's incident channel | Platform operations |
   | API errors | `api.serverErrorRate >= 0.05` and `api.requests >= 20` in 5 minutes | external monitor's incident channel | Backend on-call |
   | Retry backlog | `retryOutbox.pending >= 10` for 10 minutes | external monitor's incident channel | Integrations on-call |
   | Recent terminal deliveries | `retryOutbox.terminalRecent >= 1` in the prior 24 hours | external monitor's incident channel | Integrations on-call |
   | Database exhaustion | `database.pool.exhausted == true` for 2 minutes | external monitor's incident channel | Backend on-call |

   External delivery was **not exercised in this workspace** because no
   monitor account, incident channel, or production URL is provisioned here.
   The named operational owners above must create the checks, send a test
   notification, and attach the provider delivery ID/timestamp to this
    report before production sign-off. The application-side metrics endpoint
    and alert contract are ready for that handoff in development, but the
    published deployment must first be updated because it currently serves SPA
    HTML for the health routes.
4. **QA/device:** restaurant → supplier → driver → restaurant browser journey,
   refresh and stale tabs, duplicate clicks, concurrent actions, and offline
   reconnect on supported desktop and mobile devices.
5. **Integrations:** successful and failed drills for Resend, push, object
   storage, PMS, and ERP, including user-visible recovery behavior.

Until those artifacts exist, the release is **blocked from production sign-off**.
The failed published-health-route inspection is an immediate release blocker, not
a conditionally accepted result.