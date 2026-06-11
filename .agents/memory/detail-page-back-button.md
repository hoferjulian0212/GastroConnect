---
name: Detail page back button placement
description: Convention for where the "Zurück/Indietro" back button lives on full-page detail views
---

# Detail page back button placement

On the full-page detail views (restaurant ProductDetail, shared OrderDetail, shared
ComplaintDetail), the page-level back button must render **outside/below the dark
`bg-[#161921]` hero**, in the same position on both mobile and desktop. It must NOT be
placed inside the dark hero card.

**Why:** Users found a back button rendered inside the black header (mobile ProductDetail)
visually wrong and inconsistent with the desktop placement, which already sat below the hero.
The fix unified all three pages to a single `data-testid="button-back"` shown on all
viewports (`block`, not `hidden md:block`).

**How to apply:** When adding/editing a detail page, keep one back control below the hero,
styled `text-muted-foreground` like the others. Don't reintroduce an in-hero mobile back
(`button-back-mobile`). The back row's horizontal padding should match that page's own
content padding (`px-3` for ProductDetail, `px-4` for Order/Complaint).
