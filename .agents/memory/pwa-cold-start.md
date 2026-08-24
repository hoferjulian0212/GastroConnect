---
name: PWA cold-start speed
description: How the app avoids the slow full-restart splash when iOS kills the installed PWA
---

iOS kills the standalone PWA WebView when the user switches apps; the restart itself cannot be prevented — only made near-instant.

**Rule:** keep two layers working together: (1) the service worker primes and returns the cached app shell immediately for navigations, then refreshes it in the background; it remains cache-first for hashed `/assets/` and SWR for icons/fonts, never caches `/api` or Vite internals, and uses versioned `gc-*` caches; (2) the last authenticated `/api/auth/me` response is persisted to localStorage (`gc.me.snapshot`) and seeds the user state before Clerk finishes booting, so the shell paints instantly while real authentication refreshes in the background.

**Why:** without both layers the user sees the GastroConnect splash + full network reload on every app switch.

**How to apply:** don't persist the placeholder itself (only after `isFetchedAfterMount`); clear the snapshot on logout/unauthenticated; only trust a snapshot until the first real auth request completes, then use the server response. Tests mounting the app must `localStorage.clear()` between cases or identity leaks across tests. Bump `CACHE_VERSION` in `sw.js` when changing caching behavior. Keep focus-refetch disabled by default so a PWA resume does not flood stale screen queries. On mobile, a localStorage resume marker plus an 800ms visibility threshold drives the brief resume loader; quick app switches must not flash it.
