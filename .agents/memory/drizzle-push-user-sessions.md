---
name: drizzle push drops user_sessions
description: Why schema changes here are applied via manual SQL, not always drizzle-kit push
---

`npm run db:push` (drizzle-kit) does NOT know about the `user_sessions` table
(the connect-pg-simple session store), because it is not in `shared/schema.ts`.
When you add any new table, drizzle-kit may interpret it as a *rename* of
`user_sessions` and, if you pick "create table", then proposes to DROP
`user_sessions` ("data-loss" prompt) — which would destroy all live sessions.

**Rule:** when adding a table/column and db:push proposes dropping
`user_sessions`, ABORT. Apply the DDL via direct SQL instead (executeSql in the
code sandbox), using `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` to stay
idempotent, then run any backfill UPDATEs the same way.

**Why:** the session table is intentionally outside the Drizzle schema, so
drizzle-kit always wants to reconcile it away. Manual SQL is the safe path.

**How to apply:** for new schema in this repo, prefer manual `ALTER TABLE ... ADD
COLUMN IF NOT EXISTS` + `CREATE TABLE IF NOT EXISTS` + indexes over db:push
whenever the push diff touches `user_sessions`.
