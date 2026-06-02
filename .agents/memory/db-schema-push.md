---
name: DB schema changes
description: How schema changes reach the database in this repo
---
Schema lives in `shared/schema.ts` (Drizzle). There are NO migration files; the
project uses `drizzle-kit push`. After editing the schema, apply with:
`npm run db:push -- --force` (non-interactive). Columns with a default are safe.
