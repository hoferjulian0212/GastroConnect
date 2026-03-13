import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, Clock, CheckCircle, ShoppingBag, User as UserIcon, Truck, Check, X, AlertTriangle, Package, MessageSquare, BarChart3, TrendingUp, Euro, Hash, XCircle, CalendarDays, FileText, Loader2, Send, ArrowRight, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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

export default function SupplierHome() {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const dateLocale = lang === "de" ? de : it;

  const [cardWizard, setCardWizard] = useState<{ orderId: string; action: string } | null>(null);
  const [deliveryDatePicker, setDeliveryDatePicker] = useState<{ orderId: string; restaurantId: string } | null>(null);
  const [detailOrder, setDetailOrder] = useState<OrderWithDetails | null>(null);
  const [showMessageInput, setShowMessageInput] = useState(false);
  const [orderMessage, setOrderMessage] = useState("");

  const { data: recentOrders, isLoading: ordersLoading } = useQuery<OrderWithDetails[]>({
    queryKey: ['/api/supplier/orders/recent', currentUser?.id],
    queryFn: async () => {
      const res = await fetch(`/api/supplier/orders/recent?supplierId=${currentUser?.id}`);
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json();
    },
    enabled: !!currentUser?.id,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: upcomingDeliveries, isLoading: deliveriesLoading } = useQuery<OrderWithDetails[]>({
    queryKey: ['/api/supplier/upcoming-deliveries', currentUser?.id],
    queryFn: async () => {
      const res = await fetch(`/api/supplier/upcoming-deliveries?supplierId=${currentUser?.id}`);
      if (!res.ok) throw new Error('Failed to fetch upcoming deliveries');
      return res.json();
    },
    enabled: !!currentUser?.id,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: lowStockProducts, isLoading: lowStockLoading } = useQuery<Product[]>({
    queryKey: ['/api/low-stock', currentUser?.id],
    queryFn: async () => {
      const res = await fetch(`/api/low-stock?supplierId=${currentUser?.id}`);
      if (!res.ok) throw new Error('Failed to fetch low stock');
      return res.json();
    },
    enabled: !!currentUser?.id,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: conversations, isLoading: convLoading } = useQuery<ConversationWithUser[]>({
    queryKey: [`/api/conversations?userId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
    staleTime: 0,
    refetchOnMount: "always",
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
    staleTime: 0,
    refetchOnMount: "always",
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
    staleTime: 60000,
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
      const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [conversations]);

  const totalUnread = unreadConversations.length;

  const getMessagePreview = (conv: ConversationWithUser) => {
    if (!conv.lastMessage) return "";
    const msg = conv.lastMessage;
    if (msg.messageType === "order") return t("orders", "order");
    if (msg.messageType === "complaint") return t("common", "complaints");
    if (msg.messageType === "attachment") return t("common", "attachment");
    if (msg.messageType === "promotion") return lang === "de" ? "Aktion" : "Promozione";
    if (msg.messageType === "order_change_request") return t("orders", "order");
    return msg.content?.slice(0, 80) || "";
  };

  const invalidateOrderQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/supplier/upcoming-deliveries'] });
    queryClient.invalidateQueries({ queryKey: ['/api/supplier/orders/recent'] });
    queryClient.invalidateQueries({ queryKey: ['/api/supplier/orders'] });
    queryClient.invalidateQueries({ queryKey: ['/api/supplier/action-required'] });
  };

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status, requestedDeliveryDate }: { orderId: string; status: string; requestedDeliveryDate?: string }) => {
      await apiRequest("PATCH", `/api/orders/${orderId}/status`, {
        status,
        changedBy: currentUser?.id,
        ...(requestedDeliveryDate ? { requestedDeliveryDate } : {}),
      });
    },
    onSuccess: (_data, variables) => {
      setCardWizard(null);
      if (detailOrder && detailOrder.id === variables.orderId) {
        setDetailOrder({ ...detailOrder, status: variables.status });
      }
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

  const sendOrderMessageMutation = useMutation({
    mutationFn: async ({ order, message }: { order: OrderWithDetails; message: string }) => {
      const convRes = await apiRequest("POST", "/api/conversations", {
        restaurantId: order.restaurantId,
        supplierId: order.supplierId,
      });
      const conv = await convRes.json();
      await apiRequest("POST", `/api/conversations/${conv.id}/messages`, {
        senderId: currentUser?.id,
        content: message,
        messageType: "text",
        orderId: order.id,
      });
    },
    onSuccess: () => {
      setShowMessageInput(false);
      setOrderMessage("");
      toast({ title: lang === "de" ? "Nachricht gesendet" : "Messaggio inviato" });
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

  const displayedDeliveries = upcomingDeliveries?.slice(0, 5) || [];
  const hasMoreDeliveries = (upcomingDeliveries?.length || 0) > 5;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="text-center">
        <p className="text-sm md:text-base text-muted-foreground">
          {t("common", "welcomeBack")}
        </p>
        <h1 className="text-xl md:text-2xl font-bold text-foreground" data-testid="text-page-title">
          {currentUser?.companyName || ""}
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 md:p-6">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10 shrink-0">
              <Truck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base md:text-lg" data-testid="text-upcoming-deliveries-title">
                {t("supplierHome", "upcomingDeliveries")}
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">
                {t("supplierHome", "upcomingDeliveriesDesc")}
              </CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" className="text-xs md:text-sm shrink-0" asChild>
            <Link href="/supplier/orders?status=in_delivery" data-testid="link-all-upcoming-deliveries">
              {t("common", "all")}
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          {deliveriesLoading ? (
            <div className="space-y-2 md:space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : displayedDeliveries.length > 0 ? (
            <div className="space-y-2 md:space-y-3">
              {displayedDeliveries.map((order) => {
                const deliveryDate = order.requestedDeliveryDate
                  ? new Date(order.requestedDeliveryDate + "T00:00:00")
                  : null;
                const isTodayDelivery = deliveryDate ? isToday(deliveryDate) : false;
                const isTomorrowDelivery = deliveryDate ? isTomorrow(deliveryDate) : false;

                return (
                  <div
                    key={order.id}
                    className={`rounded-xl border p-2.5 md:p-3 transition-all ${
                      isTodayDelivery
                        ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20"
                        : "border-border bg-white dark:bg-gray-900"
                    }`}
                    data-testid={`delivery-item-${order.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className="flex items-start gap-2.5 min-w-0 flex-1 cursor-pointer"
                        onClick={() => setDetailOrder(order)}
                        data-testid={`delivery-link-${order.id}`}
                      >
                        <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${
                          isTodayDelivery
                            ? "bg-amber-100 dark:bg-amber-900/30"
                            : "bg-primary/10"
                        }`}>
                          <Truck className={`h-4 w-4 ${isTodayDelivery ? "text-amber-600" : "text-primary"}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs md:text-sm font-medium">#{order.id.slice(0, 8)}</p>
                            {isTodayDelivery && (
                              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] md:text-xs px-1.5" variant="outline">
                                {t("supplierHome", "today")}
                              </Badge>
                            )}
                            {isTomorrowDelivery && (
                              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 text-[10px] md:text-xs px-1.5" variant="outline">
                                {format(deliveryDate!, "dd.MM.yyyy", { locale: dateLocale })}
                              </Badge>
                            )}
                            {!deliveryDate && (
                              <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 text-[10px] md:text-xs px-1.5" variant="outline">
                                {t("supplierHome", "noDeliveryDate")}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <UserIcon className="h-2.5 w-2.5 md:h-3 md:w-3 text-muted-foreground shrink-0" />
                            <p className="text-[10px] md:text-xs text-muted-foreground truncate">
                              {order.restaurant?.companyName || order.restaurant?.name || t("common", "unknown")}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <span className="text-sm md:text-base font-bold">{order.totalAmount}€</span>
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

              {hasMoreDeliveries && (
                <Link
                  href="/supplier/orders?status=in_delivery"
                  className="block text-center text-sm text-primary hover:underline py-2"
                  data-testid="link-more-deliveries"
                >
                  {t("supplierHome", "allUpcomingDeliveries")}
                </Link>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle className="h-12 w-12 text-green-500/50 mb-3" />
              <p className="text-sm text-muted-foreground">{t("supplierHome", "noUpcomingDeliveries")}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("supplierHome", "allDeliveriesProcessed")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 md:p-6">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-blue-500/10 shrink-0">
              <MessageSquare className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base md:text-lg" data-testid="text-unread-messages-title">
                  {t("supplierHome", "unreadMessages")}
                </CardTitle>
                {totalUnread > 0 && (
                  <Badge className="bg-blue-600 text-white text-[10px] px-1.5 py-0 min-w-[20px] flex items-center justify-center" data-testid="badge-unread-count">
                    {totalUnread}
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs md:text-sm">
                {t("supplierHome", "unreadMessagesDesc")}
              </CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" className="text-xs md:text-sm shrink-0" asChild>
            <Link href="/supplier/inbox" data-testid="link-view-all-messages">{t("supplierHome", "allMessages")}</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          {convLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : unreadConversations.length > 0 ? (
            <div className="space-y-2">
              {unreadConversations.slice(0, 3).map((conv) => (
                <div
                  key={conv.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card cursor-pointer transition-all duration-200 hover:shadow-md hover:border-blue-300/40"
                  onClick={() => navigate(`/supplier/inbox?chat=${conv.id}`)}
                  data-testid={`unread-chat-${conv.id}`}
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    {conv.otherUser.profileImageUrl ? (
                      <AvatarImage src={conv.otherUser.profileImageUrl} alt={conv.otherUser.companyName || conv.otherUser.name} />
                    ) : null}
                    <AvatarFallback className="bg-blue-100 text-blue-700 text-xs dark:bg-blue-900/30 dark:text-blue-400">
                      {(conv.otherUser.companyName || conv.otherUser.name || "?").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold truncate" data-testid={`text-unread-restaurant-${conv.id}`}>
                        {conv.otherUser.companyName || conv.otherUser.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0" data-testid={`text-unread-time-${conv.id}`}>
                        {conv.lastMessage?.createdAt && format(new Date(conv.lastMessage.createdAt), "HH:mm", { locale: dateLocale })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground truncate flex-1" data-testid={`text-unread-preview-${conv.id}`}>
                        {getMessagePreview(conv)}
                      </p>
                      <Badge className="bg-blue-600 text-white text-[9px] px-1.5 py-0 min-w-[18px] flex items-center justify-center shrink-0" data-testid={`badge-unread-conv-${conv.id}`}>
                        {conv.unreadCount}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
              {totalUnread > 3 && (
                <p className="text-xs text-muted-foreground text-center pt-1" data-testid="text-more-unread">
                  +{totalUnread - 3} {t("supplierHome", "moreUnread")}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="flex items-center justify-center h-12 w-12 rounded-full bg-muted/50 mb-3">
                <MessageSquare className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">{t("supplierHome", "noUnreadMessages")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("supplierHome", "noUnreadMessagesDesc")}</p>
            </div>
          )}
        </CardContent>
      </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 md:p-6">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10 shrink-0">
              <ClipboardList className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base md:text-lg">{t("supplierHome", "newOrders")}</CardTitle>
              <CardDescription className="text-xs md:text-sm">{lang === "de" ? "Bestellungen der letzten 24 Stunden" : "Ordini delle ultime 24 ore"}</CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" className="text-xs md:text-sm shrink-0" asChild>
            <Link href="/supplier/orders" data-testid="link-view-all-orders">{t("common", "all")}</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          {ordersLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : recentOrders && recentOrders.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 md:gap-3 max-h-[320px] overflow-y-auto">
              {recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="p-2.5 md:p-3 rounded-xl border border-border bg-white dark:bg-gray-900 transition-all duration-200 hover:shadow-md hover:border-primary/30 cursor-pointer"
                  onClick={() => setDetailOrder(order)}
                  data-testid={`order-item-${order.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 md:gap-3 min-w-0 flex-1">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                        <ShoppingBag className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs md:text-sm font-medium">#{order.id.slice(0, 8)}</p>
                          <Badge className={`${getStatusColor(order.status)} text-[10px] md:text-xs px-1.5`} variant="outline">
                            {getOrderStatus(order.status, lang, true)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <UserIcon className="h-2.5 w-2.5 md:h-3 md:w-3 text-muted-foreground shrink-0" />
                          <p className="text-[10px] md:text-xs text-muted-foreground truncate">
                            {order.restaurant?.companyName || order.restaurant?.name || t("common", "unknown")}
                          </p>
                        </div>
                        <p className="text-[10px] md:text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="h-2.5 w-2.5 md:h-3 md:w-3 shrink-0" />
                          {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true, locale: dateLocale })}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                      <span className="text-sm md:text-base font-bold">{order.totalAmount}€</span>
                      <span className="text-[10px] md:text-xs text-muted-foreground">
                        {order.items?.length || 0} {lang === "de" ? "Artikel" : "articoli"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle className="h-12 w-12 text-green-500/50 mb-3" />
              <p className="text-sm text-muted-foreground">{t("supplierHome", "noNewOrders")}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("supplierHome", "allProcessed")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {((actionRequired?.staleOrders?.length || 0) > 0 || (actionRequired?.openComplaints?.length || 0) > 0) && (
        <Card className="border-red-200 dark:border-red-900/50">
          <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 md:p-6">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-red-100 dark:bg-red-900/30 shrink-0">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base md:text-lg" data-testid="text-action-required-title">
                    {lang === "de" ? "Erforderliche Aktionen" : "Azioni richieste"}
                  </CardTitle>
                  <Badge className="bg-red-600 text-white text-[10px] px-1.5 py-0 min-w-[20px] flex items-center justify-center">
                    {(actionRequired?.staleOrders?.length || 0) + (actionRequired?.openComplaints?.length || 0)}
                  </Badge>
                </div>
                <CardDescription className="text-xs md:text-sm">
                  {lang === "de" ? "Unbearbeitete Bestellungen und Reklamationen" : "Ordini non elaborati e reclami"}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0 space-y-3 max-h-[380px] overflow-y-auto">
            {(actionRequired?.staleOrders?.length || 0) > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {lang === "de" ? "Unbearbeitete Bestellungen" : "Ordini non elaborati"} ({actionRequired!.staleOrders.length})
                </p>
                <div className="grid grid-cols-2 gap-2">
                {actionRequired!.staleOrders.map((order) => (
                  <div
                    key={order.id}
                    className="p-2.5 md:p-3 rounded-xl border border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/10 transition-all duration-200 hover:shadow-md"
                    data-testid={`stale-order-${order.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                        onClick={() => setDetailOrder(order)}
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30 shrink-0">
                          <Clock className="h-4 w-4 text-red-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs md:text-sm font-medium">#{order.id.slice(0, 8)}</p>
                            <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px] px-1.5" variant="outline">
                              {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true, locale: dateLocale })}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <UserIcon className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                            <p className="text-[10px] md:text-xs text-muted-foreground truncate">
                              {order.restaurant?.companyName || order.restaurant?.name}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                        <span className="text-sm font-bold">{order.totalAmount}€</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => navigate(`/supplier/orders?orderId=${order.id}`)}
                          data-testid={`stale-goto-order-${order.id}`}
                        >
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      </div>
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
                <div className="grid grid-cols-2 gap-2">
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
                      className="p-2.5 md:p-3 rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/10 transition-all duration-200 hover:shadow-md"
                      data-testid={`action-complaint-${complaint.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30 shrink-0">
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-xs md:text-sm font-medium truncate">{complaint.title}</p>
                              <Badge className={`${statusColors[complaint.status] || ""} text-[10px] px-1.5`} variant="outline">
                                {statusLabels[lang]?.[complaint.status] || complaint.status}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <UserIcon className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                              <p className="text-[10px] md:text-xs text-muted-foreground truncate">
                                {complaint.restaurant?.companyName || complaint.restaurant?.name}
                              </p>
                              <span className="text-[10px] text-muted-foreground/70 ml-1">
                                {formatDistanceToNow(new Date(complaint.createdAt), { addSuffix: true, locale: dateLocale })}
                              </span>
                            </div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px] shrink-0 ml-2"
                          onClick={() => navigate(`/supplier/complaints?complaintId=${complaint.id}`)}
                          data-testid={`action-goto-complaint-${complaint.id}`}
                        >
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-statistics">
        <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 md:p-6">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 shrink-0">
              <BarChart3 className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <CardTitle className="text-base md:text-lg" data-testid="text-statistics-title">
                {t("supplierHome", "statistics")}
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">
                {t("supplierHome", "statisticsDesc")}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
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
                <div className="rounded-xl border border-border bg-white dark:bg-gray-900 p-3 md:p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Euro className="h-3.5 w-3.5 text-indigo-600" />
                    <span className="text-[10px] md:text-xs text-muted-foreground font-medium">{t("supplierHome", "totalRevenue")}</span>
                  </div>
                  <p className="text-lg md:text-xl font-bold text-foreground" data-testid="text-total-revenue">
                    {detailedStats.totalRevenue.toLocaleString(lang === "de" ? "de-DE" : "it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}€
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-white dark:bg-gray-900 p-3 md:p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Hash className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-[10px] md:text-xs text-muted-foreground font-medium">{t("supplierHome", "totalOrders")}</span>
                  </div>
                  <p className="text-lg md:text-xl font-bold text-foreground" data-testid="text-total-orders">
                    {detailedStats.totalOrders}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-white dark:bg-gray-900 p-3 md:p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingUp className="h-3.5 w-3.5 text-amber-600" />
                    <span className="text-[10px] md:text-xs text-muted-foreground font-medium">{t("supplierHome", "avgOrderValue")}</span>
                  </div>
                  <p className="text-lg md:text-xl font-bold text-foreground" data-testid="text-avg-order-value">
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
                        <div key={idx} className="rounded-lg border border-border bg-white dark:bg-gray-900 p-2.5 md:p-3" data-testid={`top-product-${idx}`}>
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
                          <div className="flex items-center justify-between">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 md:p-6">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-orange-100 dark:bg-orange-900/30 shrink-0">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <CardTitle className="text-base md:text-lg" data-testid="text-low-stock-title">
                {t("supplierHome", "lowStockAlerts")}
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">
                {t("supplierHome", "lowStockAlertsDesc")}
              </CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" className="text-xs md:text-sm shrink-0" asChild>
            <Link href="/supplier/products" data-testid="link-manage-stock">{t("common", "products")}</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          {lowStockLoading ? (
            <div className="space-y-2 md:space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : lowStockProducts && lowStockProducts.length > 0 ? (
            <div className="space-y-2 md:space-y-3">
              {lowStockProducts.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between p-2.5 md:p-3 rounded-xl border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/20"
                  data-testid={`low-stock-item-${product.id}`}
                >
                  <div className="flex items-center gap-2.5 md:gap-3 min-w-0 flex-1">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt="" className="h-9 w-9 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30 shrink-0">
                        <Package className="h-4 w-4 text-orange-600" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs md:text-sm font-medium truncate">{product.name}</p>
                      <p className="text-[10px] md:text-xs text-muted-foreground">
                        {t("supplierHome", "threshold")}: {product.lowStockThreshold} {product.unit}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 text-[10px] md:text-xs shrink-0 ml-2">
                    {product.stockQuantity ?? 0} {product.unit} {t("supplierHome", "stockLeft")}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle className="h-12 w-12 text-green-500/50 mb-3" />
              <p className="text-sm text-muted-foreground">{t("supplierHome", "noLowStock")}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("supplierHome", "noLowStockDesc")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detailOrder} onOpenChange={(open) => { if (!open) { setDetailOrder(null); setShowMessageInput(false); setOrderMessage(""); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-home-order-detail">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-primary" />
              {lang === "de" ? "Auftrag" : "Ordine"} #{detailOrder?.id.slice(0, 8)}
            </DialogTitle>
            <DialogDescription>
              {lang === "de" ? "Auftragsdetails und Artikelübersicht" : "Dettagli ordine e panoramica articoli"}
            </DialogDescription>
          </DialogHeader>
          {detailOrder && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={`${getStatusColor(detailOrder.status)}`} variant="outline">
                  {getOrderStatus(detailOrder.status, lang, true)}
                </Badge>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("common", "restaurant")}</span>
                  <span className="font-medium">{detailOrder.restaurant?.companyName || detailOrder.restaurant?.name || t("common", "unknown")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{lang === "de" ? "Bestellt am" : "Ordinato il"}</span>
                  <span>{format(new Date(detailOrder.createdAt), "dd.MM.yyyy HH:mm", { locale: dateLocale })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{lang === "de" ? "Gewünschter Liefertermin" : "Data consegna richiesta"}</span>
                  <span>
                    {detailOrder.requestedDeliveryDate
                      ? new Date(detailOrder.requestedDeliveryDate + "T00:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { weekday: "short", day: "2-digit", month: "long", year: "numeric" })
                      : (lang === "de" ? "Sobald wie möglich" : "Il prima possibile")}
                  </span>
                </div>
              </div>

              <div className="border-t border-border pt-3">
                <p className="text-sm font-medium mb-2">{t("common", "items")} ({detailOrder.items?.length || 0})</p>
                <div className="space-y-2">
                  {detailOrder.items?.map((item) => (
                    <div key={item.id} className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50" data-testid={`home-detail-item-${item.id}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        {item.productImageUrl ? (
                          <img src={item.productImageUrl} alt={item.productName} className="h-8 w-8 rounded object-cover shrink-0" />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                            <Package className="h-4 w-4 text-muted-foreground/40" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="font-medium">{item.quantity}x</span>{" "}
                          <span>{item.productName}</span>
                          <span className="text-muted-foreground ml-2">@ {item.unitPrice}€</span>
                        </div>
                      </div>
                      <span className="font-medium shrink-0 ml-2">{item.totalPrice}€</span>
                    </div>
                  ))}
                </div>
              </div>

              {detailOrder.notes && (
                <div className="border-t border-border pt-3">
                  <p className="text-sm font-medium mb-1">{lang === "de" ? "Anmerkungen" : "Note"}</p>
                  <p className="text-sm text-muted-foreground">{detailOrder.notes}</p>
                </div>
              )}

              <div className="border-t border-border pt-3 flex items-center justify-between">
                <span className="text-sm font-medium">{t("common", "total")}</span>
                <span className="text-lg font-bold" data-testid="text-home-detail-total">{detailOrder.totalAmount}€</span>
              </div>

              <div className="border-t border-border pt-4 space-y-2.5">
                <Button
                  className="w-full"
                  onClick={() => { setDetailOrder(null); navigate(`/supplier/orders?orderId=${detailOrder.id}`); }}
                  data-testid="home-detail-goto-order"
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  {lang === "de" ? "zur Bestellung" : "vai all'ordine"}
                </Button>

                {!showMessageInput ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowMessageInput(true)}
                    data-testid="home-detail-write-message"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    {lang === "de" ? "Nachricht schreiben" : "Scrivi messaggio"}
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/50 border-l-3 border-primary/50">
                      <ShoppingBag className="h-3 w-3 text-primary shrink-0" />
                      <span className="text-[11px] text-muted-foreground truncate">
                        {lang === "de" ? "Bestellung" : "Ordine"} #{detailOrder.id.substring(0, 8)} - {detailOrder.restaurant?.companyName || detailOrder.restaurant?.name}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Textarea
                        value={orderMessage}
                        onChange={(e) => setOrderMessage(e.target.value)}
                        placeholder={lang === "de" ? "Ihre Nachricht..." : "Il tuo messaggio..."}
                        rows={2}
                        className="flex-1"
                        data-testid="home-detail-message-input"
                      />
                      <div className="flex flex-col gap-1">
                        <Button
                          size="icon"
                          onClick={() => sendOrderMessageMutation.mutate({ order: detailOrder, message: orderMessage.trim() })}
                          disabled={!orderMessage.trim() || sendOrderMessageMutation.isPending}
                          data-testid="home-detail-send-message"
                        >
                          {sendOrderMessageMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => { setShowMessageInput(false); setOrderMessage(""); }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
