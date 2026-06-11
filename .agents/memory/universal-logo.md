---
name: Universal logo lockup
description: The shared GastroConnect logo component, its fixed ratio, and the header-sizing constraint that must not regress.
---

# Universal logo lockup

There is one shared logo component for the GastroConnect icon + wordmark lockup
(`client/src/components/Logo.tsx`). Use it for every horizontal logo placement
(app header, landing nav / mobile sheet / footer, login). Do NOT hand-roll
`<img> + <span>` lockups, and do NOT reintroduce `@assets/logo_fat.png` — the
"fat" asset was the source of the inconsistent/too-thick logo and was removed in
favor of `logo_no_bg.png` everywhere.

**Fixed ratio (taken from the dark app header):** icon = `3.556em`, gap =
`-0.222em`, wordmark = `1em`, `font-bold`, `tracking-tight`. Everything is driven
by a single fluid `font-size` (per-placement `clamp()` with a `vw` term) so the
icon, gap and text scale together on resize/zoom and shrink (not thicken) when
zoomed in.

**Why:** the user wanted the logo proportions identical everywhere and to scale
fluidly; the em-on-one-font-size design is what keeps all parts locked together.

**Header-sizing constraint (do not regress):** the app header is an
overflow-sensitive single no-wrap row (see `desktop-header-responsive.md`). The
`size="header"` preset is tuned so the icon stays ~36px below ~1080px, ~48px
around 1280px, and only reaches the canonical 64px near the 2xl breakpoint, where
the wordmark first appears (`textClassName="hidden 2xl:inline"`). If you change
the header logo size, keep the icon ≤~48px until 2xl and keep the wordmark hidden
until 2xl, or you risk the header right-cluster clipping/overlap again.

**Variant ↔ background pairing:** `variant="light"` (white via `brightness-0
invert` + `text-white`) on dark backgrounds (app header, login `#161921`);
`variant="dark"` (`dark:invert` + `text-foreground`) on light surfaces (landing).

The vertical splash logos (App member-select icon-only, App loading splash,
About hero image) are intentionally left as-is — they are a different vertical
composition, already use the slim asset, and are not the horizontal lockup.
