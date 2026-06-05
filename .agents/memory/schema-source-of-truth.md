---
name: Schema source of truth (db:push, not migrations)
description: How GastroConnect applies DB schema changes — push, not migration files.
---

# Schema changes use `drizzle-kit push`, NOT migration files

The only db script is `db:push` (`drizzle-kit push`). `migrations/` exists but is **stale**:
it stops at `0008`, while `shared/schema.ts` has drifted far ahead (many ERP/PMS tables,
extra columns) that were applied via `db:push` and never written as migration files.

**Why:** Running `drizzle-kit generate` here produces a giant catch-up migration that tries to
`CREATE TYPE`/`CREATE TABLE` for objects that already exist (no `IF NOT EXISTS`). Applying that
via `drizzle-kit migrate` would fail on the first existing object. So adding new migration files
is risky, not helpful.

**How to apply:** For any schema change, edit `shared/schema.ts` then run `npm run db:push`.
Do NOT generate/commit migration files. If a code reviewer flags "missing migration", this is the
reason it's intentional for this project.
