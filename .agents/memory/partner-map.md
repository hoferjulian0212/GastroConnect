---
name: Partner map (Suppliers/Restaurants)
description: How the South Tyrol partner map works, its free fallback, and the geocoding region policy.
---

# Partner map

Map of connected partners on restaurant "Lieferanten" and supplier "Kunden" pages.
`PartnerMap` (Google via `@vis.gl/react-google-maps`) is the primary; when no
`VITE_GOOGLE_MAPS_API_KEY` is set it renders `PartnerMapLeaflet` (free, no key).

## Free fallback
- Tiles: Esri World Imagery + Esri reference labels (no API key, free). Leaflet/react-leaflet v4 (v5 needs React 19; app is React 18 — pin v4).
- Geocoding falls back to OpenStreetMap **Nominatim** when no Google key. Nominatim policy: ~1 req/sec + required `User-Agent` header. The backfill throttles (~1.1s/req) only on the Nominatim path.
- `isGeocodingConfigured()` returns **true** always now (free path always available); use `isGoogleGeocodingConfigured()` to detect the Google key.

## Geocoding region policy — IMPORTANT
**Why:** Branding says "South Tyrol", but the actual seed/partner addresses are German (München, Bremerhaven). A hard country restriction (`components=country:IT` / Nominatim `countrycodes=it`) made EVERY partner un-pinnable.
**How to apply:** South Tyrol is now a *soft bias* (Google `bounds`, Nominatim `viewbox` without `bounded`), NOT a hard filter. Keep it that way so real partners anywhere still get pins. Fictional/incomplete street addresses still legitimately fail → no pin (expected).

## Leaflet sizing gotcha
**Why:** Pages use an enter animation; Leaflet computes size on init and tiles only covered part of the box (grey area).
**How to apply:** `PartnerMapLeaflet` runs `map.invalidateSize()` on a few post-mount timers + a `ResizeObserver`. Keep `InvalidateSize` if you touch that component. `FitToMarkers` auto-frames pins, else default South Tyrol view.
