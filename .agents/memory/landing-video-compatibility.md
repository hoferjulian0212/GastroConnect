---
name: Landing video compatibility
description: Browser-safe format and accessibility rules for landing-page video media
---

Landing-page phone recordings should use a browser-compatible H.264 MP4 plus a poster frame rather than relying on HEVC source files. Crop device status bars and recording indicators before import. If autoplay policy must never require a gesture, decode through WebCodecs in a dedicated worker and transfer frames to a non-interactive canvas; retain the poster for reduced motion.

**Why:** iPhone screen recordings commonly arrive as HEVC and include battery/recording indicators; HEVC is not reliably playable in desktop preview browsers and visible device chrome makes product demos look unfinished. Some mobile browsers can still block muted native autoplay. Full-length animated images stutter, while main-thread WebCodecs decoding starves UI rendering even when frame decoding itself succeeds.

**How to apply:** Keep the source recording if needed, but crop the status-bar area and generate a poster plus a display-matched H.264 derivative. For phone-sized playback, a high-quality 360×720, 30fps, no-B-frame fast-decode encode is sharper than the rendered surface while remaining cheap enough for continuous decoding. Run Mediabunny/WebCodecs and OffscreenCanvas in a dedicated worker, maintain a bounded decode-ahead queue, transfer ready ImageBitmap frames to the visible canvas, and drop superseded frames instead of presenting bursts. Start within a generous pre-viewport margin and terminate far offscreen. For a seamless infinite loop, begin filling the next loop buffer while the current loop's decoded tail is still playing. Keep the visible canvas pointer-free and expose only a poster when reduced motion is requested.