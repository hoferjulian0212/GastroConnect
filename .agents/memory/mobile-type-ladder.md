---
name: Mobile type ladder utilities
description: How the m-type-*/m-num/m-card mobile typography utilities behave and where they must NOT be applied
---

# Mobile type ladder (`m-type-*`, `m-num`, `m-card`)

Defined in `client/src/index.css`, all scoped under `@media (max-width: 767px)`, so they
**cannot** affect desktop regardless of placement — adding them next to `md:` classes is always safe.

## What each utility bundles
- `m-type-display` / `m-type-h1` / `m-type-body`: set font-size AND font-weight. `m-type-body` forces weight 500.
- `m-type-meta`: forces `muted-foreground` color (plus size).
- `m-type-micro`: forces `muted-foreground` color AND uppercase (plus size).
- `m-num`: numeric-only — `tabular-nums`, no size/weight/color change. Safe to add anywhere a number renders.
- `m-card`: removes border + sets a card background.

## Where NOT to apply (these overrides bite)
- **Dark-hero white text** (`text-white/60` etc.): do NOT use `m-type-meta`/`m-type-micro` — they force muted color.
- **Inbox conversation list rows** (primary line + preview, both roles): these use *conditional*
  `font-bold`/color classes for unread/priority states. `m-type-body`/`m-type-meta` would override
  weight+color and kill the unread emphasis. They already match ladder sizes (`text-[15px]`/`text-[13px]`),
  so leave them. Only safe Inbox spots: unread-count badge (`m-num`) and the conversation partner
  header name (`m-type-body`, it is unconditional `font-medium`).
- **Status-accent cards** (e.g. `MobileListCard` left border carrying status color): do NOT use `m-card` —
  it strips the border. Apply `m-card` only to plain tile buttons/links.

**Why:** the utilities are convenience bundles; their weight/color/uppercase side effects silently
clobber conditional/semantic styling. Match the utility's bundled properties against what the element
already needs before applying.
