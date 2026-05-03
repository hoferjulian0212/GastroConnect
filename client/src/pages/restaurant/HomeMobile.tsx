import { Link } from "wouter";
import { format, isToday, isTomorrow, formatDistanceToNow } from "date-fns";
import { MessageSquare, Calculator, ShoppingBag, Euro, Truck, AlertTriangle, ChevronRight, Plus, FileText, Package, BarChart3, Calendar } from "lucide-react";
import CountUp from "@/components/CountUp";
import PullToRefreshWrapper from "@/components/PullToRefreshWrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { queryClient } from "@/lib/queryClient";
import { MobilePageHeader, MobileSection, MobileSectionLink, MobileListCard, MobileEmptyState, MobileFab, MobileStatusPill, statusToTone } from "@/components/mobile";
import type { OrderWithDetails } from "@shared/schema";
import { getOrderStatus } from "@/lib/translations";

interface Props {
  currentUser: any;
  lang: "de" | "it";
  t: any;
  navigate: (path: string) => void;
  totalUnread: number;
  convLoading: boolean;
  pendingOrdersCount: number;
  ordersLoading: boolean;
  costAnalysis: any;
  costLoading: boolean;
  upcomingDeliveries: OrderWithDetails[] | undefined;
  isLoading: boolean;
  allOrders: OrderWithDetails[] | undefined;
  dateLocale: any;
}

