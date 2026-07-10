---
name: Member credential sanitization on API joins
description: Any API payload that joins the members table must strip credential/auth columns before serialization.
---

Rule: whenever a server payload embeds a `members` row (driver on delivery
assignments, sender on internal chat messages, driver on location pings, team
listings), strip `passwordHash`, `emailVerifiedAt`, and `lastLoginAt` before
`res.json`. Use the `SafeMember` type (shared schema) for joined view types so
tsc enforces it.

**Why:** two endpoints shipped leaking bcrypt hashes because Drizzle joins
return full rows and `res.json` serializes everything; nothing failed loudly.

**How to apply:** when adding any new join on `members`, sanitize in the
storage layer (destructure-omit) and type the joined view with `SafeMember`,
not `Member`. Grep API responses for `passwordHash` during verification.
