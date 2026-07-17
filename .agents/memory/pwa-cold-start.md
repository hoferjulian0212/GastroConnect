---
name: PWA cold-start speed
description: How the app avoids the slow full-restart splash when iOS kills the installed PWA
---

iOS kills the standalone PWA WebView when the user switches apps; the restart itself cannot be prevented — only made near-instant.

**Rule:** keep two layers working together: (1) the service worker caches the app shell/assets (network-first navigations with cached "/" fallback, cache-first for hashed `/assets/`, SWR for icons/fonts; never cache `/api` or vite internals; versioned `gc-*` caches) and is registered app-wide in `main.tsx`, not just from push settings; (2) the last authenticated `/api/auth/me` response is persisted to localStorage (`gc.me.snapshot`) and fed to react-query as `placeholderData`, so the splash is skipped and the UI paints instantly while the real session fetch runs in background.

**Why:** without both layers the user sees the GastroConnect splash + full network reload on every app switch.

**How to apply:** don't persist the placeholder itself (only after `isFetchedAfterMount`); clear the snapshot on logout/unauthenticated; the splash gate must be `isLoading && !me`, since `placeholderData` keeps the query status "pending". Tests mounting the app must `localStorage.clear()` between cases or identity leaks across tests. Bump `CACHE_VERSION` in `sw.js` when changing caching behavior.
