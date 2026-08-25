---
name: Delivery notification outbox
description: Delivery lifecycle updates use a durable external-notification retry path separate from the in-app conversation story.
---

The in-app delivery story must be written independently of push and email delivery. External channels are retried per lifecycle event and per channel, using an idempotent event key so recovery never creates a second chat card.

**Why:** A provider can fail after the driver status and conversation update have succeeded; coupling them makes clients retry successful status changes and duplicates the story.

**How to apply:** When adding restaurant-facing delivery events, persist the chat event first, enqueue only failed external channels, and keep retry records cascading with their order and organization records.