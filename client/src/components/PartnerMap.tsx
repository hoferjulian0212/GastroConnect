import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
} from "@vis.gl/react-google-maps";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { PartnerMapLeaflet } from "@/components/PartnerMapLeaflet";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const MAP_ID = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) || "DEMO_MAP_ID";

// Centered on South Tyrol (Südtirol), Bolzano/Bozen area.
const SOUTH_TYROL_CENTER = { lat: 46.6, lng: 11.45 };
const DEFAULT_ZOOM = 9;

export interface PartnerMapPartner {
  id: string;
  name: string;
  companyName?: string | null;
  profileImageUrl?: string | null;
  latitude?: string | null;
  longitude?: string | null;
}

interface PartnerMapProps {
  partners: PartnerMapPartner[];
  lang: "de" | "it";
  messageLabel: string;
  onMessage: (id: string) => void;
  primaryActionLabel: string;
  primaryActionIcon?: ReactNode;
  onPrimaryAction: (id: string) => void;
  /** Called after a lazy geocoding backfill resolved new coordinates. */
  onBackfilled?: () => void;
  testIdPrefix: string;
}

interface PlottedPartner extends PartnerMapPartner {
  lat: number;
  lng: number;
}

function parsePartners(partners: PartnerMapPartner[]): PlottedPartner[] {
  const result: PlottedPartner[] = [];
  for (const p of partners) {
    const lat = p.latitude != null ? parseFloat(p.latitude) : NaN;
    const lng = p.longitude != null ? parseFloat(p.longitude) : NaN;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      result.push({ ...p, lat, lng });
    }
  }
  return result;
}

function AvatarPin({ partner }: { partner: PlottedPartner }) {
  const label = (partner.companyName || partner.name).charAt(0).toUpperCase();
  return (
    <div className="relative -translate-y-1 cursor-pointer">
      <div className="h-10 w-10 overflow-hidden rounded-full border-2 border-white bg-primary/90 shadow-lg ring-1 ring-black/20">
        {partner.profileImageUrl ? (
          <img
            src={partner.profileImageUrl}
            alt={partner.companyName || partner.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-primary text-sm font-bold text-primary-foreground">
            {label}
          </div>
        )}
      </div>
      <div className="absolute left-1/2 top-[calc(100%-4px)] h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-b-2 border-r-2 border-white bg-primary/90 shadow-sm" />
    </div>
  );
}

export function PartnerMap({
  partners,
  lang,
  messageLabel,
  onMessage,
  primaryActionLabel,
  primaryActionIcon,
  onPrimaryAction,
  onBackfilled,
  testIdPrefix,
}: PartnerMapProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const backfillTriedRef = useRef(false);

  const plotted = useMemo(() => parsePartners(partners), [partners]);
  const selected = plotted.find((p) => p.id === selectedId) ?? null;

  // Lazily geocode any partners that are missing coordinates so existing
  // suppliers/restaurants appear without manual lat/lng entry. Runs at most
  // once per mount and only refetches when new coordinates were resolved.
  useEffect(() => {
    if (backfillTriedRef.current) return;
    if (partners.length === 0) return;
    const missing = partners.some((p) => p.latitude == null || p.longitude == null);
    if (!missing) return;
    backfillTriedRef.current = true;
    (async () => {
      try {
        const res = await apiRequest("POST", "/api/geocode/backfill");
        const data = (await res.json()) as { geocoded?: number };
        if (data.geocoded && data.geocoded > 0) onBackfilled?.();
      } catch {
        // Non-fatal: the map still works with whatever coordinates exist.
      }
    })();
  }, [partners, onBackfilled]);

  // No Google Maps key configured → render a free Leaflet/OpenStreetMap
  // satellite map (Esri World Imagery tiles, no key required) so the map still
  // works. Server-side geocoding falls back to the free Nominatim service.
  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <PartnerMapLeaflet
        partners={partners}
        lang={lang}
        messageLabel={messageLabel}
        onMessage={onMessage}
        primaryActionLabel={primaryActionLabel}
        primaryActionIcon={primaryActionIcon}
        onPrimaryAction={onPrimaryAction}
        testIdPrefix={testIdPrefix}
      />
    );
  }

  return (
    <div
      className="relative h-[320px] overflow-hidden rounded-2xl border shadow-sm md:h-[420px]"
      data-testid={`${testIdPrefix}-map`}
    >
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
        <Map
          defaultCenter={SOUTH_TYROL_CENTER}
          defaultZoom={DEFAULT_ZOOM}
          mapId={MAP_ID}
          mapTypeId="hybrid"
          gestureHandling="greedy"
          disableDefaultUI={false}
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl
          style={{ width: "100%", height: "100%" }}
        >
          {plotted.map((partner) => (
            <AdvancedMarker
              key={partner.id}
              position={{ lat: partner.lat, lng: partner.lng }}
              title={partner.companyName || partner.name}
              onClick={() => setSelectedId(partner.id)}
              data-testid={`${testIdPrefix}-marker-${partner.id}`}
            >
              <AvatarPin partner={partner} />
            </AdvancedMarker>
          ))}

          {selected && (
            <InfoWindow
              position={{ lat: selected.lat, lng: selected.lng }}
              pixelOffset={[0, -44]}
              onCloseClick={() => setSelectedId(null)}
            >
              <div className="min-w-[180px] max-w-[240px] p-1" data-testid={`${testIdPrefix}-info-${selected.id}`}>
                <p className="text-sm font-semibold leading-tight text-gray-900">
                  {selected.companyName || selected.name}
                </p>
                {selected.companyName && (
                  <p className="mt-0.5 text-xs text-gray-500">{selected.name}</p>
                )}
                <div className="mt-2.5 flex flex-col gap-1.5">
                  <Button
                    size="sm"
                    className="h-8 w-full justify-center text-xs"
                    onClick={() => onPrimaryAction(selected.id)}
                    data-testid={`${testIdPrefix}-info-primary-${selected.id}`}
                  >
                    {primaryActionIcon}
                    {primaryActionLabel}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-full justify-center text-xs"
                    onClick={() => onMessage(selected.id)}
                    data-testid={`${testIdPrefix}-info-message-${selected.id}`}
                  >
                    {messageLabel}
                  </Button>
                </div>
              </div>
            </InfoWindow>
          )}
        </Map>
      </APIProvider>

      {plotted.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3">
          <div className="pointer-events-auto rounded-full bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
            {lang === "de"
              ? "Noch keine Standorte verfügbar"
              : "Nessuna posizione disponibile"}
          </div>
        </div>
      )}
    </div>
  );
}
