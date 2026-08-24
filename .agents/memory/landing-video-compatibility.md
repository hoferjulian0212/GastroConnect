---
name: Landing video compatibility
description: Browser-safe format and accessibility rules for landing-page video media
---

Landing-page phone recordings should use a browser-compatible H.264 MP4 plus a poster frame rather than relying on HEVC source files. Autoplay videos must be muted, inline, and looped, while reduced-motion users should receive the poster without autoplay.

**Why:** iPhone screen recordings commonly arrive as HEVC, which is not reliably playable in desktop preview browsers and can leave an autoplay landing visual blank.

**How to apply:** Keep the source recording if needed, but generate a web-safe derivative and poster before importing the media into the landing page.