---
name: Checkout deployment migrations
description: Why checkout schema changes use a dedicated deployment ledger rather than replaying legacy Drizzle migrations.
---

Checkout schema changes must run through the dedicated, versioned deployment
ledger after a read-only duplicate preflight; they must never be added back to
ordinary application boot or a generic replay of all historical Drizzle files.

**Why:** The established database was created through a mix of `db:push` and
boot-time DDL and has no reliable Drizzle migration baseline. Replaying the
historical migration directory can fail before reaching a new checkout change.
Checkout uniqueness guards also protect order and notification business history,
so duplicate records require an explicit reconciliation decision rather than
automatic deletion.

**How to apply:** Add future checkout migrations to the deployment-runner
sequence with a new immutable version name. Preflight legacy duplicate business
artifacts, use bounded lock/statement timeouts, and verify PostgreSQL catalog
metadata (table, ordered columns, uniqueness, and partial predicate) before
recording the version. Keep rollback validation version-aware: a pre-migration
release should use its own checks, not a verifier that requires newer schema.