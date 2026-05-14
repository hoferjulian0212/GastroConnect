import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Search, Package, Calendar, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import {
  MobilePageHeader,
  MobileFilterChip,
  MobileSearchBar,
  MobileEmptyState,
  MobileStatusPill,
  statusToTone,
} from "@/components/mobile";
import PullToRefreshWrapper from "@/components/PullToRefreshWrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatOrderNumber, type OrderWithDetails } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { getOrderStatus } from "@/lib/translations";

interface RestaurantOrdersMobileProps {
  orders: OrderWithDetails[] | undefined;
  isLoading: boolean;
  currentUserId: string;
  lang: "de" | "it";
  dateLocale: any;
  initialStatus?: string;
}

const STATUS_FILTERS: { key: string; labelDe: string; labelIt: string }[] = [
  { key: "all", labelDe: "Alle", labelIt: "Tutti" },
  { key: "pending", labelDe: "Offen", labelIt: "In sospeso" },
  { key: "confirmed", labelDe: "Bestätigt", labelIt: "Confermati" },
  { key: "in_delivery", labelDe: "Unterwegs", labelIt: "In consegna" },
  { key: "delivered", labelDe: "Geliefert", labelIt: "Consegnati" },
  { key: "cancelled", labelDe: "Storniert", labelIt: "Annullati" },
];

export default function RestaurantOrdersMobile({
  orders,
  isLoading,
  currentUserId,
  lang,
  dateLocale,
  initialStatus,
}: RestaurantOrdersMobileProps) {
  const [, setLocation] = useLocation();
  const [filterStatus, setFilterStatus] = useState<string>(initialStatus || "all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!orders) return [];
    return orders.filter((o) => {
      if (filterStatus !== "all" && o.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        const num = formatOrderNumber(o).toLowerCase();
        const sup = (o.supplier?.companyName || "").toLowerCase();
        if (!num.includes(q) && !sup.includes(q)) return false;
      }
      return true;
    });
  }, [orders, filterStatus, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, OrderWithDetails[]>();
    for (const o of filtered) {
      const key = format(new Date(o.createdAt), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return Array.from(map.entries()).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [filtered]);

  const dayLabel = (key: string) => {
    const d = new Date(key);
    const today = format(new Date(), "yyyy-MM-dd");
    const ymd = format(d, "yyyy-MM-dd");
    if (ymd === today) return lang === "it" ? "Oggi" : "Heute";
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    if (ymd === format(yest, "yyyy-MM-dd")) return lang === "it" ? "Ieri" : "Gestern";
    return format(d, "EEEE, d. MMM", { locale: dateLocale });
  };

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: [`/api/orders?restaurantId=${currentUserId}`] });
  };

  return (
    <div className="md:hidden flex flex-col min-h-screen bg-background">
      <MobilePageHeader
        title={lang === "it" ? "Ordini" : "Bestellungen"}
        subtitle={
          orders
            ? `${filtered.length} ${
                lang === "it" ? "ordini" : "Bestellungen"
              }`
            : undefined
        }
        search={
          <MobileSearchBar
            value={search}
            onChange={setSearch}
            placeholder={lang === "it" ? "Cerca ordini..." : "Bestellungen suchen..."}
          />
        }
        filters={
          <>
            {STATUS_FILTERS.map((f) => (
              <MobileFilterChip
                key={f.key}
                active={filterStatus === f.key}
                onClick={() => setFilterStatus(f.key)}
                testId={`chip-status-${f.key}`}
              >
                {lang === "it" ? f.labelIt : f.labelDe}
              </MobileFilterChip>
            ))}
          </>
        }
      />

      <PullToRefreshWrapper onRefresh={handleRefresh} className="flex-1">
        <div
          className="px-4 pt-4 space-y-5"
          style={{ paddingBottom: "var(--mobile-bottom-pad)" }}
        >
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
          ) : grouped.length === 0 ? (
            <MobileEmptyState
              icon={<Package className="h-10 w-10" />}
              title={lang === "it" ? "Nessun ordine" : "Keine Bestellungen"}
              description={
                lang === "it"
                  ? "Le tue prossime ordini appariranno qui."
                  : "Deine nächsten Bestellungen erscheinen hier."
              }
            />
          ) : (
            grouped.map(([dayKey, list]) => (
              <div key={dayKey}>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                  {dayLabel(dayKey)}
                </div>
                <div className="space-y-2">
                  {list.map((o) => {
                    const total = parseFloat(String(o.totalAmount || 0));
                    const itemCount = (o.items || []).reduce(
                      (s, it) => s + (it.quantity || 0),
                      0
                    );
                    const tone = statusToTone(o.status);
                    const accent =
                      tone === "amber"
                        ? "amber"
                        : tone === "red"
                        ? "red"
                        : tone === "emerald"
                        ? "emerald"
                        : tone === "purple"
                        ? "indigo"
                        : "blue";
                    return (
                      <button
                        key={o.id}
                        onClick={() => setLocation(`/restaurant/orders/${o.id}`)}
                        data-testid={`card-order-${o.id}`}
                        className={`w-full text-left flex items-center gap-3 p-3 rounded-2xl bg-card border border-border border-l-4 ${
                          accent === "amber" ? "border-l-amber-500" :
                          accent === "blue" ? "border-l-blue-500" :
                          accent === "indigo" ? "border-l-indigo-500" :
                          accent === "emerald" ? "border-l-emerald-500" :
                          accent === "red" ? "border-l-red-500" :
                          accent === "orange" ? "border-l-orange-500" :
                          "border-l-slate-300"
                        } active:scale-[0.98] transition-transform`}
                      >
                        <Avatar className="h-11 w-11 shrink-0">
                          {o.supplier?.profileImageUrl && (
                            <AvatarImage src={o.supplier.profileImageUrl} />
                          )}
                          <AvatarFallback className="text-[12px] font-semibold">
                            {(o.supplier?.companyName || "?").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="text-[14px] font-semibold text-foreground truncate flex-1">
                              {o.supplier?.companyName ||
                                (lang === "it" ? "Fornitore" : "Lieferant")}
                            </div>
                            <div className="text-[14px] font-bold tabular-nums">
                              {total.toFixed(2)} €
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <MobileStatusPill tone={tone} size="sm">
                              {getOrderStatus(o.status, lang)}
                            </MobileStatusPill>
                            <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                              <Package className="h-3 w-3" />
                              {itemCount}×
                            </span>
                            {o.requestedDeliveryDate && (
                              <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1 ml-auto">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(o.requestedDeliveryDate), "d. MMM", {
                                  locale: dateLocale,
                                })}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground/70 mt-1 truncate">
                            {formatOrderNumber(o)}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </PullToRefreshWrapper>
    </div>
  );
}
