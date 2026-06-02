---
name: Chat attachments & drag-drop
description: Reusable chat file-upload flow and drag-and-drop overlay
---
- `client/src/components/ChatAttachment.tsx` exports `validateChatFile`, `uploadChatFile`, and `ChatDropZone` (drag overlay), plus AttachmentPopover/AttachmentMessageCard.
- Upload flow: POST `/api/attachments/request-url` -> PUT to presigned URL (must check `res.ok`) -> `onSendAttachment(JSON)`. Validation: 10MB max, mime pdf/jpg/png/webp/docx.
- ChatDropZone wraps the active-conversation branch in both `pages/restaurant/Inbox.tsx` and `pages/supplier/Inbox.tsx`; it's bilingual via a `lang` prop and ignores drops while uploading.
- **Why:** the upload logic was duplicated; centralizing it keeps the popover and drop-zone in sync. Any new chat upload surface should reuse these helpers.
