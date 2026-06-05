---
name: Integration connection-request flows
description: How PMS/ERP/WhatsApp "connect" features share one admin-approval pattern, and the intentional admin-notification deep-link quirk.
---

GastroConnect's external-integration "connect" features (PMS cost-analysis, ERP inventory, WhatsApp inbox) all follow ONE shared request→admin-approval pattern. When adding a new such integration, mirror the ERP one end-to-end:

- A pending-status placeholder connection row is created on every submission (even "Other/not listed").
- A `*ConnectionRequest` row tracks the request; admin reviews at `/admin` (PATCH updates status → maps to active/disconnected on the connection).
- Two notifications fire: one to the requester (confirmation) and one to the admin (`ADMIN_USER_ID`), falling back from email (`isAdminEmailConfigured`) to in-app.

**Intentional quirk — admin notification deep-link uses the *requester's* role, not `/admin`.**
`createNotificationWithPush(notification, role)` builds the URL from `role`, so the admin's in-app notification deep-links to e.g. `/supplier/inventory` or `/restaurant/inbox`, NOT `/admin`.
**Why:** ERP (the reference pattern) does exactly this (passes `"supplier"` for its admin notification). New integrations are required to "mirror ERP exactly," so WhatsApp deliberately keeps the same behavior for consistency. Do NOT "fix" this in isolation — it would diverge from the established pattern. If changed, change ERP/PMS in lockstep. The admin always reaches the review UI via `/admin` regardless of the notification link.
