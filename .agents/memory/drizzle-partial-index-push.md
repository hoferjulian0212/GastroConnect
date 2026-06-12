---
name: Drizzle partial-index WHERE not diffed by push
description: drizzle-kit push silently ignores changes to a partial index's WHERE predicate on an existing DB
---

`drizzle-kit push` does NOT diff/apply changes to the `WHERE` predicate of an
existing partial index. If you edit the `.where(...)` of a `uniqueIndex`/`index`
in `schema.ts` for an index that already exists in the DB, push reports
"Changes applied" but the live predicate stays the old one.

**Why:** drizzle's push diff engine matches partial indexes by name/columns and
does not compare the predicate expression, so predicate-only changes look like a
no-op.

**How to apply:** After changing a partial-index predicate, verify with
`SELECT indexdef FROM pg_indexes WHERE indexname='<name>'`. If stale, manually
`DROP INDEX IF EXISTS <name>` then `CREATE ... WHERE (<new predicate>)` (safe,
non-destructive — index only). Example in this repo:
`uq_documents_delivery_note_per_order` must be
`WHERE (type='delivery_note' AND is_upload=false)` so uploaded delivery-note
docs aren't blocked by an existing generated note.
