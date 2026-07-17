import { useQuery, useMutation } from "@tanstack/react-query";
import { HeroPortal } from "@/context/HeroContext";
import { useUser } from "@/context/UserContext";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, Clock, CheckCircle, ShoppingBag, User as UserIcon, Truck, Check, X, AlertTriangle, Package, MessageSquare, BarChart3, TrendingUp, TrendingDown, Euro, Hash, XCircle, CalendarDays, Calendar, FileText, Loader2, Send, ArrowRight, AlertCircle, CircleAlert, ChevronRight, Flame, Target, Users, Lightbulb, Download } from "lucide-react";
import { formatOrderNumber, formatComplaintNumber, type OrderWithDetails, type Product, type ConversationWithUser, type ComplaintWithDetails } from "@shared/schema";
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
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, Line, Legend } from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import DeliveryDatePicker from "@/components/DeliveryDatePicker";
import DraggableCardGrid from "@/components/DraggableCardGrid";
import CountUp from "@/components/CountUp";
import KpiRefreshButton from "@/components/KpiRefreshButton";
import PullToRefreshWrapper from "@/components/PullToRefreshWrapper";
import SupplierHomeMobile from "./HomeMobile";
import { useIsMobile } from "@/hooks/use-mobile";
import { ProductImage } from "@/components/ProductImage";
import SupplierRatingsList from "@/components/SupplierRatingsList";
import { OffeneReklamationenWidget, HeuteZuLiefernWidget, TopKunden30dWidget, PromoPerformanceWidget, AntwortzeitWidget, SteigendeNachfrageWidget, InaktiveRestaurantsWidget, UmsatzTrendWidget, SBestellungenStatusWidget, OffeneRisikenWidget } from "@/components/SupplierDashboardWidgets";
import { getBuiltinViews } from "@/lib/dashboard-builtin-views";

