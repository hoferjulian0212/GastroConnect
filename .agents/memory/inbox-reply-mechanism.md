---
name: Inbox reply / quote mechanism
description: How chat replies (quote-a-message) are stored and rendered in the inbox — no schema column involved.
---

Replies (quoting a message) in the inbox are NOT a database column. There is no
`replyToId` on the `messages` table. Instead, when a user replies, the new
message's `content` is a JSON string: `{ refType, refId, refLabel, refPreview, text }`.
The same content-JSON pattern also carries order/complaint attach refs
(`refType: "order" | "complaint" | "reply"`).

**Why:** The schema keeps `content` as free text; the team layered reply/attach
metadata into it rather than migrating the table. A future agent "fixing" this by
adding a `replyToId` FK would duplicate existing behavior and break the renderers
that `JSON.parse(message.content)` to detect `refType`.

**How to apply:** To add/extend reply-like features, encode in the content JSON and
update the bubble renderer's `refData` parse block in BOTH inboxes. Replying is
mirror-split across `client/src/pages/restaurant/Inbox.tsx` and
`client/src/pages/supplier/Inbox.tsx` (duplicated, not shared). Mobile
swipe-right-to-reply uses `SwipeToReply` + `getMessageReplyPreview`; desktop uses a
hover Reply button on text bubbles only.
