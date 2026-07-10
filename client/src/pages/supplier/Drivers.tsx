import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { HeroPortal } from "@/context/HeroContext";
import { useLanguage } from "@/context/LanguageContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Truck, Phone, MapPin, PackageCheck, AlertTriangle, Clock, Flag } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de, it } from "date-fns/locale";
import { DELIVERY_STATUS_META } from "@/pages/driver/DeliveryStatus";
import {
  formatOrderNumber,
  type DeliveryAssignmentWithDetails,
  type DriverLocationWithDriver,
  type Member,
} from "@shared/schema";

const SOUTH_TYROL_CENTER: [number, number] = [46.6, 11.45];

function romeToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
}

function driverPin(initials: string): L.DivIcon {
  const html = `
    <div style="width:36px;height:36px;border-radius:9999px;display:flex;align-items:center;justify-content:center;background:#2563eb;color:#fff;font-weight:700;font-size:12px;border:3px solid #fff;box-shadow:0 3px 10px rgba(37,99,235,0.45);">${initials}</div>`;
  return L.divIcon({ html, className: "office-driver-pin", iconSize: [36, 36], iconAnchor: [18, 18] });
}

export default function SupplierDrivers() {
  const { lang } = useLanguage();
  const dateLocale = lang === "de" ? de : it;
  const [date, setDate] = useState<string>(romeToday());

  const { data: drivers, isLoading: driversLoading } = useQuery<Member[]>({
    queryKey: ["/api/supplier/drivers"],
  });

  const { data: deliveries, isLoading: deliveriesLoading } = useQuery<DeliveryAssignmentWithDetails[]>({
    queryKey: ["/api/supplier/deliveries", date],
    queryFn: async () => {
      const r = await fetch(`/api/supplier/deliveries?date=${date}`, { credentials: "include" });
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    refetchInterval: 30_000,
  });

  const { data: locations } = useQuery<DriverLocationWithDriver[]>({
    queryKey: ["/api/supplier/driver-locations"],
    refetchInterval: 15_000,
  });

  const byDriver = useMemo(() => {
    const map = new Map<string, DeliveryAssignmentWithDetails[]>();
    for (const d of deliveries ?? []) {
      const list = map.get(d.driverMemberId) ?? [];
      list.push(d);
      map.set(d.driverMemberId, list);
    }
    for (const list of Array.from(map.values())) list.sort((a, b) => a.stopSequence - b.stopSequence);
    return map;
  }, [deliveries]);

  const pins = useMemo(() => {
    return (locations ?? [])
      .map((l) => {
        const lat = parseFloat(l.latitude);
        const lng = parseFloat(l.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const fresh = Date.now() - new Date(l.updatedAt).getTime() < 15 * 60 * 1000;
        return { loc: l, lat, lng, fresh };
      })
      .filter((p): p is { loc: DriverLocationWithDriver; lat: number; lng: number; fresh: boolean } => !!p && p.fresh);
  }, [locations]);

  const center: [number, number] = pins.length > 0 ? [pins[0].lat, pins[0].lng] : SOUTH_TYROL_CENTER;
  const isLoading = driversLoading || deliveriesLoading;

  const totals = useMemo(() => {
    const all = deliveries ?? [];
    return {
      total: all.length,
      delivered: all.filter((d) => d.status === "delivered").length,
      open: all.filter((d) => !["delivered", "problem"].includes(d.status)).length,
      problems: all.filter((d) => d.status === "problem").length,
    };
  }, [deliveries]);

  return (
    <div className="flex flex-col space-y-5 pb-[var(--mobile-bottom-pad)] md:pb-0">
      <HeroPortal>
        <div className="bg-[#161921] px-3 md:px-6 pt-4 md:pt-6 pb-5 md:pb-7" data-testid="drivers-hero">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-2xl md:text-4xl font-bold text-white" data-testid="text-page-title">
                {lang === "de" ? "Fahrer" : "Autisti"}
              </h1>
              <p className="text-sm text-white/60">
                {lang === "de"
                  ? "Live-Übersicht Ihrer Auslieferungen und Fahrer."
                  : "Panoramica live delle consegne e degli autisti."}
              </p>
            </div>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-[150px] h-9 bg-white/10 border-white/20 text-white [color-scheme:dark]"
              data-testid="input-drivers-date"
            />
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2 md:gap-3 max-w-xl">
            {[
              { label: lang === "de" ? "Stopps" : "Fermate", value: totals.total, icon: MapPin },
              { label: lang === "de" ? "Offen" : "Aperte", value: totals.open, icon: Clock },
              { label: lang === "de" ? "Geliefert" : "Consegnate", value: totals.delivered, icon: PackageCheck },
              { label: lang === "de" ? "Probleme" : "Problemi", value: totals.problems, icon: AlertTriangle },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-xl bg-white/[0.06] border border-white/10 px-2.5 py-2" data-testid={`kpi-${kpi.label}`}>
                <p className="text-lg md:text-xl font-bold text-white leading-none tabular-nums">{kpi.value}</p>
                <p className="text-[10px] md:text-[11px] text-white/55 mt-1 truncate">{kpi.label}</p>
              </div>
            ))}
          </div>
        </div>
      </HeroPortal>

      {/* Live map of active drivers */}
      <div className="rounded-2xl overflow-hidden border h-[300px] md:h-[380px] relative z-0" data-testid="office-driver-map">
        <MapContainer center={center} zoom={10} className="h-full w-full" scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {pins.map((p) => (
            <Marker
              key={p.loc.driverMemberId}
              position={[p.lat, p.lng]}
              icon={driverPin(p.loc.driver.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2))}
            >
              <Popup>
                <div className="space-y-0.5 min-w-[140px]">
                  <p className="font-semibold text-sm">{p.loc.driver.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(p.loc.updatedAt), { addSuffix: true, locale: dateLocale })}
                  </p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
        {pins.length === 0 && (
          <div className="absolute inset-x-0 bottom-0 z-[500] bg-gradient-to-t from-black/60 to-transparent px-4 py-3 pointer-events-none">
            <p className="text-xs text-white/90 font-medium" data-testid="text-no-live-drivers">
              {lang === "de"
                ? "Aktuell keine Fahrer mit Live-Position unterwegs."
                : "Nessun autista con posizione live al momento."}
            </p>
          </div>
        )}
      </div>

      {/* Per-driver delivery lists */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : (drivers ?? []).length === 0 ? (
        <div className="rounded-2xl border bg-card px-6 py-14 text-center" data-testid="empty-drivers">
          <Truck className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="font-semibold">{lang === "de" ? "Noch keine Fahrer" : "Nessun autista"}</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            {lang === "de"
              ? "Fügen Sie unter Team ein Mitglied mit der Rolle „Fahrer“ hinzu, um Lieferungen zuzuweisen."
              : "Aggiungi un membro con il ruolo \u201eAutista\u201c nel team per assegnare le consegne."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(drivers ?? []).map((driver) => {
            const stops = byDriver.get(driver.id) ?? [];
            const delivered = stops.filter((s) => s.status === "delivered").length;
            const online = pins.some((p) => p.loc.driverMemberId === driver.id);
            return (
              <div key={driver.id} className="rounded-2xl border bg-card overflow-hidden" data-testid={`card-driver-${driver.id}`}>
                <div className="px-4 py-3.5 flex items-center gap-3 border-b border-border/30">
                  <div className="relative">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={driver.profileImageUrl ?? undefined} alt={driver.name} />
                      <AvatarFallback className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-sm font-semibold">
                        {driver.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${online ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
                      title={online ? "Live" : "Offline"}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate" data-testid={`text-driver-name-${driver.id}`}>{driver.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {stops.length === 0
                        ? lang === "de" ? "Keine Stopps" : "Nessuna fermata"
                        : `${delivered}/${stops.length} ${lang === "de" ? "geliefert" : "consegnate"}`}
                    </p>
                  </div>
                  {driver.phone && (
                    <a
                      href={`tel:${driver.phone}`}
                      className="h-9 w-9 rounded-full inline-flex items-center justify-center bg-muted hover:bg-muted/70 transition-colors"
                      data-testid={`button-call-driver-${driver.id}`}
                      aria-label={lang === "de" ? "Anrufen" : "Chiama"}
                    >
                      <Phone className="h-4 w-4" />
                    </a>
                  )}
                </div>
                {stops.length > 0 && (
                  <>
                    <div className="h-1 bg-muted">
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${stops.length ? (delivered / stops.length) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="divide-y divide-border/20">
                      {stops.map((stop, i) => {
                        const meta = DELIVERY_STATUS_META[stop.status as keyof typeof DELIVERY_STATUS_META];
                        return (
                          <Link
                            key={stop.id}
                            href={`/supplier/orders/${stop.orderId}`}
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors"
                            data-testid={`row-stop-${stop.id}`}
                          >
                            <span className="h-6 w-6 rounded-full bg-[#161921] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                              {i + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {stop.restaurant.companyName || stop.restaurant.name}
                                {stop.priority === "high" && (
                                  <Flag className="inline h-3 w-3 ml-1.5 text-red-500" aria-label="Dringend" />
                                )}
                              </p>
                              <p className="text-[11px] text-muted-foreground truncate">
                                #{formatOrderNumber(stop.order)}
                                {stop.timeWindow ? ` · ${stop.timeWindow}` : ""}
                              </p>
                            </div>
                            {meta && (
                              <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 shrink-0 ${meta.pillClass}`}>
                                {lang === "de" ? meta.labelDe : meta.labelIt}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
