---
name: Home dashboard widgets & order-templates placement
description: How the restaurant/supplier home dashboards are structured, and why a widget can look like it's "in the black header"
---

# Home dashboard structure (both roles)

Both `restaurant/Home.tsx` and `supplier/Home.tsx` render the SAME shell:
- A dark hero (`bg-[#161921]`) via `HeroPortal` containing ONLY the page title + 4 KPI cards. On mobile `HeroPortal` wraps this in a rounded black box (the "black header"). No feature widgets ever live inside the hero.
- Below it, a `DraggableCardGrid` of body widgets.

**Key:** `DraggableCardGrid` renders widgets in a per-account order saved in
`localStorage` (`dashboard-grid-<userId>-<role>`, plus widgets/templates keys).
So when a user reports a widget is "in the black header" on mobile, it is almost
always that they dragged that widget to the TOP of their saved layout, so it sits
directly under the dark hero. It is a saved-layout artifact, not code — changing the
default section order in the array will NOT move it for users who already have a saved
layout (reconcileLayout preserves their order and only appends new sections).

# Mobile home is a SEPARATE page with its own hardcoded dark hero

On mobile (`md:hidden`) the home is rendered by `pages/<role>/HomeMobile.tsx`, NOT
the desktop `Home.tsx` hero. HomeMobile builds its own dark hero box
(`bg-[#161921] ... rounded-3xl`) with greeting + lead line. Any control placed
inside that JSX block literally sits "in the black header" on mobile — e.g. the
dashboard view selector (`MobileDashboardViewSelector`, the "Standardansicht /
Ansichten" dropdown) used to live inside it.

**Why this matters:** unlike the DraggableCardGrid templates widget (a saved-layout
artifact), a control in the HomeMobile hero is a real hardcoded placement — to get
it out of the black header you move the JSX below the hero `</div>`. The selector is
styled white-on-dark, so when moved onto the page background it must be restyled to
theme tokens (`border-border bg-muted/60 text-foreground`). Mirror the move in BOTH
`restaurant/HomeMobile.tsx` and `supplier/HomeMobile.tsx`.

# Order templates ("Bestellvorlagen") is restaurant-only

`order-templates` is a widget that exists ONLY in `restaurant/Home.tsx` (4th by
default). `supplier/Home.tsx` has NO templates feature. So the mirror convention does
NOT apply here — there is nothing to change on the supplier side for templates.

**Why this matters:** the user repeatedly asked to make templates "subtle / out of the
black header on mobile" and to "do it on both roles." The position-independent fix is to
make the widget itself visually subtle (compact pill chips + a small muted heading on
mobile, `md:` keeps the full desktop look) — that works even when the user has dragged it
to the top. There is no supplier equivalent to mirror.
