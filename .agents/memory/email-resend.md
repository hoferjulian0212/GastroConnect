---
name: Email sending via Resend
description: How transactional notification emails are sent and why the connector path was abandoned.
---

# Email sending (Resend)

`server/emailService.ts` sends transactional notification emails via the Resend
HTTP API (`POST https://api.resend.com/emails`) using a plain `fetch` and the
`RESEND_API_KEY` secret. `isEmailConfigured()` guards it; when the key is missing
`sendEmail` returns false and the app degrades gracefully (in-app + push still work).

Wired into `createNotificationWithPush` (server/routes.ts): the recipient user is
loaded once and reused to gate push + email and to get the recipient address.
Email is sent only when the per-type email pref allows AND the user has an email.

Sender defaults to `GastroConnect <onboarding@resend.dev>`; override with
`RESEND_FROM_EMAIL` once a custom domain is verified in Resend. Deep links in the
email are built from `REPLIT_DOMAINS`.

**Why not the Replit Resend connector:** the connector connection set up via the
integrations flow was invisible to the app runtime (proxy 404 / listConnections
returned 0, even with forced refresh), so it could not send. The direct HTTP API +
secret is reliable in dev and prod. If a future Resend connector path is attempted,
verify `listConnections()` actually returns the connection from the server process
before relying on it. `@replit/connectors-sdk` may still be in package.json but is
unused.

**How to apply:** to add a new email, call `sendEmail({to, subject, html})`; for
notification-style mails reuse `renderNotificationEmail({title, message, linkPath})`.
