---
name: Clerk Auth Migration
description: Key decisions and gotchas from migrating GastroConnect from custom email/password auth to Replit-managed Clerk.
---

## req.auth collision with @clerk/express

@clerk/express sets req.auth to its own ClerkAuthObject on every request (even unauthenticated ones). Our custom AuthContext also uses req.auth. The collision means:
- `if (!req.auth)` is ALWAYS truthy (Clerk's object is there even without a session)
- `req.auth.member` is undefined (Clerk's object has no member field) → sanitizeMember(undefined) throws 500

**Fix in loadAuth (server/auth/middleware.ts)**:
```ts
const clerkAuth = getAuth(req); // reads Clerk's internal session
(req as any).auth = undefined;  // MUST reset before setting our AuthContext
```
Then set req.auth = AuthContext only when member+org are found.

**Why:** getAuth() reads from req.auth (Clerk's storage); after reading, we overwrite it with our AuthContext or leave it undefined. Without this reset, unauthenticated requests still have req.auth truthy (Clerk's empty object).

**How to apply:** Any future change to loadAuth must preserve the `(req as any).auth = undefined` line that immediately follows the getAuth() call.

### Route-level Clerk identity

Routes that need verified Clerk identity after `loadAuth` has built the application context must use the email captured on the request during that initial `getAuth()` read, not call `getAuth()` again.

**Why:** application auth deliberately replaces Clerk's `req.auth` object. A second Clerk lookup after that replacement can lose the verified identity, which breaks the public-registration completion handoff with a false unauthenticated response.

**How to apply:** Capture the normalized email before resetting `req.auth`; use that captured value for routes that legitimately need Clerk identity while no approved application AuthContext exists (such as registration completion and pending-status lookup).

## Identity bridge
- sessionClaims.email → lower(members.email) lookup via getMemberByEmail
- No JIT auto-create; unknown Clerk email → req.auth stays undefined → "Kein Zugang" screen (isClerkSignedInButUnauthorized in UserContext)
- isClerkSignedInButUnauthorized: clerkLoaded && isSignedIn && !isAuthenticated && !meLoading

## Session coexistence
- Platform admin panel (/admin) still uses express-session (req.session.adminId / impersonatedMemberId)
- Business users: Clerk only — no express-session for member identity
- /api routes mount BOTH clerkMiddleware (global) and createSessionMiddleware (for admin sessions)
- Impersonation (admin acts as member): still express-session based; loadAuth checks req.session.adminId + impersonatedMemberId first

## Tailwind v3 compatibility
- No cssLayerName:"clerk" in ClerkProvider appearance (would need Tailwind v4)
- No @layer changes needed — Clerk styles don't conflict with existing globals
