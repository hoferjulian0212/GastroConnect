---
name: Dashboard views cross-device sync
description: How desktop/mobile dashboard "Views" share state and how default-reset must behave
---

# Dashboard "Views/Ansichten" cross-device model

Desktop (`DraggableCardGrid`) and mobile (`MobileDashboardViewSelector` + `use-dashboard-templates`)
share the SAME persisted dashboard state via server endpoints `/api/users/:id/dashboard-{layout,widgets,templates}/:role`
(mirrored into localStorage). Server wins on load.

**Rule:** When resetting to the standard dashboard ("Standardansicht") on mobile, you MUST persist
the default widget set + an empty layout — not just clear `activeId`. Otherwise a device that applied
a view leaves the view's widgets/layout on the server, and the other device loads that view's layout
while showing the "Standardansicht" label (state mismatch).

**Why it works:** desktop reconciles server state against its actual sections —
`reconcileEnabledIds` force-enables required (non-optional) sections, and `reconcileLayout([])`
rebuilds default order for the effective (enabled) sections. So mobile only needs to send the
optional `defaultEnabled:true` widget ids (`getDefaultViewWidgets(role)` in `dashboard-builtin-views.ts`)
with an empty layout.

**Drift risk:** `getDefaultViewWidgets` hardcodes the default-on optional widget ids per role and must
stay in sync with the optional `defaultEnabled: true` sections defined inline in the desktop
`pages/{restaurant,supplier}/Home.tsx`. Built-in views are code-defined (never persisted server-side),
non-editable/non-deletable; their layouts may reference required section ids (e.g. `action-required`,
`upcoming-deliveries`) which are force-enabled and not listed in the view's `widgets` array.
