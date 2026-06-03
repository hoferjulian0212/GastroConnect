---
name: Backend not hot-reloading in dev
description: New/changed server modules (e.g. new route files) require a workflow restart, not just Vite HMR
---

When you add a new server module (e.g. a new route registration like `server/aiSearch.ts`)
or change existing backend code, the running dev process does NOT pick it up automatically.
The `Start application` workflow logs only show Vite **client** HMR updates — the Express
backend keeps serving the old module graph.

**Symptom:** A newly added API route (e.g. `POST /api/search/ai`) returns the SPA
`index.html` fallback (HTTP 200, HTML body) instead of JSON, because the route isn't
registered in the still-running process.

**Fix:** Restart the `Start application` workflow after backend changes, then re-test.

**Why:** dev backend is not run under a file watcher that reloads server modules.
