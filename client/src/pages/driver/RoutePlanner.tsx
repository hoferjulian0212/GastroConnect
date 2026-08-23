import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { HeroPortal } from "@/context/HeroContext";
import { useLanguage } from "@/context/LanguageContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GripVertical, MapPin, Sparkles, Loader2, Clock, Route as RouteIcon, CheckCircle2, Play, CalendarDays } from "lucide-react";
import { StatusPill } from "./DeliveryStatus";
import type { DeliveryAssignmentWithDetails } from "@shared/schema";

function romeToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
}

function SortableStop({
  delivery,
  index,
  lang,
  onOpen,
  disabled,
}: {
  delivery: DeliveryAssignmentWithDetails;
  index: number;
  lang: "de" | "it";
  onOpen: () => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: delivery.id,
    disabled,
  });
  const r = delivery.restaurant;
  const address = [r.address, r.city].filter(Boolean).join(", ");

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-2xl border bg-card p-3.5 flex items-center gap-3 ${
        isDragging ? "shadow-lg ring-2 ring-primary/30 z-10 relative" : ""
      } ${disabled ? "opacity-60" : ""}`}
      data-testid={`stop-${delivery.id}`}
    >
      {!disabled && (
        <button
          {...attributes}
          {...listeners}
          className="touch-none p-1.5 -ml-1 text-muted-foreground cursor-grab active:cursor-grabbing"
          data-testid={`handle-${delivery.id}`}
        >
          <GripVertical className="h-5 w-5" />
        </button>
      )}
      <div
        className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold ${
          disabled
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
            : "bg-[#161921] text-white dark:bg-white dark:text-black"
        }`}
      >
        {disabled ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
      </div>
      <button className="flex-1 min-w-0 text-left" onClick={onOpen} data-testid={`stop-open-${delivery.id}`}>
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-sm truncate">{r.companyName || r.name}</p>
          <StatusPill status={delivery.status} lang={lang} />
        </div>
        {address && (
          <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
            <MapPin className="h-3 w-3 shrink-0" />
            {address}
          </p>
        )}
        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
          {delivery.timeWindow && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {delivery.timeWindow}
            </span>
          )}
          {delivery.etaMinutes != null && (
            <span className="font-medium text-blue-600 dark:text-blue-400">
              ETA ~{delivery.etaMinutes} min
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

export default function DriverRoutePlanner() {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [orderedIds, setOrderedIds] = useState<string[] | null>(null);
  const [date, setDate] = useState(romeToday);

  const { data: routeData, isLoading } = useQuery<{ route: any; deliveries: DeliveryAssignmentWithDetails[] }>({
    queryKey: ["/api/driver/route", date],
    queryFn: async () => {
      const r = await fetch(`/api/driver/route?date=${date}`);
      if (!r.ok) throw new Error("route-load");
      return r.json();
    },
    refetchInterval: 60_000,
  });

  const list = routeData?.deliveries ?? [];
  const route = routeData?.route;
  const doneList = list.filter((d) => ["delivered", "problem", "rejected"].includes(d.status));
  const openList = list.filter((d) => !["delivered", "problem", "rejected"].includes(d.status));

  // Local drag order (open stops only); resets when server data changes.
  useEffect(() => {
    setOrderedIds(openList.map((d) => d.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(openList.map((d) => d.id))]);

  const orderedOpen = (orderedIds ?? openList.map((d) => d.id))
    .map((id) => openList.find((d) => d.id === id))
    .filter((d): d is DeliveryAssignmentWithDetails => !!d);
  const missingCoordinates = openList.filter((d) => !d.restaurant.latitude || !d.restaurant.longitude);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  const reorderMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const r = await apiRequest("PATCH", "/api/driver/route/reorder", {
        deliveryDate: date,
        orderedIds: [...doneList.map((d) => d.id), ...ids],
      });
      return r.json();
    },
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/driver/route", date] }),
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/route", date] });
      toast({ title: lang === "de" ? "Speichern fehlgeschlagen" : "Salvataggio non riuscito", variant: "destructive" });
    },
  });

  const optimizeMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/driver/route/optimize", { deliveryDate: date });
      return r.json() as Promise<{ deliveries: DeliveryAssignmentWithDetails[]; optimized: boolean; trafficAware: boolean; message?: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/route", date] });
      if (!data.optimized) {
        toast({ title: data.message ?? (lang === "de" ? "Keine Optimierung möglich" : "Ottimizzazione non possibile") });
      } else {
        toast({
          title: lang === "de" ? "Route optimiert ✓" : "Percorso ottimizzato ✓",
          description: data.trafficAware
            ? lang === "de"
              ? "Mit Echtzeit-Verkehrsdaten berechnet."
              : "Calcolato con dati sul traffico in tempo reale."
            : lang === "de"
              ? "Nach kürzester Distanz sortiert."
              : "Ordinato per distanza più breve.",
        });
      }
    },
    onError: () =>
      toast({ title: lang === "de" ? "Optimierung fehlgeschlagen" : "Ottimizzazione non riuscita", variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/driver/route/confirm", { deliveryDate: date })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/route", date] });
      toast({ title: lang === "de" ? "Route bestätigt ✓" : "Percorso confermato ✓" });
    },
    onError: () => toast({ title: lang === "de" ? "Route konnte nicht bestätigt werden" : "Percorso non confermato", variant: "destructive" }),
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = orderedOpen.map((d) => d.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(ids, from, to);
    setOrderedIds(next);
    reorderMutation.mutate(next);
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-[var(--mobile-bottom-pad)] md:pb-0">
      <HeroPortal>
        <div className="bg-[#161921] px-3 md:px-6 pt-4 md:pt-6 pb-5 md:pb-7 space-y-4" data-testid="route-hero">
          <div className="space-y-1">
            <h1 className="text-2xl md:text-4xl font-bold text-white" data-testid="text-page-title">
              {lang === "de" ? "Routenplaner" : "Pianifica percorso"}
            </h1>
            <p className="text-sm text-white/60">
              {lang === "de"
                ? "Stopps per Ziehen sortieren oder automatisch optimieren."
                : "Trascina le fermate per ordinarle o ottimizza automaticamente."}
            </p>
            <div className="flex items-center gap-2 pt-2">
              <CalendarDays className="h-4 w-4 text-white/60" />
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg bg-white/10 text-white px-2 py-1.5 text-sm" data-testid="input-route-date" />
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/75" data-testid="route-state">
                {route?.status === "confirmed" ? (lang === "de" ? "Bestätigt" : "Confermato") :
                  route?.status === "active" ? (lang === "de" ? "Aktiv" : "Attivo") :
                  route?.status === "completed" ? (lang === "de" ? "Abgeschlossen" : "Completato") :
                  (lang === "de" ? "Entwurf" : "Bozza")}
              </span>
            </div>
            {missingCoordinates.length > 0 && (
              <p className="text-xs text-amber-200" data-testid="route-warning-coordinates">
                {lang === "de"
                  ? `${missingCoordinates.length} Stopp(s) ohne Koordinaten bleiben am Ende der Route.`
                  : `${missingCoordinates.length} fermata/e senza coordinate rimangono alla fine del percorso.`}
              </p>
            )}
          </div>
          <Button
            size="lg"
            className="w-full md:w-auto h-12 font-semibold border-0 bg-white text-black hover:bg-white/90"
            disabled={optimizeMutation.isPending || openList.length < 2 || route?.status === "active"}
            onClick={() => optimizeMutation.mutate()}
            data-testid="button-optimize-route"
          >
            {optimizeMutation.isPending ? (
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-5 w-5 mr-2" />
            )}
            {lang === "de" ? "Route optimieren" : "Ottimizza percorso"}
          </Button>
          {route?.status === "draft" && (
            <Button size="lg" variant="outline" className="w-full md:w-auto h-12 font-semibold bg-transparent text-white border-white/30 hover:bg-white/10 hover:text-white" onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending || openList.length === 0} data-testid="button-confirm-route">
              {confirmMutation.isPending ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
              {lang === "de" ? "Route bestätigen" : "Conferma percorso"}
            </Button>
          )}
        </div>
      </HeroPortal>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border bg-card px-6 py-14 text-center" data-testid="empty-route">
          <RouteIcon className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="font-semibold">{lang === "de" ? "Keine Stopps für heute" : "Nessuna fermata per oggi"}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {lang === "de"
              ? "Zugewiesene Lieferungen erscheinen hier als Route."
              : "Le consegne assegnate appariranno qui come percorso."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {doneList.length > 0 && (
            <div className="space-y-2">
              {doneList.map((d, i) => (
                <SortableStop
                  key={d.id}
                  delivery={d}
                  index={i}
                  lang={lang}
                  disabled
                  onOpen={() => setLocation(`/supplier/delivery/${d.id}`)}
                />
              ))}
            </div>
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedOpen.map((d) => d.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {orderedOpen.map((d, i) => (
                  <SortableStop
                    key={d.id}
                    delivery={d}
                    index={i}
                    lang={lang}
                   disabled={route?.status !== "draft"}
                    onOpen={() => setLocation(`/supplier/delivery/${d.id}`)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          {reorderMutation.isPending && (
            <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {lang === "de" ? "Reihenfolge wird gespeichert…" : "Salvataggio ordine…"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
