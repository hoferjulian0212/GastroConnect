# GastroConnect — Authentication & Authorization Threat Model

Scope: the member authentication and authorization surface added in the
"Member Authentication & Security" work. Identity is a **member** belonging to one
organization (`users` row) with a member role (`admin`/`manager`/`staff`/`vertreter`).
Sessions are server-side, stored in Postgres, referenced by an HTTP-only cookie
(`gc.sid`). Onboarding is invite-only; there is no public self-signup.

## Assets to protect
- Member credentials (password hashes, OAuth links) and session cookies.
- Per-organization data: orders, chat/messages, complaints, documents, delivery
  notes, team/seat configuration, pricing.
- Invite and password-reset tokens (grant account access if leaked).

## Trust boundaries
- Browser ↔ Express API (`/api`) — all requests cross this boundary; identity is
  derived **only** from the server session, never from client-supplied ids.
- Express ↔ Postgres — parameterized queries via Drizzle ORM.
- Express ↔ third parties — Google OAuth, Resend (email).

## Attack surface & mitigations

| # | Threat | Mitigation in place |
|---|--------|---------------------|
| 1 | **Credential stuffing / brute force** on login | `bcryptjs` hashing; strict per-IP rate limit on `/api/auth/login`, reset-request and claim/reset-confirm (`authLimiter`); global API + write limiters. |
| 2 | **Identity spoofing** via client-supplied `userId`/`actingMemberId` | All protected routes resolve identity from the session (`loadAuth` → `req.auth`); client-supplied ids are ignored. Authz audit completed (T6). |
| 3 | **Cross-org / horizontal privilege escalation** | Every protected route enforces org ownership + member role/capability (`requireAuth`, `requireCapability`, `shared/permissions.ts`). |
| 4 | **Session hijacking** | Cookie is `httpOnly`, `secure` (prod), `sameSite=lax`; secret from `SESSION_SECRET` (startup refuses without it); sessions stored server-side and pruned hourly; logout destroys the server session. |
| 5 | **CSRF** | `sameSite=lax` cookie blocks cross-site credentialed POSTs; OAuth round-trip protected by a short-lived `oauthState`; no permissive CORS (same-origin only unless `ALLOWED_ORIGINS` allowlists a host). |
| 6 | **Invite / reset token theft or replay** | Tokens are random 32-byte values; only the SHA-256 hash is stored; tokens are single-use and time-limited; raw token only travels in the emailed link. |
| 7 | **Open redirect / account takeover via OAuth** | Google sign-in matches an **already-invited** member by verified email only; un-invited emails are rejected and logged (`oauth.not_invited`); OAuth endpoints rate-limited. |
| 8 | **XSS** | React auto-escapes output; no `dangerouslySetInnerHTML` on user data; `helmet` headers; JSON body size capped at 1 MB. |
| 9 | **Seat-limit / billing-adjacent abuse** | Member create/invite enforce seat limits server-side; last-admin removal is blocked. |
| 10 | **Secret leakage** | No secrets hardcoded; all via env (`SESSION_SECRET`, `GOOGLE_CLIENT_*`, `RESEND_API_KEY`); server refuses to start without `SESSION_SECRET`. |
| 11 | **Auth-event blindness** | Login success/failure, reset, invite, claim, and OAuth outcomes are logged with IP (`[auth] ...`). |

## Residual risks / accepted items
- **OAuth providers**: only Google is enabled (Apple/Microsoft deliberately skipped).
  Google client id/secret must be set in prod for the Google button to appear.
- **Dependency advisories**: `xlsx` (high, no upstream fix) is used by ERP sync only;
  `yaml` (moderate, transitive). Tracked, not exploitable through the auth surface.
  Re-run `npm audit` periodically; pin/replace `xlsx` if an alternative emerges.
- **No 2FA / passkeys** — out of scope, candidate future work.
- **New-org bootstrap** is out-of-band (invite-only by decision); first admin of a new
  org is provisioned by a platform path, not self-signup.

## Suggested pre-deploy CI check
Add a CI job (e.g. GitHub Actions) that fails the build on any of:

1. **Type safety** — `npx tsc --noEmit` must pass (catches broken auth wiring).
2. **Secret hygiene** — fail if required secrets are referenced but a fallback/default
   is hardcoded; scan the diff for accidental secret literals (e.g. `gitleaks`).
3. **Dependency audit** — `npm audit --omit=dev --audit-level=high` (review/allowlist
   the known `xlsx` advisory so new high/critical issues still fail the build).
4. **Authz smoke tests** — run the auth/route test suite asserting that protected
   endpoints reject unauthenticated requests (401) and cross-org access (403), and that
   login/reset endpoints return rate-limit headers.

Example workflow step:

```yaml
- run: npx tsc --noEmit
- run: npm audit --omit=dev --audit-level=high || true   # gate on new advisories
- run: node --import tsx --test server/**/*.test.ts
```
