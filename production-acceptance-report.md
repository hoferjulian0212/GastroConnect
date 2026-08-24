# GastroConnect production-like acceptance report

**Run date:** 2026-08-24  
**Environment:** Replit development workflow (`Start application`, port 5000), shared
development database, seeded demo data  
**Release decision:** **Conditional / not production sign-off**

This report records executable acceptance evidence from the application workspace.
It does not present local or simulated checks as proof of production backups,
provider delivery, or deployment rollback.

## Evidence summary

| Area | Status | Evidence |
| --- | --- | --- |
| Restaurant order creation and order-state protections | **Verified by automated tests** | `node --import tsx --test server/*.test.ts` — 185 passed |
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
| Monitoring and alert routing | **Configured in application; external delivery pending** | `/health/live`, `/health/ready`, and `/health/metrics` are pollable without session state; metrics include five-minute API 5xx rate, retry-outbox backlog/terminal counts, oldest pending age, process uptime, and PostgreSQL pool exhaustion |
| Deployment rollback | **Not verified** | Requires a deployment canary/rollback drill and attached deployment evidence |

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
   | Terminal deliveries | `retryOutbox.terminal >= 1` | external monitor's incident channel | Integrations on-call |
   | Database exhaustion | `database.pool.exhausted == true` for 2 minutes | external monitor's incident channel | Backend on-call |

   External delivery was **not exercised in this workspace** because no
   monitor account, incident channel, or production URL is provisioned here.
   The named operational owners above must create the checks, send a test
   notification, and attach the provider delivery ID/timestamp to this
   report before production sign-off. The application-side metrics endpoint
   and alert contract are ready for that handoff.
4. **QA/device:** restaurant → supplier → driver → restaurant browser journey,
   refresh and stale tabs, duplicate clicks, concurrent actions, and offline
   reconnect on supported desktop and mobile devices.
5. **Integrations:** successful and failed drills for Resend, push, object
   storage, PMS, and ERP, including user-visible recovery behavior.

Until those artifacts exist, the release should be treated as conditionally
validated rather than fully accepted for production.