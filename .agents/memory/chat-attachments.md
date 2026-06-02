---
name: Centralized chat uploads
description: Reuse the shared chat upload helpers; pitfalls to avoid
---
Chat file uploads are centralized in `client/src/components/ChatAttachment.tsx` (shared validate + upload helpers plus a drag-drop overlay). Both restaurant and supplier inboxes consume them.

**Why:** the upload + validation logic was duplicated and drifted; centralizing keeps the attach button and drag-drop in sync. A presigned PUT can succeed at the request-url step but fail on the actual upload — always check the PUT response before posting the attachment message, or chat shows a file that doesn't exist.

**How to apply:** any new chat attach surface should call the shared helpers rather than re-implementing the presigned-URL flow.
