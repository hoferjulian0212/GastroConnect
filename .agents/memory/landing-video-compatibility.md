---
name: Landing video compatibility
description: Browser-safe format and accessibility rules for landing-page video media
---

Landing-page phone recordings should use a browser-compatible H.264 MP4 plus a poster frame rather than relying on HEVC source files. Crop device status bars and recording indicators before import. If mobile browsers surface a native paused-video control despite muted inline autoplay, render the H.264 decoder into a canvas so the user sees no native media surface; retain the poster for reduced motion.

**Why:** iPhone screen recordings commonly arrive as HEVC and include battery/recording indicators; HEVC is not reliably playable in desktop preview browsers and visible device chrome makes product demos look unfinished. Some mobile browsers can still block native video playback and display a play overlay even after normal autoplay safeguards. Animated WebP avoids controls but can stutter and lose fidelity because every frame must be decoded as an image.

**How to apply:** Keep the source recording if needed, but crop the status-bar area and generate a cleaned web-safe derivative plus poster. Prefer the MP4 for normal video contexts; for an autoplay-only decorative phone demo that receives a native play overlay, play the MP4 through a hidden decoder and draw its frames to a visible canvas. This keeps hardware video decoding while preventing the play overlay.