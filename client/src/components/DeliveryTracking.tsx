import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useLanguage } from "@/context/LanguageContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Phone, Truck, Check } from "lucide-react";
import { format } from "date-fns";
import type { OrderTrackingInfo } from "@shared/schema";

const SOUTH_TYROL_CENTER: [number, number] = [46.6, 11.45];

const driverIcon = L.divIcon({
  html: `
    <div style="width:38px;height:38px;border-radius:9999px;display:flex;align-items:center;justify-content:center;background:#2563eb;color:#fff;border:3px solid #fff;box-shadow:0 3px 10px rgba(37,99,235,0.45);">
      <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>
    </div>`,
  className: "tracking-driver-pin",
  iconSize: [38, 38],
  iconAnchor: [19, 19],
});

const destinationIcon = L.divIcon({
  html: `
    <div style="position:relative;">
      <div style="width:30px;height:30px;border-radius:9999px;display:flex;align-items:center;justify-content:center;background:#161921;color:#fff;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>
      </div>
      <div style="position:absolute;left:50%;top:25px;width:8px;height:8px;transform:translateX(-50%) rotate(45deg);background:#161921;border-right:2px solid #fff;border-bottom:2px solid #fff;"></div>
    </div>`,
  className: "tracking-dest-pin",
  iconSize: [30, 38],
  iconAnchor: [15, 34],
});

/**
 * Uber-Eats-style live tracking card shown on the order detail page while a
 * driver is assigned. Polls the tracking endpoint; the live map only appears
 * while the driver is actually en route / arriving.
 */
