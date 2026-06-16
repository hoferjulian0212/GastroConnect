---
name: Business self-signup & email verification
description: Activation-state model for self-signup orgs/members and the migration/backfill rules that protect the email-verification gate.
---

# Business self-signup activation model

Two org-creation paths with deliberately different activation state:
- `createUser()` — used ONLY by demo seed / admin tooling. Defaults `users.verifiedAt = now()`, so these orgs are active immediately and stay visible under `getUsersByRole` (which filters `verifiedAt IS NOT NULL`).
- `createBusinessSignup()` — real public self-signup. Inserts the org row directly with `verifiedAt` null (pending) and an admin member with `passwordHash` set but `emailVerifiedAt` null. The owner stays gated until they click the email verification link.

Login gate: `/api/auth/login` returns `403 email_unverified` when `member.passwordHash` is set but `member.emailVerifiedAt` is null. Invited/claimed/reset members always get `emailVerifiedAt` set alongside their password, so only pending self-signup owners are ever blocked.

**Why:** the verifiedAt listing filter would silently empty `/api/suppliers` etc. for any org created without verifiedAt — seeded orgs must be auto-verified while real signups must not be.
**How to apply:** never route real signups through `createUser`; never auto-set `verifiedAt`/`emailVerifiedAt` on the self-signup path.

# Migration / backfill rule

The email-verification schema ships as an always-run startup step (`runEmailVerificationMigration` in routes boot before seed), NOT a manual db:push:
- DDL is idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, indexes) — safe every boot.
- The DML backfill (mark legacy orgs/members verified) MUST run exactly once, gated by an `app_migrations` marker row. Column-existence is NOT a valid "first run" signal because db:push can create the column before the server boots.

**Why:** a backfill that runs on every boot will auto-verify still-pending self-signups after any restart, silently bypassing the email gate. Putting it inside `seedData` is also wrong — seed early-returns on the demo sentinel, so existing DBs never get backfilled.

# Password reset proves email ownership

`/api/auth/password-reset/confirm` also calls `markOrganizationVerified` when the member was still pending (captured as `wasPending` before the update). A reset link proves the same email ownership as the verify link, so completing it fully activates the org instead of leaving a half-verified state (member usable but org hidden from listings).
