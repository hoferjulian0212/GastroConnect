import { useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { HeroPortal } from "@/context/HeroContext";
import { useLanguage } from "@/context/LanguageContext";
import { queryClient } from "@/lib/queryClient";
import PullToRefreshWrapper from "@/components/PullToRefreshWrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { History as HistoryIcon, MapPin, CheckCircle2, AlertTriangle, ChevronRight } from "lucide-react";
import { formatOrderNumber, type DeliveryAssignmentWithDetails } from "@shared/schema";
import { PROBLEM_TYPE_LABELS } from "./DeliveryStatus";

export default function DriverHistory() {
  const { lang } = useLanguage();
  const [, setLocation] = useLocation();

  const { data: rows, isLoading } = useQuery<DeliveryAssignmentWithDetails[]>({
    queryKey: ["/api/driver/deliveries/history"],
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/driver/deliveries/history"] });
  };

  // Group by delivery day, newest first.
  const groups = useMemo(() => {
    const map = new Map<string, DeliveryAssignmentWithDetails[]>();
    for (const r of rows ?? []) {
      const list = map.get(r.deliveryDate) ?? [];
      list.push(r);
      map.set(r.deliveryDate, list);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [rows]);

  const formatDay = (day: string) =>
    new Date(day + "T12:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  return (
    <PullToRefreshWrapper onRefresh={refresh}>
      <div className="space-y-4 md:space-y-6 pb-[var(--mobile-bottom-pad)] md:pb-0">
        <HeroPortal>
          <div className="bg-[#161921] px-3 md:px-6 pt-4 md:pt-6 pb-5 md:pb-7 space-y-1" data-testid="history-hero">
            <h1 className="text-2xl md:text-4xl font-bold text-white" data-testid="text-page-title">
              {lang === "de" ? "Verlauf" : "Cronologia"}
            </h1>
            <p className="text-sm text-white/60">
              {lang === "de" ? "Ihre abgeschlossenen Lieferungen." : "Le tue consegne completate."}
            </p>
          </div>
        </HeroPortal>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-2xl border bg-card px-6 py-14 text-center" data-testid="empty-history">
            <HistoryIcon className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="font-semibold">{lang === "de" ? "Noch keine Lieferungen" : "Ancora nessuna consegna"}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {lang === "de"
                ? "Abgeschlossene Touren erscheinen hier."
                : "I giri completati appariranno qui."}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map(([day, items]) => (
              <div key={day} className="space-y-2">
                <p className="text-sm font-semibold text-muted-foreground capitalize px-1" data-testid={`day-${day}`}>
                  {formatDay(day)}
                </p>
                {items.map((d) => {
                  const problem = d.status === "problem";
                  return (
                    <button
                      key={d.id}
                      onClick={() => setLocation(`/supplier/delivery/${d.id}`)}
                      className="w-full text-left rounded-2xl border bg-card p-4 flex items-center gap-3 hover:shadow-md transition-all active:scale-[0.99]"
                      data-testid={`history-${d.id}`}
                    >
                      <div
                        className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center ${
                          problem
                            ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                            : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400"
                        }`}
                      >
                        {problem ? <AlertTriangle className="h-4.5 w-4.5" /> : <CheckCircle2 className="h-4.5 w-4.5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">
                          {d.restaurant.companyName || d.restaurant.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {[d.restaurant.address, d.restaurant.city].filter(Boolean).join(", ") || `#${formatOrderNumber(d.order)}`}
                        </p>
                        {problem && d.problemType && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                            {PROBLEM_TYPE_LABELS[d.problemType]?.[lang] ?? d.problemType}
                          </p>
                        )}
                        {!problem && d.deliveredAt && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {lang === "de" ? "Zugestellt um" : "Consegnato alle"}{" "}
                            {new Date(d.deliveredAt).toLocaleTimeString(lang === "de" ? "de-DE" : "it-IT", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {d.podRecipient ? ` · ${d.podRecipient}` : ""}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </PullToRefreshWrapper>
  );
}
