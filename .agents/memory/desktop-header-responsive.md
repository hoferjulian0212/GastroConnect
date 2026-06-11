---
name: Desktop header responsive disclosure
description: How the desktop top header avoids overlap/clipping across widths and zoom; what must stay consistent when adding header controls.
---

# Desktop header responsive disclosure

The desktop top header (rendered in `client/src/App.tsx`, inside the
`bg-[#161921]` rounded shell with `overflow-hidden`) packs a logo+wordmark,
the center `HeaderNav`, and a right-side action cluster (search, RoleSwitcher,
AccountSwitcher, language toggle, cart, help, notifications, profile) into one
non-wrapping flex row. Because the shell is `overflow-hidden`, anything that
doesn't fit gets clipped/overlapped — this previously happened at intermediate
desktop widths and under browser zoom (zoom shrinks the CSS viewport, so it
hits the same Tailwind breakpoints).

## The rule
Header controls use **progressive disclosure** by breakpoint, not fixed sizing:
- `md` (768–1023): smallest footprint; RoleSwitcher + AccountSwitcher wrappers
  hidden (`hidden lg:block`); icon/avatar-only controls; tightest gaps/padding.
- `lg`/`xl`: switchers shown but icon/avatar-compact.
- `2xl`: full text restored — logo wordmark, RoleSwitcher "Betrieb/Händler"
  labels, AccountSwitcher name+chevron, GlobalSearch "Suchen…"+⌘K.

The **center nav is the compression buffer**: `HeaderNav` is `min-w-0
overflow-x-auto scrollbar-hide` (NOT `shrink-0`). Under extreme cramping the
nav scrolls horizontally instead of pushing the right cluster (notifications/
profile) off-screen. Nav dropdown menus render via a portal to `document.body`,
so the nav's `overflow-x-auto` does not clip them.

**Why:** the right-side cluster (notifications/profile) is more important to keep
visible than the last nav link; making all three regions `shrink-0` is what
caused clipping.

## How to apply
- Adding a new right-side header control: gate verbose/text parts to `2xl`,
  keep an icon-only form at `lg`/`xl`, and consider hiding it at `md`. Re-check
  that md/lg/xl still fit (count widths) — the row has little slack at `md`.
- AccountSwitcher compact-mode classes are scoped to `compact` so the
  non-compact usage in restaurant/supplier `Settings.tsx` is unaffected; keep
  that scoping. RoleSwitcher is header-only, safe to restyle freely.
- `scrollbar-hide` utility lives in `client/src/index.css`.
