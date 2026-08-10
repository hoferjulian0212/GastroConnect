---
name: Vaul drawer body pointer-events lock
description: Why mobile taps can die app-wide after closing a vaul Drawer, and the guarded cleanup pattern in the shared drawer component.
---

**Rule:** The shared Drawer (vaul) must keep `shouldScaleBackground=false` (no `[data-vaul-drawer-wrapper]` exists in the app) and must release `body.style.pointerEvents` via the open-drawer registry + composed `onOpenChange` in `client/src/components/ui/drawer.tsx`.

**Why:** On iOS, vaul could strand `pointer-events: none` on `<body>` after a drawer closed, making the entire app — including the floating bottom nav — unresponsive to taps. Warehouse (Lager) users were hit hardest because their home funnels into the InventoryRiskWizard drawer; reported as "can't switch pages on mobile".

**How to apply:** Never clear body pointer-events unconditionally — another modal (Radix dialog) may own the lock. The cleanup only runs when the registry says no drawer is open AND no `[role="dialog"][data-state="open"]` exists, after the ~500ms close animation. Works for controlled and uncontrolled drawers (composed onOpenChange + unmount cleanup).
