---
name: Published health contract
description: How to verify production health checks through the public deployment origin.
---

Validate health endpoints through the published origin using status code,
`application/json` content type, and the expected JSON body. Never treat a
successful deployment, process log, or HTTP 200 by itself as monitoring proof.

**Why:** A SPA fallback can return `200 text/html` for a missing or stale health
route, creating a false healthy signal for external monitoring.

**How to apply:** Before enabling alerts, releasing a canary, or accepting a
rollback drill, probe `/health/live`, `/health/ready`, and `/health/metrics`
from the public URL and fail the release if any response is an HTML fallback.