export function DeliveryTracking({
  orderId,
  destinationLat,
  destinationLng,
  active,
}: {
  orderId: string;
  destinationLat?: string | null;
  destinationLng?: string | null;
  /** Only poll while the order can plausibly be in delivery. */
  active: boolean;
}) {
  const { lang } = useLanguage();

  const { data } = useQuery<OrderTrackingInfo>({
    queryKey: ["/api/orders", orderId, "tracking"],
    enabled: active,
    refetchInterval: (q) => {
      const s = q.state.data?.assignment?.status;
      if (s === "delivered" || s === "problem") return false;
      return s === "en_route" || s === "arriving" ? 10_000 : 30_000;
    },
  });

  const assignment = data?.assignment ?? null;
  const driver = data?.driver ?? null;

  const steps = useMemo(() => {
    if (!assignment) return [];
    const s = assignment.status;
    const idx =
      s === "assigned" ? 1 : s === "picked_up" ? 1 : s === "en_route" ? 2 : s === "arriving" ? 3 : s === "delivered" ? 4 : 1;
    const defs = [
      { de: "Vorbereitung", it: "Preparazione", at: assignment.assignedAt },
      { de: "Fahrer zugewiesen", it: "Autista assegnato", at: assignment.assignedAt },
      { de: "Unterwegs", it: "In viaggio", at: assignment.enRouteAt },
      { de: "Kommt gleich an", it: "In arrivo", at: assignment.arrivingAt },
      { de: "Geliefert", it: "Consegnato", at: assignment.deliveredAt },
    ];
    return defs.map((d, i) => ({ ...d, done: i <= idx, current: i === idx }));
  }, [assignment]);

  if (!assignment || assignment.status === "problem") return null;

  const driverPos: [number, number] | null =
    data?.location && Number.isFinite(parseFloat(data.location.latitude))
      ? [parseFloat(data.location.latitude), parseFloat(data.location.longitude)]
      : null;
  const destPos: [number, number] | null =
    destinationLat && destinationLng && Number.isFinite(parseFloat(destinationLat))
      ? [parseFloat(destinationLat), parseFloat(destinationLng)]
      : null;
  const showMap = !!driverPos && ["en_route", "arriving"].includes(assignment.status);
  const center: [number, number] = driverPos ?? destPos ?? SOUTH_TYROL_CENTER;
  const isMoving = ["en_route", "arriving"].includes(assignment.status);
  const showEtaBanner = isMoving && assignment.etaMinutes != null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm min-w-0" data-testid="section-delivery-tracking">
      <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold flex items-center gap-2">
          <Truck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          {lang === "de" ? "Lieferverfolgung" : "Tracciamento consegna"}
        </p>
        {isMoving && assignment.distanceKm != null && (
          <span className="text-[11px] font-medium rounded-full bg-muted text-muted-foreground px-2 py-0.5" data-testid="text-tracking-distance">
            {parseFloat(String(assignment.distanceKm)).toFixed(1)} km
          </span>
        )}
      </div>

      {showEtaBanner && (
        <div className="px-4 py-3 border-b border-border/20 bg-blue-50 dark:bg-blue-950/30 flex items-baseline justify-between gap-2" data-testid="banner-tracking-eta">
          <p className="text-xs font-medium text-blue-700/80 dark:text-blue-300/80">
            {lang === "de" ? "Voraussichtliche Ankunft" : "Arrivo previsto"}
          </p>
          <p className="text-lg font-bold text-blue-700 dark:text-blue-300 leading-none" data-testid="text-tracking-eta">
            {lang === "de" ? `in ~${assignment.etaMinutes} Min.` : `tra ~${assignment.etaMinutes} min`}
          </p>
        </div>
      )}

      {driver && (
        <div className="px-4 py-3 flex items-center gap-3 border-b border-border/20" data-testid="tracking-driver-card">
          <Avatar className="h-10 w-10">
            <AvatarImage src={driver.profileImageUrl ?? undefined} alt={driver.name} />
            <AvatarFallback className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-sm font-semibold">
              {driver.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" data-testid="text-tracking-driver-name">{driver.name}</p>
            <p className="text-xs text-muted-foreground">{lang === "de" ? "Ihr Fahrer" : "Il tuo autista"}</p>
          </div>
          {driver.phone && (
            <a
              href={`tel:${driver.phone}`}
              className="h-9 w-9 rounded-full inline-flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 transition-colors"
              data-testid="button-call-driver"
              aria-label={lang === "de" ? "Fahrer anrufen" : "Chiama l'autista"}
            >
              <Phone className="h-4 w-4" />
            </a>
          )}
        </div>
      )}

      {showMap && (
        <div className="h-[240px] md:h-[280px] relative z-0" data-testid="tracking-map">
          <MapContainer center={center} zoom={12} className="h-full w-full" scrollWheelZoom={false}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {driverPos && <Marker position={driverPos} icon={driverIcon} />}
            {destPos && <Marker position={destPos} icon={destinationIcon} />}
          </MapContainer>
        </div>
      )}

      <div className="px-4 py-3.5">
        <div className="space-y-0">
          {steps.map((step, i) => (
            <div key={i} className="flex items-stretch gap-3" data-testid={`tracking-step-${i}`}>
              <div className="flex flex-col items-center">
                <div
                  className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${
                    step.done
                      ? step.current && assignment.status !== "delivered"
                        ? "bg-blue-600 text-white animate-pulse"
                        : "bg-emerald-500 text-white"
                      : "bg-muted text-muted-foreground/40"
                  }`}
                >
                  {step.done && !(step.current && assignment.status !== "delivered") ? (
                    <Check className="h-3 w-3" strokeWidth={3} />
                  ) : (
                    <div className={`h-1.5 w-1.5 rounded-full ${step.done ? "bg-white" : "bg-muted-foreground/40"}`} />
                  )}
                </div>
                {i < steps.length - 1 && (
                  <div className={`w-px flex-1 min-h-[14px] ${step.done && steps[i + 1].done ? "bg-emerald-400" : "bg-border"}`} />
                )}
              </div>
              <div className={`pb-2.5 ${i === steps.length - 1 ? "pb-0" : ""}`}>
                <p className={`text-[13px] leading-5 ${step.current ? "font-semibold" : step.done ? "font-medium" : "text-muted-foreground"}`}>
                  {lang === "de" ? step.de : step.it}
                </p>
                {step.at && step.done && (
                  <p className="text-[11px] text-muted-foreground">{format(new Date(step.at), "HH:mm")}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
