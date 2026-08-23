---
name: Registration approval gate
description: Durable separation between Clerk email verification and GastroConnect platform approval for public business registrations.
---

Public business registration must complete Clerk email verification before creating the organization, but email verification alone must not grant dashboard or protected API access. The organization approval state is independent and can be pending, approved, or denied; invited, seeded, and legacy organizations remain approved.

**Why:** GastroConnect needs to review organization details after verifying ownership of the email address, while preserving the existing invitation and demo account behavior.

**How to apply:** Resolve public self-registrations through the approval state on every request. Keep the pending/denied response available to the signed-in client so it can show a waiting or rejection screen, and use the platform-admin approval action to transition the organization to approved.