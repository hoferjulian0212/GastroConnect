---
name: seedData wipe FK ordering
description: Why server/storage.ts seedData() wipe order must track FK references to members/users
---

# seedData() wipe ordering

The demo seed (`DatabaseStorage.seedData()` in `server/storage.ts`) wipes all tables
on a `DEMO_VERSION` bump before reseeding. Deletes must run in FK-safe order:
a referenced table can only be deleted after every table that references it.

**Why:** `members` is referenced by `messages.sender_member_id`,
`orders.created_by_member_id`, `orderStatusHistory.changed_by_member_id`,
`complaintStatusHistory.changed_by_member_id`, and `vertreterAssignments.member_id`.
Deleting `members` too early throws `update or delete ... violates foreign key
constraint` (Postgres 23503) **on server startup**, so the whole app fails to boot.

**How to apply:** Whenever you add a new column that FKs to an existing seeded
table (especially `members` or `users`), update the wipe block in lockstep so the
new child table is deleted *before* its parent. Bumping `DEMO_VERSION` re-triggers
the wipe, so this surfaces immediately on the next restart.
