---
name: web-push delivery
description: Constraints and gotchas for the Web Push notification system (service worker + VAPID + iOS PWA).
---

# Web Push delivery

The push stack is fully wired and VAPID keys are configured as shared env vars (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`). If notifications "don't work", first suspect the device/permission flow, not the backend.

## iOS is the main constraint
- iOS/iPadOS only deliver Web Push when the app is an **installed PWA** (added to Home Screen and opened from that icon). In plain mobile Safari, `PushManager` is absent or `subscribe()` throws.
- The Settings push card therefore shows when `pushSupported || needsInstall`, and renders "Add to Home Screen" guidance when `needsInstall` (iOS && !standalone). Detect iPadOS via `navigator.platform === "MacIntel" && maxTouchPoints > 1`.

## Test endpoint must reflect real delivery
- `sendPushNotification` returns `{ attempted, succeeded, failed }`. `POST /api/push/test` reports `sent: succeeded` — never the raw subscription count, or you get false-positive "test sent" toasts when delivery actually failed.
- **Why:** delivery failures are swallowed per-subscription (dead subs are auto-deleted on 404/410), so pre-send count is not proof of delivery.

## Service worker
- `client/public/sw.js` must NOT have a pass-through `fetch` handler — it intercepts every request for no benefit. Keep only `install`(skipWaiting) / `activate`(clients.claim) / `push` / `notificationclick`.
- Notification icon uses `/app-icon.png` (bold logo); badge uses `/favicon.png`.
