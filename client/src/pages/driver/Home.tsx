import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { HeroPortal } from "@/context/HeroContext";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import PullToRefreshWrapper from "@/components/PullToRefreshWrapper";
import StaggeredList from "@/components/StaggeredList";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Package, Clock, ChevronRight, Truck, Flag } from "lucide-react";
import { StatusPill } from "./DeliveryStatus";
import type { DeliveryAssignmentWithDetails } from "@shared/schema";

export function DeliveryStopCard({
  delivery,
  index,
  onClick,
  lang,
}: {
  delivery: DeliveryAssignmentWithDetails;
  index: number;
  onClick: () => void;
  lang: "de" | "it";
}) {
  const r = delivery.restaurant;
  const address = [r.address, r.city].filter(Boolean).join(", ");
  const done = delivery.status === "delivered";
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-2xl border bg-card p-4 transition-all hover:shadow-md active:scale-[0.99] ${
        done ? "opacity-60" : ""
      }`}
      data-testid={`card-delivery-${delivery.id}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-sm font-bold ${
            done
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              : "bg-[#161921] text-white dark:bg-white dark:text-black"
          }`}
        >
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
             <p className="font-semibold truncate" data-testid={`text-restaurant-${delivery.id}`}>
              {r.companyName || r.name}
            </p>
            <StatusPill status={delivery.status} lang={lang} />
          </div>
          {address && (
            <p className="text-sm text-muted-foreground truncate flex items-center gap-1 mt-0.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {address}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
            {delivery.timeWindow && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {delivery.timeWindow}
              </span>
            )}
            {delivery.packages != null && (
              <span className="flex items-center gap-1">
                <Package className="h-3.5 w-3.5" />
                {delivery.packages} {lang === "de" ? "Pakete" : "colli"}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Truck className="h-3.5 w-3.5" />
              {delivery.order.items.length} {lang === "de" ? "Artikel" : "articoli"}
            </span>
            {delivery.priority === "high" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-2 py-0.5 font-semibold">
                <Flag className="h-3 w-3" />
                {lang === "de" ? "Dringend" : "Urgente"}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 self-center" />
      </div>
    </button>
  );
}

export default function DriverHome() {
  const { currentMember } = useUser();
  const { lang } = useLanguage();
  const [, setLocation] = useLocation();

  const { data: deliveries, isLoading } = useQuery<DeliveryAssignmentWithDetails[]>({
    queryKey: ["/api/driver/deliveries"],
    refetchInterval: 30_000,
  });
  const { data: routeData } = useQuery<{ route: { status: string; activeStopId: string | null } }>({
    queryKey: ["/api/driver/route", "today"],
    queryFn: async () => {
      const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
      const r = await fetch(`/api/driver/route?date=${d}`);
      if (!r.ok) throw new Error("route-load");
      return r.json();
    },
    refetchInterval: 15_000,
  });
  const startRoute = useMutation({
    mutationFn: async () => {
      const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
      return (await apiRequest("POST", "/api/driver/route/start", { deliveryDate: d })).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/route", "today"] });
    },
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/driver/deliveries"] });
  };

  const list = deliveries ?? [];
  const deliveredCount = list.filter((d) => d.status === "delivered").length;
  const openCount = list.filter((d) => !["delivered", "problem", "rejected"].includes(d.status)).length;
  const today = new Date().toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <PullToRefreshWrapper onRefresh={refresh}>
      <div className="space-y-4 md:space-y-6 pb-[var(--mobile-bottom-pad)] md:pb-0">
        <HeroPortal>
          <div className="bg-[#161921] px-3 md:px-6 pt-4 md:pt-6 pb-5 md:pb-7 space-y-4" data-testid="driver-home-hero">
            <div className="space-y-1">
              <p className="text-xs md:text-sm font-medium text-white/50 capitalize" data-testid="text-today">
                {today}
              </p>
              <h1 className="text-2xl md:text-4xl font-bold text-white" data-testid="text-page-title">
                {lang === "de" ? "Heutige Lieferungen" : "Consegne di oggi"}
              </h1>
              {currentMember && (
                <p className="text-sm text-white/60">
                  {lang === "de" ? `Hallo ${currentMember.name.split(" ")[0]}!` : `Ciao ${currentMember.name.split(" ")[0]}!`}
                </p>
              )}
            </div>
            {list.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                    style={{ width: `${list.length ? (deliveredCount / list.length) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-sm font-semibold text-white/80 shrink-0" data-testid="text-progress">
                  {deliveredCount}/{list.length} {lang === "de" ? "geliefert" : "consegnate"}
                </p>
              </div>
            )}
          </div>
        </HeroPortal>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-2xl border bg-card px-6 py-14 text-center" data-testid="empty-deliveries">
            <Truck className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="font-semibold">
              {lang === "de" ? "Keine Lieferungen für heute" : "Nessuna consegna per oggi"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {lang === "de"
                ? "Sobald das Büro Ihnen eine Lieferung zuweist, erscheint sie hier."
                : "Le consegne assegnate dall'ufficio appariranno qui."}
            </p>
          </div>
        ) : (
          <StaggeredList className="space-y-3">
            {list.map((d, i) => (
              <DeliveryStopCard
                key={d.id}
                delivery={d}
                index={i}
                lang={lang}
                onClick={() => setLocation(`/supplier/delivery/${d.id}`)}
              />
            ))}
          </StaggeredList>
        )}

        {openCount > 0 && routeData?.route.status === "confirmed" && (
          <button
            onClick={() => startRoute.mutate()}
            disabled={startRoute.isPending}
            className="w-full rounded-2xl bg-emerald-600 p-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
            data-testid="button-start-route"
          >
            <Flag className="h-4 w-4" />
            {startRoute.isPending ? (lang === "de" ? "Route wird gestartet…" : "Avvio percorso…") : (lang === "de" ? "Gesamte Route starten" : "Avvia percorso completo")}
          </button>
        )}
        {openCount > 0 && routeData?.route.status !== "active" && routeData?.route.status !== "completed" && (
          <button
            onClick={() => setLocation("/supplier/route")}
            className="w-full rounded-2xl border border-dashed p-4 text-sm font-medium text-muted-foreground hover:bg-muted/40 transition-colors"
            data-testid="button-goto-route"
          >
            {lang === "de" ? "Route planen & optimieren →" : "Pianifica e ottimizza il percorso →"}
          </button>
        )}
      </div>
    </PullToRefreshWrapper>
  );
}
