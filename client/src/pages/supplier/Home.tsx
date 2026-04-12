import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, Clock, CheckCircle, ShoppingBag, User as UserIcon, Truck, Check, X, AlertTriangle, Package, MessageSquare, BarChart3, TrendingUp, TrendingDown, Euro, Hash, XCircle, CalendarDays, Calendar, FileText, Loader2, Send, ArrowRight, AlertCircle, CircleAlert, ChevronRight, Flame } from "lucide-react";
import type { OrderWithDetails, Product, ConversationWithUser, ComplaintWithDetails } from "@shared/schema";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format, formatDistanceToNow, isToday, isTomorrow } from "date-fns";
import { de, it } from "date-fns/locale";
import { useLanguage } from "@/context/LanguageContext";
import { useT, getOrderStatus } from "@/lib/translations";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import DeliveryDatePicker from "@/components/DeliveryDatePicker";
import DraggableCardGrid from "@/components/DraggableCardGrid";
import CountUp from "@/components/CountUp";

export default function SupplierHome() {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const dateLocale = lang === "de" ? de : it;

  const [cardWizard, setCardWizard] = useState<{ orderId: string; action: string } | null>(null);
  const [deliveryDatePicker, setDeliveryDatePicker] = useState<{ orderId: string; restaurantId: string } | null>(null);

  const { data: recentOrders, isLoading: ordersLoading } = useQuery<OrderWithDetails[]>({
    queryKey: ['/api/supplier/orders/recent', currentUser?.id],
    queryFn: async () => {
      const res = await fetch(`/api/supplier/orders/recent?supplierId=${currentUser?.id}`);
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json();
    },
    enabled: !!currentUser?.id,
  });

  const { data: upcomingDeliveries, isLoading: deliveriesLoading } = useQuery<OrderWithDetails[]>({
    queryKey: ['/api/supplier/upcoming-deliveries', currentUser?.id],
    queryFn: async () => {
      const res = await fetch(`/api/supplier/upcoming-deliveries?supplierId=${currentUser?.id}`);
      if (!res.ok) throw new Error('Failed to fetch upcoming deliveries');
      return res.json();
    },
    enabled: !!currentUser?.id,
  });

  const { data: lowStockProducts, isLoading: lowStockLoading } = useQuery<Product[]>({
    queryKey: ['/api/low-stock', currentUser?.id],
    queryFn: async () => {
      const res = await fetch(`/api/low-stock?supplierId=${currentUser?.id}`);
      if (!res.ok) throw new Error('Failed to fetch low stock');
      return res.json();
    },
    enabled: !!currentUser?.id,
  });

  const { data: conversations, isLoading: convLoading } = useQuery<ConversationWithUser[]>({
    queryKey: [`/api/conversations?userId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: actionRequired, isLoading: actionRequiredLoading } = useQuery<{
    staleOrders: OrderWithDetails[];
    openComplaints: ComplaintWithDetails[];
  }>({
    queryKey: ['/api/supplier/action-required', currentUser?.id],
    queryFn: async () => {
      const res = await fetch(`/api/supplier/action-required?supplierId=${currentUser?.id}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: !!currentUser?.id,
  });

  const { data: detailedStats, isLoading: statsLoading } = useQuery<{
    monthlyRevenue: { month: string; revenue: number }[];
    topProducts: { name: string; quantity: number; revenue: number }[];
    ordersByStatus: { status: string; count: number }[];
    totalRevenue: number;
    totalOrders: number;
    avgOrderValue: number;
  }>({
    queryKey: [`/api/supplier/detailed-stats?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const monthNames: Record<string, Record<string, string>> = {
    de: { "01": "Jan", "02": "Feb", "03": "Mär", "04": "Apr", "05": "Mai", "06": "Jun", "07": "Jul", "08": "Aug", "09": "Sep", "10": "Okt", "11": "Nov", "12": "Dez" },
    it: { "01": "Gen", "02": "Feb", "03": "Mar", "04": "Apr", "05": "Mag", "06": "Giu", "07": "Lug", "08": "Ago", "09": "Set", "10": "Ott", "11": "Nov", "12": "Dic" },
  };

  const chartData = useMemo(() => {
    if (!detailedStats?.monthlyRevenue) return [];
    return detailedStats.monthlyRevenue.map(m => ({
      name: monthNames[lang]?.[m.month.split("-")[1]] || m.month.split("-")[1],
      revenue: m.revenue,
    }));
  }, [detailedStats, lang]);

  const unreadConversations = useMemo(() => {
    if (!conversations) return [];
    return conversations.filter(c => c.unreadCount > 0).sort((a, b) => {
      const aPriority = a.lastMessage?.priority === "important" ? 1 : 0;
      const bPriority = b.lastMessage?.priority === "important" ? 1 : 0;
      if (bPriority !== aPriority) return bPriority - aPriority;
      const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [conversations]);

  const totalUnread = unreadConversations.length;

  const monthlyChange = useMemo(() => {
    const months = detailedStats?.monthlyRevenue || [];
    if (months.length < 2) return null;
    const current = months[months.length - 1]?.revenue || 0;
    const previous = months[months.length - 2]?.revenue || 0;
    if (previous === 0) return null;
    return ((current - previous) / previous * 100);
  }, [detailedStats]);

  const getMessagePreview = (conv: ConversationWithUser) => {
    if (!conv.lastMessage) return "";
    const msg = conv.lastMessage;
    try {
      if (msg.messageType === "order") {
        const data = JSON.parse(msg.content);
        const id = (data.orderId || msg.orderId || "")?.substring(0, 8);
        if (data.isFollowUp) {
          return id ? `${lang === "de" ? "Nachlieferung" : "Riconsegna"} #${id}` : (lang === "de" ? "Nachlieferung" : "Riconsegna");
        }
        return id ? `${lang === "de" ? "Neue Bestellung" : "Nuovo ordine"} #${id}` : (lang === "de" ? "Neue Bestellung" : "Nuovo ordine");
      }
      if (msg.messageType === "complaint") {
        const data = JSON.parse(msg.content);
        return data.title
          ? `${lang === "de" ? "Reklamation" : "Reclamo"}: ${data.title.replace("[PRIORITY IMMEDIATE] ", "")}`
          : (lang === "de" ? "Neue Reklamation" : "Nuovo reclamo");
      }
      if (msg.messageType === "document") {
        const data = JSON.parse(msg.content);
        const id = (data.orderId || "")?.substring(0, 8);
        return id ? `${lang === "de" ? "Lieferschein" : "Bolla di consegna"} #${id}` : (lang === "de" ? "Neuer Lieferschein" : "Nuova bolla");
      }
      if (msg.messageType === "order_change_request") {
        const data = JSON.parse(msg.content);
        const id = (data.orderId || msg.orderId || "")?.substring(0, 8);
        return id ? `${lang === "de" ? "Änderungsanfrage" : "Richiesta di modifica"} #${id}` : (lang === "de" ? "Änderungsanfrage" : "Richiesta di modifica");
      }
    } catch {}
    if (msg.messageType === "attachment") return lang === "de" ? "Anhang" : "Allegato";
    if (msg.messageType === "promotion") return lang === "de" ? "Neue Aktion" : "Nuova promozione";
    return msg.content?.slice(0, 80) || "";
  };

  const invalidateOrderQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/supplier/upcoming-deliveries'] });
    queryClient.invalidateQueries({ queryKey: ['/api/supplier/orders/recent'] });
    queryClient.invalidateQueries({ queryKey: ['/api/supplier/orders'] });
    queryClient.invalidateQueries({ queryKey: ['/api/supplier/action-required'] });
    queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.includes?.("/api/supplier/detailed-stats") });
  };

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status, requestedDeliveryDate }: { orderId: string; status: string; requestedDeliveryDate?: string }) => {
      await apiRequest("PATCH", `/api/orders/${orderId}/status`, {
        status,
        changedBy: currentUser?.id,
        ...(requestedDeliveryDate ? { requestedDeliveryDate } : {}),
      });
    },
    onSuccess: () => {
      setCardWizard(null);
      invalidateOrderQueries();
      toast({
        title: lang === "de" ? "Status aktualisiert" : "Stato aggiornato",
        description: lang === "de" ? "Der Bestellstatus wurde geändert." : "Lo stato dell'ordine è stato modificato.",
      });
    },
    onError: () => {
      setCardWizard(null);
      toast({
        title: lang === "de" ? "Fehler" : "Errore",
        description: lang === "de" ? "Status konnte nicht geändert werden." : "Impossibile modificare lo stato.",
        variant: "destructive",
      });
    },
  });

  const setDeliveryDateMutation = useMutation({
    mutationFn: async ({ orderId, requestedDeliveryDate }: { orderId: string; requestedDeliveryDate: string }) => {
      await apiRequest("PATCH", `/api/orders/${orderId}/reschedule`, { requestedDeliveryDate });
    },
    onSuccess: () => {
      setDeliveryDatePicker(null);
      invalidateOrderQueries();
      toast({
        title: lang === "de" ? "Lieferdatum gesetzt" : "Data di consegna impostata",
        description: lang === "de" ? "Das Lieferdatum wurde erfolgreich gesetzt." : "La data di consegna è stata impostata con successo.",
      });
    },
    onError: () => {
      setDeliveryDatePicker(null);
      toast({
        title: lang === "de" ? "Fehler" : "Errore",
        description: lang === "de" ? "Lieferdatum konnte nicht gesetzt werden." : "Impossibile impostare la data di consegna.",
        variant: "destructive",
      });
    },
  });

  const deliveryNoteMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiRequest("POST", `/api/orders/${orderId}/delivery-note`);
      return res.json();
    },
    onSuccess: (data) => {
      invalidateOrderQueries();
      toast({ title: lang === "de" ? "Lieferschein erstellt" : "Bolla di consegna creata" });
      if (data?.documentUrl) window.open(data.documentUrl, "_blank");
    },
    onError: () => {
      toast({ title: lang === "de" ? "Fehler" : "Errore", variant: "destructive" });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "confirmed": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "partially_confirmed": return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
      case "in_delivery": return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
      case "delivered": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "cancelled": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getDeliveryDateLabel = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    if (isToday(date)) return t("supplierHome", "today");
    if (isTomorrow(date)) return lang === "de" ? "Morgen" : "Domani";
    return format(date, "EEEE, dd.MM.", { locale: dateLocale });
  };

  const groupedDeliveries = useMemo(() => {
    if (!upcomingDeliveries) return [];

    const groups = new Map<string, OrderWithDetails[]>();
    const noDateOrders: OrderWithDetails[] = [];

    for (const order of upcomingDeliveries) {
      if (!order.requestedDeliveryDate) {
        noDateOrders.push(order);
      } else {
        const dateKey = order.requestedDeliveryDate;
        if (!groups.has(dateKey)) groups.set(dateKey, []);
        groups.get(dateKey)!.push(order);
      }
    }

    const result: { dateKey: string; label: string; isToday: boolean; orders: OrderWithDetails[] }[] = [];

    const sortedEntries = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [dateKey, orders] of sortedEntries) {
      const dtToday = isToday(new Date(dateKey + "T00:00:00"));
      result.push({
        dateKey,
        label: getDeliveryDateLabel(dateKey),
        isToday: dtToday,
        orders,
      });
    }

    if (!result.some(g => g.isToday)) {
      const insertIdx = result.findIndex(g => {
        const d = new Date(g.dateKey + "T00:00:00");
        return d > new Date(new Date().toDateString());
      });
      const todayEntry = {
        dateKey: "_today_empty",
        label: t("supplierHome", "today"),
        isToday: true,
        orders: [] as OrderWithDetails[],
      };
      if (insertIdx === -1) result.push(todayEntry);
      else result.splice(insertIdx, 0, todayEntry);
    }

    if (noDateOrders.length > 0) {
      result.push({
        dateKey: "_no_date",
        label: lang === "de" ? "Ohne Lieferdatum" : "Senza data di consegna",
        isToday: false,
        orders: noDateOrders,
      });
    }

    return result;
  }, [upcomingDeliveries, lang]);

  return (
    <div className="space-y-4 md:space-y-6 pb-4 md:pb-6">
      <div>
        <div className="bg-[#161921] px-3 md:px-6 pt-4 md:pt-6 pb-4 md:pb-6 rounded-b-3xl">
          <h1 className="text-2xl md:text-4xl font-bold text-white mb-3 md:mb-5" data-testid="text-page-title">
            {currentUser?.companyName || ""}
          </h1>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
            <Link href="/supplier/inbox" data-testid="kpi-card-messages">
              <div className="rounded-xl md:rounded-2xl bg-white/[0.06] border border-white/[0.08] p-3 md:p-5 cursor-pointer hover:bg-white/[0.10] transition-colors h-full flex flex-col justify-between min-h-[100px] md:min-h-[120px]">
                <span className="text-[11px] md:text-sm text-gray-400 font-medium"><span className="md:hidden">{lang === "de" ? "Nachrichten" : "Messaggi"}</span><span className="hidden md:inline">{lang === "de" ? "Neue Nachrichten" : "Nuovi messaggi"}</span></span>
                <div className="flex items-end justify-between mt-auto">
                  <p className="text-3xl md:text-5xl font-bold text-white leading-none" data-testid="kpi-unread-messages">{convLoading ? "..." : <CountUp end={totalUnread} duration={800} />}</p>
                  <div className="flex items-center justify-center h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl bg-blue-500/20">
                    <MessageSquare className="h-4 w-4 md:h-5 md:w-5 text-blue-400" />
                  </div>
                </div>
              </div>
            </Link>
            <Link href="/supplier/orders" data-testid="kpi-card-orders">
              <div className="rounded-xl md:rounded-2xl bg-white/[0.06] border border-white/[0.08] p-3 md:p-5 cursor-pointer hover:bg-white/[0.10] transition-colors h-full flex flex-col justify-between min-h-[100px] md:min-h-[120px]">
                <span className="text-[11px] md:text-sm text-gray-400 font-medium"><span className="md:hidden">{lang === "de" ? "Bestellungen" : "Ordini"}</span><span className="hidden md:inline">{lang === "de" ? "Neue Bestellungen" : "Nuovi ordini"}</span></span>
                <div className="flex items-end justify-between mt-auto">
                  <p className="text-3xl md:text-5xl font-bold text-white leading-none" data-testid="kpi-new-orders">{ordersLoading ? "..." : <CountUp end={recentOrders?.length || 0} duration={800} />}</p>
                  <div className="flex items-center justify-center h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl bg-amber-500/20">
                    <ClipboardList className="h-4 w-4 md:h-5 md:w-5 text-amber-400" />
                  </div>
                </div>
              </div>
            </Link>
            <div className="rounded-xl md:rounded-2xl bg-white/[0.06] border border-white/[0.08] p-3 md:p-5 flex flex-col justify-between min-h-[100px] md:min-h-[120px]" data-testid="kpi-card-stats">
              <span className="text-[11px] md:text-sm text-gray-400 font-medium">{t("supplierHome", "statistics")}</span>
              <div className="flex items-end justify-between mt-auto">
                {statsLoading ? (
                  <Skeleton className="h-8 w-16 md:h-10 md:w-20 bg-white/10" />
                ) : monthlyChange !== null ? (
                  <p className={`text-2xl md:text-4xl font-bold leading-none ${monthlyChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`} data-testid="kpi-stats-change">
                    <CountUp end={monthlyChange} duration={1000} decimals={1} prefix={monthlyChange >= 0 ? "+" : ""} suffix="%" />
                  </p>
                ) : (
                  <p className="text-3xl md:text-4xl font-bold text-gray-500 leading-none">--</p>
                )}
                <div className="flex items-center justify-center h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl bg-emerald-500/20">
                  <BarChart3 className="h-4 w-4 md:h-5 md:w-5 text-emerald-400" />
                </div>
              </div>
            </div>
            <Link href="/supplier/products" data-testid="kpi-card-low-stock">
              <div className="rounded-xl md:rounded-2xl bg-white/[0.06] border border-white/[0.08] p-3 md:p-5 cursor-pointer hover:bg-white/[0.10] transition-colors h-full flex flex-col justify-between min-h-[100px] md:min-h-[120px]">
                <span className="text-[11px] md:text-sm text-gray-400 font-medium"><span className="md:hidden">{lang === "de" ? "Bestand" : "Scorte"}</span><span className="hidden md:inline">{lang === "de" ? "Niedriger Bestand" : "Scorte basse"}</span></span>
                <div className="flex items-end justify-between mt-auto">
                  <p className="text-3xl md:text-5xl font-bold text-white leading-none" data-testid="kpi-low-stock">{lowStockLoading ? "..." : <CountUp end={lowStockProducts?.length || 0} duration={800} />}</p>
                  <div className="flex items-center justify-center h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl bg-rose-500/20">
                    <AlertTriangle className="h-4 w-4 md:h-5 md:w-5 text-rose-400" />
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>

      <DraggableCardGrid
        userId={currentUser?.id || ""}
        role="supplier"
        sections={[
          { id: "upcoming-deliveries", defaultSize: "full" as const, content: (
      <div className="md:rounded-xl md:border md:border-border md:bg-card md:shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-3 md:mb-0 md:p-5 md:pb-4">
          <div className="flex items-center gap-2.5">
            <div>
              <h2 className="text-base md:text-xl font-bold" data-testid="text-upcoming-deliveries-title">
                {t("supplierHome", "upcomingDeliveries")}
              </h2>
              <p className="text-xs text-muted-foreground hidden md:block">
                {t("supplierHome", "upcomingDeliveriesDesc")}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="text-xs md:text-sm shrink-0" asChild>
            <Link href="/supplier/orders?status=in_delivery" data-testid="link-all-upcoming-deliveries">
              {t("common", "all")}
            </Link>
          </Button>
        </div>
        <div className="md:px-5 md:pb-5">

        {deliveriesLoading ? (
          <div className="flex gap-3 overflow-hidden md:flex-col">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="min-w-[200px] h-[160px] md:min-w-0 md:h-16 rounded-xl shrink-0" />
            ))}
          </div>
        ) : groupedDeliveries.length > 0 ? (
          <div className="space-y-4">
            {groupedDeliveries.map((group) => (
              <div key={group.dateKey}>
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className={`h-3.5 w-3.5 text-black dark:text-white`} />
                  <span className={`text-xs font-semibold uppercase tracking-wide text-black dark:text-white`}>
                    {group.label}
                  </span>
                  {group.isToday && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  )}
                </div>

                {group.orders.length === 0 && group.isToday && (
                  <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center" data-testid="today-no-deliveries">
                    <p className="text-sm text-muted-foreground">
                      {lang === "de" ? "Keine Lieferungen geplant für heute" : "Nessuna consegna prevista per oggi"}
                    </p>
                  </div>
                )}

                {group.orders.length > 0 && (
                  <>
                    {/* Mobile: horizontal scroll cards */}
                    <div
                      className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory md:hidden"
                      style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
                    >
                      {group.orders.map((order) => {
                        const restaurantName = order.restaurant?.companyName || order.restaurant?.name || t("common", "unknown");
                        return (
                          <div
                            key={order.id}
                            className="min-w-[200px] w-[200px] shrink-0 snap-start rounded-2xl border border-border bg-card p-4 cursor-pointer transition-all active:scale-[0.98]"
                            onClick={() => navigate(`/supplier/orders/${order.id}`)}
                            data-testid={`delivery-item-${order.id}`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <div className={`flex items-center justify-center h-10 w-10 rounded-xl shrink-0 ${
                                order.status === "in_delivery"
                                  ? "bg-purple-100 dark:bg-purple-900/30"
                                  : "bg-blue-100 dark:bg-blue-900/30"
                              }`}>
                                {order.status === "in_delivery" ? (
                                  <Truck className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                                ) : (
                                  <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                )}
                              </div>
                              <Badge className={`${getStatusColor(order.status)} text-[10px] px-1.5`} variant="outline">
                                {getOrderStatus(order.status, lang, true)}
                              </Badge>
                            </div>

                            <p className="text-sm font-semibold truncate">{restaurantName}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {order.items?.length || 0} {lang === "de" ? "Artikel" : "articoli"}
                            </p>

                            <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border/50">
                              <span className="text-xs text-muted-foreground font-mono">#{order.id.slice(0, 8)}</span>
                              <span className="text-base font-bold">{order.totalAmount}€</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop: stacked list */}
                    <div className="hidden md:block space-y-2">
                      {group.orders.map((order) => {
                        const restaurantName = order.restaurant?.companyName || order.restaurant?.name || t("common", "unknown");
                        return (
                          <div
                            key={order.id}
                            className="rounded-xl border border-border bg-card hover:shadow-md hover:border-primary/20 transition-all duration-200"
                            data-testid={`delivery-item-${order.id}`}
                          >
                            <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => navigate(`/supplier/orders/${order.id}`)}>
                              <div className={`flex items-center justify-center h-10 w-10 rounded-lg shrink-0 ${
                                order.status === "in_delivery"
                                  ? "bg-purple-100 dark:bg-purple-900/30"
                                  : "bg-blue-100 dark:bg-blue-900/30"
                              }`}>
                                {order.status === "in_delivery" ? (
                                  <Truck className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                                ) : (
                                  <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{restaurantName}</p>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  <span className="text-xs text-muted-foreground">#{order.id.slice(0, 8)}</span>
                                  <span className="text-xs text-muted-foreground">·</span>
                                  <span className="text-xs font-medium">{order.totalAmount}€</span>
                                  {order.createdByUser && (
                                    <>
                                      <span className="text-xs text-muted-foreground">·</span>
                                      <span className="text-xs text-muted-foreground" data-testid={`text-created-by-${order.id}`}>{order.createdByUser.name}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                {cardWizard?.orderId === order.id ? (
                                  <div className="flex flex-col items-end gap-1">
                                    <p className="text-[10px] md:text-xs font-medium text-foreground">
                                      {cardWizard.action === "delivered" && (lang === "de" ? "Als geliefert markieren?" : "Contrassegnare come consegnato?")}
                                      {cardWizard.action === "cancelled" && (lang === "de" ? "Bestellung stornieren?" : "Annullare l'ordine?")}
                                    </p>
                                    <div className="flex items-center gap-1">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[10px] md:text-xs"
                                        onClick={() => setCardWizard(null)}
                                        disabled={updateStatusMutation.isPending}
                                        data-testid={`cancel-wizard-${order.id}`}
                                      >
                                        <X className="h-3 w-3 mr-0.5" />
                                        {t("common", "cancel")}
                                      </Button>
                                      <Button
                                        size="sm"
                                        className={`h-7 px-2 text-[10px] md:text-xs ${cardWizard.action === "cancelled" ? "bg-red-600 hover:bg-red-700 text-white" : "bg-green-600 hover:bg-green-700 text-white"}`}
                                        onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: cardWizard.action })}
                                        disabled={updateStatusMutation.isPending}
                                        data-testid={`confirm-wizard-${order.id}`}
                                      >
                                        <Check className="h-3 w-3 mr-0.5" />
                                        {t("supplierHome", "confirm")}
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap gap-1 justify-end">
                                    <Button size="sm" className="h-7 px-2 text-[10px] md:text-xs border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950/30" variant="outline" onClick={() => setCardWizard({ orderId: order.id, action: "delivered" })} disabled={updateStatusMutation.isPending} data-testid={`home-delivered-${order.id}`}>
                                      <Package className="h-3 w-3 mr-0.5" />
                                      {lang === "de" ? "Geliefert" : "Consegnato"}
                                    </Button>
                                    {!order.requestedDeliveryDate && (
                                      <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] md:text-xs border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-400 dark:hover:bg-purple-950/30" onClick={() => setDeliveryDatePicker({ orderId: order.id, restaurantId: order.restaurantId })} data-testid={`home-set-date-${order.id}`}>
                                        <CalendarDays className="h-3 w-3 mr-0.5" />
                                        {lang === "de" ? "Datum setzen" : "Imposta data"}
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex items-center justify-center h-14 w-14 rounded-full bg-muted/50 mb-3">
              <Truck className="h-7 w-7 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">{t("supplierHome", "noUpcomingDeliveries")}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("supplierHome", "allDeliveriesProcessed")}
            </p>
          </div>
        )}
        </div>
      </div>
          )},
          { id: "unread-messages", defaultSize: "half" as const, content: (
          <div className="md:rounded-xl md:border md:border-border md:bg-card md:shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-3 md:mb-0 md:p-5 md:pb-4">
              <div className="flex items-center gap-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base md:text-xl font-bold" data-testid="text-unread-messages-title">
                      {t("supplierHome", "unreadMessages")}
                    </h2>
                    {totalUnread > 0 && (
                      <Badge className="bg-blue-600 text-white text-[10px] px-1.5 py-0 min-w-[20px] flex items-center justify-center" data-testid="badge-unread-count">
                        {totalUnread}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground hidden md:block">
                    {t("supplierHome", "unreadMessagesDesc")}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="text-xs md:text-sm shrink-0" asChild>
                <Link href="/supplier/inbox" data-testid="link-view-all-messages">{t("supplierHome", "allMessages")}</Link>
              </Button>
            </div>
            <div className="md:px-5 md:pb-5">
            {convLoading ? (
              <div className="flex gap-3 overflow-hidden md:flex-col">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="min-w-[220px] h-[130px] md:min-w-0 md:h-14 rounded-xl shrink-0" />
                ))}
              </div>
            ) : unreadConversations.length > 0 ? (
              <>
                {/* Mobile: horizontal scroll cards */}
                <div
                  className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory md:hidden"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
                >
                  {unreadConversations.slice(0, 5).map((conv) => {
                    const isPriority = conv.lastMessage?.priority === "important";
                    return (
                      <div
                        key={conv.id}
                        className={`min-w-[220px] w-[220px] shrink-0 snap-start rounded-2xl border p-4 cursor-pointer transition-all active:scale-[0.98] ${isPriority ? "border-red-300 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20" : "border-border bg-card"}`}
                        onClick={() => navigate(`/supplier/inbox?chat=${conv.id}`)}
                        data-testid={`unread-chat-${conv.id}`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <Avatar className="h-10 w-10 shrink-0">
                            {conv.otherUser.profileImageUrl ? (
                              <AvatarImage src={conv.otherUser.profileImageUrl} alt={conv.otherUser.companyName || conv.otherUser.name} />
                            ) : null}
                            <AvatarFallback className={`text-xs font-bold ${isPriority ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}`}>
                              {(conv.otherUser.companyName || conv.otherUser.name || "?").slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <Badge className={`text-white text-[9px] px-1.5 py-0 min-w-[18px] flex items-center justify-center shrink-0 ${isPriority ? "bg-red-600" : "bg-blue-600"}`} data-testid={`badge-unread-conv-${conv.id}`}>
                            {conv.unreadCount}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-1.5 mb-1">
                          {isPriority && <Flame className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                          <p className={`text-sm font-semibold truncate ${isPriority ? "text-red-700 dark:text-red-400" : ""}`} data-testid={`text-unread-restaurant-${conv.id}`}>
                            {conv.otherUser.companyName || conv.otherUser.name}
                          </p>
                        </div>
                        <p className={`text-xs line-clamp-2 ${isPriority ? "text-red-600/70 dark:text-red-400/70" : "text-muted-foreground"}`} data-testid={`text-unread-preview-${conv.id}`}>
                          {getMessagePreview(conv)}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-2" data-testid={`text-unread-time-${conv.id}`}>
                          {conv.lastMessage?.createdAt && format(new Date(conv.lastMessage.createdAt), "HH:mm", { locale: dateLocale })}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop: stacked list */}
                <div className="hidden md:block space-y-2">
                  {unreadConversations.slice(0, 3).map((conv) => {
                    const isPriority = conv.lastMessage?.priority === "important";
                    return (
                      <div
                        key={conv.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200 hover:shadow-md ${isPriority ? "border-red-300 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20 hover:border-red-400" : "border-border bg-card hover:border-blue-300/40"}`}
                        onClick={() => navigate(`/supplier/inbox?chat=${conv.id}`)}
                        data-testid={`unread-chat-desktop-${conv.id}`}
                      >
                        {isPriority && (
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30 shrink-0">
                            <Flame className="h-4 w-4 text-red-600" />
                          </div>
                        )}
                        {!isPriority && (
                          <Avatar className="h-9 w-9 shrink-0">
                            {conv.otherUser.profileImageUrl ? (
                              <AvatarImage src={conv.otherUser.profileImageUrl} alt={conv.otherUser.companyName || conv.otherUser.name} />
                            ) : null}
                            <AvatarFallback className="bg-blue-100 text-blue-700 text-xs dark:bg-blue-900/30 dark:text-blue-400">
                              {(conv.otherUser.companyName || conv.otherUser.name || "?").slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {isPriority && (
                                <Flame className="h-3.5 w-3.5 text-red-500 shrink-0" />
                              )}
                              <span className={`text-sm font-semibold truncate ${isPriority ? "text-red-700 dark:text-red-400" : ""}`} data-testid={`text-unread-restaurant-desktop-${conv.id}`}>
                                {conv.otherUser.companyName || conv.otherUser.name}
                              </span>
                            </div>
                            <span className="text-[10px] text-muted-foreground shrink-0" data-testid={`text-unread-time-desktop-${conv.id}`}>
                              {conv.lastMessage?.createdAt && format(new Date(conv.lastMessage.createdAt), "HH:mm", { locale: dateLocale })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className={`text-xs truncate flex-1 ${isPriority ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`} data-testid={`text-unread-preview-desktop-${conv.id}`}>
                              {getMessagePreview(conv)}
                            </p>
                            <Badge className={`text-white text-[9px] px-1.5 py-0 min-w-[18px] flex items-center justify-center shrink-0 ${isPriority ? "bg-red-600" : "bg-blue-600"}`} data-testid={`badge-unread-conv-desktop-${conv.id}`}>
                              {conv.unreadCount}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {totalUnread > 3 && (
                    <p className="text-xs text-muted-foreground text-center pt-1" data-testid="text-more-unread">
                      +{totalUnread - 3} {t("supplierHome", "moreUnread")}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="flex items-center justify-center h-12 w-12 rounded-full bg-muted/50 mb-3">
                  <MessageSquare className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">{t("supplierHome", "noUnreadMessages")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("supplierHome", "noUnreadMessagesDesc")}</p>
              </div>
            )}
            </div>
          </div>
          )},
          { id: "new-orders", defaultSize: "half" as const, content: (
          <div className="md:rounded-xl md:border md:border-border md:bg-card md:shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-3 md:mb-0 md:p-5 md:pb-4">
              <div className="flex items-center gap-2.5">
                <div>
                  <h2 className="text-base md:text-xl font-bold">{t("supplierHome", "newOrders")}</h2>
                  <p className="text-xs text-muted-foreground hidden md:block">{lang === "de" ? "Bestellungen der letzten 24 Stunden" : "Ordini delle ultime 24 ore"}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="text-xs md:text-sm shrink-0" asChild>
                <Link href="/supplier/orders" data-testid="link-view-all-orders">{t("common", "all")}</Link>
              </Button>
            </div>
            <div className="md:px-5 md:pb-5">
            {ordersLoading ? (
              <div className="flex gap-3 overflow-hidden md:flex-col">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="min-w-[200px] h-[160px] md:min-w-0 md:h-20 rounded-xl shrink-0" />
                ))}
              </div>
            ) : recentOrders && recentOrders.length > 0 ? (
              <>
                {/* Mobile: horizontal scroll cards */}
                <div
                  className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory md:hidden"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
                >
                  {recentOrders.map((order) => (
                    <div
                      key={order.id}
                      className="min-w-[200px] w-[200px] shrink-0 snap-start rounded-2xl border border-border bg-card p-4 cursor-pointer transition-all active:scale-[0.98]"
                      onClick={() => navigate(`/supplier/orders/${order.id}`)}
                      data-testid={`order-item-${order.id}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 shrink-0">
                          <ShoppingBag className="h-5 w-5 text-primary" />
                        </div>
                        <Badge className={`${getStatusColor(order.status)} text-[10px] px-1.5`} variant="outline">
                          {getOrderStatus(order.status, lang, true)}
                        </Badge>
                      </div>

                      <p className="text-sm font-semibold truncate">{order.restaurant?.companyName || order.restaurant?.name || t("common", "unknown")}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {order.items?.length || 0} {lang === "de" ? "Artikel" : "articoli"}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true, locale: dateLocale })}
                      </p>

                      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border/50">
                        <span className="text-xs text-muted-foreground font-mono">#{order.id.slice(0, 8)}</span>
                        <span className="text-base font-bold">{order.totalAmount}€</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop: stacked list */}
                <div className="hidden md:block space-y-2">
                  {recentOrders.map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:shadow-md hover:border-primary/20 transition-all duration-200 cursor-pointer"
                      onClick={() => navigate(`/supplier/orders/${order.id}`)}
                      data-testid={`order-item-${order.id}`}
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                        <ShoppingBag className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-medium">#{order.id.slice(0, 8)}</p>
                          <Badge className={`${getStatusColor(order.status)} text-[10px] px-1.5`} variant="outline">
                            {getOrderStatus(order.status, lang, true)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <UserIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                          <p className="text-xs text-muted-foreground truncate">
                            {order.restaurant?.companyName || order.restaurant?.name || t("common", "unknown")}
                          </p>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true, locale: dateLocale })}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                        <span className="text-base font-bold">{order.totalAmount}€</span>
                        <span className="text-xs text-muted-foreground">
                          {order.items?.length || 0} {lang === "de" ? "Artikel" : "articoli"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="flex items-center justify-center h-12 w-12 rounded-full bg-muted/50 mb-3">
                  <ClipboardList className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">{t("supplierHome", "noNewOrders")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("supplierHome", "allProcessed")}</p>
              </div>
            )}
            </div>
          </div>
          )},
          { id: "action-required", defaultSize: "half" as const, content: (
          <>
          {((actionRequired?.staleOrders?.length || 0) > 0 || (actionRequired?.openComplaints?.length || 0) > 0) && (
            <div className="md:rounded-xl md:border md:border-border md:bg-card md:shadow-sm">
              <div className="flex items-center justify-between gap-2 mb-3 md:mb-0 md:p-5 md:pb-4">
                <div className="flex items-center gap-2.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base md:text-xl font-bold" data-testid="text-action-required-title">
                        {lang === "de" ? "Erforderliche Aktionen" : "Azioni richieste"}
                      </h2>
                      <Badge className="bg-red-600 text-white text-[10px] px-1.5 py-0 min-w-[20px] flex items-center justify-center">
                        {(actionRequired?.staleOrders?.length || 0) + (actionRequired?.openComplaints?.length || 0)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground hidden md:block">
                      {lang === "de" ? "Unbearbeitete Bestellungen und Reklamationen" : "Ordini non elaborati e reclami"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="md:px-5 md:pb-5">
              {/* Mobile: horizontal scroll cards */}
              <div
                className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory md:hidden"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
              >
                {(actionRequired?.staleOrders || []).map((order) => (
                  <div
                    key={order.id}
                    className="min-w-[200px] w-[200px] shrink-0 snap-start rounded-2xl border border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/10 p-4 cursor-pointer transition-all active:scale-[0.98]"
                    onClick={() => navigate(`/supplier/orders/${order.id}`)}
                    data-testid={`stale-order-${order.id}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 dark:bg-red-900/30 shrink-0">
                        <Clock className="h-5 w-5 text-red-600" />
                      </div>
                      <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px] px-1.5" variant="outline">
                        {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true, locale: dateLocale })}
                      </Badge>
                    </div>
                    <p className="text-sm font-semibold truncate">{order.restaurant?.companyName || order.restaurant?.name}</p>
                    <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-red-200/50 dark:border-red-900/30">
                      <span className="text-xs text-muted-foreground font-mono">#{order.id.slice(0, 8)}</span>
                      <span className="text-base font-bold">{order.totalAmount}€</span>
                    </div>
                  </div>
                ))}
                {(actionRequired?.openComplaints || []).map((complaint) => {
                  const statusLabels: Record<string, Record<string, string>> = {
                    de: { open: "Offen", in_progress: "In Bearbeitung", resolved: "Gelöst" },
                    it: { open: "Aperto", in_progress: "In lavorazione", resolved: "Risolto" },
                  };
                  return (
                    <div
                      key={complaint.id}
                      className={`min-w-[200px] w-[200px] shrink-0 snap-start rounded-2xl border p-4 cursor-pointer transition-all active:scale-[0.98] ${complaint.priority === "urgent" ? "border-red-300 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/10" : "border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/10"}`}
                      onClick={() => navigate(`/supplier/complaints/${complaint.id}`)}
                      data-testid={`action-complaint-${complaint.id}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30 shrink-0">
                          {complaint.priority === "urgent" ? <Flame className="h-5 w-5 text-red-500" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
                        </div>
                        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] px-1.5" variant="outline">
                          {statusLabels[lang]?.[complaint.status] || complaint.status}
                        </Badge>
                      </div>
                      <p className={`text-sm font-semibold truncate ${complaint.priority === "urgent" ? "text-red-700 dark:text-red-400" : ""}`}>{complaint.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{complaint.restaurant?.companyName || complaint.restaurant?.name}</p>
                      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border/50">
                        <span className="text-xs text-muted-foreground font-mono">#{complaint.id.slice(0, 8)}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(complaint.createdAt), { addSuffix: true, locale: dateLocale })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop: stacked list */}
              <div className="hidden md:block space-y-3">
                {(actionRequired?.staleOrders?.length || 0) > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {lang === "de" ? "Unbearbeitete Bestellungen" : "Ordini non elaborati"} ({actionRequired!.staleOrders.length})
                    </p>
                    <div className="space-y-2">
                      {actionRequired!.staleOrders.map((order) => (
                        <div
                          key={order.id}
                          className="flex items-center gap-3 p-3 rounded-xl border border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/10 hover:shadow-md transition-all duration-200 cursor-pointer"
                          onClick={() => navigate(`/supplier/orders/${order.id}`)}
                          data-testid={`stale-order-desktop-${order.id}`}
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30 shrink-0">
                            <Clock className="h-5 w-5 text-red-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-sm font-medium">#{order.id.slice(0, 8)}</p>
                              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px] px-1.5" variant="outline">
                                {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true, locale: dateLocale })}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <UserIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                              <p className="text-xs text-muted-foreground truncate">
                                {order.restaurant?.companyName || order.restaurant?.name}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="text-base font-bold">{order.totalAmount}€</span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(actionRequired?.openComplaints?.length || 0) > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {lang === "de" ? "Reklamationen" : "Reclami"} ({actionRequired!.openComplaints.length})
                    </p>
                    <div className="space-y-2">
                      {actionRequired!.openComplaints.map((complaint) => {
                        const statusColors: Record<string, string> = {
                          open: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
                          in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
                          resolved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
                        };
                        const statusLabels: Record<string, Record<string, string>> = {
                          de: { open: "Offen", in_progress: "In Bearbeitung", resolved: "Gelöst" },
                          it: { open: "Aperto", in_progress: "In lavorazione", resolved: "Risolto" },
                        };
                        return (
                          <div
                            key={complaint.id}
                            className={`flex items-center gap-3 p-3 rounded-xl border hover:shadow-md transition-all duration-200 cursor-pointer ${complaint.priority === "urgent" ? "border-red-300 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/10" : "border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/10"}`}
                            onClick={() => navigate(`/supplier/complaints/${complaint.id}`)}
                            data-testid={`action-complaint-desktop-${complaint.id}`}
                          >
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30 shrink-0">
                              {complaint.priority === "urgent" ? <Flame className="h-5 w-5 text-red-500" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {complaint.priority === "urgent" && <Flame className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                                <p className={`text-sm font-medium truncate ${complaint.priority === "urgent" ? "text-red-700 dark:text-red-400" : ""}`}>{complaint.title}</p>
                                <Badge className={`${statusColors[complaint.status] || ""} text-[10px] px-1.5`} variant="outline">
                                  {statusLabels[lang]?.[complaint.status] || complaint.status}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <UserIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                                <p className="text-xs text-muted-foreground truncate">
                                  {complaint.restaurant?.companyName || complaint.restaurant?.name}
                                </p>
                                <span className="text-[10px] text-muted-foreground/70 shrink-0 ml-1">
                                  {formatDistanceToNow(new Date(complaint.createdAt), { addSuffix: true, locale: dateLocale })}
                                </span>
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              </div>
            </div>
          )}
          </>
          )},
          { id: "low-stock", defaultSize: "half" as const, content: (
          <div className="md:rounded-xl md:border md:border-border md:bg-card md:shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-3 md:mb-0 md:p-5 md:pb-4">
              <div className="flex items-center gap-2.5">
                <div>
                  <h2 className="text-base md:text-xl font-bold" data-testid="text-low-stock-title">
                    {t("supplierHome", "lowStockAlerts")}
                  </h2>
                  <p className="text-xs text-muted-foreground hidden md:block">
                    {t("supplierHome", "lowStockAlertsDesc")}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="text-xs md:text-sm shrink-0" asChild>
                <Link href="/supplier/products" data-testid="link-manage-stock">{t("common", "products")}</Link>
              </Button>
            </div>
            <div className="md:px-5 md:pb-5">
            {lowStockLoading ? (
              <div className="flex gap-3 overflow-hidden md:flex-col">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="min-w-[180px] h-[120px] md:min-w-0 md:h-14 rounded-xl shrink-0" />
                ))}
              </div>
            ) : lowStockProducts && lowStockProducts.length > 0 ? (
              <>
                {/* Mobile: horizontal scroll cards */}
                <div
                  className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory md:hidden"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
                >
                  {lowStockProducts.map((product) => (
                    <div
                      key={product.id}
                      className="min-w-[180px] w-[180px] shrink-0 snap-start rounded-2xl border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/20 p-4 cursor-pointer transition-all active:scale-[0.98]"
                      onClick={() => navigate("/supplier/products")}
                      data-testid={`low-stock-item-${product.id}`}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt="" className="h-10 w-10 rounded-xl object-cover shrink-0" />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-900/30 shrink-0">
                            <Package className="h-5 w-5 text-orange-600" />
                          </div>
                        )}
                      </div>
                      <p className="text-sm font-semibold truncate">{product.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {t("supplierHome", "threshold")}: {product.lowStockThreshold} {product.unit}
                      </p>
                      <div className="mt-3 pt-2.5 border-t border-orange-200/50 dark:border-orange-800/30">
                        <Badge variant="outline" className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 text-[10px]">
                          <span className="tabular-nums">{product.stockQuantity ?? 0}</span> {product.unit}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop: stacked list */}
                <div className="hidden md:block space-y-2">
                  {lowStockProducts.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between gap-2 p-3 rounded-xl border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/20"
                      data-testid={`low-stock-item-desktop-${product.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt="" className="h-9 w-9 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30 shrink-0">
                            <Package className="h-4 w-4 text-orange-600" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{product.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {t("supplierHome", "threshold")}: {product.lowStockThreshold} {product.unit}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 text-xs shrink-0 ml-2 whitespace-nowrap">
                        <span className="tabular-nums">{product.stockQuantity ?? 0}</span> {product.unit}
                      </Badge>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="flex items-center justify-center h-12 w-12 rounded-full bg-muted/50 mb-3">
                  <Package className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">{t("supplierHome", "noLowStock")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("supplierHome", "noLowStockDesc")}</p>
              </div>
            )}
            </div>
          </div>
          )},
          { id: "statistics", defaultSize: "half" as const, content: (
      <div className="md:rounded-xl md:border md:border-border md:bg-card md:shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-3 md:mb-0 md:p-5 md:pb-4">
          <div className="flex items-center gap-2.5">
            <div>
              <h2 className="text-base md:text-xl font-bold" data-testid="text-statistics-title">
                {t("supplierHome", "statistics")}
              </h2>
              <p className="text-xs text-muted-foreground hidden md:block">
                {t("supplierHome", "statisticsDesc")}
              </p>
            </div>
          </div>
        </div>
        <div className="md:px-5 md:pb-5">
        {statsLoading ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
            </div>
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        ) : detailedStats && (detailedStats.totalOrders > 0 || detailedStats.topProducts.length > 0) ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              <div className="rounded-xl border border-border bg-card p-3 md:p-4 min-w-0">
                <div className="flex items-center gap-1.5 mb-1 min-w-0">
                  <Euro className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                  <span className="text-[10px] md:text-xs text-muted-foreground font-medium truncate">{t("supplierHome", "totalRevenue")}</span>
                </div>
                <p className="text-base md:text-xl font-bold text-foreground truncate" data-testid="text-total-revenue">
                  {detailedStats.totalRevenue.toLocaleString(lang === "de" ? "de-DE" : "it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}€
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 md:p-4 min-w-0">
                <div className="flex items-center gap-1.5 mb-1 min-w-0">
                  <Hash className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span className="text-[10px] md:text-xs text-muted-foreground font-medium truncate">{t("supplierHome", "totalOrders")}</span>
                </div>
                <p className="text-base md:text-xl font-bold text-foreground" data-testid="text-total-orders">
                  {detailedStats.totalOrders}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 md:p-4 min-w-0">
                <div className="flex items-center gap-1.5 mb-1 min-w-0">
                  <TrendingUp className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <span className="text-[10px] md:text-xs text-muted-foreground font-medium truncate">{t("supplierHome", "avgOrderValue")}</span>
                </div>
                <p className="text-base md:text-xl font-bold text-foreground truncate" data-testid="text-avg-order-value">
                  {detailedStats.avgOrderValue.toLocaleString(lang === "de" ? "de-DE" : "it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}€
                </p>
              </div>
            </div>

            {chartData.length > 0 && chartData.some(d => d.revenue > 0) && (
              <div>
                <p className="text-xs md:text-sm font-medium text-foreground mb-3">{t("supplierHome", "revenueOverview")}</p>
                <div className="h-44 md:h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}€`} />
                      <Tooltip
                        cursor={{ fill: "rgba(0, 0, 0, 0.04)" }}
                        isAnimationActive={false}
                        position={{ y: 0 }}
                        offset={0}
                        allowEscapeViewBox={{ x: false, y: true }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const value = payload[0].value as number;
                          return (
                            <div className="rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-sm text-center">
                              <p className="text-xs font-semibold text-foreground">
                                {value.toLocaleString(lang === "de" ? "de-DE" : "it-IT", { minimumFractionDigits: 2 })}€
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {detailedStats.topProducts.length > 0 && (
              <div>
                <p className="text-xs md:text-sm font-medium text-foreground mb-3">{t("supplierHome", "topProducts")}</p>
                <div className="grid grid-cols-2 gap-2 md:gap-3">
                  {detailedStats.topProducts.slice(0, 6).map((product, idx) => {
                    const maxQty = detailedStats.topProducts[0]?.quantity || 1;
                    const pct = Math.round((product.quantity / maxQty) * 100);
                    return (
                      <div key={idx} className="rounded-xl border border-border bg-card p-2.5 md:p-3" data-testid={`top-product-${idx}`}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold shrink-0">
                            {idx + 1}
                          </span>
                          <span className="text-xs md:text-sm font-medium truncate flex-1">{product.name}</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-1.5">
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] md:text-xs text-muted-foreground">
                            {product.quantity}x
                          </span>
                          <span className="text-xs md:text-sm font-semibold">
                            {product.revenue.toLocaleString(lang === "de" ? "de-DE" : "it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}€
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="flex items-center justify-center h-12 w-12 rounded-full bg-muted/50 mb-3">
              <BarChart3 className="h-6 w-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">{t("supplierHome", "noStatsYet")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("supplierHome", "noStatsYetDesc")}</p>
          </div>
        )}
        </div>
      </div>
          )},
        ]}
      />

      {deliveryDatePicker && (
        <DeliveryDatePicker
          open={true}
          onOpenChange={(open) => { if (!open) setDeliveryDatePicker(null); }}
          supplierId={currentUser?.id || ""}
          restaurantId={deliveryDatePicker.restaurantId}
          onConfirm={(date) => {
            const order = [...(upcomingDeliveries || []), ...(recentOrders || [])].find(o => o.id === deliveryDatePicker.orderId);
            if (order && order.status === "confirmed") {
              updateStatusMutation.mutate({ orderId: deliveryDatePicker.orderId, status: "in_delivery", requestedDeliveryDate: date });
            } else {
              setDeliveryDateMutation.mutate({ orderId: deliveryDatePicker.orderId, requestedDeliveryDate: date });
            }
          }}
          isPending={updateStatusMutation.isPending || setDeliveryDateMutation.isPending}
        />
      )}
    </div>
  );
}
