---
name: Mobile fixed bottom-bar content clearance
description: How to keep mobile bottom bars from covering content — padding reservation for the floating tab bar & cart checkout, and in-flow sticky for detail-page action bars
---

# Mobile fixed bottom-bar clearance

Reserve bottom space for fixed/floating mobile bottom bars with a **pure-CSS**
variable that includes `env(safe-area-inset-bottom)`, not a JS-measured value
with a hardcoded px fallback.

**Why:** A prior fix measured the detail-page action bar height via
`useStickyActionBarHeight` (useEffect + ResizeObserver) and set
`--mobile-action-bar-h` with a hardcoded 112px fallback. The bar's true height is
`calc(env(safe-area-inset-bottom) + ~73px)`. On phones with a large bottom inset
(>40px, some Android gesture-nav), the bar exceeds 112px; before the JS ran, the
fallback under-reserved and content was hidden — an intermittent, device-specific
overlap that is hard to reproduce on desktop emulation.

**How to apply:**
- Global pattern lives in `client/src/index.css` `:root`:
  `--mobile-cta-offset`/`--mobile-bottom-pad` (floating tab bar).
- Apply on the scrolling page root as `pb-[var(--…-bottom-pad)] md:!pb-0`.
- The bar's real height must match its `--…-cta-h` var; if the bar's structure
  changes (extra row, taller buttons), update the var. Comments by each bar note this.
- `min-h-dvh` + border-box bottom padding on the root still reserves scroll space
  correctly — the padding is not absorbed by min-height.

**Detail-page action bars (OrderDetail / ComplaintDetail) use a different,
more robust pattern — in-flow `sticky bottom-0`, NOT padding reservation:**
- The bar is the last child of the page scroll content; the page root is
  `min-h-dvh flex flex-col` and the content wrapper is `flex-1` so the bar is
  pushed to the screen bottom on short pages and pinned to the viewport bottom
  while scrolling on long pages. The bar carries `md:hidden sticky bottom-0 z-40 mt-auto`.
- **Why:** the pure-CSS padding reservation (`--mobile-detail-bottom-pad`) failed
  on the user's iOS in-app webview: the `position:fixed` bar's bottom edge and the
  `dvh`-sized inner scroll area's bottom edge didn't line up, so the razor-thin
  (~16px) reserve was eaten and the last content stayed hidden. A sticky in-flow
  bar occupies real layout space, so content above it can NEVER be covered,
  regardless of device/safe-area/dvh mismatch. The old detail-bar CSS vars were removed.
- `restaurant/Cart.tsx` now uses the pure-CSS `--mobile-cart-bottom-pad`
  (`= --mobile-cta-offset + ~112px`) too. Its `stickyBarRef` was never actually
  attached, so the old JS hook only ever set the 112px fallback. The keyboard-lift
  hook `useMobileKeyboardInset` is kept, but note `--mobile-keyboard-inset` is not
  consumed by any CSS — the keyboard-lift may be inert.
