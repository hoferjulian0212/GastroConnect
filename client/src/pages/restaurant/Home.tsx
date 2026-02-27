import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingBag, Package, Clock, Truck, Calendar, MessageSquare, Tag, Minus, Plus, ShoppingCart, Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { OrderWithDetails, ConversationWithUser, ProductWithSupplierAndPromotion } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Link, useLocation } from "wouter";
import { format, isToday, isTomorrow, differenceInDays, differenceInHours } from "date-fns";
import { de, it } from "date-fns/locale";
import { useLanguage } from "@/context/LanguageContext";
import { useT, getOrderStatus } from "@/lib/translations";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function RestaurantHome() {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [detailOrder, setDetailOrder] = useState<OrderWithDetails | null>(null);
  const dateLocale = lang === "it" ? it : de;
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [addedProductIds, setAddedProductIds] = useState<Set<string>>(new Set());
  const [addedTimers, setAddedTimers] = useState<Record<string, ReturnType<typeof setTimeout>>>({});
  const promoScrollRef = useRef<HTMLDivElement>(null);

  const { data: upcomingDeliveries, isLoading } = useQuery<OrderWithDetails[]>({
    queryKey: ['/api/restaurant/upcoming-deliveries', currentUser?.id],
    queryFn: async () => {
      const res = await fetch(`/api/restaurant/upcoming-deliveries?restaurantId=${currentUser?.id}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: !!currentUser?.id,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: conversations, isLoading: convLoading } = useQuery<ConversationWithUser[]>({
    queryKey: [`/api/conversations?userId=${currentUser?.id}&role=restaurant`],
    enabled: !!currentUser?.id,
  });

  const { data: products, isLoading: productsLoading } = useQuery<ProductWithSupplierAndPromotion[]>({
    queryKey: [`/api/products?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const addToCartMutation = useMutation({
    mutationFn: async ({ productId, supplierId, quantity }: { productId: string; supplierId: string; quantity: number }) => {
      return apiRequest("POST", "/api/cart", {
        restaurantId: currentUser?.id,
        productId,
        supplierId,
        quantity,
        mode: "set",
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
      setAddedProductIds(prev => new Set(prev).add(variables.productId));
      if (addedTimers[variables.productId]) clearTimeout(addedTimers[variables.productId]);
      const timer = setTimeout(() => {
        setAddedProductIds(prev => {
          const next = new Set(prev);
          next.delete(variables.productId);
          return next;
        });
      }, 2000);
      setAddedTimers(prev => ({ ...prev, [variables.productId]: timer }));
    },
    onError: () => {
      toast({
        title: t("common", "error"),
        description: t("common", "productAddError"),
        variant: "destructive",
      });
    },
  });

  const unreadConversations = useMemo(() => {
    if (!conversations) return [];
    return conversations.filter(c => c.unreadCount > 0).sort((a, b) => {
      const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [conversations]);

  const promoProducts = useMemo(() => {
    if (!products) return [];
    return products.filter(p => p.activePromotion);
  }, [products]);

  const getMinOrderQty = (product: ProductWithSupplierAndPromotion) => {
    return product.minOrderQuantity && product.minOrderQuantity > 1 ? product.minOrderQuantity : 1;
  };

  const updateQuantity = (productId: string, delta: number, minQty: number) => {
    setQuantities(prev => ({
      ...prev,
      [productId]: Math.max(minQty, (prev[productId] || minQty) + delta),
    }));
  };

  const handleAddToCart = (product: ProductWithSupplierAndPromotion) => {
    const minQty = getMinOrderQty(product);
    const quantity = quantities[product.id] || minQty;
    addToCartMutation.mutate({ productId: product.id, supplierId: product.supplierId, quantity });
  };

  const getMessagePreview = (conv: ConversationWithUser) => {
    if (!conv.lastMessage) return "";
    const msg = conv.lastMessage;
    if (msg.messageType === "order") return t("orders", "order");
    if (msg.messageType === "complaint") return t("common", "complaints");
    if (msg.messageType === "attachment") return t("common", "attachment");
    if (msg.messageType === "promotion") return t("restaurantHome", "actions");
    if (msg.messageType === "order_change_request") return t("orders", "order");
    return msg.content?.slice(0, 80) || "";
  };

  const scrollPromos = (dir: "left" | "right") => {
    if (promoScrollRef.current) {
      const scrollAmount = 220;
      promoScrollRef.current.scrollBy({ left: dir === "left" ? -scrollAmount : scrollAmount, behavior: "smooth" });
    }
  };

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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending": return <Clock className="h-3.5 w-3.5" />;
      case "confirmed": return <Package className="h-3.5 w-3.5" />;
      case "in_delivery": return <Truck className="h-3.5 w-3.5" />;
      case "delivered": return <Package className="h-3.5 w-3.5" />;
      default: return <ShoppingBag className="h-3.5 w-3.5" />;
    }
  };

  const getDeliveryDateLabel = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    if (isToday(date)) return t("restaurantHome", "today");
    if (isTomorrow(date)) return t("restaurantHome", "tomorrow");
    return format(date, "EEEE, dd.MM.", { locale: dateLocale });
  };

  const groupedDeliveries = useMemo(() => {
    if (!upcomingDeliveries) return [];
    const groups = new Map<string, OrderWithDetails[]>();
    for (const order of upcomingDeliveries) {
      const dateKey = order.requestedDeliveryDate || "";
      if (!groups.has(dateKey)) groups.set(dateKey, []);
      groups.get(dateKey)!.push(order);
    }
    return Array.from(groups.entries()).map(([dateKey, orders]) => ({
      dateKey,
      label: getDeliveryDateLabel(dateKey),
      isToday: isToday(new Date(dateKey + "T00:00:00")),
      orders,
    }));
  }, [upcomingDeliveries, lang]);

  const totalUnread = unreadConversations.length;

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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 md:p-6">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10 shrink-0">
              <Truck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base md:text-lg" data-testid="text-upcoming-deliveries-title">
                {t("restaurantHome", "upcomingDeliveries")}
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">
                {t("restaurantHome", "upcomingDeliveriesDesc")}
              </CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" className="text-xs md:text-sm shrink-0" asChild>
            <Link href="/restaurant/orders" data-testid="link-view-all-orders">{t("common", "all")}</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : groupedDeliveries.length > 0 ? (
            <div className="space-y-4">
              {groupedDeliveries.map((group) => (
                <div key={group.dateKey}>
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className={`h-3.5 w-3.5 ${group.isToday ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-xs font-semibold uppercase tracking-wide ${group.isToday ? "text-primary" : "text-muted-foreground"}`}>
                      {group.label}
                    </span>
                    {group.isToday && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    )}
                  </div>
                  <div className="space-y-2">
                    {group.orders.map((order) => (
                      <div
                        key={order.id}
                        className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/20"
                        onClick={() => setDetailOrder(order)}
                        data-testid={`delivery-item-${order.id}`}
                      >
                        <div className={`flex items-center justify-center h-10 w-10 rounded-lg shrink-0 ${
                          order.status === "in_delivery"
                            ? "bg-purple-100 dark:bg-purple-900/30"
                            : "bg-blue-100 dark:bg-blue-900/30"
                        }`}>
                          {order.status === "in_delivery"
                            ? <Truck className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                            : <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium truncate">
                              {order.supplier?.companyName || order.supplier?.name || t("common", "unknown")}
                            </span>
                            <Badge className={`${getStatusColor(order.status)} text-[10px] px-1.5`} variant="outline">
                              {getOrderStatus(order.status, lang)}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {order.items?.length || 0} {t("common", "items")} — #{order.id.slice(0, 8)}
                          </p>
                        </div>
                        <span className="text-sm font-bold shrink-0">{order.totalAmount}€</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="flex items-center justify-center h-14 w-14 rounded-full bg-muted/50 mb-3">
                <Truck className="h-7 w-7 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">{t("restaurantHome", "noUpcomingDeliveries")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("restaurantHome", "noUpcomingDeliveriesDesc")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <div className="space-y-4 md:space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 md:p-6">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-blue-500/10 shrink-0">
                  <MessageSquare className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base md:text-lg" data-testid="text-unread-messages-title">
                      {t("restaurantHome", "unreadMessages")}
                    </CardTitle>
                    {totalUnread > 0 && (
                      <Badge className="bg-blue-600 text-white text-[10px] px-1.5 py-0 min-w-[20px] flex items-center justify-center" data-testid="badge-unread-count">
                        {totalUnread}
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs md:text-sm">
                    {t("restaurantHome", "unreadMessagesDesc")}
                  </CardDescription>
                </div>
              </div>
              <Button variant="outline" size="sm" className="text-xs md:text-sm shrink-0" asChild>
                <Link href="/restaurant/inbox" data-testid="link-view-all-messages">{t("restaurantHome", "allMessages")}</Link>
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
                      onClick={() => navigate(`/restaurant/inbox?chat=${conv.id}`)}
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
                          <span className="text-sm font-semibold truncate" data-testid={`text-unread-supplier-${conv.id}`}>
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
                      +{totalUnread - 3} {t("restaurantHome", "moreUnread")}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="flex items-center justify-center h-12 w-12 rounded-full bg-muted/50 mb-3">
                    <MessageSquare className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">{t("restaurantHome", "noUnreadMessages")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("restaurantHome", "noUnreadMessagesDesc")}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 md:p-6">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-green-500/10 shrink-0">
                  <Tag className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <CardTitle className="text-base md:text-lg" data-testid="text-active-promotions-title">
                    {t("restaurantHome", "activePromotions")}
                  </CardTitle>
                  <CardDescription className="text-xs md:text-sm">
                    {t("restaurantHome", "activePromotionsDesc")}
                  </CardDescription>
                </div>
              </div>
              <Button variant="outline" size="sm" className="text-xs md:text-sm shrink-0" asChild>
                <Link href="/restaurant/catalog?promotions=true" data-testid="link-view-all-promotions">{t("restaurantHome", "allPromotions")}</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
              {productsLoading ? (
                <div className="flex gap-3 overflow-hidden">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="min-w-[180px] h-[260px] rounded-xl shrink-0" />
                  ))}
                </div>
              ) : promoProducts.length > 0 ? (
                <div className="relative group">
                  {promoProducts.length > 3 && (
                    <>
                      <button
                        onClick={() => scrollPromos("left")}
                        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 z-10 h-8 w-8 rounded-full bg-background border border-border shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        data-testid="button-scroll-promos-left"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => scrollPromos("right")}
                        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 z-10 h-8 w-8 rounded-full bg-background border border-border shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        data-testid="button-scroll-promos-right"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  <div
                    ref={promoScrollRef}
                    className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 snap-x snap-mandatory"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                  >
                    {promoProducts.map((product) => {
                      const promo = product.activePromotion!;
                      const originalPrice = parseFloat(product.price);
                      const discountedPrice = originalPrice * (1 - promo.discountPercent / 100);
                      const minQty = getMinOrderQty(product);

                      return (
                        <div
                          key={product.id}
                          className="min-w-[180px] w-[180px] shrink-0 snap-start rounded-xl border border-border bg-card overflow-hidden transition-all duration-200 hover:shadow-md hover:border-green-300/40 ring-1 ring-green-400/30"
                          data-testid={`promo-card-${product.id}`}
                        >
                          <div className="relative">
                            {product.imageUrl ? (
                              <div className="w-full aspect-square bg-muted">
                                <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                              </div>
                            ) : (
                              <div className="w-full aspect-square bg-muted flex items-center justify-center">
                                <Package className="h-8 w-8 text-muted-foreground/30" />
                              </div>
                            )}
                            <div className="absolute top-1.5 left-1.5 flex items-center justify-center rounded-full bg-green-600 text-white text-[10px] font-bold px-1.5 py-0.5 shadow-sm">
                              -{promo.discountPercent}%
                            </div>
                            {product.inStock ? (
                              <Badge variant="outline" className="absolute top-1.5 right-1.5 bg-green-100/90 text-green-800 dark:bg-green-900/80 dark:text-green-400 text-[9px] px-1 py-0">
                                {t("common", "available")}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="absolute top-1.5 right-1.5 bg-red-100/90 text-red-800 dark:bg-red-900/80 dark:text-red-400 text-[9px] px-1 py-0">
                                {t("common", "unavailable")}
                              </Badge>
                            )}
                          </div>
                          <div className="p-2.5 flex flex-col">
                            <h3 className="font-medium text-xs truncate" data-testid={`text-promo-name-${product.id}`}>{product.name}</h3>
                            <p className="text-[10px] text-muted-foreground truncate" data-testid={`text-promo-supplier-${product.id}`}>
                              {product.supplier?.companyName || product.supplier?.name}
                            </p>
                            <div className="flex items-baseline gap-1 mt-1 flex-wrap">
                              <span className="text-[10px] text-muted-foreground line-through" data-testid={`text-promo-original-price-${product.id}`}>{originalPrice.toFixed(2)}€</span>
                              <span className="font-bold text-sm text-green-600 dark:text-green-400" data-testid={`text-promo-discounted-price-${product.id}`}>{discountedPrice.toFixed(2)}€</span>
                              <span className="text-[10px] text-muted-foreground">/{product.unit}</span>
                            </div>
                            {promo.endDate && (() => {
                              const now = new Date();
                              const end = new Date(promo.endDate);
                              const daysLeft = differenceInDays(end, now);
                              const hoursLeft = differenceInHours(end, now);
                              let remainingText = "";
                              if (daysLeft <= 0 && hoursLeft > 0) {
                                remainingText = t("common", "endsToday");
                              } else if (daysLeft === 1) {
                                remainingText = t("common", "oneDay");
                              } else if (daysLeft > 1) {
                                remainingText = `${t("common", "still")} ${daysLeft} ${t("common", "daysLeft")}`;
                              } else {
                                remainingText = t("common", "endsSoon");
                              }
                              return (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <Clock className="h-2.5 w-2.5 text-green-600 dark:text-green-400 shrink-0" />
                                  <span className="text-[9px] text-green-600 dark:text-green-400 font-medium truncate">
                                    {remainingText}
                                  </span>
                                </div>
                              );
                            })()}
                            <div className="flex items-center gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center border border-border rounded-md shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => updateQuantity(product.id, -1, minQty)}
                                  disabled={!product.inStock || (quantities[product.id] || minQty) <= minQty}
                                  data-testid={`button-promo-decrease-${product.id}`}
                                >
                                  <Minus className="h-2.5 w-2.5" />
                                </Button>
                                <span className="w-5 text-center text-xs" data-testid={`promo-quantity-${product.id}`}>
                                  {quantities[product.id] || minQty}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => updateQuantity(product.id, 1, minQty)}
                                  disabled={!product.inStock}
                                  data-testid={`button-promo-increase-${product.id}`}
                                >
                                  <Plus className="h-2.5 w-2.5" />
                                </Button>
                              </div>
                              <Button
                                variant={addedProductIds.has(product.id) ? "default" : "outline"}
                                size="sm"
                                className={`gap-0.5 text-[10px] h-6 flex-1 min-w-0 transition-all duration-300 ${
                                  addedProductIds.has(product.id)
                                    ? "bg-primary border-primary text-primary-foreground"
                                    : ""
                                }`}
                                disabled={!product.inStock || addToCartMutation.isPending}
                                onClick={() => handleAddToCart(product)}
                                data-testid={`button-promo-add-to-cart-${product.id}`}
                              >
                                {addedProductIds.has(product.id) ? (
                                  <Check className="h-3 w-3 shrink-0" />
                                ) : (
                                  <ShoppingCart className="h-3 w-3 shrink-0" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="flex items-center justify-center h-12 w-12 rounded-full bg-muted/50 mb-3">
                    <Tag className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">{t("restaurantHome", "noActivePromotions")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("restaurantHome", "noActivePromotionsDesc")}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div />
      </div>

      <Dialog open={!!detailOrder} onOpenChange={(open) => !open && setDetailOrder(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-home-order-detail">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailOrder && getStatusIcon(detailOrder.status)}
              {t("orders", "order")} #{detailOrder?.id.slice(0, 8)}
            </DialogTitle>
            <DialogDescription>
              {t("orders", "orderDetails")}
            </DialogDescription>
          </DialogHeader>
          {detailOrder && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={`${getStatusColor(detailOrder.status)}`} variant="outline">
                  {getStatusIcon(detailOrder.status)}
                  <span className="ml-1">{getOrderStatus(detailOrder.status, lang)}</span>
                </Badge>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t("common", "supplier")}</span>
                  <span className="font-medium text-right">{detailOrder.supplier?.companyName || detailOrder.supplier?.name || t("common", "unknown")}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t("orders", "createdAt")}</span>
                  <span>{format(new Date(detailOrder.createdAt), "dd.MM.yyyy HH:mm", { locale: dateLocale })}</span>
                </div>
                {detailOrder.requestedDeliveryDate && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t("orders", "requestedDeliveryDate")}</span>
                    <span>{new Date(detailOrder.requestedDeliveryDate + "T00:00:00").toLocaleDateString(lang === "it" ? "it-IT" : "de-DE", { weekday: "short", day: "2-digit", month: "long", year: "numeric" })}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-3">
                <p className="text-sm font-medium mb-2">{t("common", "items")} ({detailOrder.items?.length || 0})</p>
                <div className="space-y-2">
                  {detailOrder.items?.map((item) => (
                    <div key={item.id} className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50" data-testid={`home-detail-item-${item.id}`}>
                      <div>
                        <span className="font-medium">{item.quantity}x</span>{" "}
                        <span>{item.productName}</span>
                        <span className="text-muted-foreground ml-2">@ {item.unitPrice}€</span>
                      </div>
                      <span className="font-medium">{item.totalPrice}€</span>
                    </div>
                  ))}
                </div>
              </div>

              {detailOrder.notes && (
                <div className="border-t border-border pt-3">
                  <p className="text-sm font-medium mb-1">{t("orders", "notes")}</p>
                  <p className="text-sm text-muted-foreground">{detailOrder.notes}</p>
                </div>
              )}

              <div className="border-t border-border pt-3 flex items-center justify-between">
                <span className="text-sm font-medium">{t("common", "total")}</span>
                <span className="text-lg font-bold" data-testid="text-home-detail-total">{detailOrder.totalAmount}€</span>
              </div>

              <div className="border-t border-border pt-3">
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/restaurant/orders" data-testid="link-go-to-orders">
                    {t("common", "all")} {t("common", "orders")}
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
