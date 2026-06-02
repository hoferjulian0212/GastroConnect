---
name: Global command bar & search
description: Where the command-bar / global search lives and how to extend it
---
- `client/src/components/GlobalSearch.tsx` is a full cmdk command bar: Cmd/Ctrl+K toggles it, `openGlobalSearch()` fires a `gc:open-search` CustomEvent, and `DesktopSearchButton` is the header trigger. Mounted in `App.tsx`.
- Backend search is `/api/search` in `server/routes.ts` (role-scoped; returns orders/products/partners/messages/complaints/documents, PER=5).
- When query < 2 chars it shows a role-aware "Aktionen/Azioni" quick-nav group instead of a hint.
- **How to apply:** add new searchable types or quick actions here rather than building a second palette.
