import { Link } from "wouter";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, isToday, isTomorrow, formatDistanceToNow } from "date-fns";
import { MessageSquare, ClipboardList, BarChart3, AlertTriangle, ChevronRight, Plus, Package, Tag, Building2, Truck, Calendar, Target, Sparkles, TrendingUp, TrendingDown, Download, Users, Euro, Hash } from "lucide-react";
import CountUp from "@/components/CountUp";
import PullToRefreshWrapper from "@/components/PullToRefreshWrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, Line, Bar } from "recharts";
import { queryClient } from "@/lib/queryClient";
import { MobileSection, MobileSectionLink, MobileListCard, MobileEmptyState, MobileFab, MobileStatusPill, statusToTone, AttentionDeck, type AttentionCard } from "@/components/mobile";
import type { OrderWithDetails, Product, ConversationWithUser } from "@shared/schema";
import { getOrderStatus } from "@/lib/translations";

type StatsPeriod = "7d" | "30d" | "6m" | "12m";

interface Props {
  currentUser: any;
  lang: "de" | "it";
  t: any;
  navigate: (path: string) => void;
  totalUnread: number;
  convLoading: boolean;
  recentOrders: OrderWithDetails[] | undefined;
  ordersLoading: boolean;
  lowStockProducts: Product[] | undefined;
  lowStockLoading: boolean;
  upcomingDeliveries: OrderWithDetails[] | undefined;
  deliveriesLoading: boolean;
  actionRequired: any;
  detailedStats: any;
  dateLocale: any;
  statsPeriod: StatsPeriod;
  setStatsPeriod: (p: StatsPeriod) => void;
  statsLoading: boolean;
  insights?: Array<{ type: string; title: string; count: number; link: string }>;
  monthlyRevenueTarget: number | null;
  onExportStats: () => void;
  onOpenRevenueGoal: () => void;
  chartData: Array<{ name: string; key: string; revenue: number; orders: number }>;
  monthRevenue: number;
  goalProgress: number;
  calcDelta: (current: number, previous: number) => number;
}