export default function RestaurantHomeMobile({
  currentUser, lang, t, navigate,
  totalUnread, convLoading,
  pendingOrdersCount, ordersLoading,
  costAnalysis, costLoading,
  upcomingDeliveries, isLoading,
  allOrders,
  dateLocale,
}: Props) {
  const greeting = (() => {
    const h = new Date().getHours();
    if (lang === "de") return h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend";
    return h < 11 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera";
  })();

  const todayDeliveries = (upcomingDeliveries || []).filter(o => o.deliveryDate && isToday(new Date(o.deliveryDate)));
  const nextDeliveries = (upcomingDeliveries || []).slice(0, 3);
  const recentActivity = (allOrders || [])
    .slice()
    .sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime())
    .slice(0, 5);

  const fmtPrice = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

  const kpis = [
    {
      label: lang === "de" ? "Nachrichten" : "Messaggi",
      value: convLoading ? "..." : <CountUp end={totalUnread} duration={800} />,
      icon: <MessageSquare className="h-4 w-4" />,
      tone: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
      onClick: () => navigate("/restaurant/inbox"),
      testId: "mobile-kpi-messages",
    },
    {
      label: lang === "de" ? "Offen" : "Aperti",
      value: ordersLoading ? "..." : <CountUp end={pendingOrdersCount} duration={800} />,
      icon: <ShoppingBag className="h-4 w-4" />,
      tone: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
      onClick: () => navigate("/restaurant/orders"),
      testId: "mobile-kpi-orders",
    },
    {
      label: lang === "de" ? "Kosten/Gast" : "Costo/ospite",
      value: costLoading
        ? "..."
        : costAnalysis?.costPerGuest && parseFloat(costAnalysis.costPerGuest) > 0
        ? <CountUp end={parseFloat(costAnalysis.costPerGuest)} duration={1000} decimals={2} suffix="€" />
        : "--",
      icon: <Calculator className="h-4 w-4" />,
      tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
      onClick: () => navigate("/restaurant/cost-analysis"),
      testId: "mobile-kpi-cost-per-guest",
    },
    {
      label: lang === "de" ? "Monat" : "Mese",
      value: costLoading
        ? "..."
        : costAnalysis?.totalCosts && parseFloat(costAnalysis.totalCosts) > 0
        ? <CountUp end={parseFloat(costAnalysis.totalCosts)} duration={1200} suffix="€" formatter={(v: number) => Math.round(v).toLocaleString(lang === "de" ? "de-DE" : "it-IT")} />
        : "--",
      icon: <Euro className="h-4 w-4" />,
      tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
      onClick: () => navigate("/restaurant/cost-analysis"),
      testId: "mobile-kpi-spending",
    },
  ];

  const quickActions = [
    { icon: <Plus className="h-5 w-5" />, label: lang === "de" ? "Bestellen" : "Ordina", to: "/restaurant/catalog", color: "bg-primary text-primary-foreground" },
    { icon: <FileText className="h-5 w-5" />, label: lang === "de" ? "Vorlagen" : "Modelli", to: "/restaurant/templates", color: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" },
    { icon: <AlertTriangle className="h-5 w-5" />, label: lang === "de" ? "Reklamation" : "Reclami", to: "/restaurant/complaints", color: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
    { icon: <BarChart3 className="h-5 w-5" />, label: lang === "de" ? "Vergleich" : "Confronto", to: "/restaurant/price-comparison", color: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
    { icon: <Package className="h-5 w-5" />, label: lang === "de" ? "Lieferanten" : "Fornitori", to: "/restaurant/suppliers", color: "bg-teal-500/15 text-teal-600 dark:text-teal-400" },
  ];

  return (
    <div className="md:hidden">
      <PullToRefreshWrapper
        onRefresh={async () => {
          await queryClient.invalidateQueries({
            predicate: (q) => {
              const k = q.queryKey[0];
              return typeof k === "string" && (k.startsWith("/api/restaurant") || k.startsWith("/api/orders") || k.startsWith("/api/products") || k.startsWith("/api/conversations") || k.startsWith("/api/order-templates"));
            },
          });
        }}
        className="pb-32"
      >
        <MobilePageHeader
          title={currentUser?.companyName || ""}
          subtitle={`${greeting} · ${todayDeliveries.length} ${lang === "de" ? "heute" : "oggi"}`}
          testId="mobile-header-restaurant-home"
        />

        <div className="px-4 -mt-4">
          <div className="grid grid-cols-2 gap-2">
            {kpis.map((k) => (
              <button
                key={k.testId}
                onClick={k.onClick}
                data-testid={k.testId}
                className="text-left rounded-2xl bg-card border border-border p-3 active:scale-[0.98] transition-transform shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</span>
                  <div className={`flex items-center justify-center h-7 w-7 rounded-lg ${k.tone}`}>{k.icon}</div>
                </div>
                <div className="mt-2 text-[22px] font-bold leading-none text-foreground">{k.value}</div>
              </button>
            ))}
          </div>
        </div>

        <MobileSection
          title={lang === "de" ? "Schnellaktionen" : "Azioni rapide"}
          className="mt-6"
        >
          <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide">
            <div className="flex items-stretch gap-2.5 min-w-min pr-4">
              {quickActions.map((qa) => (
                <Link
                  key={qa.label}
                  href={qa.to}
                  data-testid={`mobile-quick-${qa.label}`}
                  className="flex flex-col items-center justify-center gap-2 w-[88px] h-[84px] rounded-2xl bg-card border border-border active:scale-95 transition-transform no-underline"
                >
                  <div className={`flex items-center justify-center h-10 w-10 rounded-full ${qa.color}`}>{qa.icon}</div>
                  <span className="text-[11px] font-semibold text-foreground text-center leading-tight">{qa.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </MobileSection>

        <MobileSection
          title={lang === "de" ? "Anstehende Lieferungen" : "Consegne in arrivo"}
          action={<MobileSectionLink onClick={() => navigate("/restaurant/orders")}>{lang === "de" ? "Alle" : "Tutti"}</MobileSectionLink>}
          className="mt-6"
          testId="mobile-section-deliveries"
        >
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-[68px] rounded-2xl" />)}
            </div>
          ) : nextDeliveries.length === 0 ? (
            <MobileEmptyState
              icon={<Truck className="h-7 w-7" />}
              title={lang === "de" ? "Keine Lieferungen" : "Nessuna consegna"}
              description={lang === "de" ? "Aktuell sind keine Lieferungen geplant." : "Nessuna consegna programmata."}
            />
          ) : (
            <div className="space-y-2">
              {nextDeliveries.map((o) => {
                const date = o.deliveryDate ? new Date(o.deliveryDate) : null;
                const dateLabel = !date ? "" : isToday(date)
                  ? lang === "de" ? "Heute" : "Oggi"
                  : isTomorrow(date)
                  ? lang === "de" ? "Morgen" : "Domani"
                  : format(date, "dd.MM.", { locale: dateLocale });
                return (
                  <MobileListCard
                    key={o.id}
                    onClick={() => navigate(`/restaurant/orders/${o.id}`)}
                    accent={o.status === "in_delivery" ? "indigo" : o.status === "delivered" ? "emerald" : "amber"}
                    leading={
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={o.supplier?.profileImageUrl || undefined} />
                        <AvatarFallback className="text-xs bg-muted">{o.supplier?.companyName?.[0] || "?"}</AvatarFallback>
                      </Avatar>
                    }
                    title={o.supplier?.companyName || ""}
                    subtitle={`${o.items?.length || 0} ${lang === "de" ? "Artikel" : "articoli"} · ${fmtPrice(parseFloat(o.totalPrice as any || "0"))}`}
                    trailing={
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[12px] font-semibold text-foreground">{dateLabel}</span>
                        <MobileStatusPill tone={statusToTone(o.status)} size="sm">
                          {getOrderStatus(o.status as any, lang)}
                        </MobileStatusPill>
                      </div>
                    }
                    testId={`mobile-delivery-${o.id}`}
                  />
                );
              })}
            </div>
          )}
        </MobileSection>

        <MobileSection
          title={lang === "de" ? "Letzte Aktivität" : "Attività recente"}
          action={<MobileSectionLink onClick={() => navigate("/restaurant/orders")}>{lang === "de" ? "Verlauf" : "Storico"}</MobileSectionLink>}
          className="mt-6"
          testId="mobile-section-recent"
        >
          {ordersLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-[60px] rounded-2xl" />)}
            </div>
          ) : recentActivity.length === 0 ? (
            <MobileEmptyState
              icon={<Calendar className="h-7 w-7" />}
              title={lang === "de" ? "Noch keine Bestellungen" : "Nessun ordine"}
              description={lang === "de" ? "Bestelle bei deinen Lieferanten." : "Ordina dai tuoi fornitori."}
            />
          ) : (
            <div className="space-y-2">
              {recentActivity.map(o => (
                <MobileListCard
                  key={o.id}
                  onClick={() => navigate(`/restaurant/orders/${o.id}`)}
                  title={o.supplier?.companyName || ""}
                  subtitle={`${formatDistanceToNow(new Date(o.createdAt as any), { addSuffix: true, locale: dateLocale })} · ${fmtPrice(parseFloat(o.totalPrice as any || "0"))}`}
                  trailing={<MobileStatusPill tone={statusToTone(o.status)} size="sm">{getOrderStatus(o.status as any, lang)}</MobileStatusPill>}
                  showChevron={false}
                  testId={`mobile-recent-${o.id}`}
                />
              ))}
            </div>
          )}
        </MobileSection>
      </PullToRefreshWrapper>

      <MobileFab
        onClick={() => navigate("/restaurant/catalog")}
        icon={<Plus className="h-6 w-6" />}
        label={lang === "de" ? "Bestellen" : "Ordina"}
        testId="mobile-fab-order"
      />
    </div>
  );
}
