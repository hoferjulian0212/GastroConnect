import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, Download, Calendar as CalendarIcon, CalendarClock, Clock, Package, Truck, CheckCircle, AlertTriangle } from "lucide-react";
import { format, addMonths, addWeeks, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday } from "date-fns";
import { de, it } from "date-fns/locale";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DarkHero } from "@/components/DarkHero";
import { SectionTabs } from "@/components/SectionTabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatOrderNumber, type OrderWithDetails } from "@shared/schema";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ViewMode = "month" | "week";

const fmtDateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function isOverdue(o: OrderWithDetails): boolean {
  if (!o.requestedDeliveryDate) return false;
  if (o.status === "delivered" || o.status === "cancelled") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dd = new Date(o.requestedDeliveryDate + "T00:00:00");
  return dd < today;
}

function statusMeta(o: OrderWithDetails, lang: "de" | "it") {
  if (isOverdue(o)) {
    return {
      key: "overdue",
      label: lang === "de" ? "Verspätet" : "In ritardo",
      dot: "bg-red-500",
      chip: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-900/60",
      icon: AlertTriangle,
    };
  }
  switch (o.status) {
    case "delivered":
      return {
        key: "delivered",
        label: lang === "de" ? "Geliefert" : "Consegnato",
        dot: "bg-green-500",
        chip: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-900/60",
        icon: CheckCircle,
      };
    case "scheduled":
      return {
        key: "scheduled",
        label: lang === "de" ? "Geplant" : "Pianificato",
        dot: "bg-indigo-500",
        chip: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900/60",
        icon: CalendarClock,
      };
    case "in_delivery":
      return {
        key: "in_delivery",
        label: lang === "de" ? "Unterwegs" : "In viaggio",
        dot: "bg-purple-500",
        chip: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-900/60",
        icon: Truck,
      };
    case "partially_confirmed":
      return {
        key: "partially_confirmed",
        label: lang === "de" ? "Teilweise bestätigt" : "Parzialmente confermato",
        dot: "bg-orange-500",
        chip: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-orange-200 dark:border-orange-900/60",
        icon: AlertTriangle,
      };
    default:
      return {
        key: "confirmed",
        label: lang === "de" ? "Bestätigt" : "Confermato",
        dot: "bg-blue-500",
        chip: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-900/60",
        icon: Package,
      };
  }
}

interface CalendarProps {
  role: "restaurant" | "supplier";
}

