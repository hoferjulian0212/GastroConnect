---
name: Browser print-only view pattern
description: How to print one specific view (bypassing the SPA shell, Radix dialogs, toasts) on this client.
---

# Printing a single view via the browser print dialog

To trigger `window.print()` and have ONLY a custom layout appear (no app chrome,
no open dialog, no toasts):

1. Render the print layout with `createPortal(<PrintView/>, document.body)` so it
   becomes a **direct child of `<body>`** (give it class `print-report`).
2. In `index.css`, hide it on screen (`.print-report { display: none }`) and in
   `@media print` do:
   ```css
   body > * { display: none !important; }
   body > .print-report { display: block; }
   ```

**Why:** Radix Dialog/Toast portals also mount as direct children of `<body>`
(outside `#root`), so hiding only `#root` is not enough. Using `display:none`
(not `visibility:hidden`) on the siblings is required — `visibility:hidden`
elements still occupy page space and produce blank printed pages.

**How to apply:** Reuse for any "print this one report/receipt/view" feature.
When triggering print after mounting the portal, wait for paint (double rAF) then
call `window.print()`, and tear the portal down on the `afterprint` event (with a
long timeout fallback) rather than a fixed delay — some WebKit browsers run
`window.print()` non-blocking, so unmounting too early yields a blank printout.
