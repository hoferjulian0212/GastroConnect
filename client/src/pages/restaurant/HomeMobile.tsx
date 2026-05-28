import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format, isToday, isTomorrow, formatDistanceToNow } from "date-fns";
import { MessageSquare, Calculator, ShoppingBag, Euro, Truck, AlertTriangle, ChevronRight, Plus, FileText, Calendar, RotateCcw, Inbox } from "lucide-react";
import CountUp from "@/components/CountUp";
import PullToRefreshWrapper from "@/components/PullToRefreshWrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { queryClient } from "@/lib/queryClient";
import { MobileSection, MobileSectionLink, MobileListCard, MobileEmptyState, MobileFab, MobileStatusPill, MobileTopActions, statusToTone, AttentionDeck, type AttentionCard } from "@/components/mobile";
import type { OrderWithDetails, ConversationWithUser, OrderTemplateWithItems } from "@shared/schema";
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
  const { data: conversations } = useQuery<ConversationWithUser[]>({
    queryKey: [`/api/conversations?userId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });
  const { data: templates } = useQuery<OrderTemplateWithItems[]>({
    queryKey: [`/api/order-templates?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const greeting = (() => {
    const h = new Date().getHours();
    if (lang === "de") return h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend";
    return h < 11 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera";
  })();

  const todayDeliveries = (upcomingDeliveries || []).filter(o => o.requestedDeliveryDate && isToday(new Date(o.requestedDeliveryDate)));
  const nextDeliveries = (upcomingDeliveries || []).slice(0, 3);
  const recentActivity = (allOrders || [])
    .slice()
    .sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime())
    .slice(0, 5);
  const unreadConvs = (conversations || []).filter(c => c.unreadCount > 0);

  const fmtPrice = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

  const cpgNum = parseFloat(costAnalysis?.costPerGuest || "0");
  const cpgTarget = parseFloat(costAnalysis?.targetCost || "0");
  const cpgDiff = cpgTarget > 0 ? cpgNum - cpgTarget : 0;
  const cpgStatus: "ok" | "over" | "under" | "none" = !cpgTarget
    ? "none"
    : cpgDiff > 0.3
    ? "over"
    : cpgDiff < -0.3
    ? "under"
    : "ok";

  const leadParts: string[] = [];
  if (todayDeliveries.length > 0) {
    leadParts.push(lang === "de"
      ? `${todayDeliveries.length} ${todayDeliveries.length === 1 ? "Lieferung" : "Lieferungen"} heute`
      : `${todayDeliveries.length} ${todayDeliveries.length === 1 ? "consegna" : "consegne"} oggi`);
  }
  if (unreadConvs.length > 0) {
    leadParts.push(lang === "de"
      ? `${unreadConvs.length} ungelesen`
      : `${unreadConvs.length} non letti`);
  }
  if (pendingOrdersCount > 0) {
    leadParts.push(lang === "de" ? `${pendingOrdersCount} offen` : `${pendingOrdersCount} aperti`);
  }
  const leadLine = leadParts.length
    ? leadParts.join(" · ")
    : lang === "de" ? "Heute ist nichts dringend." : "Niente di urgente oggi.";

  const leadHref =
    pendingOrdersCount > 0 ? "/restaurant/orders?status=pending"
    : todayDeliveries.length > 0 ? "/restaurant/orders?status=in_delivery"
    : unreadConvs.length > 0 ? "/restaurant/inbox"
    : "/restaurant/cost-analysis";

  // Build attention deck
  const deck: AttentionCard[] = [];
  todayDeliveries.slice(0, 3).forEach((o) => {
    deck.push({
      id: `del-${o.id}`,
      icon: <Truck className="h-4 w-4" />,
      accent: "amber",
      eyebrow: lang === "de" ? "Heute" : "Oggi",
      title: o.supplier?.companyName || "",
      subtitle: `${o.items?.length || 0} ${lang === "de" ? "Artikel" : "art."} · ${fmtPrice(parseFloat(o.totalAmount as any || "0"))}`,
      cta: lang === "de" ? "Öffnen" : "Apri",
      onClick: () => navigate(`/restaurant/orders/${o.id}`),
      testId: `mobile-attention-delivery-${o.id}`,
    });
  });
  unreadConvs.slice(0, 2).forEach((c: any) => {
    const name = c.otherUser?.companyName || c.otherUser?.name || (lang === "de" ? "Nachricht" : "Messaggio");
    deck.push({
      id: `msg-${c.id}`,
      icon: <MessageSquare className="h-4 w-4" />,
      accent: "sky",
      eyebrow: lang === "de" ? "Neu" : "Nuovo",
      title: name,
      subtitle: `${c.unreadCount} ${lang === "de" ? "ungelesen" : "non letti"}`,
      cta: lang === "de" ? "Antworten" : "Rispondi",
      onClick: () => navigate(`/restaurant/inbox?conv=${c.id}`),
      testId: `mobile-attention-msg-${c.id}`,
    });
  });
  (templates || []).slice(0, 2).forEach((tmpl: any) => {
    deck.push({
      id: `tmpl-${tmpl.id}`,
      icon: <RotateCcw className="h-4 w-4" />,
      accent: "emerald",
      eyebrow: lang === "de" ? "Schnellbestellung" : "Riordino",
      title: tmpl.name,
      subtitle: `${tmpl.items?.length || 0} ${lang === "de" ? "Artikel" : "art."}`,
      cta: lang === "de" ? "Bestellen" : "Ordina",
      onClick: () => navigate(`/restaurant/templates?use=${tmpl.id}`),
      testId: `mobile-attention-tmpl-${tmpl.id}`,
    });
  });
  const finalDeck = deck.slice(0, 6);

  const quickActions = [
    { icon: <Plus className="h-5 w-5" />, label: lang === "de" ? "Bestellen" : "Ordina", to: "/restaurant/catalog", color: "bg-foreground text-background" },
    { icon: <FileText className="h-5 w-5" />, label: lang === "de" ? "Vorlagen" : "Modelli", to: "/restaurant/templates", color: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" },
    { icon: <AlertTriangle className="h-5 w-5" />, label: lang === "de" ? "Reklamation" : "Reclami", to: "/restaurant/complaints", color: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  ];

  const kpis = [
    {
      label: lang === "de" ? "Nachrichten" : "Messaggi",
      value: convLoading ? "..." : <CountUp end={totalUnread} duration={800} />,
      icon: <MessageSquare className="h-3.5 w-3.5" />,
      onClick: () => navigate("/restaurant/inbox"),
      testId: "mobile-kpi-messages",
    },
    {
      label: lang === "de" ? "Offene Bestellungen" : "Ordini aperti",
      value: ordersLoading ? "..." : <CountUp end={pendingOrdersCount} duration={800} />,
      icon: <ShoppingBag className="h-3.5 w-3.5" />,
      onClick: () => navigate("/restaurant/orders"),
      testId: "mobile-kpi-orders",
    },
    {
      label: lang === "de" ? "Kosten/Gast" : "Costo/ospite",
      value: costLoading
        ? "..."
        : cpgNum > 0
        ? <CountUp end={cpgNum} duration={1000} decimals={2} suffix="€" />
        : "--",
      icon: <Calculator className="h-3.5 w-3.5" />,
      onClick: () => navigate("/restaurant/cost-analysis"),
      testId: "mobile-kpi-cost-per-guest",
    },
    {
      label: lang === "de" ? "Monatskosten" : "Costi mese",
      value: costLoading
        ? "..."
        : costAnalysis?.totalCosts && parseFloat(costAnalysis.totalCosts) > 0
        ? <CountUp end={parseFloat(costAnalysis.totalCosts)} duration={1200} suffix="€" formatter={(v: number) => Math.round(v).toLocaleString(lang === "de" ? "de-DE" : "it-IT")} />
        : "--",
      icon: <Euro className="h-3.5 w-3.5" />,
      onClick: () => navigate("/restaurant/cost-analysis"),
      testId: "mobile-kpi-spending",
    },
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
        className="pb-[var(--mobile-bottom-pad)]"
      >
        <div
          className="bg-[#161921] text-white px-4 pb-5 rounded-3xl mx-2 overflow-hidden"
          style={{ marginTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)" }}
          data-testid="mobile-header-restaurant-home"
        >
          <div className="pt-1 pb-2 flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-white/60 truncate">{greeting},</p>
              <h1 className="text-[22px] font-bold leading-tight mt-0.5 text-white truncate">
                {currentUser?.companyName || currentUser?.name || ""}
              </h1>
            </div>
            <MobileTopActions variant="dark" />
          </div>
          <button
            onClick={() => navigate(leadHref)}
            data-testid="mobile-home-lead"
            className="text-left text-[14px] text-white/85 leading-snug mt-1 w-full active:opacity-70 transition-opacity"
          >
            {leadLine}
          </button>
        </div>

        {finalDeck.length > 0 && (
          <MobileSection className="mt-4" testId="mobile-section-briefing">
            <AttentionDeck cards={finalDeck} testId="mobile-attention-deck" />
          </MobileSection>
        )}

        <MobileSection className="mt-4">
          <div className="grid grid-cols-3 gap-2">
            {quickActions.map((qa) => (
              <Link
                key={qa.label}
                href={qa.to}
                data-testid={`mobile-quick-${qa.label}`}
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
          testId="mobile-section-overview"
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
          action={<MobileSectionLink onClick={() => navigate("/restaurant/orders")}>{lang === "de" ? "Alle" : "Tutti"}</MobileSectionLink>}
          className="mt-5"
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
                const date = o.requestedDeliveryDate ? new Date(o.requestedDeliveryDate) : null;
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
                    subtitle={`${o.items?.length || 0} ${lang === "de" ? "Artikel" : "articoli"} · ${fmtPrice(parseFloat(o.totalAmount as any || "0"))}`}
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
          className="mt-5"
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
                  subtitle={`${formatDistanceToNow(new Date(o.createdAt as any), { addSuffix: true, locale: dateLocale })} · ${fmtPrice(parseFloat(o.totalAmount as any || "0"))}`}
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

      {cpgStatus !== "none" && (
        <button
          onClick={() => navigate("/restaurant/cost-analysis")}
          data-testid="mobile-home-cpg-sticky"
          className="fixed left-3 right-3 z-40 flex items-center justify-between gap-2 rounded-2xl bg-card/95 backdrop-blur border border-border shadow-lg px-3.5 py-2.5 active:scale-[0.98] transition-transform"
          style={{ bottom: "var(--mobile-cta-offset)" }}
        >
          <span className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
            <Calculator className="h-3.5 w-3.5" />
            {lang === "de" ? "Kosten/Gast" : "Costo/ospite"}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-[14px] font-bold tabular-nums text-foreground">{cpgNum.toFixed(2)}€</span>
            <span className={`text-[11px] tabular-nums font-semibold ${cpgStatus === "over" ? "text-rose-600 dark:text-rose-400" : cpgStatus === "under" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
              {cpgDiff > 0 ? "+" : ""}{cpgDiff.toFixed(2)}€
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
        </button>
      )}
    </div>
  );
}
