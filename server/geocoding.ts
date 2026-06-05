import { storage } from "./storage";

export interface GeocodeResult {
  lat: number;
  lng: number;
}

/** Returns the Google Maps key used for server-side Geocoding API calls. */
function getApiKey(): string | undefined {
  return process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
}

/** Whether a Google Maps key is available for the Geocoding API. */
export function isGoogleGeocodingConfigured(): boolean {
  return !!getApiKey();
}

/**
 * Geocoding is always available: when no Google key is configured we fall back
 * to the free OpenStreetMap Nominatim service.
 */
export function isGeocodingConfigured(): boolean {
  return true;
}

/** Builds a single-line address string from the stored address parts. */
export function buildAddressQuery(parts: {
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
}): string {
  const cityLine = [parts.postalCode, parts.city]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const segments = [(parts.address ?? "").trim(), cityLine].filter(Boolean);
  return segments.join(", ").trim();
}

/**
 * Geocodes an address using Google's Geocoding API, biased toward the
 * South Tyrol / Italy region for accuracy.
 */
async function geocodeWithGoogle(query: string, key: string): Promise<GeocodeResult | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("region", "it");
  // Soft viewport bias toward South Tyrol (Südtirol) — not a hard restriction,
  // so partners with valid addresses elsewhere are still geocoded and pinned.
  url.searchParams.set("bounds", "46.2,10.3|47.1,12.5");
  url.searchParams.set("key", key);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error("[geocoding] HTTP error", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as {
      status: string;
      results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>;
      error_message?: string;
    };

    if (data.status === "OK" && data.results && data.results.length > 0) {
      const loc = data.results[0].geometry?.location;
      if (loc && typeof loc.lat === "number" && typeof loc.lng === "number") {
        return { lat: loc.lat, lng: loc.lng };
      }
      return null;
    }

    if (data.status === "ZERO_RESULTS") return null;

    console.error("[geocoding] API status", data.status, data.error_message ?? "");
    return null;
  } catch (err) {
    console.error("[geocoding] request failed", err);
    return null;
  }
}

/**
 * Geocodes an address using the free OpenStreetMap Nominatim service, biased to
 * Italy. Used as a fallback when no Google Maps key is configured. Note:
 * Nominatim's usage policy limits requests to ~1/sec, so callers doing bulk
 * work (the backfill) must throttle.
 */
async function geocodeWithNominatim(query: string): Promise<GeocodeResult | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  // Soft relevance bias toward South Tyrol (lon,lat: left,top,right,bottom).
  // Not "bounded", so valid addresses elsewhere are still geocoded and pinned.
  url.searchParams.set("viewbox", "10.3,47.1,12.5,46.2");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        // Nominatim requires an identifying User-Agent.
        "User-Agent": "GastroConnect/1.0 (gastroconnect map fallback)",
        "Accept-Language": "de,it",
      },
    });
    if (!res.ok) {
      console.error("[geocoding] Nominatim HTTP error", res.status);
      return null;
    }
    const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    if (Array.isArray(data) && data.length > 0) {
      const lat = parseFloat(data[0].lat ?? "");
      const lng = parseFloat(data[0].lon ?? "");
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
      }
    }
    return null;
  } catch (err) {
    console.error("[geocoding] Nominatim request failed", err);
    return null;
  }
}

/**
 * Geocodes an address, biased toward the South Tyrol / Italy region. Uses
 * Google's Geocoding API when a key is configured, otherwise falls back to the
 * free OpenStreetMap Nominatim service. Returns null when there is no usable
 * address or it cannot be resolved — callers should treat null as "no pin"
 * rather than an error.
 */
export async function geocodeAddress(parts: {
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
}): Promise<GeocodeResult | null> {
  const query = buildAddressQuery(parts);
  if (!query) return null;

  const key = getApiKey();
  if (key) return geocodeWithGoogle(query, key);
  return geocodeWithNominatim(query);
}

/**
 * Geocodes a user's stored address and persists the coordinates. Returns the
 * resolved coordinates, or null when the address could not be geocoded.
 */
export async function geocodeAndPersistUser(
  userId: string,
  parts: { address?: string | null; postalCode?: string | null; city?: string | null },
): Promise<GeocodeResult | null> {
  const result = await geocodeAddress(parts);
  await storage.updateUser(userId, {
    latitude: result ? String(result.lat) : null,
    longitude: result ? String(result.lng) : null,
  });
  return result;
}

/**
 * Idempotently geocodes every user that has an address but no stored
 * coordinates yet. Safe to call repeatedly (e.g. lazily when the map loads):
 * already-geocoded users are skipped. Returns counts for observability.
 */
export async function backfillMissingCoordinates(): Promise<{
  geocoded: number;
  failed: number;
  skipped: number;
}> {
  if (!isGeocodingConfigured()) {
    return { geocoded: 0, failed: 0, skipped: 0 };
  }

  const users = await storage.getUsers();
  const pending = users.filter(
    (u) => !u.latitude && !u.longitude && buildAddressQuery(u).length > 0,
  );

  // Without a Google key we use Nominatim, which limits requests to ~1/sec, so
  // throttle bulk geocoding to stay within its usage policy.
  const usingNominatim = !isGoogleGeocodingConfigured();
  const delayMs = usingNominatim ? 1100 : 0;

  let geocoded = 0;
  let failed = 0;
  for (let i = 0; i < pending.length; i++) {
    const result = await geocodeAndPersistUser(pending[i].id, pending[i]);
    if (result) geocoded++;
    else failed++;
    if (delayMs > 0 && i < pending.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return { geocoded, failed, skipped: users.length - pending.length };
}
