---
name: Command bar already exists
description: Avoid rebuilding the global search / command palette
---
A full global command palette already ships in the app (cmdk-based, Cmd/Ctrl+K, role-scoped backend search). It also exposes a programmatic open helper and a header trigger button.

**Why:** it's easy to miss and accidentally build a parallel palette. New searchable entities or quick actions belong in the existing component, not a new one.

**How to apply:** before adding any search/command/shortcut-launcher UI, grep for the existing GlobalSearch component and `/api/search`, and extend those.
