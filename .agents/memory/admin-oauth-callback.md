---
name: Admin OAuth callback URL
description: Why REPLIT_DEV_DOMAIN must be used for the Replit OIDC redirect_uri, not x-forwarded headers.
---

# Admin OAuth callback URL

**Rule:** `callbackUrl()` in `server/auth/adminAuth.ts` must use `process.env.REPLIT_DEV_DOMAIN` as the primary source for the redirect URI base, falling back to `x-forwarded-host` only when the env var is absent.

**Why:** When `curl` or the Replit-internal routing hits the Express server on `localhost:5000`, the `x-forwarded-host` header is absent or contains the internal host. The OIDC `redirect_uri` was built as `http://localhost:5000/api/admin/auth/callback` — a URL Replit's OAuth server redirected back to, but which is unreachable from any real browser. The OAuth callback never arrived, and the user was left on a broken page.

`REPLIT_DEV_DOMAIN` is always injected by the Replit platform (e.g. `abc-00-xyz.riker.replit.dev`) and is the correct public hostname in both dev and preview environments.

**How to apply:** Any server-side code that needs to construct an absolute self-referencing URL (OAuth callbacks, email links with full domain, webhook endpoints) should prefer `REPLIT_DEV_DOMAIN` over request headers.
