---
name: Admin panel Replit OIDC login
description: How the /admin platform-admin login authenticates via Replit OIDC and why it uses REPL_ID + PKCE instead of a registered OAuth App.
---

# Admin panel Replit OIDC login

The `/admin` platform-admin login authenticates against Replit's OIDC
(`https://replit.com/oidc`) as a **public client using PKCE** — it does NOT
require a manually-registered Replit OAuth App.

**Rule:** the OAuth client id is `REPL_ID` (auto-injected in every Replit
environment). `REPLIT_CLIENT_ID`/`REPLIT_CLIENT_SECRET` are optional overrides
only for self-hosted/confidential setups. The token exchange sends a PKCE
`code_verifier` (stored in the session) and omits `client_secret` unless one is
explicitly configured.

**Why:** users on Replit cannot/won't register an OAuth App at
replit.com → Account → OAuth Apps. The "Log In with Replit" integration enables
the project as an OIDC client keyed by `REPL_ID`, so login works with zero manual
credential setup. The original admin code assumed a registered App and left the
login button disabled forever without those secrets.

**How to apply:** bootstrap the first admin via
`PLATFORM_ADMIN_REPLIT_USERNAMES` (comma-separated, lowercased) — first login of
an allowlisted username is auto-approved; everyone else lands `pending` and needs
an existing approved admin to approve them (chicken-and-egg without the allowlist).

**Gotcha:** the `javascript_log_in_with_replit` blueprint scaffolds
`server/replit_integrations/auth/*`, `shared/models/auth.ts`,
`client/src/hooks/use-auth.ts`, `client/src/lib/auth-utils.ts` and pulls in
`openid-client` + `memoizee`. `memoizee`→`es5-ext` is blocked by Socket Security
(protestware) so the install fails. The admin flow does OIDC by hand with
`fetch` + Node `crypto`, so those scaffold files are unused — delete them to keep
`tsc --noEmit` green. We only needed the integration to enable Replit Auth at the
platform level, not its code.