export default function SupplierHome() {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const isMobile = useIsMobile();
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

  type StatsPeriod = "7d" | "30d" | "6m" | "12m";
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>("6m");
  const [statsTab, setStatsTab] = useState<"products" | "customers">("products");
  const [revenueGoalOpen, setRevenueGoalOpen] = useState(false);
  const [revenueGoalInput, setRevenueGoalInput] = useState("");

  type DetailedStats = {
    period: StatsPeriod;
    bucket: "day" | "month";
    timeSeries: { key: string; revenue: number; orders: number }[];
    monthlyRevenue: { month: string; revenue: number }[];
    topProducts: { productId: string; name: string; quantity: number; revenue: number; previousQuantity: number }[];
    topCustomers: { restaurantId: string; name: string; orders: number; revenue: number }[];
    ordersByStatus: { status: string; count: number }[];
    totalRevenue: number;
    totalOrders: number;
    avgOrderValue: number;
    activeCustomers: number;
    currentMonthRevenue: number;
    previous: { totalRevenue: number; totalOrders: number; avgOrderValue: number; activeCustomers: number };
  };

  const { data: detailedStats, isLoading: statsLoading } = useQuery<DetailedStats>({
    queryKey: [`/api/supplier/detailed-stats?supplierId=${currentUser?.id}&period=${statsPeriod}`],
    enabled: !!currentUser?.id,
  });

  const { data: revenueTargetData } = useQuery<{ monthlyRevenueTarget: number | null }>({
    queryKey: [`/api/supplier/settings/revenue-target?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
    queryFn: async () => {
      const res = await fetch(`/api/supplier/settings/revenue-target?supplierId=${currentUser?.id}`, {
        credentials: "include",
        headers: { "x-user-id": currentUser?.id ?? "" },
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  const { data: insights } = useQuery<Array<{ type: string; title: string; count: number; link: string }>>({
    queryKey: [`/api/supplier/insights?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const monthlyRevenueTarget = revenueTargetData?.monthlyRevenueTarget ?? null;

  const setRevenueTargetMutation = useMutation({
    mutationFn: async (target: number | null) => {
      const res = await fetch("/api/supplier/settings/revenue-target", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-user-id": currentUser?.id ?? "" },
        body: JSON.stringify({ supplierId: currentUser?.id, monthlyRevenueTarget: target }),
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/supplier/settings/revenue-target?supplierId=${currentUser?.id}`] });
      setRevenueGoalOpen(false);
      toast({ title: lang === "de" ? "Ziel gespeichert" : "Obiettivo salvato" });
    },
  });

  const monthNames: Record<string, Record<string, string>> = {
    de: { "01": "Jan", "02": "Feb", "03": "Mär", "04": "Apr", "05": "Mai", "06": "Jun", "07": "Jul", "08": "Aug", "09": "Sep", "10": "Okt", "11": "Nov", "12": "Dez" },
    it: { "01": "Gen", "02": "Feb", "03": "Mar", "04": "Apr", "05": "Mag", "06": "Giu", "07": "Lug", "08": "Ago", "09": "Set", "10": "Ott", "11": "Nov", "12": "Dic" },
  };

  const dayShort = (lang === "de") ? ["So","Mo","Di","Mi","Do","Fr","Sa"] : ["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];

  const chartData = useMemo(() => {
    if (!detailedStats?.timeSeries) return [];
    return detailedStats.timeSeries.map(p => {
      let name = "";
      if (detailedStats.bucket === "day") {
        const d = new Date(p.key + "T00:00:00");
        if (statsPeriod === "7d") {
          name = dayShort[d.getDay()];
        } else {
          name = `${d.getDate()}.${d.getMonth()+1}`;
        }
      } else {
        const mo = p.key.split("-")[1];
        name = monthNames[lang]?.[mo] || mo;
      }
      return { name, key: p.key, revenue: Number(p.revenue) || 0, orders: Number(p.orders) || 0 };
    });
  }, [detailedStats, lang, statsPeriod]);

  const calcDelta = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const monthRevenue = Number(detailedStats?.currentMonthRevenue) || 0;
  const goalProgress = monthlyRevenueTarget && monthlyRevenueTarget > 0 ? Math.min(100, Math.round((monthRevenue / monthlyRevenueTarget) * 100)) : 0;

  const handleStatsExport = () => {
    if (!currentUser?.id) return;
    const now = new Date();
    let dateFrom = new Date(now);
    if (statsPeriod === "7d") dateFrom.setDate(now.getDate() - 6);
    else if (statsPeriod === "30d") dateFrom.setDate(now.getDate() - 29);
    else if (statsPeriod === "6m") dateFrom = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    else dateFrom = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const url = `/api/orders/export?userId=${currentUser.id}&role=supplier&format=csv&dateFrom=${fmt(dateFrom)}&dateTo=${fmt(now)}`;
    window.open(url, "_blank");
  };

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
        const id = data.orderNumber || formatOrderNumber({orderNumber: msg.orderNumber, id: data.orderId || msg.orderId || ""});
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
        const id = data.orderNumber || formatOrderNumber({orderNumber: msg.orderNumber, id: data.orderId || ""});
        return id ? `${lang === "de" ? "Lieferschein" : "Bolla di consegna"} #${id}` : (lang === "de" ? "Neuer Lieferschein" : "Nuova bolla");
      }
      if (msg.messageType === "order_change_request") {
        const data = JSON.parse(msg.content);
        const id = data.orderNumber || formatOrderNumber({orderNumber: msg.orderNumber, id: data.orderId || msg.orderId || ""});
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
    mutationFn: async ({ orderId, status, requestedDeliveryDate, deliveryNotes }: { orderId: string; status: string; requestedDeliveryDate?: string; deliveryNotes?: string }) => {
      await apiRequest("PATCH", `/api/orders/${orderId}/status`, {
        status,
        changedBy: currentUser?.id,
        ...(requestedDeliveryDate ? { requestedDeliveryDate } : {}),
        ...(deliveryNotes !== undefined ? { deliveryNotes } : {}),
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
    mutationFn: async ({ orderId, requestedDeliveryDate, dateChangeReason }: { orderId: string; requestedDeliveryDate: string; dateChangeReason?: string }) => {
      await apiRequest("PATCH", `/api/orders/${orderId}/reschedule`, { requestedDeliveryDate, ...(dateChangeReason ? { dateChangeReason } : {}) });
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
      case "scheduled": return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400";
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending": return <Clock className="h-3.5 w-3.5" />;
      case "confirmed": return <Package className="h-3.5 w-3.5" />;
      case "partially_confirmed": return <AlertTriangle className="h-3.5 w-3.5" />;
      case "scheduled": return <CalendarDays className="h-3.5 w-3.5" />;
      case "in_delivery": return <Truck className="h-3.5 w-3.5" />;
      case "delivered": return <CheckCircle className="h-3.5 w-3.5" />;
      case "cancelled": return <XCircle className="h-3.5 w-3.5" />;
      default: return <ShoppingBag className="h-3.5 w-3.5" />;
    }
  };

  const deliveriesGridTemplate = "100px 130px minmax(0,1.6fr) 80px 150px 130px 110px";

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

  const mobileSharedProps = {
    currentUser, lang, t, navigate,
    totalUnread, convLoading,
    recentOrders, ordersLoading,
    lowStockProducts, lowStockLoading,
    upcomingDeliveries, deliveriesLoading,
    actionRequired, detailedStats, dateLocale,
    statsPeriod, setStatsPeriod, statsLoading,
    insights, monthlyRevenueTarget,
    onExportStats: handleStatsExport,
    onOpenRevenueGoal: () => { setRevenueGoalInput(monthlyRevenueTarget ? String(monthlyRevenueTarget) : ""); setRevenueGoalOpen(true); },
    chartData,
    monthRevenue,
    goalProgress,
    calcDelta,
  };
  const mobileGoalDialog = (
    <Dialog open={revenueGoalOpen} onOpenChange={setRevenueGoalOpen}>
      <DialogContent data-testid="dialog-revenue-goal-mobile">
        <DialogHeader>
          <DialogTitle>{t("supplierHome", "revenueGoal")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="revenue-goal-input-m">{t("supplierHome", "revenueGoalAmount")}</Label>
          <Input
            id="revenue-goal-input-m"
            type="number"
            inputMode="decimal"
            min={0}
            value={revenueGoalInput}
            onChange={(e) => setRevenueGoalInput(e.target.value)}
            data-testid="input-revenue-goal-mobile"
            placeholder="10000"
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          {monthlyRevenueTarget && (
            <Button type="button" variant="outline" onClick={() => setRevenueTargetMutation.mutate(null)} disabled={setRevenueTargetMutation.isPending} data-testid="button-remove-revenue-goal-mobile">
              {t("supplierHome", "revenueGoalRemove")}
            </Button>
          )}
          <Button type="button" onClick={() => { const v = parseFloat(revenueGoalInput); if (!isFinite(v) || v <= 0) return; setRevenueTargetMutation.mutate(v); }} disabled={setRevenueTargetMutation.isPending || !revenueGoalInput} data-testid="button-save-revenue-goal-mobile">
            {t("supplierHome", "revenueGoalSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  if (isMobile) {
    return (
      <>
        <SupplierHomeMobile {...mobileSharedProps} />
        {mobileGoalDialog}
      </>
    );
  }
  return (
    <>
    <SupplierHomeMobile {...mobileSharedProps} />
    {mobileGoalDialog}
    <PullToRefreshWrapper
      onRefresh={async () => {
        await queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey[0];
            return typeof key === "string" && (key.startsWith("/api/supplier") || key.startsWith("/api/low-stock") || key.startsWith("/api/conversations"));
          },
        });
      }}
      className="hidden md:block md:space-y-6 md:pb-6"
    >
      <div>
        <HeroPortal><div className="bg-[#161921] px-3 md:px-6 pt-4 md:pt-6 pb-4 md:pb-6">
          <h1 className="text-2xl md:text-4xl font-bold text-white mb-3 md:mb-5" data-testid="text-page-title">
            {currentUser?.companyName || ""}
          </h1>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
            <Link href="/supplier/inbox" data-testid="kpi-card-messages">
              <div className="group/kpi relative rounded-xl md:rounded-2xl bg-white/[0.06] border border-white/[0.08] p-3 md:p-5 cursor-pointer hover:bg-white/[0.10] transition-colors h-full flex flex-col justify-between min-h-[100px] md:min-h-[120px]">
                <KpiRefreshButton testId="button-refresh-kpi-messages" label={lang === "de" ? "Aktualisieren" : "Aggiorna"} queryKeys={[[`/api/conversations?userId=${currentUser?.id}`]]} />
                <span className="text-[11px] md:text-sm text-gray-400 font-medium"><span className="md:hidden">{lang === "de" ? "Nachrichten" : "Messaggi"}</span><span className="hidden md:inline">{lang === "de" ? "Neue Nachrichten" : "Nuovi messaggi"}</span></span>
                <div className="flex items-end justify-between mt-auto">
                  <p className="text-3xl md:text-5xl font-bold text-white leading-none" data-testid="kpi-unread-messages">{convLoading ? "..." : <CountUp end={totalUnread} duration={800} />}</p>
                  <div className="flex items-center justify-center h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl bg-white/10">
                    <MessageSquare className="h-4 w-4 md:h-5 md:w-5 text-white" />
                  </div>
                </div>
              </div>
            </Link>
            <Link href="/supplier/orders" data-testid="kpi-card-orders">
              <div className="group/kpi relative rounded-xl md:rounded-2xl bg-white/[0.06] border border-white/[0.08] p-3 md:p-5 cursor-pointer hover:bg-white/[0.10] transition-colors h-full flex flex-col justify-between min-h-[100px] md:min-h-[120px]">
                <KpiRefreshButton testId="button-refresh-kpi-orders" label={lang === "de" ? "Aktualisieren" : "Aggiorna"} queryKeys={[['/api/supplier/orders/recent', currentUser?.id]]} />
                <span className="text-[11px] md:text-sm text-gray-400 font-medium"><span className="md:hidden">{lang === "de" ? "Bestellungen" : "Ordini"}</span><span className="hidden md:inline">{lang === "de" ? "Neue Bestellungen" : "Nuovi ordini"}</span></span>
                <div className="flex items-end justify-between mt-auto">
                  <p className="text-3xl md:text-5xl font-bold text-white leading-none" data-testid="kpi-new-orders">{ordersLoading ? "..." : <CountUp end={recentOrders?.length || 0} duration={800} />}</p>
                  <div className="flex items-center justify-center h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl bg-amber-500/20">
                    <ClipboardList className="h-4 w-4 md:h-5 md:w-5 text-amber-400" />
                  </div>
                </div>
              </div>
            </Link>
            <div className="group/kpi relative rounded-xl md:rounded-2xl bg-white/[0.06] border border-white/[0.08] p-3 md:p-5 flex flex-col justify-between min-h-[100px] md:min-h-[120px]" data-testid="kpi-card-stats">
              <KpiRefreshButton testId="button-refresh-kpi-stats" label={lang === "de" ? "Aktualisieren" : "Aggiorna"} queryKeys={[[`/api/supplier/detailed-stats?supplierId=${currentUser?.id}&period=${statsPeriod}`]]} />
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
              <div className="group/kpi relative rounded-xl md:rounded-2xl bg-white/[0.06] border border-white/[0.08] p-3 md:p-5 cursor-pointer hover:bg-white/[0.10] transition-colors h-full flex flex-col justify-between min-h-[100px] md:min-h-[120px]">
                <KpiRefreshButton testId="button-refresh-kpi-low-stock" label={lang === "de" ? "Aktualisieren" : "Aggiorna"} queryKeys={[['/api/low-stock', currentUser?.id]]} />
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
        </div></HeroPortal>
      </div>

      <DraggableCardGrid
        userId={currentUser?.id || ""}
        role="supplier"
        builtinViews={getBuiltinViews("supplier", lang)}
        managerTitle={t("supplierHome", "manageWidgets")}
        managerDescription={t("supplierHome", "manageWidgetsDesc")}
        managerButtonLabel={t("supplierHome", "manageWidgets")}
        viewLabels={{
          views: t("dashboardViews", "views"),
          noViews: t("dashboardViews", "noViews"),
          defaultView: t("dashboardViews", "defaultView"),
          saveAsNew: t("dashboardViews", "saveAsNew"),
          updateActive: t("dashboardViews", "updateActive"),
          rename: t("dashboardViews", "rename"),
          delete: t("dashboardViews", "delete"),
          createTitle: t("dashboardViews", "createTitle"),
          createDesc: t("dashboardViews", "createDesc"),
          renameTitle: t("dashboardViews", "renameTitle"),
          nameLabel: t("dashboardViews", "nameLabel"),
          namePlaceholder: t("dashboardViews", "namePlaceholder"),
          deleteTitle: t("dashboardViews", "deleteTitle"),
          deleteDesc: t("dashboardViews", "deleteDesc"),
          save: t("common", "save"),
          cancel: t("common", "cancel"),
          refresh: t("dashboardViews", "refresh"),
          refreshAll: t("dashboardViews", "refreshAll"),
        }}
        sections={[
          { id: "w-offene-risiken", optional: true, defaultEnabled: true, defaultSize: "half" as const, queryKeys: [["/api/inventory-risks", "status=Open"]],
            title: t("supplierHome", "widgetOpenRisks"), description: t("supplierHome", "widgetOpenRisksDesc"),
            content: <OffeneRisikenWidget supplierId={currentUser?.id || ""} lang={lang} />,
          },
          { id: "w-offene-reklamationen", optional: true, defaultEnabled: true, defaultSize: "half" as const, queryKeys: [['/api/supplier/action-required', currentUser?.id]],
            title: t("supplierHome", "widgetOpenComplaints"), description: t("supplierHome", "widgetOpenComplaintsDesc"),
            content: <OffeneReklamationenWidget supplierId={currentUser?.id || ""} lang={lang} />,
          },
          { id: "w-heute-zu-liefern", optional: true, defaultEnabled: true, defaultSize: "half" as const, queryKeys: [['/api/supplier/upcoming-deliveries', currentUser?.id]],
            title: t("supplierHome", "widgetTodayDeliveries"), description: t("supplierHome", "widgetTodayDeliveriesDesc"),
            content: <HeuteZuLiefernWidget supplierId={currentUser?.id || ""} lang={lang} />,
          },
          { id: "w-top-kunden-30d", optional: true, defaultEnabled: true, defaultSize: "half" as const, queryKeys: [[`/api/supplier/detailed-stats?supplierId=${currentUser?.id}&period=30d`]],
            title: t("supplierHome", "widgetTopCustomers"), description: t("supplierHome", "widgetTopCustomersDesc"),
            content: <TopKunden30dWidget supplierId={currentUser?.id || ""} lang={lang} />,
          },
          { id: "w-promo-performance", optional: true, defaultEnabled: true, defaultSize: "half" as const, queryKeys: [['/api/supplier/promo-performance', currentUser?.id]],
            title: t("supplierHome", "widgetPromoPerformance"), description: t("supplierHome", "widgetPromoPerformanceDesc"),
            content: <PromoPerformanceWidget supplierId={currentUser?.id || ""} lang={lang} />,
          },
          { id: "w-antwortzeit", optional: true, defaultEnabled: true, defaultSize: "half" as const, queryKeys: [['/api/supplier/response-time', currentUser?.id]],
            title: t("supplierHome", "widgetResponseTime"), description: t("supplierHome", "widgetResponseTimeDesc"),
            content: <AntwortzeitWidget supplierId={currentUser?.id || ""} lang={lang} />,
          },
          { id: "w-steigende-nachfrage", optional: true, defaultEnabled: false, defaultSize: "half" as const, queryKeys: [[`/api/supplier/detailed-stats?supplierId=${currentUser?.id}&period=6m`]],
            title: t("supplierHome", "widgetRisingDemand"), description: t("supplierHome", "widgetRisingDemandDesc"),
            content: <SteigendeNachfrageWidget supplierId={currentUser?.id || ""} lang={lang} />,
          },
          { id: "w-inaktive-restaurants", optional: true, defaultEnabled: false, defaultSize: "half" as const, queryKeys: [[`/api/supplier/inactive-restaurants?supplierId=${currentUser?.id}`]],
            title: t("supplierHome", "widgetInactiveRestaurants"), description: t("supplierHome", "widgetInactiveRestaurantsDesc"),
            content: <InaktiveRestaurantsWidget supplierId={currentUser?.id || ""} lang={lang} />,
          },
          { id: "w-umsatz-trend", optional: true, defaultEnabled: false, defaultSize: "full" as const, queryKeys: [[`/api/supplier/detailed-stats?supplierId=${currentUser?.id}&period=6m`]],
            title: t("supplierHome", "widgetRevenueTrend"), description: t("supplierHome", "widgetRevenueTrendDesc"),
            content: <UmsatzTrendWidget supplierId={currentUser?.id || ""} lang={lang} />,
          },
          { id: "w-s-bestellungen-status", optional: true, defaultEnabled: false, defaultSize: "half" as const, queryKeys: [[`/api/supplier/detailed-stats?supplierId=${currentUser?.id}&period=6m`]],
            title: t("supplierHome", "widgetOrdersStatus"), description: t("supplierHome", "widgetOrdersStatusDesc"),
            content: <SBestellungenStatusWidget supplierId={currentUser?.id || ""} lang={lang} />,
          },
          { id: "upcoming-deliveries", defaultSize: "full" as const, queryKeys: [['/api/supplier/upcoming-deliveries', currentUser?.id]], content: (
      <div className="md:rounded-xl md:border md:border-border md:bg-card md:shadow-[0_1px_2px_rgba(15,23,42,0.03),0_6px_16px_-8px_rgba(15,23,42,0.08),0_16px_28px_-20px_rgba(15,23,42,0.10)]">
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
            {/* Mobile: per-group horizontal scroll cards (preserved) */}
            <div className="space-y-4 md:hidden">
              {groupedDeliveries.map((group) => (
                <div key={`m-${group.dateKey}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className={`h-3.5 w-3.5 text-foreground`} />
                    <span className={`text-xs font-semibold uppercase tracking-wide text-foreground`}>
                      {group.label}
                    </span>
                    {group.isToday && (
                      <span className="h-1.5 w-1.5 rounded-full bg-foreground animate-pulse" />
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
                    <div
                      className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory"
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
                              <span className="text-xs font-mono text-blue-600 dark:text-blue-400 underline underline-offset-2">#{formatOrderNumber(order)}</span>
                              <span className="text-base font-bold">{order.totalAmount}€</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop: Excel-style table (mirrors Bestellungen page) */}
            <div className="hidden md:block">
              <div className="rounded-2xl border border-border bg-card overflow-hidden" data-testid="deliveries-table">
              <div className="md:overflow-x-auto">
              <div>
                <div
                  className="sticky top-0 z-10 grid items-center gap-3 px-3 py-2 bg-muted/40 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground font-semibold backdrop-blur-sm"
                  style={{ gridTemplateColumns: deliveriesGridTemplate }}
                >
                  <div className="truncate">{lang === "de" ? "Bestell-Nr" : "N. ordine"}</div>
                  <div className="truncate">Status</div>
                  <div className="truncate">{lang === "de" ? "Restaurant" : "Ristorante"}</div>
                  <div className="truncate text-right">{lang === "de" ? "Artikel" : "Articoli"}</div>
                  <div className="truncate">{lang === "de" ? "Lieferdatum" : "Data consegna"}</div>
                  <div className="truncate">{lang === "de" ? "Erstellt" : "Creato"}</div>
                  <div className="truncate text-right">{lang === "de" ? "Summe" : "Totale"}</div>
                </div>
                {groupedDeliveries.map((group) => (
                  <div key={`d-${group.dateKey}`} data-testid={`deliveries-group-${group.dateKey}`}>
                    <div className="px-4 py-2 bg-muted/20 border-b border-border flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h3>
                      {group.isToday && (
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                      )}
                      <span className="text-[11px] text-muted-foreground/60">({group.orders.length})</span>
                    </div>
                    {group.orders.length === 0 && group.isToday ? (
                      <div className="px-4 py-6 text-center text-sm text-muted-foreground" data-testid="desk-today-no-deliveries">
                        {lang === "de" ? "Keine Lieferungen geplant für heute" : "Nessuna consegna prevista per oggi"}
                      </div>
                    ) : (
                      group.orders.map((order) => {
                        const restaurantName = order.restaurant?.companyName || order.restaurant?.name || t("common", "unknown");
                        const deliveryDateLabel = order.requestedDeliveryDate
                          ? (() => {
                              const d = new Date(order.requestedDeliveryDate + "T00:00:00");
                              if (isToday(d)) return lang === "de" ? "Heute" : "Oggi";
                              if (isTomorrow(d)) return lang === "de" ? "Morgen" : "Domani";
                              return format(d, "EEE dd.MM.", { locale: dateLocale });
                            })()
                          : "—";
                        return (
                          <Link
                            key={order.id}
                            href={`/supplier/orders/${order.id}`}
                            className="block group/row border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors"
                            data-testid={`delivery-row-${order.id}`}
                          >
                            <div
                              className={"grid items-center gap-3 px-3 py-2.5 text-sm"}
                              style={{ gridTemplateColumns: deliveriesGridTemplate }}
                            >
                              <span className="font-mono text-[13px] text-blue-600 dark:text-blue-400 underline underline-offset-2 truncate">#{formatOrderNumber(order)}</span>
                              <div>
                                <Badge className={`${getStatusColor(order.status)} text-[11px] rounded-full px-2.5 py-0.5 font-medium border-0`} variant="outline">
                                  <span className="inline-flex items-center gap-1">
                                    {getStatusIcon(order.status)}
                                    {getOrderStatus(order.status, lang, true)}
                                  </span>
                                </Badge>
                              </div>
                              <div className="min-w-0 flex items-center gap-2">
                                <Avatar className="h-6 w-6 shrink-0">
                                  <AvatarImage src={order.restaurant?.profileImageUrl || undefined} />
                                  <AvatarFallback className="text-[9px] font-semibold">{restaurantName.substring(0, 2).toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <span className="truncate font-medium" data-testid={`text-restaurant-${order.id}`}>{restaurantName}</span>
                              </div>
                              <div className="text-right tabular-nums text-muted-foreground">{order.items?.length || 0}</div>
                              <div className="min-w-0">
                                <span className="truncate" data-testid={`text-delivery-${order.id}`}>{deliveryDateLabel}</span>
                              </div>
                              <div className="text-muted-foreground text-[12px] truncate" title={format(new Date(order.createdAt), "dd.MM.yyyy HH:mm", { locale: dateLocale })}>
                                {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true, locale: dateLocale })}
                              </div>
                              <div className="text-right font-semibold tabular-nums" data-testid={`text-total-${order.id}`}>
                                {parseFloat(order.totalAmount).toFixed(2)}€
                              </div>
                            </div>
                          </Link>
                        );
                      })
                    )}
                  </div>
                ))}
              </div>
              </div>
              </div>
            </div>
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
          { id: "unread-messages", defaultSize: "half" as const, queryKeys: [[`/api/conversations?userId=${currentUser?.id}`]], content: (
          <div className="md:rounded-xl md:border md:border-border md:bg-card md:shadow-[0_1px_2px_rgba(15,23,42,0.03),0_6px_16px_-8px_rgba(15,23,42,0.08),0_16px_28px_-20px_rgba(15,23,42,0.10)]">
            <div className="flex items-center justify-between gap-2 mb-3 md:mb-0 md:p-5 md:pb-4">
              <div className="flex items-center gap-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base md:text-xl font-bold" data-testid="text-unread-messages-title">
                      {t("supplierHome", "unreadMessages")}
                    </h2>
                    {totalUnread > 0 && (
                      <Badge className="bg-neutral-900 text-white text-[10px] px-1.5 py-0 min-w-[20px] flex items-center justify-center" data-testid="badge-unread-count">
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
                            <AvatarFallback className={`text-xs font-bold ${isPriority ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-primary/10 text-primary dark:bg-primary/20"}`}>
                              {(conv.otherUser.companyName || conv.otherUser.name || "?").slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <Badge className={`text-white text-[9px] px-1.5 py-0 min-w-[18px] flex items-center justify-center shrink-0 ${isPriority ? "bg-red-600" : "bg-neutral-900"}`} data-testid={`badge-unread-conv-${conv.id}`}>
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
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200 hover:shadow-md ${isPriority ? "border-red-300 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20 hover:border-red-400" : "border-border bg-card hover:border-primary/30"}`}
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
                            <AvatarFallback className="bg-primary/10 text-primary text-xs dark:bg-primary/20">
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
                            <Badge className={`text-white text-[9px] px-1.5 py-0 min-w-[18px] flex items-center justify-center shrink-0 ${isPriority ? "bg-red-600" : "bg-neutral-900"}`} data-testid={`badge-unread-conv-desktop-${conv.id}`}>
                              {conv.unreadCount}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {totalUnread > 3 && (
                    <Link
                      href="/supplier/inbox"
                      className="mt-1 mx-auto flex w-fit items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-primary bg-primary/5 hover:bg-primary/10 hover-elevate active-elevate-2 transition-colors"
                      data-testid="link-more-unread"
                    >
                      +{totalUnread - 3} {t("supplierHome", "moreUnread")}
                      <ArrowRight className="h-3 w-3" />
                    </Link>
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
          { id: "new-orders", defaultSize: "half" as const, queryKeys: [['/api/supplier/orders/recent', currentUser?.id]], content: (
          <div className="md:rounded-xl md:border md:border-border md:bg-card md:shadow-[0_1px_2px_rgba(15,23,42,0.03),0_6px_16px_-8px_rgba(15,23,42,0.08),0_16px_28px_-20px_rgba(15,23,42,0.10)]">
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
                        <span className="text-xs font-mono text-blue-600 dark:text-blue-400 underline underline-offset-2">#{formatOrderNumber(order)}</span>
                        <span className="text-base font-bold">{order.totalAmount}€</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop: Excel-style table (mirrors Anstehende Lieferungen) */}
                <div className="hidden md:block">
                  <div className="rounded-2xl border border-border bg-card overflow-hidden" data-testid="new-orders-table">
                    <div className="md:overflow-x-auto">
                      <div>
                        <div
                          className="sticky top-0 z-10 grid items-center gap-3 px-3 py-2 bg-muted/40 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground font-semibold backdrop-blur-sm"
                          style={{ gridTemplateColumns: deliveriesGridTemplate }}
                        >
                          <div className="truncate">{lang === "de" ? "Bestell-Nr" : "N. ordine"}</div>
                          <div className="truncate">Status</div>
                          <div className="truncate">{lang === "de" ? "Restaurant" : "Ristorante"}</div>
                          <div className="truncate text-right">{lang === "de" ? "Artikel" : "Articoli"}</div>
                          <div className="truncate">{lang === "de" ? "Lieferdatum" : "Data consegna"}</div>
                          <div className="truncate">{lang === "de" ? "Erstellt" : "Creato"}</div>
                          <div className="truncate text-right">{lang === "de" ? "Summe" : "Totale"}</div>
                        </div>
                        {recentOrders.map((order) => {
                          const restaurantName = order.restaurant?.companyName || order.restaurant?.name || t("common", "unknown");
                          const deliveryDateLabel = order.requestedDeliveryDate
                            ? (() => {
                                const d = new Date(order.requestedDeliveryDate + "T00:00:00");
                                if (isToday(d)) return lang === "de" ? "Heute" : "Oggi";
                                if (isTomorrow(d)) return lang === "de" ? "Morgen" : "Domani";
                                return format(d, "EEE dd.MM.", { locale: dateLocale });
                              })()
                            : "—";
                          return (
                            <Link
                              key={order.id}
                              href={`/supplier/orders/${order.id}`}
                              className="block group/row border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors"
                              data-testid={`order-row-${order.id}`}
                            >
                              <div
                                className={"grid items-center gap-3 px-3 py-2.5 text-sm"}
                                style={{ gridTemplateColumns: deliveriesGridTemplate }}
                              >
                                <span className="font-mono text-[13px] text-blue-600 dark:text-blue-400 underline underline-offset-2 truncate">#{formatOrderNumber(order)}</span>
                                <div>
                                  <Badge className={`${getStatusColor(order.status)} text-[11px] rounded-full px-2.5 py-0.5 font-medium border-0`} variant="outline">
                                    <span className="inline-flex items-center gap-1">
                                      {getStatusIcon(order.status)}
                                      {getOrderStatus(order.status, lang, true)}
                                    </span>
                                  </Badge>
                                </div>
                                <div className="min-w-0 flex items-center gap-2">
                                  <Avatar className="h-6 w-6 shrink-0">
                                    <AvatarImage src={order.restaurant?.profileImageUrl || undefined} />
                                    <AvatarFallback className="text-[9px] font-semibold">{restaurantName.substring(0, 2).toUpperCase()}</AvatarFallback>
                                  </Avatar>
                                  <span className="truncate font-medium" data-testid={`text-order-restaurant-${order.id}`}>{restaurantName}</span>
                                </div>
                                <div className="text-right tabular-nums text-muted-foreground">{order.items?.length || 0}</div>
                                <div className="min-w-0">
                                  <span className="truncate" data-testid={`text-order-delivery-${order.id}`}>{deliveryDateLabel}</span>
                                </div>
                                <div className="text-muted-foreground text-[12px] truncate" title={format(new Date(order.createdAt), "dd.MM.yyyy HH:mm", { locale: dateLocale })}>
                                  {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true, locale: dateLocale })}
                                </div>
                                <div className="text-right font-semibold tabular-nums" data-testid={`text-order-total-${order.id}`}>
                                  {parseFloat(order.totalAmount).toFixed(2)}€
                                </div>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  </div>
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
          { id: "action-required", defaultSize: "half" as const, queryKeys: [['/api/supplier/action-required', currentUser?.id]], content: (
          <>
          {((actionRequired?.staleOrders?.length || 0) > 0 || (actionRequired?.openComplaints?.length || 0) > 0) && (
            <div className="md:rounded-xl md:border md:border-border md:bg-card md:shadow-[0_1px_2px_rgba(15,23,42,0.03),0_6px_16px_-8px_rgba(15,23,42,0.08),0_16px_28px_-20px_rgba(15,23,42,0.10)]">
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
                      <span className="text-xs font-mono text-blue-600 dark:text-blue-400 underline underline-offset-2">#{formatOrderNumber(order)}</span>
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
                        <span className="text-xs text-muted-foreground font-mono">#{formatComplaintNumber(complaint)}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(complaint.createdAt), { addSuffix: true, locale: dateLocale })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop: Excel-style tables (mirrors Anstehende Lieferungen / Neue Bestellungen) */}
              <div className="hidden md:block space-y-4">
                {(actionRequired?.staleOrders?.length || 0) > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-red-600" />
                      {lang === "de" ? "Unbearbeitete Bestellungen" : "Ordini non elaborati"} ({actionRequired!.staleOrders.length})
                    </p>
                    <div className="rounded-2xl border border-border bg-card overflow-hidden" data-testid="action-stale-orders-table">
                      <div className="md:overflow-x-auto">
                        <div>
                          <div
                            className="sticky top-0 z-10 grid items-center gap-3 px-3 py-2 bg-muted/40 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground font-semibold backdrop-blur-sm"
                            style={{ gridTemplateColumns: deliveriesGridTemplate }}
                          >
                            <div className="truncate">{lang === "de" ? "Bestell-Nr" : "N. ordine"}</div>
                            <div className="truncate">Status</div>
                            <div className="truncate">{lang === "de" ? "Restaurant" : "Ristorante"}</div>
                            <div className="truncate text-right">{lang === "de" ? "Artikel" : "Articoli"}</div>
                            <div className="truncate">{lang === "de" ? "Lieferdatum" : "Data consegna"}</div>
                            <div className="truncate">{lang === "de" ? "Erstellt" : "Creato"}</div>
                            <div className="truncate text-right">{lang === "de" ? "Summe" : "Totale"}</div>
                          </div>
                          {actionRequired!.staleOrders.map((order) => {
                            const restaurantName = order.restaurant?.companyName || order.restaurant?.name || t("common", "unknown");
                            const deliveryDateLabel = order.requestedDeliveryDate
                              ? (() => {
                                  const d = new Date(order.requestedDeliveryDate + "T00:00:00");
                                  if (isToday(d)) return lang === "de" ? "Heute" : "Oggi";
                                  if (isTomorrow(d)) return lang === "de" ? "Morgen" : "Domani";
                                  return format(d, "EEE dd.MM.", { locale: dateLocale });
                                })()
                              : "—";
                            return (
                              <Link
                                key={order.id}
                                href={`/supplier/orders/${order.id}`}
                                className="block group/row border-b border-border last:border-b-0 hover:bg-red-50/50 dark:hover:bg-red-950/10 transition-colors"
                                data-testid={`stale-order-row-${order.id}`}
                              >
                                <div
                                  className={"grid items-center gap-3 px-3 py-2.5 text-sm"}
                                  style={{ gridTemplateColumns: deliveriesGridTemplate }}
                                >
                                  <span className="font-mono text-[13px] text-blue-600 dark:text-blue-400 underline underline-offset-2 truncate">#{formatOrderNumber(order)}</span>
                                  <div>
                                    <Badge className={`${getStatusColor(order.status)} text-[11px] rounded-full px-2.5 py-0.5 font-medium border-0`} variant="outline">
                                      <span className="inline-flex items-center gap-1">
                                        {getStatusIcon(order.status)}
                                        {getOrderStatus(order.status, lang, true)}
                                      </span>
                                    </Badge>
                                  </div>
                                  <div className="min-w-0 flex items-center gap-2">
                                    <Avatar className="h-6 w-6 shrink-0">
                                      <AvatarImage src={order.restaurant?.profileImageUrl || undefined} />
                                      <AvatarFallback className="text-[9px] font-semibold">{restaurantName.substring(0, 2).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                    <span className="truncate font-medium" data-testid={`text-stale-restaurant-${order.id}`}>{restaurantName}</span>
                                  </div>
                                  <div className="text-right tabular-nums text-muted-foreground">{order.items?.length || 0}</div>
                                  <div className="min-w-0">
                                    <span className="truncate" data-testid={`text-stale-delivery-${order.id}`}>{deliveryDateLabel}</span>
                                  </div>
                                  <div className="text-red-600 dark:text-red-400 text-[12px] font-medium truncate" title={format(new Date(order.createdAt), "dd.MM.yyyy HH:mm", { locale: dateLocale })}>
                                    {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true, locale: dateLocale })}
                                  </div>
                                  <div className="text-right font-semibold tabular-nums" data-testid={`text-stale-total-${order.id}`}>
                                    {parseFloat(order.totalAmount).toFixed(2)}€
                                  </div>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {(actionRequired?.openComplaints?.length || 0) > 0 && (() => {
                  const complaintsGridTemplate = "minmax(180px, 1fr) 140px minmax(160px, 1.2fr) 110px 130px";
                  const complaintStatusColors: Record<string, string> = {
                    open: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
                    in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
                    resolved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
                  };
                  const complaintStatusLabels: Record<string, Record<string, string>> = {
                    de: { open: "Offen", in_progress: "In Bearbeitung", resolved: "Gelöst" },
                    it: { open: "Aperto", in_progress: "In lavorazione", resolved: "Risolto" },
                  };
                  return (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                        <AlertTriangle className="h-3 w-3 text-amber-600" />
                        {lang === "de" ? "Reklamationen" : "Reclami"} ({actionRequired!.openComplaints.length})
                      </p>
                      <div className="rounded-2xl border border-border bg-card overflow-hidden" data-testid="action-complaints-table">
                        <div className="md:overflow-x-auto">
                          <div>
                            <div
                              className="sticky top-0 z-10 grid items-center gap-3 px-3 py-2 bg-muted/40 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground font-semibold backdrop-blur-sm"
                              style={{ gridTemplateColumns: complaintsGridTemplate }}
                            >
                              <div className="truncate">{lang === "de" ? "Reklamation" : "Reclamo"}</div>
                              <div className="truncate">Status</div>
                              <div className="truncate">{lang === "de" ? "Restaurant" : "Ristorante"}</div>
                              <div className="truncate">{lang === "de" ? "Bestellung" : "Ordine"}</div>
                              <div className="truncate">{lang === "de" ? "Erstellt" : "Creato"}</div>
                            </div>
                            {actionRequired!.openComplaints.map((complaint) => {
                              const restaurantName = complaint.restaurant?.companyName || complaint.restaurant?.name || t("common", "unknown");
                              const isUrgent = complaint.priority === "urgent";
                              return (
                                <Link
                                  key={complaint.id}
                                  href={`/supplier/complaints/${complaint.id}`}
                                  className={`block group/row border-b border-border last:border-b-0 transition-colors ${isUrgent ? "hover:bg-red-50/50 dark:hover:bg-red-950/10" : "hover:bg-amber-50/50 dark:hover:bg-amber-950/10"}`}
                                  data-testid={`action-complaint-row-${complaint.id}`}
                                >
                                  <div
                                    className={"grid items-center gap-3 px-3 py-2.5 text-sm"}
                                    style={{ gridTemplateColumns: complaintsGridTemplate }}
                                  >
                                    <div className="min-w-0 !justify-start !text-left flex items-center gap-1.5">
                                      {isUrgent && <Flame className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                                      <span className={`truncate font-medium ${isUrgent ? "text-red-700 dark:text-red-400" : ""}`} title={complaint.title}>{complaint.title}</span>
                                    </div>
                                    <div>
                                      <Badge className={`${complaintStatusColors[complaint.status] || ""} text-[11px] rounded-full px-2.5 py-0.5 font-medium border-0`} variant="outline">
                                        {complaintStatusLabels[lang]?.[complaint.status] || complaint.status}
                                      </Badge>
                                    </div>
                                    <div className="min-w-0 flex items-center gap-2 !justify-start !text-left">
                                      <Avatar className="h-6 w-6 shrink-0">
                                        <AvatarImage src={complaint.restaurant?.profileImageUrl || undefined} />
                                        <AvatarFallback className="text-[9px] font-semibold">{restaurantName.substring(0, 2).toUpperCase()}</AvatarFallback>
                                      </Avatar>
                                      <span className="truncate font-medium" data-testid={`text-complaint-restaurant-${complaint.id}`}>{restaurantName}</span>
                                    </div>
                                    <div className="font-mono text-[12px] text-primary truncate">
                                      {complaint.order?.id ? `#${formatOrderNumber(complaint.order)}` : "—"}
                                    </div>
                                    <div className="text-muted-foreground text-[12px] truncate" title={format(new Date(complaint.createdAt), "dd.MM.yyyy HH:mm", { locale: dateLocale })}>
                                      {formatDistanceToNow(new Date(complaint.createdAt), { addSuffix: true, locale: dateLocale })}
                                    </div>
                                  </div>
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
              </div>
            </div>
          )}
          </>
          )},
          { id: "low-stock", defaultSize: "half" as const, queryKeys: [['/api/low-stock', currentUser?.id]], content: (
          <div className="md:rounded-xl md:border md:border-border md:bg-card md:shadow-[0_1px_2px_rgba(15,23,42,0.03),0_6px_16px_-8px_rgba(15,23,42,0.08),0_16px_28px_-20px_rgba(15,23,42,0.10)]">
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
                        <ProductImage src={product.imageUrl} className="h-10 w-10 rounded-xl" iconClassName="h-5 w-5" fallbackBg="bg-orange-100 dark:bg-orange-900/30" fallbackIconColor="text-orange-600" />
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
                        <ProductImage src={product.imageUrl} className="h-9 w-9 rounded-lg" iconClassName="h-4 w-4" fallbackBg="bg-orange-100 dark:bg-orange-900/30" fallbackIconColor="text-orange-600" />
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
          { id: "ratings", defaultSize: "half" as const, queryKeys: [['/api/suppliers', currentUser?.id, 'ratings']], content: (
            <SupplierRatingsList supplierId={currentUser?.id || ""} limit={5} showFlag />
          )},
          { id: "statistics", defaultSize: "full" as const, queryKeys: [[`/api/supplier/detailed-stats?supplierId=${currentUser?.id}&period=${statsPeriod}`], [`/api/supplier/settings/revenue-target?supplierId=${currentUser?.id}`], [`/api/supplier/insights?supplierId=${currentUser?.id}`]], content: (
      <div className="md:rounded-xl md:border md:border-border md:bg-card md:shadow-[0_1px_2px_rgba(15,23,42,0.03),0_6px_16px_-8px_rgba(15,23,42,0.08),0_16px_28px_-20px_rgba(15,23,42,0.10)]">
        <div className="flex items-start md:items-center justify-between gap-2 mb-3 md:mb-0 md:p-5 md:pb-4 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="min-w-0">
              <h2 className="text-base md:text-xl font-bold" data-testid="text-statistics-title">
                {t("supplierHome", "statistics")}
              </h2>
              <p className="text-xs text-muted-foreground hidden md:block">
                {t("supplierHome", "statisticsDesc")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center rounded-full bg-muted/60 p-0.5" data-testid="period-switcher">
              {(["7d","30d","6m","12m"] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setStatsPeriod(p)}
                  data-testid={`pill-period-${p}`}
                  className={`text-[11px] md:text-xs px-2.5 md:px-3 py-1 rounded-full transition-colors ${statsPeriod === p ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {p === "7d" ? t("supplierHome", "period7d") : p === "30d" ? t("supplierHome", "period30d") : p === "6m" ? t("supplierHome", "period6m") : t("supplierHome", "period12m")}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs gap-1.5"
              onClick={handleStatsExport}
              data-testid="button-export-stats"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("supplierHome", "exportStats")}</span>
            </Button>
          </div>
        </div>
        <div className="md:px-5 md:pb-5">
        {statsLoading ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
            </div>
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        ) : detailedStats && (detailedStats.totalOrders > 0 || (detailedStats.topProducts?.length ?? 0) > 0) ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
              {([
                { id: "revenue", label: t("supplierHome", "totalRevenue"), value: detailedStats.totalRevenue, prev: detailedStats.previous?.totalRevenue ?? 0, isCurrency: true, icon: <Euro className="h-3.5 w-3.5 text-primary shrink-0" /> },
                { id: "orders", label: t("supplierHome", "totalOrders"), value: detailedStats.totalOrders, prev: detailedStats.previous?.totalOrders ?? 0, isCurrency: false, icon: <Hash className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> },
                { id: "avg", label: t("supplierHome", "avgOrderValue"), value: detailedStats.avgOrderValue, prev: detailedStats.previous?.avgOrderValue ?? 0, isCurrency: true, icon: <TrendingUp className="h-3.5 w-3.5 text-amber-600 shrink-0" /> },
                { id: "active-customers", label: t("supplierHome", "activeCustomers"), value: detailedStats.activeCustomers, prev: detailedStats.previous?.activeCustomers ?? 0, isCurrency: false, icon: <Users className="h-3.5 w-3.5 text-primary shrink-0" /> },
              ] as const).map(k => {
                const delta = calcDelta(k.value as number, k.prev as number);
                const isUp = delta > 0;
                const isDown = delta < 0;
                return (
                  <div key={k.id} className="rounded-xl border border-border bg-card p-3 md:p-4 min-w-0" data-testid={`kpi-${k.id}`}>
                    <div className="flex items-center gap-1.5 mb-1 min-w-0">
                      {k.icon}
                      <span className="text-[10px] md:text-xs text-muted-foreground font-medium truncate">{k.label}</span>
                    </div>
                    <p className="text-base md:text-xl font-bold text-foreground tabular-nums tracking-tight whitespace-nowrap" data-testid={`kpi-value-${k.id}`}>
                      {k.isCurrency
                        ? `${((k.value as number) ?? 0).toLocaleString(lang === "de" ? "de-DE" : "it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}€`
                        : ((k.value as number) ?? 0).toLocaleString(lang === "de" ? "de-DE" : "it-IT")}
                    </p>
                    <div className="flex items-center gap-1 mt-1" data-testid={`kpi-delta-${k.id}`}>
                      {isUp && <TrendingUp className="h-3 w-3 text-emerald-600" />}
                      {isDown && <TrendingDown className="h-3 w-3 text-rose-600" />}
                      <span className={`text-[10px] tabular-nums ${isUp ? "text-emerald-600" : isDown ? "text-rose-600" : "text-muted-foreground"}`}>
                        {delta > 0 ? "+" : ""}{delta}% <span className="text-muted-foreground hidden md:inline">{t("supplierHome", "vsPrevious")}</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {chartData.length > 0 && (
                <div className="lg:col-span-2 rounded-xl border border-border bg-card p-3 md:p-4">
                  <p className="text-xs md:text-sm font-medium text-foreground mb-3">{t("supplierHome", "revenueOverview")}</p>
                  <div className="h-44 md:h-56" data-testid="chart-revenue-orders">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44}
                          tickFormatter={(v) => v >= 1_000 ? `${(v/1_000).toFixed(0)}k€` : `${v}€`} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
                        <Tooltip
                          cursor={{ fill: "rgba(0,0,0,0.04)" }}
                          isAnimationActive={false}
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const rev = payload.find((p) => p.dataKey === "revenue")?.value as number | undefined;
                            const ord = payload.find((p) => p.dataKey === "orders")?.value as number | undefined;
                            return (
                              <div className="rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-sm">
                                <p className="text-[11px] text-muted-foreground">{label}</p>
                                <p className="text-xs font-semibold">{(rev || 0).toLocaleString(lang === "de" ? "de-DE" : "it-IT", { minimumFractionDigits: 2 })}€</p>
                                <p className="text-[11px] text-muted-foreground">{ord || 0} {t("supplierHome", "chartOrders")}</p>
                              </div>
                            );
                          }}
                        />
                        <Bar
                          yAxisId="left" dataKey="revenue" name={t("supplierHome", "chartRevenue")}
                          fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} maxBarSize={40}
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
                          }}
                        />
                        <Line yAxisId="right" type="monotone" dataKey="orders" name={t("supplierHome", "chartOrders")} stroke="hsl(var(--chart-2, 220 70% 55%))" strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-border bg-card p-3 md:p-4 flex flex-col" data-testid="ring-revenue-goal">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5 text-fuchsia-600" />
                    <span className="text-[10px] md:text-xs text-muted-foreground font-medium">{t("supplierHome", "revenueGoal")}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => { setRevenueGoalInput(monthlyRevenueTarget ? String(monthlyRevenueTarget) : ""); setRevenueGoalOpen(true); }}
                    data-testid="button-edit-revenue-goal"
                  >
                    {monthlyRevenueTarget ? t("supplierHome", "revenueGoalEdit") : t("supplierHome", "revenueGoalSet")}
                  </Button>
                </div>
                <div className="flex-1 flex items-center justify-center">
                  {monthlyRevenueTarget && monthlyRevenueTarget > 0 ? (
                    <div className="relative h-32 w-32">
                      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                        <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
                        <circle
                          cx="50" cy="50" r="42" fill="none"
                          stroke="hsl(var(--primary))"
                          strokeWidth="10"
                          strokeLinecap="round"
                          strokeDasharray={`${(2 * Math.PI * 42 * goalProgress) / 100} ${2 * Math.PI * 42}`}
                          className="transition-all duration-700"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-xl font-bold tabular-nums" data-testid="text-goal-progress-percent">{goalProgress}%</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums" data-testid="text-goal-progress-amount">
                          {Math.round(monthRevenue).toLocaleString(lang === "de" ? "de-DE" : "it-IT")} / {Math.round(monthlyRevenueTarget).toLocaleString(lang === "de" ? "de-DE" : "it-IT")}€
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center">{t("supplierHome", "revenueGoalNone")}</p>
                  )}
                </div>
              </div>
            </div>

            <Tabs value={statsTab} onValueChange={(v) => setStatsTab(v as "products" | "customers")} className="w-full">
              <TabsList className="grid w-full grid-cols-2 max-w-sm">
                <TabsTrigger value="products" data-testid="tab-top-products">{t("supplierHome", "topProducts")}</TabsTrigger>
                <TabsTrigger value="customers" data-testid="tab-top-customers">{t("supplierHome", "topCustomers")}</TabsTrigger>
              </TabsList>
              <TabsContent value="products" className="mt-3">
                {(detailedStats.topProducts?.length ?? 0) > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
                    {(detailedStats.topProducts ?? []).slice(0, 6).map((product, idx) => {
                      const maxQty = (detailedStats.topProducts ?? [])[0]?.quantity || 1;
                      const pct = Math.round((product.quantity / maxQty) * 100);
                      const qDelta = calcDelta(product.quantity, product.previousQuantity);
                      return (
                        <div key={product.productId || idx} className="rounded-xl border border-border bg-card p-2.5 md:p-3 cursor-pointer hover:border-primary/40 transition-colors"
                          data-testid={`top-product-${idx}`}
                          onClick={() => product.productId && navigate(`/supplier/products?highlight=${product.productId}`)}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold shrink-0">{idx + 1}</span>
                            <span className="text-xs md:text-sm font-medium truncate flex-1">{product.name}</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-1.5">
                            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] md:text-xs text-muted-foreground tabular-nums">{product.quantity}x</span>
                            <span className="text-xs md:text-sm font-semibold tabular-nums">
                              {product.revenue.toLocaleString(lang === "de" ? "de-DE" : "it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}€
                            </span>
                          </div>
                          {product.previousQuantity > 0 && (
                            <div className="flex items-center gap-1 mt-1">
                              {qDelta > 0 ? <TrendingUp className="h-3 w-3 text-emerald-600" /> : qDelta < 0 ? <TrendingDown className="h-3 w-3 text-rose-600" /> : null}
                              <span className={`text-[10px] tabular-nums ${qDelta > 0 ? "text-emerald-600" : qDelta < 0 ? "text-rose-600" : "text-muted-foreground"}`}>
                                {qDelta > 0 ? "+" : ""}{qDelta}%
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground py-4 text-center">{t("supplierHome", "noStatsYet")}</p>
                )}
              </TabsContent>
              <TabsContent value="customers" className="mt-3">
                {(detailedStats.topCustomers?.length ?? 0) > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
                    {(detailedStats.topCustomers ?? []).slice(0, 6).map((c, idx) => {
                      const maxRev = (detailedStats.topCustomers ?? [])[0]?.revenue || 1;
                      const pct = Math.round((c.revenue / maxRev) * 100);
                      return (
                        <div key={c.restaurantId || idx} className="rounded-xl border border-border bg-card p-2.5 md:p-3 cursor-pointer hover:border-primary/40 transition-colors"
                          data-testid={`top-customer-${idx}`}
                          onClick={() => c.restaurantId && navigate(`/supplier/inbox?to=${c.restaurantId}`)}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold shrink-0">{idx + 1}</span>
                            <span className="text-xs md:text-sm font-medium truncate flex-1">{c.name}</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-1.5">
                            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] md:text-xs text-muted-foreground tabular-nums">{c.orders} {t("supplierHome", "chartOrders")}</span>
                            <span className="text-xs md:text-sm font-semibold tabular-nums">
                              {c.revenue.toLocaleString(lang === "de" ? "de-DE" : "it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}€
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground py-4 text-center">{t("supplierHome", "noStatsYet")}</p>
                )}
              </TabsContent>
            </Tabs>

            {insights && insights.length > 0 && (
              <div className="rounded-xl border border-border bg-muted/30 p-3 md:p-4" data-testid="insights-box">
                <div className="flex items-center gap-1.5 mb-2">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-[10px] md:text-xs text-muted-foreground font-semibold uppercase tracking-wide">{t("supplierHome", "insights")}</span>
                </div>
                <div className="space-y-1.5">
                  {insights.map((ins) => {
                    const label =
                      ins.type === "inactive_customers" ? t("supplierHome", "insightInactive") :
                      ins.type === "low_stock_top" ? t("supplierHome", "insightLowStockTop") :
                      t("supplierHome", "insightTrending");
                    return (
                      <Link key={ins.type} href={ins.link} data-testid={`insight-${ins.type}`} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-card border border-border hover:border-primary/40 transition-colors">
                        <span className="text-xs md:text-sm font-medium">
                          <span className="tabular-nums font-bold mr-1">{ins.count}</span>{label}
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </Link>
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

        <Dialog open={revenueGoalOpen} onOpenChange={setRevenueGoalOpen}>
          <DialogContent data-testid="dialog-revenue-goal">
            <DialogHeader>
              <DialogTitle>{t("supplierHome", "revenueGoal")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="revenue-goal-input">{t("supplierHome", "revenueGoalAmount")}</Label>
              <Input
                id="revenue-goal-input"
                type="number"
                inputMode="decimal"
                min={0}
                value={revenueGoalInput}
                onChange={(e) => setRevenueGoalInput(e.target.value)}
                data-testid="input-revenue-goal"
                placeholder="10000"
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              {monthlyRevenueTarget && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRevenueTargetMutation.mutate(null)}
                  disabled={setRevenueTargetMutation.isPending}
                  data-testid="button-remove-revenue-goal"
                >
                  {t("supplierHome", "revenueGoalRemove")}
                </Button>
              )}
              <Button
                type="button"
                onClick={() => {
                  const v = parseFloat(revenueGoalInput);
                  if (!isFinite(v) || v <= 0) return;
                  setRevenueTargetMutation.mutate(v);
                }}
                disabled={setRevenueTargetMutation.isPending || !revenueGoalInput}
                data-testid="button-save-revenue-goal"
              >
                {t("supplierHome", "revenueGoalSave")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
          currentDate={[...(upcomingDeliveries || []), ...(recentOrders || [])].find(o => o.id === deliveryDatePicker.orderId)?.requestedDeliveryDate || null}
          onConfirm={(date, deliveryNotes, reason) => {
            // Setting a delivery date never changes the order status —
            // the delivery only starts via the driver app.
            setDeliveryDateMutation.mutate({ orderId: deliveryDatePicker.orderId, requestedDeliveryDate: date, dateChangeReason: reason });
          }}
          isPending={updateStatusMutation.isPending || setDeliveryDateMutation.isPending}
        />
      )}
    </PullToRefreshWrapper>
    </>
  );
}
