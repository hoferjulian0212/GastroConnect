---
name: Mobile full-screen inbox chat
description: How the mobile inbox chat becomes full-screen and which files must stay coordinated
---

When a conversation is open on mobile the chat fills the whole viewport. This is
driven by the `isInChat` flag from `ChatContext` (set by each Inbox via
`setIsInChat(selectedConversation !== null)`), gated across THREE coordinated places:

- `App.tsx` AppLayout: when `isInChat`, the scroll container drops mobile page
  padding (`px-0 pt-0`, desktop `md:px-6 md:pt-6`), the mobile top bar hides, and
  the mobile bottom nav hides (`!isDetailPage && !isInChat`).
- both `pages/{restaurant,supplier}/Inbox.tsx`: the `<Card>` goes full-bleed on
  mobile when a conversation is selected (`border-0 rounded-none shadow-none`,
  restored at `md:`).

**Why:** the floating message-input pill (`.mobile-message-pill`, margin-bottom
safe-area) and the floating bottom nav both sit at the viewport bottom — leaving
both visible makes them overlap and cramps the chat. Hiding the nav in chat fixes it.

**How to apply:** because the page top bar + top padding are removed in chat, the
chat header carries its own `pt-[calc(env(safe-area-inset-top,0px)+0.875rem)]` so it
clears the notch. Keep restaurant + supplier inboxes mirrored (replit.md convention).
