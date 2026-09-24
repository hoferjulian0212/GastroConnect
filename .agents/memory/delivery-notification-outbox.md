---
name: Delivery notification outbox
description: Delivery lifecycle updates use a durable external-notification retry path separate from the in-app conversation story.
---

The in-app delivery story must be written independently of push and email delivery. External channels are retried per lifecycle event and per channel, using an idempotent event key so recovery never creates a second chat card.

For terminal order transitions that notify both organizations, write the in-app notification rows in the same transaction as the order status and history, and give each recipient a stable event deduplication key. A retry of an already-terminal action should ensure either recipient's missing row without repeating the transition.

**Why:** A provider can fail after the driver status and conversation update have succeeded, and separate state/notification commits can leave a terminal order with one organization uninformed.

**How to apply:** When adding restaurant-facing delivery events, persist the chat event first, enqueue only failed external channels, and keep retry records cascading with their order and organization records. For terminal order status fan-out, persist in-app notifications atomically and repair them idempotently on request replay.