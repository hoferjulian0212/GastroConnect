---
name: Admin OAuth (Replit OIDC) gotchas
description: Two distinct bugs that broke the admin "Log in with Replit" flow — prompt value + callback URL.
---

# Admin OAuth (Replit OIDC) gotchas

The admin panel uses a custom Replit OIDC PKCE flow in `server/auth/adminAuth.ts` (not the blueprint). Two separate things broke "Mit Replit anmelden":

## 1. `prompt=select_account` is rejected by Replit OIDC (the real culprit)

Replit's authorization endpoint (`https://replit.com/oidc/auth`) returns
`error=invalid_request&error_description=unsupported prompt value requested`
for `prompt=select_account`. It immediately 303s back to the redirect_uri with that error — the user never sees a Replit login screen.

**Accepted prompt values:** `login`, `consent`, `login consent`, `none`. Use `prompt=login`.

**Why:** `select_account` is a valid OIDC value in general but Replit's IdP does not implement it. The discovery doc does NOT advertise `prompt_values_supported`, so you must test empirically (curl the auth endpoint and inspect the `location` header for `error_description`).

**How to apply:** When building any Replit OIDC authorize URL by hand, stick to `prompt=login`/`consent`/`none`. Never `select_account`.

## 2. redirect_uri must use REPLIT_DEV_DOMAIN, not request headers

`callbackUrl()` must prefer `process.env.REPLIT_DEV_DOMAIN` for the redirect_uri base. When the server is hit on `localhost:5000` (curl, internal routing) the `x-forwarded-host` header is absent, producing an unreachable `http://localhost:5000/...` callback. `REPLIT_DEV_DOMAIN` is the canonical public hostname in dev/preview.

**Note:** `REPLIT_DEV_DOMAIN` is dev-only; a production deployment must fall back to the forwarded host (the fallback branch in `callbackUrl()` handles this).