export default function SupplierHomeMobile({
  currentUser, lang, t, navigate,
  totalUnread, convLoading,
  recentOrders, ordersLoading,
  lowStockProducts, lowStockLoading,
  upcomingDeliveries, deliveriesLoading,
  actionRequired,
  detailedStats,
  dateLocale,
  statsPeriod, setStatsPeriod, statsLoading,
  insights, monthlyRevenueTarget,
  onExportStats, onOpenRevenueGoal,
  chartData, monthRevenue, goalProgress, calcDelta,
}: Props) {
  const [statsTab, setStatsTab] = useState<"products" | "customers">("products");
  const [statsExpanded, setStatsExpanded] = useState(false);
  const { data: conversations } = useQuery<ConversationWithUser[]>({
    queryKey: [`/api/conversations?userId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });
  const unreadConvs = (conversations || []).filter((c) => c.unreadCount > 0);
  const greeting = (() => {
    const h = new Date().getHours();
    if (lang === "de") return h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend";
    return h < 11 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera";
  })();

  const fmtPrice = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

  const todayDeliveries = (upcomingDeliveries || []).filter(o => o.requestedDeliveryDate && isToday(new Date(o.requestedDeliveryDate)));
  const nextDeliveries = (upcomingDeliveries || []).slice(0, 3);
  const recent = (recentOrders || []).slice(0, 5);

  const newOrdersCount = (recentOrders || []).filter(o => o.status === "pending").length;
  const openComplaints = actionRequired?.openComplaints?.length || 0;
  const todayRevenue = todayDeliveries.reduce((s, o) => s + parseFloat(o.totalAmount as any || "0"), 0);

  const kpis = [
    {
      label: lang === "de" ? "Nachrichten" : "Messaggi",
      value: convLoading ? "..." : <CountUp end={totalUnread} duration={800} />,
      icon: <MessageSquare className="h-3.5 w-3.5" />,
      onClick: () => navigate("/supplier/inbox"),
      testId: "mobile-kpi-s-messages",
    },
    {
      label: lang === "de" ? "Neue Bestellungen" : "Nuovi ordini",
      value: ordersLoading ? "..." : <CountUp end={newOrdersCount} duration={800} />,
      icon: <ClipboardList className="h-3.5 w-3.5" />,
      onClick: () => navigate("/supplier/orders?status=pending"),
      testId: "mobile-kpi-s-orders",
    },
    {
      label: lang === "de" ? "Heute Umsatz" : "Oggi fatt.",
      value: <CountUp end={todayRevenue} duration={1000} suffix="€" formatter={(v: number) => Math.round(v).toLocaleString(lang === "de" ? "de-DE" : "it-IT")} />,
      icon: <Euro className="h-3.5 w-3.5" />,
      onClick: () => navigate("/supplier/orders"),
      testId: "mobile-kpi-s-revenue",
    },
    {
      label: lang === "de" ? "Niedriger Bestand" : "Scorte basse",
      value: lowStockLoading ? "..." : <CountUp end={lowStockProducts?.length || 0} duration={800} />,
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      onClick: () => navigate("/supplier/products"),
      testId: "mobile-kpi-s-lowstock",
    },
  ];

  const quickActions = [
    { icon: <ClipboardList className="h-5 w-5" />, label: lang === "de" ? "Bestellungen" : "Ordini", to: "/supplier/orders?status=pending", color: "bg-foreground text-background" },
    { icon: <Tag className="h-5 w-5" />, label: lang === "de" ? "Aktion" : "Promo", to: "/supplier/promotions", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
    { icon: <Package className="h-5 w-5" />, label: lang === "de" ? "Lager" : "Magazzino", to: "/supplier/inventory", color: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" },
  ];

  const leadParts: string[] = [];
  if (newOrdersCount > 0) {
    leadParts.push(lang === "de"
      ? `${newOrdersCount} ${newOrdersCount === 1 ? "neue Bestellung" : "neue Bestellungen"}`
      : `${newOrdersCount} ${newOrdersCount === 1 ? "nuovo ordine" : "nuovi ordini"}`);
  }
  if (todayDeliveries.length > 0) {
    leadParts.push(lang === "de"
      ? `${todayDeliveries.length} ${todayDeliveries.length === 1 ? "Lieferung" : "Lieferungen"} heute`
      : `${todayDeliveries.length} ${todayDeliveries.length === 1 ? "consegna" : "consegne"} oggi`);
  }
  if (openComplaints > 0) {
    leadParts.push(lang === "de"
      ? `${openComplaints} ${openComplaints === 1 ? "Reklamation" : "Reklamationen"}`
      : `${openComplaints} ${openComplaints === 1 ? "reclamo" : "reclami"}`);
  }
  if (unreadConvs.length > 0) {
    leadParts.push(lang === "de" ? `${unreadConvs.length} ungelesen` : `${unreadConvs.length} non letti`);
  }
  const leadLine = leadParts.length
    ? leadParts.slice(0, 3).join(" · ")
    : lang === "de" ? "Heute ist nichts dringend." : "Niente di urgente oggi.";

  const leadHref =
    newOrdersCount > 0 ? "/supplier/orders?status=pending"
    : openComplaints > 0 ? "/supplier/complaints"
    : todayDeliveries.length > 0 ? "/supplier/orders?status=in_delivery"
    : unreadConvs.length > 0 ? "/supplier/inbox"
    : "/supplier/orders";

  const deck: AttentionCard[] = [];
  todayDeliveries.slice(0, 3).forEach((o) => {
    deck.push({
      id: `del-${o.id}`,
      icon: <Truck className="h-4 w-4" />,
      accent: "amber",
      eyebrow: lang === "de" ? "Heute liefern" : "Da consegnare",
      title: o.restaurant?.companyName || "",
      subtitle: `${o.items?.length || 0} ${lang === "de" ? "Artikel" : "art."} · ${fmtPrice(parseFloat(o.totalAmount as any || "0"))}`,
      cta: lang === "de" ? "Öffnen" : "Apri",
      onClick: () => navigate(`/supplier/orders/${o.id}`),
      testId: `mobile-attention-s-del-${o.id}`,
    });
  });
  (recentOrders || []).filter((o) => o.status === "pending").slice(0, 2).forEach((o) => {
    deck.push({
      id: `new-${o.id}`,
      icon: <ClipboardList className="h-4 w-4" />,
      accent: "indigo",
      eyebrow: lang === "de" ? "Neue Bestellung" : "Nuovo ordine",
      title: o.restaurant?.companyName || "",
      subtitle: `${o.items?.length || 0} ${lang === "de" ? "Artikel" : "art."} · ${fmtPrice(parseFloat(o.totalAmount as any || "0"))}`,
      cta: lang === "de" ? "Bestätigen" : "Conferma",
      onClick: () => navigate(`/supplier/orders/${o.id}`),
      testId: `mobile-attention-s-new-${o.id}`,
    });
  });
  (actionRequired?.openComplaints || []).slice(0, 1).forEach((c: any) => {
    deck.push({
      id: `cmp-${c.id}`,
      icon: <AlertTriangle className="h-4 w-4" />,
      accent: "rose",
      eyebrow: lang === "de" ? "Reklamation" : "Reclamo",
      title: c.restaurant?.companyName || c.title || (lang === "de" ? "Reklamation" : "Reclamo"),
      subtitle: c.title ? String(c.title).replace("[PRIORITY IMMEDIATE] ", "") : undefined,
      cta: lang === "de" ? "Ansehen" : "Apri",
      onClick: () => navigate(`/supplier/complaints/${c.id}`),
      testId: `mobile-attention-s-cmp-${c.id}`,
    });
  });
  (lowStockProducts || []).slice(0, 2).forEach((p) => {
    deck.push({
      id: `low-${p.id}`,
      icon: <Package className="h-4 w-4" />,
      accent: "violet",
      eyebrow: lang === "de" ? "Bestand" : "Scorte",
      title: p.name,
      subtitle: `${p.stockQuantity ?? 0} ${lang === "de" ? "verbleibend" : "rimasti"}`,
      cta: lang === "de" ? "Auffüllen" : "Rifornire",
      onClick: () => navigate(`/supplier/products?highlight=${p.id}`),
      testId: `mobile-attention-s-low-${p.id}`,
    });
  });
  const finalDeck = deck.slice(0, 6);

  return (
    <div className="md:hidden">
      <PullToRefreshWrapper
        onRefresh={async () => {
          await queryClient.invalidateQueries({
            predicate: (q) => {
              const k = q.queryKey[0];
              return typeof k === "string" && (k.startsWith("/api/supplier") || k.startsWith("/api/low-stock") || k.startsWith("/api/conversations"));
            },
          });
        }}
        className="pb-[var(--mobile-bottom-pad)]"
      >
        <div
          className="bg-[#161921] text-white px-4 pb-4 rounded-3xl mx-2 overflow-hidden"
          style={{ marginTop: "0.25rem" }}
          data-testid="mobile-header-supplier-home"
        >
          <div className="pt-4 pb-3.5 flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-white/60 truncate">{greeting},</p>
              <h1 className="text-[22px] font-bold leading-tight mt-0.5 text-white truncate">
                {currentUser?.companyName || currentUser?.name || ""}
              </h1>
            </div>
          </div>
          <button
            onClick={() => navigate(leadHref)}
            data-testid="mobile-home-lead-supplier"
            className="text-left text-[14px] text-white/85 leading-snug mt-1 w-full active:opacity-70 transition-opacity"
          >
            {leadLine}
          </button>
        </div>

        {finalDeck.length > 0 && (
          <MobileSection className="mt-4" testId="mobile-s-section-briefing">
            <AttentionDeck cards={finalDeck} testId="mobile-s-attention-deck" />
          </MobileSection>
        )}

        <MobileSection className="mt-4">
          <div className="grid grid-cols-3 gap-2">
            {quickActions.map((qa) => (
              <Link
                key={qa.label}
                href={qa.to}
                data-testid={`mobile-s-quick-${qa.label}`}
                className="flex flex-col items-center justify-center gap-1.5 h-[72px] rounded-2xl bg-card border border-border active:scale-95 transition-transform no-underline"
              >
                <div className={`flex items-center justify-center h-9 w-9 rounded-full ${qa.color}`}>{qa.icon}</div>
                <span className="text-[10px] font-semibold text-foreground text-center leading-tight">{qa.label}</span>
              </Link>
            ))}
          </div>
        </MobileSection>

        <MobileSection
          title={lang === "de" ? "Übersicht" : "Panoramica"}
          className="mt-5"
          testId="mobile-s-section-overview"
        >
          <div className="grid grid-cols-2 gap-2">
            {kpis.map((k) => (
              <button
                key={k.testId}
                onClick={k.onClick}
                data-testid={k.testId}
                className="text-left rounded-2xl bg-card border border-border p-3 active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
                  {k.icon}
                  <span className="text-[11px] font-medium truncate">{k.label}</span>
                </div>
                <div className="text-[20px] font-bold leading-none tabular-nums text-foreground">{k.value}</div>
              </button>
            ))}
          </div>
        </MobileSection>

        <MobileSection
          title={lang === "de" ? "Anstehende Lieferungen" : "Consegne in arrivo"}
          action={<MobileSectionLink onClick={() => navigate("/supplier/orders?status=in_delivery")}>{lang === "de" ? "Alle" : "Tutti"}</MobileSectionLink>}
          className="mt-6"
          testId="mobile-s-section-deliveries"
        >
          {deliveriesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-[68px] rounded-2xl" />)}
            </div>
          ) : nextDeliveries.length === 0 ? (
            <MobileEmptyState
              icon={<Truck className="h-7 w-7" />}
              title={lang === "de" ? "Keine Lieferungen" : "Nessuna consegna"}
            />
          ) : (
            <div className="space-y-2">
              {nextDeliveries.map((o) => {
                const date = o.requestedDeliveryDate ? new Date(o.requestedDeliveryDate) : null;
                const dateLabel = !date ? "" : isToday(date)
                  ? lang === "de" ? "Heute" : "Oggi"
                  : isTomorrow(date)
                  ? lang === "de" ? "Morgen" : "Domani"
                  : format(date, "dd.MM.", { locale: dateLocale });
                return (
                  <MobileListCard
                    key={o.id}
                    onClick={() => navigate(`/supplier/orders/${o.id}`)}
                    accent={o.status === "in_delivery" ? "indigo" : o.status === "delivered" ? "emerald" : "amber"}
                    leading={
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={o.restaurant?.profileImageUrl || undefined} />
                        <AvatarFallback className="text-xs bg-muted">{o.restaurant?.companyName?.[0] || "?"}</AvatarFallback>
                      </Avatar>
                    }
                    title={o.restaurant?.companyName || ""}
                    subtitle={`${o.items?.length || 0} ${lang === "de" ? "Artikel" : "articoli"} · ${fmtPrice(parseFloat(o.totalAmount as any || "0"))}`}
                    trailing={
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[12px] font-semibold text-foreground">{dateLabel}</span>
                        <MobileStatusPill tone={statusToTone(o.status)} size="sm">
                          {getOrderStatus(o.status as any, lang)}
                        </MobileStatusPill>
                      </div>
                    }
                    testId={`mobile-s-delivery-${o.id}`}
                  />
                );
              })}
            </div>
          )}
        </MobileSection>

        <MobileSection
          title={t("supplierHome", "statistics")}
          className="mt-5"
          testId="mobile-s-section-stats"
          action={
            statsExpanded ? (
              <button onClick={onExportStats} data-testid="button-export-stats-mobile" className="text-[12px] font-semibold text-primary inline-flex items-center gap-1">
                <Download className="h-3 w-3" /> {t("supplierHome", "exportStats")}
              </button>
            ) : null
          }
        >
          {(() => {
            const rev = detailedStats?.totalRevenue ?? 0;
            const prev = detailedStats?.previous?.totalRevenue ?? 0;
            const ordersN = detailedStats?.totalOrders ?? 0;
            const delta = prev > 0 ? ((rev - prev) / prev) * 100 : 0;
            const deltaSign = delta > 0 ? "+" : "";
            const deltaTone = delta > 0.5 ? "text-emerald-600 dark:text-emerald-400" : delta < -0.5 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground";
            const summary = `${fmtPrice(rev)} · ${ordersN} ${lang === "de" ? (ordersN === 1 ? "Bestellung" : "Bestellungen") : (ordersN === 1 ? "ordine" : "ordini")}`;
            return (
              <button
                type="button"
                onClick={() => setStatsExpanded((v) => !v)}
                data-testid="mobile-s-stats-toggle"
                className="w-full flex items-center justify-between gap-2 rounded-2xl bg-card border border-border px-3.5 py-2.5 mb-3 active:scale-[0.98] transition-transform"
                aria-expanded={statsExpanded}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex items-center justify-center h-7 w-7 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                    <TrendingUp className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-[13px] font-semibold text-foreground tabular-nums truncate">{summary}</span>
                  {prev > 0 && (
                    <span className={`text-[11px] font-semibold tabular-nums ${deltaTone}`}>{deltaSign}{delta.toFixed(0)}%</span>
                  )}
                </div>
                <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${statsExpanded ? "rotate-90" : ""}`} />
              </button>
            );
          })()}
          {!statsExpanded ? null : (
          <>
          <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide mb-3" data-testid="period-switcher-mobile">
            <div className="inline-flex items-center rounded-full bg-muted/60 p-0.5">
              {(["7d","30d","6m","12m"] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setStatsPeriod(p)}
                  data-testid={`pill-period-${p}-mobile`}
                  className={`text-[11px] px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${statsPeriod === p ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground"}`}
                >
                  {p === "7d" ? t("supplierHome", "period7d") : p === "30d" ? t("supplierHome", "period30d") : p === "6m" ? t("supplierHome", "period6m") : t("supplierHome", "period12m")}
                </button>
              ))}
            </div>
          </div>

          {statsLoading ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
              <Skeleton className="h-40 rounded-xl" />
            </div>
          ) : detailedStats && (detailedStats.totalOrders > 0 || detailedStats.topProducts?.length > 0) ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: "revenue", label: t("supplierHome", "totalRevenue"), value: detailedStats.totalRevenue, prev: detailedStats.previous?.totalRevenue ?? 0, isCurrency: true, icon: <Euro className="h-3 w-3 text-indigo-600" /> },
                  { id: "orders", label: t("supplierHome", "totalOrders"), value: detailedStats.totalOrders, prev: detailedStats.previous?.totalOrders ?? 0, isCurrency: false, icon: <Hash className="h-3 w-3 text-emerald-600" /> },
                  { id: "avg", label: t("supplierHome", "avgOrderValue"), value: detailedStats.avgOrderValue, prev: detailedStats.previous?.avgOrderValue ?? 0, isCurrency: true, icon: <TrendingUp className="h-3 w-3 text-amber-600" /> },
                  { id: "active-customers", label: t("supplierHome", "activeCustomers"), value: detailedStats.activeCustomers, prev: detailedStats.previous?.activeCustomers ?? 0, isCurrency: false, icon: <Users className="h-3 w-3 text-sky-600" /> },
                ] as const).map(k => {
                  const delta = calcDelta(k.value as number, k.prev as number);
                  const isUp = delta > 0; const isDown = delta < 0;
                  return (
                    <div key={k.id} className="rounded-2xl border border-border bg-card p-3" data-testid={`kpi-${k.id}-mobile`}>
                      <div className="flex items-center gap-1 mb-1">
                        {k.icon}
                        <span className="text-[10px] text-muted-foreground font-medium truncate">{k.label}</span>
                      </div>
                      <p className="text-base font-bold tabular-nums tracking-tight" data-testid={`kpi-value-${k.id}-mobile`}>
                        {k.isCurrency
                          ? `${((k.value as number) ?? 0).toLocaleString(lang === "de" ? "de-DE" : "it-IT", { maximumFractionDigits: 0 })}€`
                          : ((k.value as number) ?? 0).toLocaleString(lang === "de" ? "de-DE" : "it-IT")}
                      </p>
                      <div className="flex items-center gap-1 mt-1" data-testid={`kpi-delta-${k.id}-mobile`}>
                        {isUp && <TrendingUp className="h-3 w-3 text-emerald-600" />}
                        {isDown && <TrendingDown className="h-3 w-3 text-rose-600" />}
                        <span className={`text-[10px] tabular-nums ${isUp ? "text-emerald-600" : isDown ? "text-rose-600" : "text-muted-foreground"}`}>
                          {delta > 0 ? "+" : ""}{delta}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-border bg-card p-3" data-testid="ring-revenue-goal-mobile">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5 text-fuchsia-600" />
                    <span className="text-[11px] font-semibold">{t("supplierHome", "revenueGoal")}</span>
                  </div>
                  <button onClick={onOpenRevenueGoal} data-testid="button-edit-revenue-goal-mobile" className="text-[11px] text-primary font-semibold">
                    {monthlyRevenueTarget ? t("supplierHome", "revenueGoalEdit") : t("supplierHome", "revenueGoalSet")}
                  </button>
                </div>
                {monthlyRevenueTarget && monthlyRevenueTarget > 0 ? (
                  <>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${goalProgress}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[11px] tabular-nums" data-testid="text-goal-progress-amount-mobile">{Math.round(monthRevenue).toLocaleString(lang === "de" ? "de-DE" : "it-IT")}€ / {Math.round(monthlyRevenueTarget).toLocaleString(lang === "de" ? "de-DE" : "it-IT")}€</span>
                      <span className="text-[11px] font-bold tabular-nums" data-testid="text-goal-progress-percent-mobile">{goalProgress}%</span>
                    </div>
                  </>
                ) : (
                  <p className="text-[11px] text-muted-foreground">{t("supplierHome", "revenueGoalNone")}</p>
                )}
              </div>

              {chartData.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-3">
                  <p className="text-[11px] font-semibold mb-2">{t("supplierHome", "revenueOverview")}</p>
                  <div className="h-36" data-testid="chart-revenue-orders-mobile">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 5, right: 4, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={36}
                          tickFormatter={(v) => v >= 1000 ? `${Math.round(v/1000)}k` : `${v}`} />
                        <Tooltip
                          isAnimationActive={false}
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const rev = payload.find((p) => p.dataKey === "revenue")?.value as number | undefined;
                            const ord = payload.find((p) => p.dataKey === "orders")?.value as number | undefined;
                            return (
                              <div className="rounded-lg border border-border bg-card px-2 py-1 shadow-sm">
                                <p className="text-[10px] text-muted-foreground">{label}</p>
                                <p className="text-[11px] font-semibold">{(rev ?? 0).toLocaleString(lang === "de" ? "de-DE" : "it-IT", { maximumFractionDigits: 0 })}€</p>
                                <p className="text-[10px] text-muted-foreground">{ord ?? 0} {t("supplierHome", "chartOrders")}</p>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={28}
                          cursor="pointer"
                          onClick={(d: { key?: string }) => {
                            if (!d?.key) return;
                            const isDay = detailedStats.bucket === "day";
                            const from = isDay ? d.key : `${d.key}-01`;
                            const to = isDay ? d.key : (() => {
                              const [y, m] = d.key!.split("-").map(Number);
                              const last = new Date(y, m, 0);
                              return `${last.getFullYear()}-${String(last.getMonth()+1).padStart(2,'0')}-${String(last.getDate()).padStart(2,'0')}`;
                            })();
                            navigate(`/supplier/orders?dateFrom=${from}&dateTo=${to}`);
                          }} />
                        <Line type="monotone" dataKey="orders" stroke="hsl(var(--chart-2, 220 70% 55%))" strokeWidth={2} dot={false} yAxisId={0} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              <Tabs value={statsTab} onValueChange={(v) => setStatsTab(v as "products" | "customers")}>
                <TabsList className="grid w-full grid-cols-2 h-8">
                  <TabsTrigger value="products" className="text-[11px]" data-testid="tab-top-products-mobile">{t("supplierHome", "topProducts")}</TabsTrigger>
                  <TabsTrigger value="customers" className="text-[11px]" data-testid="tab-top-customers-mobile">{t("supplierHome", "topCustomers")}</TabsTrigger>
                </TabsList>
                <TabsContent value="products" className="mt-2">
                  {detailedStats.topProducts.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground py-3 text-center">{t("supplierHome", "noStatsYet")}</p>
                  ) : (
                    <div className="space-y-2">
                      {detailedStats.topProducts.slice(0, 5).map((p: { productId?: string; name: string; quantity: number; previousQuantity: number; revenue: number }, idx: number) => {
                        const maxQty = detailedStats.topProducts[0]?.quantity || 1;
                        const pct = Math.round((p.quantity / maxQty) * 100);
                        const qDelta = calcDelta(p.quantity, p.previousQuantity);
                        return (
                          <button key={p.productId || idx} onClick={() => p.productId && navigate(`/supplier/products?highlight=${p.productId}`)}
                            data-testid={`top-product-${idx}-mobile`}
                            className="w-full text-left rounded-xl border border-border bg-card p-2.5 active:scale-[0.99] transition-transform">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">{idx + 1}</span>
                              <span className="text-xs font-medium truncate flex-1">{p.name}</span>
                              <span className="text-xs font-semibold tabular-nums">{p.revenue.toLocaleString(lang === "de" ? "de-DE" : "it-IT", { maximumFractionDigits: 0 })}€</span>
                            </div>
                            <div className="h-1 bg-muted rounded-full overflow-hidden mb-1"><div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} /></div>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-muted-foreground tabular-nums">{p.quantity}x</span>
                              {p.previousQuantity > 0 && (
                                <span className={`text-[10px] tabular-nums ${qDelta > 0 ? "text-emerald-600" : qDelta < 0 ? "text-rose-600" : "text-muted-foreground"}`}>
                                  {qDelta > 0 ? "+" : ""}{qDelta}%
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="customers" className="mt-2">
                  {(detailedStats.topCustomers || []).length === 0 ? (
                    <p className="text-[11px] text-muted-foreground py-3 text-center">{t("supplierHome", "noStatsYet")}</p>
                  ) : (
                    <div className="space-y-2">
                      {(detailedStats.topCustomers || []).slice(0, 5).map((c: { restaurantId?: string; name: string; orders: number; revenue: number }, idx: number) => {
                        const maxRev = detailedStats.topCustomers[0]?.revenue || 1;
                        const pct = Math.round((c.revenue / maxRev) * 100);
                        return (
                          <button key={c.restaurantId || idx} onClick={() => c.restaurantId && navigate(`/supplier/inbox?to=${c.restaurantId}`)}
                            data-testid={`top-customer-${idx}-mobile`}
                            className="w-full text-left rounded-xl border border-border bg-card p-2.5 active:scale-[0.99] transition-transform">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">{idx + 1}</span>
                              <span className="text-xs font-medium truncate flex-1">{c.name}</span>
                              <span className="text-xs font-semibold tabular-nums">{c.revenue.toLocaleString(lang === "de" ? "de-DE" : "it-IT", { maximumFractionDigits: 0 })}€</span>
                            </div>
                            <div className="h-1 bg-muted rounded-full overflow-hidden mb-1"><div className="h-full bg-sky-500 rounded-full" style={{ width: `${pct}%` }} /></div>
                            <span className="text-[10px] text-muted-foreground tabular-nums">{c.orders} {t("supplierHome", "chartOrders")}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              {insights && insights.length > 0 && (
                <div className="rounded-2xl border border-border bg-muted/30 p-3" data-testid="insights-box-mobile">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Sparkles className="h-3.5 w-3.5 text-fuchsia-600" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("supplierHome", "insights")}</span>
                  </div>
                  <div className="space-y-1.5">
                    {insights.map((ins) => {
                      const label =
                        ins.type === "inactive_customers" ? t("supplierHome", "insightInactive") :
                        ins.type === "low_stock_top" ? t("supplierHome", "insightLowStockTop") :
                        t("supplierHome", "insightTrending");
                      return (
                        <Link key={ins.type} href={ins.link} data-testid={`insight-${ins.type}-mobile`} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-card border border-border">
                          <span className="text-[12px] font-medium"><span className="font-bold tabular-nums mr-1">{ins.count}</span>{label}</span>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <MobileEmptyState
              icon={<BarChart3 className="h-7 w-7" />}
              title={t("supplierHome", "noStatsYet")}
              description={t("supplierHome", "noStatsYetDesc")}
            />
          )}
          </>
          )}
        </MobileSection>

        <MobileSection
          title={lang === "de" ? "Letzte Bestellungen" : "Ordini recenti"}
          action={<MobileSectionLink onClick={() => navigate("/supplier/orders")}>{lang === "de" ? "Alle" : "Tutti"}</MobileSectionLink>}
          className="mt-5"
          testId="mobile-s-section-recent"
        >
          {ordersLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-[60px] rounded-2xl" />)}
            </div>
          ) : recent.length === 0 ? (
            <MobileEmptyState
              icon={<Calendar className="h-7 w-7" />}
              title={lang === "de" ? "Noch keine Bestellungen" : "Nessun ordine"}
            />
          ) : (
            <div className="space-y-2">
              {recent.map(o => (
                <MobileListCard
                  key={o.id}
                  onClick={() => navigate(`/supplier/orders/${o.id}`)}
                  title={o.restaurant?.companyName || ""}
                  subtitle={`${formatDistanceToNow(new Date(o.createdAt as any), { addSuffix: true, locale: dateLocale })} · ${fmtPrice(parseFloat(o.totalAmount as any || "0"))}`}
                  trailing={<MobileStatusPill tone={statusToTone(o.status)} size="sm">{getOrderStatus(o.status as any, lang)}</MobileStatusPill>}
                  testId={`mobile-s-recent-${o.id}`}
                />
              ))}
            </div>
          )}
        </MobileSection>
      </PullToRefreshWrapper>

      <MobileFab
        onClick={() => navigate("/supplier/products")}
        icon={<Plus className="h-6 w-6" />}
        label={lang === "de" ? "Produkt" : "Prodotto"}
        testId="mobile-fab-product"
      />
    </div>
  );
}
