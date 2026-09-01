---
name: Voice message storage fallback
description: Documents the runtime constraint and fallback for Inbox voice messages.
---

The configured Object Storage signer can be unavailable in a Replit runtime, returning 401 or lacking signing credentials. Voice delivery must not depend on that presigned upload path.

**Why:** Voice recording otherwise succeeds locally, but sending fails before persistence and the recording disappears from the composer.

**How to apply:** Keep the authenticated raw voice endpoint bounded by content type and body size, and persist only the supported audio formats needed by MediaRecorder. Prefer object storage again when the platform signer is healthy, but do not route voice through the failing generic presigner.