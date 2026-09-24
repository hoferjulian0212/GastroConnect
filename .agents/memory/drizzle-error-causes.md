---
name: Drizzle database error causes
description: PostgreSQL exception metadata is nested after the Drizzle 0.45 upgrade
---

Rule: In Drizzle ORM 0.45.3, database query failures can be wrapped in a Drizzle query error, with the original PostgreSQL exception exposed through `cause`. Conflict handling must unwrap causes before checking SQLSTATE (`code`) or constraint names.

**Why:** After the ORM update, a duplicate checkout still failed at PostgreSQL's unique constraint, but code and tests that inspected only the outer error stopped recognizing it. This affected idempotency retries and can affect any duplicate-key recovery path.

**How to apply:** For server-side handling of unique violations, unwrap nested causes before inspecting `code`, `constraint`, or other PostgreSQL fields. Keep a regression test for idempotency/retry behavior when upgrading Drizzle.