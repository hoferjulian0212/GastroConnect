---
name: Notification preferences model
description: How per-user notification toggles are stored and how they gate delivery channels.
---

# Notification preferences

Per-user prefs live in `users.notificationPrefs` (jsonb, nullable). Shape + defaults
are in `shared/schema.ts` as `NotificationPrefs` / `DEFAULT_NOTIFICATION_PREFS`
(two channels `push` and `email`, each with `newOrder/orderStatus/newMessage/complaint`).
Null is treated as "all defaults". Persisted via `PATCH /api/users/:id/notification-prefs`.

**Gating model (the durable decision):**
- The per-type toggles on the Settings "Benachrichtigungen" (push) and "E-Mail" cards
  gate *delivery* of that channel for that event type. They do NOT stop the in-app
  notification record from being created — the bell stays an activity feed.
- The "Push" card is the master device subscribe/unsubscribe (separate).
- `createNotificationWithPush` (server/routes.ts) loads the recipient once and gates
  BOTH push and email inline using `notificationPrefKey(type)` → pref key. Types NOT
  mapped (low_stock, monthly_report, pms_request, erp_request, erp_sync_failed,
  whatsapp_request) are operational and ALWAYS delivered, regardless of toggles.

**Why:** the email toggles + granular push toggles used to be local `useState` only —
dead UI that lied to the user (a false promise). Toggling did nothing; no customer
email was ever sent (SendGrid was admin-only).

**How to apply:** when adding a new gateable notification type, add a case to
`notificationPrefKey` AND a toggle on both Settings pages. Email sending must call
`shouldSendNotification(..., "email")` before sending.
