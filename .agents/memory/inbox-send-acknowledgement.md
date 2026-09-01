---
name: Inbox send acknowledgement
description: Keeps persisted chat messages visible even when downstream notifications fail.
---

Once an Inbox message has been persisted, the send endpoint must return success even if its downstream push or notification work fails.

**Why:** Returning an error after persistence makes the composer discard the recording while the client skips cache refresh, so a successfully saved voice message appears to vanish.

**How to apply:** Treat notification delivery as a best-effort side effect or durable outbox operation. Only message validation or persistence failures may fail the send request.