export default function CalendarPage({ role }: CalendarProps) {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const [, setLocation] = useLocation();
  const dateLocale = lang === "it" ? it : de;
  const [view, setView] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [openDay, setOpenDay] = useState<string | null>(null);

  const range = useMemo(() => {
    if (view === "month") {
      const monthStart = startOfMonth(cursor);
      const monthEnd = endOfMonth(cursor);
      const from = startOfWeek(monthStart, { weekStartsOn: 1 });
      const to = endOfWeek(monthEnd, { weekStartsOn: 1 });
      return { from, to };
    }
    const from = startOfWeek(cursor, { weekStartsOn: 1 });
    const to = endOfWeek(cursor, { weekStartsOn: 1 });
    return { from, to };
  }, [cursor, view]);

  const fromKey = fmtDateKey(range.from);
  const toKey = fmtDateKey(range.to);

  const { data: deliveries, isLoading } = useQuery<OrderWithDetails[]>({
    queryKey: [`/api/calendar/deliveries?userId=${currentUser?.id}&role=${role}&from=${fromKey}&to=${toKey}`],
    enabled: !!currentUser?.id,
  });

  const dayMap = useMemo(() => {
    const map = new Map<string, OrderWithDetails[]>();
    for (const o of deliveries || []) {
      if (!o.requestedDeliveryDate) continue;
      const list = map.get(o.requestedDeliveryDate) || [];
      list.push(o);
      map.set(o.requestedDeliveryDate, list);
    }
    return map;
  }, [deliveries]);

  const days = useMemo(() => {
    const arr: Date[] = [];
    let d = range.from;
    while (d <= range.to) {
      arr.push(d);
      d = addDays(d, 1);
    }
    return arr;
  }, [range]);

  const monthLabel = format(cursor, "MMMM yyyy", { locale: dateLocale });
  const weekLabel = `${format(range.from, "d. MMM", { locale: dateLocale })} – ${format(range.to, "d. MMM yyyy", { locale: dateLocale })}`;
  const weekdayLabels = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => format(addDays(start, i), "EEE", { locale: dateLocale }));
  }, [dateLocale]);

  const handlePrev = () => setCursor(view === "month" ? addMonths(cursor, -1) : addWeeks(cursor, -1));
  const handleNext = () => setCursor(view === "month" ? addMonths(cursor, 1) : addWeeks(cursor, 1));
  const handleToday = () => setCursor(new Date());

  const handleExport = () => {
    if (!currentUser?.id) return;
    window.open(`/api/calendar/deliveries.ics?userId=${currentUser.id}&role=${role}`, "_blank");
  };

  const openDayOrders = openDay ? (dayMap.get(openDay) || []) : [];

  const handleOpenOrder = (orderId: string) => {
    setOpenDay(null);
    setLocation(`/${role}/orders/${orderId}`);
  };

  return (
    <>
      <DarkHero testId="calendar-hero">
        <SectionTabs />
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl md:text-3xl font-bold text-white">
              {lang === "de" ? "Lieferkalender" : "Calendario consegne"}
            </h1>
            <p className="hidden md:block text-sm text-white/50 mt-1">
              {lang === "de"
                ? "Übersicht aller anstehenden Lieferungen"
                : "Panoramica di tutte le consegne in arrivo"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
            data-testid="button-calendar-export-ics"
          >
            <Download className="h-4 w-4 mr-2" />
            {lang === "de" ? "ICS exportieren" : "Esporta ICS"}
          </Button>
        </div>
      </DarkHero>

      <div className="px-3 md:px-6 pb-24 md:pb-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePrev} data-testid="button-calendar-prev">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleToday} data-testid="button-calendar-today">
              {lang === "de" ? "Heute" : "Oggi"}
            </Button>
            <Button variant="outline" size="icon" onClick={handleNext} data-testid="button-calendar-next">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <h2 className="text-base md:text-lg font-semibold ml-2 capitalize" data-testid="text-calendar-period">
              {view === "month" ? monthLabel : weekLabel}
            </h2>
          </div>
          <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="month" data-testid="tab-calendar-month">
                {lang === "de" ? "Monat" : "Mese"}
              </TabsTrigger>
              <TabsTrigger value="week" data-testid="tab-calendar-week">
                {lang === "de" ? "Woche" : "Settimana"}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? (
          <Skeleton className="h-[480px] w-full rounded-2xl" />
        ) : view === "month" ? (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="grid grid-cols-7 bg-muted/40 text-xs font-medium text-muted-foreground">
              {weekdayLabels.map((d) => (
                <div key={d} className="px-2 py-2 text-center capitalize">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const key = fmtDateKey(day);
                const inMonth = isSameMonth(day, cursor);
                const today = isToday(day);
                const orders = dayMap.get(key) || [];
                return (
                  <button
                    type="button"
                    key={key}
                    onClick={() => orders.length > 0 && setOpenDay(key)}
                    className={`relative min-h-[88px] md:min-h-[110px] border-t border-l border-border p-1.5 md:p-2 text-left transition-colors ${
                      inMonth ? "bg-card" : "bg-muted/20 text-muted-foreground"
                    } ${orders.length > 0 ? "hover-elevate cursor-pointer" : "cursor-default"}`}
                    data-testid={`calendar-day-${key}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs md:text-sm font-medium ${today ? "inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground" : ""}`}>
                        {day.getDate()}
                      </span>
                      {orders.length > 0 && (
                        <span className="text-[10px] text-muted-foreground">{orders.length}</span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {orders.slice(0, 3).map((o) => {
                        const meta = statusMeta(o, lang);
                        const counterparty = role === "restaurant"
                          ? (o.supplier?.companyName || o.supplier?.name || "")
                          : (o.restaurant?.companyName || o.restaurant?.name || "");
                        return (
                          <div
                            key={o.id}
                            className={`flex items-center gap-1 truncate px-1.5 py-0.5 rounded text-[10px] md:text-[11px] border ${meta.chip}`}
                            title={`${counterparty} · ${meta.label}`}
                          >
                            <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${meta.dot}`} />
                            <span className="truncate">{counterparty}</span>
                          </div>
                        );
                      })}
                      {orders.length > 3 && (
                        <div className="text-[10px] text-muted-foreground px-1.5">
                          +{orders.length - 3} {lang === "de" ? "weitere" : "altri"}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-7">
              {days.map((day) => {
                const key = fmtDateKey(day);
                const today = isToday(day);
                const orders = dayMap.get(key) || [];
                return (
                  <div
                    key={key}
                    className="border-t md:border-t-0 md:border-l first:border-l-0 first:border-t-0 border-border p-3 min-h-[160px]"
                    data-testid={`calendar-week-day-${key}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-medium capitalize text-muted-foreground`}>
                        {format(day, "EEE", { locale: dateLocale })}
                      </span>
                      <span className={`text-sm font-semibold ${today ? "inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-full bg-primary text-primary-foreground" : ""}`}>
                        {day.getDate()}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {orders.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">—</p>
                      ) : (
                        orders.map((o) => {
                          const meta = statusMeta(o, lang);
                          const Icon = meta.icon;
                          const counterparty = role === "restaurant"
                            ? (o.supplier?.companyName || o.supplier?.name || "")
                            : (o.restaurant?.companyName || o.restaurant?.name || "");
                          const orderNo = formatOrderNumber({ orderNumber: o.orderNumber, id: o.id });
                          return (
                            <button
                              key={o.id}
                              type="button"
                              onClick={() => handleOpenOrder(o.id)}
                              className={`w-full text-left flex items-start gap-1.5 px-2 py-1.5 rounded-lg border ${meta.chip} hover-elevate`}
                              data-testid={`calendar-week-order-${o.id}`}
                            >
                              <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="text-[11px] font-medium truncate">{counterparty}</div>
                                <div className="text-[10px] opacity-80">#{orderNo}</div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <LegendItem dot="bg-blue-500" label={lang === "de" ? "Bestätigt" : "Confermato"} />
          <LegendItem dot="bg-orange-500" label={lang === "de" ? "Teilweise" : "Parziale"} />
          <LegendItem dot="bg-purple-500" label={lang === "de" ? "In Lieferung" : "In consegna"} />
          <LegendItem dot="bg-green-500" label={lang === "de" ? "Geliefert" : "Consegnato"} />
          <LegendItem dot="bg-red-500" label={lang === "de" ? "Verspätet" : "In ritardo"} />
        </div>
      </div>

      <Dialog open={!!openDay} onOpenChange={(o) => !o && setOpenDay(null)}>
        <DialogContent data-testid="dialog-calendar-day">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              {openDay ? format(new Date(openDay + "T00:00:00"), "EEEE, d. MMMM yyyy", { locale: dateLocale }) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {openDayOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">{lang === "de" ? "Keine Lieferungen" : "Nessuna consegna"}</p>
            ) : (
              openDayOrders.map((o) => {
                const meta = statusMeta(o, lang);
                const Icon = meta.icon;
                const counterparty = role === "restaurant"
                  ? (o.supplier?.companyName || o.supplier?.name || "")
                  : (o.restaurant?.companyName || o.restaurant?.name || "");
                const orderNo = formatOrderNumber({ orderNumber: o.orderNumber, id: o.id });
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => handleOpenOrder(o.id)}
                    className="w-full text-left p-3 rounded-xl border border-border hover-elevate"
                    data-testid={`calendar-day-order-${o.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{counterparty}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          #{orderNo} · {(o.items || []).length} {lang === "de" ? "Artikel" : "articoli"}
                        </div>
                      </div>
                      <Badge variant="outline" className={`${meta.chip} shrink-0`}>
                        <Icon className="h-3 w-3 mr-1" />
                        {meta.label}
                      </Badge>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LegendItem({ dot, label }: { dot: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      <span>{label}</span>
    </div>
  );
}
