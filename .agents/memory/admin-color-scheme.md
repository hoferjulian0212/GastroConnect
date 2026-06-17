---
name: Admin panel color scheme
description: The agreed single-accent color system for all /admin pages
---

## Rule
Use **one accent color** (indigo) throughout all admin UI chrome. No orange, blue, purple, cyan, or sky as decorative accents.

**Backgrounds:**
- Page: `bg-[#0a0a0f]`
- Cards / header: `bg-[#111116]`
- Hover: `bg-[#1a1a24]` or `hover:bg-white/[0.05]`
- Deep inset (notes, code): `bg-[#0a0a0f]`

**Accent — indigo only:**
- Icons / labels: `text-indigo-400`
- Primary buttons: `bg-indigo-600 hover:bg-indigo-500`
- Active nav: `bg-indigo-500/15 text-indigo-300`
- Muted bg: `bg-indigo-500/10` / `bg-indigo-500/15`
- Borders: `border-indigo-500/40`

**Semantic status (keep, don't replace with indigo):**
- `text-emerald-400` — verified / success / supplier badge
- `text-red-400` / `bg-red-500` — errors / danger / complaint badge
- `text-amber-400` — pending / warning / low stock
- `bg-amber-500/10` / `border-amber-500/40` — amber status cards

**Charts:**
- Stroke / fill: `#818cf8` (indigo-400); second series: `#a5b4fc` (indigo-300)
- Gradient stop: `stopColor="#818cf8"`

**Borders:**
- Cards/rows: `border-white/8` (slightly lower opacity than the old `border-white/10`)

**Why:** User asked for one consistent color scheme — the previous panel mixed orange (#F26207), navy-blue backgrounds (#161921/#0e1117), and decorative accents in blue, purple, cyan, amber, emerald all at once.

**How to apply:** Any new admin page or component follows this scheme. Never introduce a new accent color into admin without updating this file first.
