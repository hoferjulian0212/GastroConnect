---
name: PWA home-screen icon
description: How the mobile home-screen / PWA app icon is configured and a key gotcha
---

# PWA home-screen icon

The home-screen / "add to home screen" icon is `client/public/app-icon.png`,
referenced by `client/public/manifest.json` (icons) and the `apple-touch-icon`
link in `client/index.html`. The browser-tab favicon stays separate as
`client/public/favicon.png` (kept transparent).

`app-icon.png` is generated from the line-art `favicon.png` logo (chef hat + box)
by recoloring strokes to pure black, thickening them, and flattening onto a white
background:
`magick favicon.png -channel RGB -evaluate set 0 +channel -channel A -morphology Dilate Disk:4 +channel -background white -flatten -resize 512x512 app-icon.png`
(Disk:4 = bold but not fat/blobby; Disk:7 looked too thick, Disk:10+ merges box detail.)

**Why white background:** iOS replaces transparency on home-screen icons with
**black**, so a black logo on a transparent icon would be invisible on iOS. A
solid white background keeps the black logo visible on both iOS and Android.
