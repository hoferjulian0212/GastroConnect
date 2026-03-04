import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, Clock, CheckCircle, ShoppingBag, User as UserIcon, Truck, Check, X, AlertTriangle, Package, MessageSquare } from "lucide-react";
import type { OrderWithDetails, Product, ConversationWithUser } from "@shared/schema";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format, formatDistanceToNow, isToday } from "date-fns";
import { de, it } from "date-fns/locale";
import { useLanguage } from "@/context/LanguageContext";
import { useT, getOrderStatus } from "@/lib/translations";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";

export default function SupplierHome() {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const dateLocale = lang === "de" ? de : it;

  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null);

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

  const markDeliveredMutation = useMutation({
    mutationFn: async (orderId: string) => {
      await apiRequest("PATCH", `/api/orders/${orderId}/status`, {
        status: "delivered",
        changedBy: currentUser?.id,
      });
    },
    onSuccess: () => {
      setConfirmingOrderId(null);
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/upcoming-deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/orders/recent'] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/orders'] });
      toast({
        title: lang === "de" ? "Lieferung bestätigt" : "Consegna confermata",
        description: lang === "de" ? "Die Bestellung wurde als geliefert markiert." : "L'ordine è stato contrassegnato come consegnato.",
      });
    },
    onError: () => {
      setConfirmingOrderId(null);
      toast({
        title: lang === "de" ? "Fehler" : "Errore",
        description: lang === "de" ? "Status konnte nicht geändert werden." : "Impossibile modificare lo stato.",
        variant: "destructive",
      });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "confirmed": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
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
                const isDelivered = order.status === "delivered";
                const isConfirming = confirmingOrderId === order.id;

                return (
                  <div
                    key={order.id}
                    className={`rounded-xl border p-2.5 md:p-3 transition-all ${
                      isDelivered
                        ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20"
                        : isTodayDelivery
                          ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20"
                          : "border-border bg-white dark:bg-gray-900"
                    }`}
                    data-testid={`delivery-item-${order.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/supplier/orders?orderId=${order.id}`}
                        className="flex items-start gap-2.5 min-w-0 flex-1 cursor-pointer"
                        data-testid={`delivery-link-${order.id}`}
                      >
                        <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${
                          isDelivered
                            ? "bg-green-100 dark:bg-green-900/30"
                            : isTodayDelivery
                              ? "bg-amber-100 dark:bg-amber-900/30"
                              : "bg-primary/10"
                        }`}>
                          {isDelivered ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Truck className={`h-4 w-4 ${isTodayDelivery ? "text-amber-600" : "text-primary"}`} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs md:text-sm font-medium">#{order.id.slice(0, 8)}</p>
                            <Badge className={`${getStatusColor(order.status)} text-[10px] md:text-xs px-1.5`} variant="outline">
                              {getOrderStatus(order.status, lang, true)}
                            </Badge>
                            {isTodayDelivery && !isDelivered && (
                              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] md:text-xs px-1.5" variant="outline">
                                {t("supplierHome", "today")}
                              </Badge>
                            )}
                            {isDelivered && (
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-[10px] md:text-xs px-1.5" variant="outline">
                                {t("supplierHome", "deliveredToday")}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <UserIcon className="h-2.5 w-2.5 md:h-3 md:w-3 text-muted-foreground shrink-0" />
                            <p className="text-[10px] md:text-xs text-muted-foreground truncate">
                              {order.restaurant?.companyName || order.restaurant?.name || t("common", "unknown")}
                            </p>
                          </div>
                          <p className="text-[10px] md:text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Clock className="h-2.5 w-2.5 md:h-3 md:w-3 shrink-0" />
                            {deliveryDate
                              ? format(deliveryDate, "dd.MM.yyyy", { locale: dateLocale })
                              : t("supplierHome", "noDeliveryDate")}
                          </p>
                        </div>
                      </Link>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className="text-sm md:text-base font-bold">{order.totalAmount}€</span>
                        {!isDelivered && (order.status === "in_delivery" || (order.status === "confirmed" && isTodayDelivery)) && (
                          <>
                            {isConfirming ? (
                              <div className="flex flex-col items-end gap-1">
                                <p className="text-[10px] md:text-xs font-medium text-foreground">
                                  {t("supplierHome", "confirmDelivery")}
                                </p>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-[10px] md:text-xs"
                                    onClick={() => setConfirmingOrderId(null)}
                                    disabled={markDeliveredMutation.isPending}
                                    data-testid={`cancel-delivery-${order.id}`}
                                  >
                                    <X className="h-3 w-3 mr-0.5" />
                                    {t("supplierHome", "cancel")}
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="h-7 px-2 text-[10px] md:text-xs bg-green-600 hover:bg-green-700 text-white"
                                    onClick={() => markDeliveredMutation.mutate(order.id)}
                                    disabled={markDeliveredMutation.isPending}
                                    data-testid={`confirm-delivery-${order.id}`}
                                  >
                                    <Check className="h-3 w-3 mr-0.5" />
                                    {t("supplierHome", "confirm")}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[10px] md:text-xs border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950/30"
                                onClick={() => setConfirmingOrderId(order.id)}
                                data-testid={`mark-delivered-${order.id}`}
                              >
                                <Check className="h-3 w-3 mr-1" />
                                {t("supplierHome", "markDelivered")}
                              </Button>
                            )}
                          </>
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
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10 shrink-0">
              <ClipboardList className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base md:text-lg">{t("supplierHome", "newOrders")}</CardTitle>
              <CardDescription className="text-xs md:text-sm">{t("supplierHome", "waitingForProcessing")}</CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" className="text-xs md:text-sm shrink-0" asChild>
            <Link href="/supplier/orders" data-testid="link-view-all-orders">{t("common", "all")}</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          {ordersLoading ? (
            <div className="space-y-2 md:space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : recentOrders && recentOrders.length > 0 ? (
            <div className="space-y-2 md:space-y-3">
              {recentOrders.slice(0, 4).map((order) => (
                <Link
                  key={order.id}
                  href={`/supplier/orders?orderId=${order.id}`}
                  className="flex items-center justify-between p-2.5 md:p-3 rounded-xl border border-border bg-white dark:bg-gray-900 cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/30"
                  data-testid={`order-item-${order.id}`}
                >
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
                        {format(new Date(order.createdAt), "dd.MM.yyyy HH:mm", { locale: dateLocale })}
                        <span className="text-muted-foreground/70">({formatDistanceToNow(new Date(order.createdAt), { addSuffix: true, locale: dateLocale })})</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                    <span className="text-sm md:text-base font-bold">{order.totalAmount}€</span>
                    <span className="text-[10px] md:text-xs text-muted-foreground">
                      {order.items?.length || 0} {lang === "de" ? "Artikel" : "articoli"}
                    </span>
                  </div>
                </Link>
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
      </div>

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
    </div>
  );
}
