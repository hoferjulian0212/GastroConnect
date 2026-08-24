---
name: Checkout delivery outbox
description: Durable supplier order-message and notification delivery after checkout.
---

Checkout completion must require a persisted client idempotency identity and commit the order, initial status history, stock reservation, and a pending supplier-delivery outbox record in one transaction. Delivery workers and inline delivery must use an expiring claim token; completion and failure updates must require that token.

**Why:** An order may commit while the process crashes or an external sender fails. Retrying from the client must replay the order rather than duplicate it, and overlapping or expired delivery attempts must not send duplicate supplier-facing order cards, notifications, pushes, or emails.

**How to apply:** Keep cart and direct checkout on the same transactional outbox path. Persist client checkout keys across reloads but fingerprint them so changed baskets get new identities. Preserve the order-card and `new_order` notification uniqueness guarantees, only dispatch external channels when the notification insert actually created a record, and surface terminal outbox failures rather than retrying them invisibly forever.