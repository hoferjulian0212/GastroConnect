---
name: Frontend app-mount tests (vitest/jsdom)
description: Gotchas when mounting the full App in vitest/jsdom, and the UserLoader hydration rule.
---

## jsdom polyfills for full-App mounts
Importing `<App />` pulls the whole component graph, including pdfjs-dist, which
touches canvas APIs (`DOMMatrix`, `Path2D`, `ImageData`) at module load and crashes
jsdom. The test setup file must stub these (plus matchMedia/observers/pointer
capture/`URL.createObjectURL`) before any test file imports run.

## UserLoader must wait for session hydration
**Rule:** the role-area redirect (`UserLoader` keeping users inside `/restaurant/*`
or `/supplier/*`) must no-op until `currentUser` is loaded.
**Why:** `currentRole` defaults to "restaurant" while the session is still hydrating;
redirecting on that placeholder bounced supplier deep links (e.g. `/supplier/orders`
on hard refresh) to `/restaurant` then `/supplier`, losing the target page.
**How to apply:** any new global navigation guard tied to role/identity must gate on
the session actually being loaded, not on default context values.

## Test determinism
Prefer `waitFor` on a route-specific test id (e.g. the target page's hero) over
fixed `setTimeout` sleeps when asserting "no redirect happened".
