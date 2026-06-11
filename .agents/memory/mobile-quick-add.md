---
name: Mobile quick-add bottom-sheet
description: How the restaurant catalog quick-add adapts to mobile vs desktop
---

# Mobile quick-add (restaurant Catalog)

`QuickAddBar` in `client/src/pages/restaurant/Catalog.tsx` is the per-product "+" control.

- Desktop (`hidden md:block`): inline expand-in-place stepper (-/value/+/check).
- Mobile (`md:hidden`): "+" opens a vaul `Drawer` bottom-sheet for amount selection
  (product image/name/supplier, promo-aware unit price, large h-14 stepper, MOQ note,
  full-width "add to cart" CTA with line total). `addMutation.onSuccess` closes the
  sheet and shows the 1.5s green-check feedback.

**Why:** the tiny inline stepper was not touch-friendly on mobile; user wanted a fast
e-commerce amount picker. Desktop was fine and must stay unchanged.

**How to apply:** the mobile cart drawer (same file, ~lines 246-312) is the canonical
Drawer style reference (DrawerContent `md:hidden`, full-width h-12 rounded-full CTA,
safe-area padding). This page uses inline `lang === "de" ? ... : ...` strings, not
translations.ts keys. Ordering/cart is restaurant-only — no supplier mirror.
