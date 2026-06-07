---
name: Local types shadowing shared schema types cause silent UI bugs
description: Why some pages redeclare interface OrderWithDetails locally, and how that hides backend-populated fields.
---

Several large pages (e.g. restaurant & supplier `Inbox.tsx`) declare their OWN
`interface OrderWithDetails extends Order { ... }` instead of importing the
shared one from `@shared/schema`. These local copies are partial and drift out of
sync with the backend response shape.

**Symptom:** A conditional UI block like `{orderDetail.createdByUser && (...)}`
silently never renders because the local interface omits `createdByUser`, even
though `getOrderWithDetails` in `server/storage.ts` populates it. TypeScript does
NOT error on the missing branch — it just types the field as absent, so the block
is dead.

**Rule:** When a field the backend returns isn't showing up in the UI, check
whether the page uses a local interface that shadows the shared type. Prefer
importing the shared type; if a local partial type must stay, keep the displayed
fields in sync with the server's populated shape.

**Also:** `tsconfig.json` had no `target` (defaulted to ES3), which produced ~32
spurious TS2802 "can only be iterated…" errors on Map/Set iteration. Setting
`"target": "ES2020"` is the correct fix and is type-check-only (Vite/esbuild
build target is independent).
