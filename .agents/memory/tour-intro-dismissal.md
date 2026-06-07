---
name: Auto-popup dismissal must survive stale refetch
description: Why one-time popups (page-intro tour) re-appear after dismissal, and the guard pattern that fixes it.
---

One-time auto-popups (e.g. the page-intro tour in `client/src/components/tour/TourProvider.tsx`)
are gated by a "have I shown this?" check that reads from `currentUser`. The
dismissal flow must make the "already handled" decision authoritative for the
session, independent of any server state that can momentarily regress.

**Rule:** When dismissing a one-time popup, record it in a session-scoped ref
(a `Set`) SYNCHRONOUSLY, before any async save or `stop()`, and check that ref
in the auto-trigger effect. Do NOT rely solely on the persisted field
(`seenPageIntros`) round-tripping back through the user query, and do NOT use
`invalidateQueries` to refresh the user after dismissal.

**Why:** The user query (`/api/users?role=`) polls (~30s). A refetch that started
*before* the dismissal can resolve *after* it and overwrite `currentUser` with a
version whose persisted "seen" list lacks the just-dismissed item. If the only
other guard is a ref that the effect cleanup can delete (the `!fired` path), the
popup re-fires — repeatedly, until a fresh fetch wins. This is what caused the
"dismiss 4-5 times / app restarts" bug. `invalidateQueries` also forces refetch
churn that feels like a reload.

**How to apply:** populate `handledIntrosRef` at the top of `finish()`/`skipAll()`;
update the cached user in place via `setCurrentUser(updated)` +
`queryClient.setQueryData` (a `patchUserCache` helper) instead of invalidating;
reset the session ref on account switch (user.id change) and on reset, so other
users / re-enabled intros still show.
