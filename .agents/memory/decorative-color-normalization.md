---
name: Decorative color normalization (GastroConnect)
description: How decorative blue/indigo/sky/violet accents are normalized vs. which blues are kept as meaningful status/info.
---

# Decorative vs. meaningful blue in GastroConnect

Ad-hoc decorative blue/indigo/sky/violet accents (not tied to a meaning) are normalized to the neutral theme tokens `primary` / `muted` / `accent` / `foreground` so the dark palette feels coherent.

**Why:** `--primary` is a neutral ink (light `0 0% 9%`, dark `0 0% 98%`), so `text-primary`/`bg-primary/10` reads as coherent monochrome ink that flips with the theme.

**How to apply:**
- On theme-background surfaces (cards, dialogs), decorative blue → `bg-primary/10 dark:bg-primary/20` + `text-primary`, neutral fills → `bg-muted`/`text-foreground`.
- On the ALWAYS-DARK hero (`bg-[#161921]`, fixed regardless of light/dark) do NOT use theme `primary` — it flips to near-black in light mode and disappears. Use white-based neutrals there: `bg-white/10` + `text-white` (matches the hero's other fixed-color KPI accents like `emerald-500/20`).

## KEEP (do not normalize — meaningful)
- Status colors: confirmed=blue, in_delivery=indigo, in_progress=blue/indigo, scheduled(promotion)=blue. Canonical source `client/src/lib/status-colors.ts`; also StatusTimeline, MobileStatusPill, Calendar, OrderDetail/ComplaintDetail status, per-page status switch fns.
- Priority dot `normal`=blue.
- Info: notification type `order_status`=blue (NotificationBell), document / delivery-note icons=blue (Documents doc-type, DeliveryNoteCard, ChatAttachment, Inbox FileText), planned-delivery-date banners=blue.

## Category taxonomy palettes (Catalog.tsx / Products.tsx)
Category colors are a designed distinct-hue taxonomy, NOT status — do not collapse to `primary`. Instead remap blue/indigo to other distinct non-blue hues (used: teal-600, teal-400, fuchsia-700) to preserve distinctness while removing the blue family.
