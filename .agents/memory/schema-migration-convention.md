---
name: Schema migration convention
description: How DB schema changes are applied in this repo (no migration files)
---

Schema changes are applied with `npm run db:push --force` (drizzle-kit push). There are
NO hand-written migration SQL files / journal that need updating for new tables.

**Why:** The project intentionally uses drizzle-kit push against the dev/prod DB rather
than a versioned migrations folder. Adding a table means: edit `shared/schema.ts`, run
`npm run db:push --force`, done.

**How to apply:** When a reviewer (e.g. architect) flags a "missing migration" for a new
table, treat it as a false positive for this repo — verify the table was pushed via
db:push instead of looking for a migration file. Do NOT introduce a migrations folder.
