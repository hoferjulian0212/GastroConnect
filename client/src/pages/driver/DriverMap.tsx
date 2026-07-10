import { useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { HeroPortal } from "@/context/HeroContext";
import { useLanguage } from "@/context/LanguageContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Map as MapIcon } from "lucide-react";
import type { DeliveryAssignmentWithDetails } from "@shared/schema";

const SOUTH_TYROL_CENTER: [number, number] = [46.6, 11.45];

function stopIcon(index: number, done: boolean): L.DivIcon {
  const bg = done ? "#10b981" : "#161921";
  const html = `
    <div style="position:relative;">
      <div style="width:32px;height:32px;border-radius:9999px;display:flex;align-items:center;justify-content:center;background:${bg};color:#fff;font-weight:700;font-size:13px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);">${done ? "✓" : index + 1}</div>
      <div style="position:absolute;left:50%;top:27px;width:8px;height:8px;transform:translateX(-50%) rotate(45deg);background:${bg};border-right:2px solid #fff;border-bottom:2px solid #fff;"></div>
    </div>`;
  return L.divIcon({ html, className: "driver-stop-pin", iconSize: [32, 40], iconAnchor: [16, 36] });
}

export default function DriverMap() {
  const { lang } = useLanguage();
  const [, setLocation] = useLocation();

  const { data: deliveries, isLoading } = useQuery<DeliveryAssignmentWithDetails[]>({
    queryKey: ["/api/driver/deliveries"],
    refetchInterval: 60_000,
  });

  const stops = useMemo(() => {
    return (deliveries ?? [])
      .map((d, i) => {
        const lat = d.restaurant.latitude ? parseFloat(d.restaurant.latitude) : NaN;
        const lng = d.restaurant.longitude ? parseFloat(d.restaurant.longitude) : NaN;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return { delivery: d, index: i, lat, lng };
      })
      .filter((s): s is { delivery: DeliveryAssignmentWithDetails; index: number; lat: number; lng: number } => !!s);
  }, [deliveries]);

  const openPath = stops
    .filter((s) => !["delivered", "problem"].includes(s.delivery.status))
    .map((s) => [s.lat, s.lng] as [number, number]);

  const center: [number, number] = stops.length > 0 ? [stops[0].lat, stops[0].lng] : SOUTH_TYROL_CENTER;

  return (
    <div className="flex flex-col space-y-4 pb-[var(--mobile-bottom-pad)] md:pb-0">
      <HeroPortal>
        <div className="bg-[#161921] px-3 md:px-6 pt-4 md:pt-6 pb-5 md:pb-7 space-y-1" data-testid="map-hero">
          <h1 className="text-2xl md:text-4xl font-bold text-white" data-testid="text-page-title">
            {lang === "de" ? "Karte" : "Mappa"}
          </h1>
          <p className="text-sm text-white/60">
            {lang === "de" ? "Alle heutigen Stopps im Überblick." : "Tutte le fermate di oggi in un colpo d'occhio."}
          </p>
        </div>
      </HeroPortal>

      {isLoading ? (
        <Skeleton className="h-[60vh] rounded-2xl" />
      ) : stops.length === 0 ? (
        <div className="rounded-2xl border bg-card px-6 py-14 text-center" data-testid="empty-map">
          <MapIcon className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="font-semibold">
            {lang === "de" ? "Keine Stopps mit Adresse" : "Nessuna fermata con indirizzo"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {lang === "de"
              ? "Sobald Lieferungen mit Koordinaten zugewiesen sind, erscheinen sie hier."
              : "Le consegne con coordinate appariranno qui."}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden border h-[62vh] min-h-[380px]" data-testid="driver-map">
          <MapContainer center={center} zoom={11} className="h-full w-full" scrollWheelZoom>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {openPath.length >= 2 && (
              <Polyline positions={openPath} pathOptions={{ color: "#3b82f6", weight: 3, dashArray: "6 8", opacity: 0.7 }} />
            )}
            {stops.map((s) => (
              <Marker
                key={s.delivery.id}
                position={[s.lat, s.lng]}
                icon={stopIcon(s.index, ["delivered", "problem"].includes(s.delivery.status))}
              >
                <Popup>
                  <div className="space-y-1 min-w-[160px]">
                    <p className="font-semibold text-sm">
                      {s.delivery.restaurant.companyName || s.delivery.restaurant.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[s.delivery.restaurant.address, s.delivery.restaurant.city].filter(Boolean).join(", ")}
                    </p>
                    <button
                      className="text-xs font-semibold text-blue-600 underline"
                      onClick={() => setLocation(`/supplier/delivery/${s.delivery.id}`)}
                      data-testid={`map-open-${s.delivery.id}`}
                    >
                      {lang === "de" ? "Details öffnen" : "Apri dettagli"}
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}
    </div>
  );
}
