import { useEffect, useMemo, type ReactNode } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import type { PartnerMapPartner } from "@/components/PartnerMap";

const SOUTH_TYROL_CENTER: [number, number] = [46.6, 11.45];
const DEFAULT_ZOOM = 9;

interface PlottedPartner extends PartnerMapPartner {
  lat: number;
  lng: number;
}

interface PartnerMapLeafletProps {
  partners: PartnerMapPartner[];
  lang: "de" | "it";
  messageLabel: string;
  onMessage: (id: string) => void;
  primaryActionLabel: string;
  primaryActionIcon?: ReactNode;
  onPrimaryAction: (id: string) => void;
  testIdPrefix: string;
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPinIcon(partner: PlottedPartner): L.DivIcon {
  const label = escapeHtml((partner.companyName || partner.name).charAt(0).toUpperCase());
  const inner = partner.profileImageUrl
    ? `<img src="${escapeHtml(partner.profileImageUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;" />`
    : `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:hsl(var(--primary));color:hsl(var(--primary-foreground));font-weight:700;font-size:14px;">${label}</div>`;
  const html = `
    <div style="position:relative;">
      <div style="width:40px;height:40px;border-radius:9999px;overflow:hidden;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);background:hsl(var(--primary));">${inner}</div>
      <div style="position:absolute;left:50%;top:34px;width:10px;height:10px;transform:translateX(-50%) rotate(45deg);background:hsl(var(--primary));border-right:2px solid #fff;border-bottom:2px solid #fff;box-shadow:1px 1px 2px rgba(0,0,0,0.2);"></div>
    </div>`;
  return L.divIcon({
    html,
    className: "partner-leaflet-pin",
    iconSize: [40, 50],
    iconAnchor: [20, 46],
    popupAnchor: [0, -46],
  });
}

// Leaflet computes its size on init; if the container is still animating in or
// hasn't reached full width yet, tiles only cover part of the box. Recompute the
// size shortly after mount and whenever the container resizes.
function InvalidateSize() {
  const map = useMap();
  useEffect(() => {
    const fix = () => map.invalidateSize();
    const timers = [100, 300, 600].map((ms) => window.setTimeout(fix, ms));
    const container = map.getContainer();
    const observer = new ResizeObserver(fix);
    observer.observe(container);
    window.addEventListener("resize", fix);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      observer.disconnect();
      window.removeEventListener("resize", fix);
    };
  }, [map]);
  return null;
}

// Frames the map to the available pins so partners are always in view, while
// keeping the default South Tyrol view when there are none.
function FitToMarkers({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 13);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 14 });
  }, [map, points]);
  return null;
}

export function PartnerMapLeaflet({
  partners,
  lang,
  messageLabel,
  onMessage,
  primaryActionLabel,
  primaryActionIcon,
  onPrimaryAction,
  testIdPrefix,
}: PartnerMapLeafletProps) {
  const plotted = useMemo(() => parsePartners(partners), [partners]);
  const points = useMemo<Array<[number, number]>>(
    () => plotted.map((p) => [p.lat, p.lng]),
    [plotted],
  );

  return (
    <div
      className="relative h-[320px] overflow-hidden rounded-2xl border shadow-sm md:h-[420px]"
      data-testid={`${testIdPrefix}-map`}
    >
      <MapContainer
        center={SOUTH_TYROL_CENTER}
        zoom={DEFAULT_ZOOM}
        scrollWheelZoom
        style={{ width: "100%", height: "100%" }}
      >
        <InvalidateSize />
        <FitToMarkers points={points} />
        <TileLayer
          attribution="Tiles &copy; Esri"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxZoom={19}
        />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
          maxZoom={19}
        />
        {plotted.map((partner) => (
          <Marker
            key={partner.id}
            position={[partner.lat, partner.lng]}
            icon={buildPinIcon(partner)}
          >
            <Popup>
              <div
                className="min-w-[180px] max-w-[240px]"
                data-testid={`${testIdPrefix}-info-${partner.id}`}
              >
                <p className="text-sm font-semibold leading-tight text-gray-900">
                  {partner.companyName || partner.name}
                </p>
                {partner.companyName && (
                  <p className="mt-0.5 text-xs text-gray-500">{partner.name}</p>
                )}
                <div className="mt-2.5 flex flex-col gap-1.5">
                  <Button
                    size="sm"
                    className="h-8 w-full justify-center text-xs"
                    onClick={() => onPrimaryAction(partner.id)}
                    data-testid={`${testIdPrefix}-info-primary-${partner.id}`}
                  >
                    {primaryActionIcon}
                    {primaryActionLabel}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-full justify-center text-xs"
                    onClick={() => onMessage(partner.id)}
                    data-testid={`${testIdPrefix}-info-message-${partner.id}`}
                  >
                    {messageLabel}
                  </Button>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <div className="pointer-events-none absolute right-2 top-2 z-[1000] rounded-full bg-background/85 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur">
        {lang === "de" ? "Kostenlose Karte" : "Mappa gratuita"}
      </div>

      {plotted.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] flex justify-center p-3">
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
