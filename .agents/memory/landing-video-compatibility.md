---
name: Landing video compatibility
description: Browser-safe format and accessibility rules for landing-page video media
---

Landing-page phone recordings should use a browser-compatible H.264 MP4 plus a poster frame rather than relying on HEVC source files. Crop device status bars and recording indicators before import. Autoplay videos must be muted, inline, and looped, while reduced-motion users should receive the poster without autoplay.

**Why:** iPhone screen recordings commonly arrive as HEVC and include battery/recording indicators; HEVC is not reliably playable in desktop preview browsers and visible device chrome makes product demos look unfinished.

**How to apply:** Keep the source recording if needed, but crop the status-bar area, generate a web-safe derivative and poster, and import only the cleaned media into the landing page.