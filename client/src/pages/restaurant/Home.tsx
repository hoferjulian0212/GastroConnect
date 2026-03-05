import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingBag, Package, Clock, Truck, Calendar, MessageSquare, Tag, ShoppingCart, Check, ChevronLeft, ChevronRight, CheckCircle, XCircle, AlertTriangle, Send, ClipboardList, Loader2, ArrowRight, Plus, Sparkles } from "lucide-react";
import QuantityInput from "@/components/QuantityInput";
import type { OrderWithDetails, ConversationWithUser, ProductWithSupplierAndPromotion, OrderTemplateWithItems } from "@shared/schema";
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
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);
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
    queryKey: [`/api/conversations?userId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: products, isLoading: productsLoading } = useQuery<ProductWithSupplierAndPromotion[]>({
    queryKey: [`/api/products?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: templates, isLoading: templatesLoading } = useQuery<OrderTemplateWithItems[]>({
    queryKey: [`/api/order-templates?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const [orderingTemplateId, setOrderingTemplateId] = useState<string | null>(null);
  const [wizardTemplate, setWizardTemplate] = useState<OrderTemplateWithItems | null>(null);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [wizardQuantities, setWizardQuantities] = useState<Record<string, number>>({});
  const [wizardRecommendedQtys, setWizardRecommendedQtys] = useState<Record<string, number>>({});
  const [wizardSelectedRecommended, setWizardSelectedRecommended] = useState<Set<string>>(new Set());
  const [wizardSubmitting, setWizardSubmitting] = useState(false);

  const openTemplateWizard = useCallback((tmpl: OrderTemplateWithItems) => {
    const qtys: Record<string, number> = {};
    for (const item of tmpl.items) {
      if (item.product.inStock !== false) {
        qtys[item.productId] = item.quantity;
      }
    }
    setWizardQuantities(qtys);
    setWizardRecommendedQtys({});
    setWizardSelectedRecommended(new Set());
    setWizardTemplate(tmpl);
    setWizardStep(1);
    setWizardSubmitting(false);
  }, []);

  const wizardRecommendedProducts = useMemo(() => {
    if (!wizardTemplate || !products) return [];
    const templateProductIds = new Set(wizardTemplate.items.map(i => i.productId));
    const templateSupplierIds = new Set(wizardTemplate.items.map(i => i.product.supplierId));
    const recommended: ProductWithSupplierAndPromotion[] = [];
    const promos = products.filter(p => p.activePromotion && !templateProductIds.has(p.id) && p.inStock !== false);
    for (const p of promos) recommended.push(p);
    const sameSupplier = products.filter(p => templateSupplierIds.has(p.supplierId) && !templateProductIds.has(p.id) && !promos.some(pr => pr.id === p.id) && p.inStock !== false);
    for (const p of sameSupplier.slice(0, 6 - recommended.length)) recommended.push(p);
    return recommended.slice(0, 6);
  }, [wizardTemplate, products]);

  const wizardAddToCartMutation = useMutation({
    mutationFn: async () => {
      for (const [productId, qty] of Object.entries(wizardQuantities)) {
        if (qty <= 0) continue;
        const item = wizardTemplate?.items.find(i => i.productId === productId);
        if (!item) continue;
        await apiRequest("POST", "/api/cart", {
          restaurantId: currentUser?.id,
          productId,
          supplierId: item.product.supplierId,
          quantity: qty,
          mode: "set",
        });
      }
      for (const prodId of wizardSelectedRecommended) {
        const qty = wizardRecommendedQtys[prodId] || 1;
        const prod = wizardRecommendedProducts.find(p => p.id === prodId);
        if (!prod || qty <= 0) continue;
        await apiRequest("POST", "/api/cart", {
          restaurantId: currentUser?.id,
          productId: prodId,
          supplierId: prod.supplierId,
          quantity: qty,
          mode: "set",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
      setWizardStep(3);
      setWizardSubmitting(false);
      setTimeout(() => {
        setWizardTemplate(null);
        navigate("/restaurant/cart");
      }, 3500);
    },
    onError: () => {
      toast({ title: t("common", "error"), variant: "destructive" });
      setWizardSubmitting(false);
    },
  });

  const handleWizardSubmit = () => {
    setWizardSubmitting(true);
    wizardAddToCartMutation.mutate();
  };

  const orderFromTemplateMutation = useMutation({
    mutationFn: async (template: OrderTemplateWithItems) => {
      const inStockItems = template.items.filter(i => i.product.inStock !== false);
      for (const item of inStockItems) {
        await apiRequest("POST", "/api/cart", {
          restaurantId: currentUser?.id,
          productId: item.productId,
          supplierId: item.product.supplierId,
          quantity: item.quantity,
          mode: "set",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
      toast({ title: lang === "de" ? "Zum Warenkorb hinzugefuegt" : "Aggiunto al carrello" });
      setOrderingTemplateId(null);
      navigate("/restaurant/cart");
    },
    onError: () => {
      toast({ title: t("common", "error"), variant: "destructive" });
      setOrderingTemplateId(null);
    },
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

  const getOrderDeliveryState = (order: OrderWithDetails): "delivered_today" | "overdue" | "delayed" | "upcoming" => {
    if (order.status === "delivered") {
      const updatedAt = order.updatedAt ? new Date(order.updatedAt) : null;
      if (updatedAt && isToday(updatedAt)) return "delivered_today";
      return "upcoming";
    }
    if (!order.requestedDeliveryDate) return "upcoming";
    const dd = new Date(order.requestedDeliveryDate + "T00:00:00");
    if (isNaN(dd.getTime())) return "upcoming";
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (dd < now) return "overdue";
    if (order.originalDeliveryDate) return "delayed";
    return "upcoming";
  };

  const groupedDeliveries = useMemo(() => {
    if (!upcomingDeliveries) return [];
    const overdueOrders: OrderWithDetails[] = [];
    const todayDeliveredOrders: OrderWithDetails[] = [];
    const regularGroups = new Map<string, OrderWithDetails[]>();

    for (const order of upcomingDeliveries) {
      const state = getOrderDeliveryState(order);
      if (state === "overdue") {
        overdueOrders.push(order);
      } else if (state === "delivered_today") {
        todayDeliveredOrders.push(order);
      } else {
        const dateKey = order.requestedDeliveryDate || "";
        if (!regularGroups.has(dateKey)) regularGroups.set(dateKey, []);
        regularGroups.get(dateKey)!.push(order);
      }
    }

    const result: { dateKey: string; label: string; isToday: boolean; type: "overdue" | "delivered" | "regular"; orders: OrderWithDetails[] }[] = [];

    if (overdueOrders.length > 0) {
      result.push({
        dateKey: "_overdue",
        label: lang === "de" ? "Überfällig" : "Scaduto",
        isToday: false,
        type: "overdue",
        orders: overdueOrders,
      });
    }

    for (const [dateKey, orders] of regularGroups.entries()) {
      const dtToday = isToday(new Date(dateKey + "T00:00:00"));
      result.push({
        dateKey,
        label: getDeliveryDateLabel(dateKey),
        isToday: dtToday,
        type: "regular",
        orders: [...orders, ...(dtToday ? todayDeliveredOrders : [])],
      });
    }

    if (todayDeliveredOrders.length > 0 && !result.some(g => g.type === "regular" && g.isToday)) {
      result.push({
        dateKey: "_delivered_today",
        label: t("restaurantHome", "today"),
        isToday: true,
        type: "delivered",
        orders: todayDeliveredOrders,
      });
    }

    return result;
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
                    {group.type === "overdue" ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                    ) : (
                      <Calendar className={`h-3.5 w-3.5 ${group.isToday ? "text-primary" : "text-muted-foreground"}`} />
                    )}
                    <span className={`text-xs font-semibold uppercase tracking-wide ${
                      group.type === "overdue" ? "text-red-500" : group.isToday ? "text-primary" : "text-muted-foreground"
                    }`}>
                      {group.label}
                    </span>
                    {group.isToday && group.type !== "overdue" && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    )}
                  </div>
                  <div className="space-y-2">
                    {group.orders.map((order) => {
                      const deliveryState = getOrderDeliveryState(order);
                      const isDelivered = deliveryState === "delivered_today";
                      const isOverdue = deliveryState === "overdue";
                      const isDelayed = deliveryState === "delayed";
                      const supplierName = order.supplier?.companyName || order.supplier?.name || t("common", "unknown");

                      return (
                        <div
                          key={order.id}
                          className={`rounded-xl border transition-all duration-200 ${
                            isDelivered
                              ? "border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/20"
                              : isOverdue
                                ? "border-red-300 dark:border-red-700 bg-red-50/30 dark:bg-red-950/20"
                                : isDelayed
                                  ? "border-amber-300 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-950/20"
                                  : "border-border bg-card hover:shadow-md hover:border-primary/20"
                          }`}
                          data-testid={`delivery-item-${order.id}`}
                        >
                          <div
                            className="flex items-center gap-3 p-3 cursor-pointer"
                            onClick={() => setDetailOrder(order)}
                          >
                            <div className={`flex items-center justify-center h-10 w-10 rounded-lg shrink-0 ${
                              isDelivered
                                ? "bg-green-100 dark:bg-green-900/30"
                                : isOverdue
                                  ? "bg-red-100 dark:bg-red-900/30"
                                  : isDelayed
                                    ? "bg-amber-100 dark:bg-amber-900/30"
                                    : order.status === "in_delivery"
                                      ? "bg-purple-100 dark:bg-purple-900/30"
                                      : "bg-blue-100 dark:bg-blue-900/30"
                            }`}>
                              {isDelivered
                                ? <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                                : isOverdue
                                  ? <XCircle className="h-5 w-5 text-red-500 dark:text-red-400" />
                                  : isDelayed
                                    ? <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                                    : order.status === "in_delivery"
                                      ? <Truck className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                                      : <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-sm font-medium truncate ${isOverdue ? "text-red-700 dark:text-red-400" : ""}`}>
                                  {supplierName}
                                </span>
                                {isDelivered ? (
                                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-[10px] px-1.5" variant="outline">
                                    {lang === "de" ? "Geliefert" : "Consegnato"}
                                  </Badge>
                                ) : isOverdue ? (
                                  <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-[10px] px-1.5" variant="outline">
                                    {lang === "de" ? "Überfällig" : "Scaduto"}
                                  </Badge>
                                ) : isDelayed ? (
                                  <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] px-1.5" variant="outline">
                                    {lang === "de" ? "In Verspätung" : "In ritardo"}
                                  </Badge>
                                ) : (
                                  <Badge className={`${getStatusColor(order.status)} text-[10px] px-1.5`} variant="outline">
                                    {getOrderStatus(order.status, lang)}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {order.items?.length || 0} {t("common", "items")} — #{order.id.slice(0, 8)}
                              </p>
                              {isDelayed && order.originalDeliveryDate && (
                                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                                  {lang === "de" ? "Ursprünglich" : "Originale"}: {new Date(order.originalDeliveryDate + "T00:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { day: "2-digit", month: "short" })}
                                  {" → "}
                                  {new Date((order.requestedDeliveryDate || "") + "T00:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { day: "2-digit", month: "short" })}
                                </p>
                              )}
                              {isOverdue && (
                                <p className="text-[11px] text-red-500 dark:text-red-400 mt-0.5">
                                  {lang === "de" ? "Erwartet am" : "Previsto per il"} {new Date((order.requestedDeliveryDate || "") + "T00:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { weekday: "short", day: "2-digit", month: "short" })}
                                </p>
                              )}
                            </div>
                            <span className="text-sm font-bold shrink-0">{order.totalAmount}€</span>
                          </div>
                          {isOverdue && (
                            <div className="px-3 pb-3">
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full text-xs border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/restaurant/inbox?supplierId=${order.supplierId}`);
                                }}
                                data-testid={`button-send-overdue-msg-${order.id}`}
                              >
                                <Send className="h-3.5 w-3.5 mr-1.5" />
                                {lang === "de" ? "Nachricht senden" : "Invia messaggio"}
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
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
                          </div>
                          <div className="p-2.5 flex flex-col">
                            {product.inStock ? (
                              <span className="text-[10px] font-medium text-green-700 dark:text-green-400" data-testid={`text-promo-stock-${product.id}`}>
                                {t("common", "available")}
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-red-600 dark:text-red-400" data-testid={`text-promo-stock-${product.id}`}>
                                {t("common", "unavailable")}
                              </span>
                            )}
                            <div className="flex items-center gap-1.5 mb-1" data-testid={`text-promo-supplier-${product.id}`}>
                              <Avatar className="h-5 w-5 shrink-0">
                                {product.supplier?.profileImageUrl ? (
                                  <AvatarImage src={product.supplier.profileImageUrl} alt={product.supplier?.companyName || product.supplier?.name} />
                                ) : null}
                                <AvatarFallback className="text-[8px] font-bold bg-primary/10 text-primary">
                                  {(product.supplier?.companyName || product.supplier?.name || "?").slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-xs font-bold text-foreground truncate">
                                {product.supplier?.companyName || product.supplier?.name}
                              </span>
                            </div>
                            <h3 className="font-medium text-xs text-muted-foreground truncate" data-testid={`text-promo-name-${product.id}`}>{product.name}</h3>
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
                              <QuantityInput
                                value={quantities[product.id] || minQty}
                                onChange={(val) => setQuantities(prev => ({ ...prev, [product.id]: val }))}
                                min={minQty}
                                disabled={!product.inStock}
                                size="sm"
                                testIdPrefix={`promo-qty-${product.id}`}
                              />
                              <Button
                                variant={addedProductIds.has(product.id) ? "default" : "outline"}
                                size="sm"
                                className={`gap-0.5 text-[10px] h-6 flex-1 min-w-0 ${
                                  addedProductIds.has(product.id)
                                    ? "bg-green-500 border-green-500 text-white hover:bg-green-500 no-default-hover-elevate no-default-active-elevate animate-cart-added"
                                    : "transition-all duration-200"
                                }`}
                                disabled={!product.inStock || addToCartMutation.isPending}
                                onClick={() => handleAddToCart(product)}
                                data-testid={`button-promo-add-to-cart-${product.id}`}
                              >
                                {addedProductIds.has(product.id) ? (
                                  <Check className="h-3 w-3 shrink-0 animate-cart-check" />
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

        <div className="space-y-4 md:space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 md:p-6">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-orange-500/10 shrink-0">
                  <ClipboardList className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <CardTitle className="text-base md:text-lg" data-testid="text-templates-title">
                    {lang === "de" ? "Bestellvorlagen" : "Modelli d'ordine"}
                  </CardTitle>
                  <CardDescription className="text-xs md:text-sm">
                    {lang === "de" ? "Wiederkehrende Bestellungen" : "Ordini ricorrenti"}
                  </CardDescription>
                </div>
              </div>
              <Button variant="outline" size="sm" className="text-xs md:text-sm shrink-0" asChild>
                <Link href="/restaurant/orders?tab=templates" data-testid="link-view-all-templates">{t("common", "all")}</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
              {templatesLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-24 w-full rounded-lg" />
                  ))}
                </div>
              ) : templates && templates.length > 0 ? (
                <div className="space-y-2">
                  {templates.slice(0, 3).map((tmpl) => {
                    const inStockItems = tmpl.items.filter(i => i.product.inStock !== false);
                    const outOfStockCount = tmpl.items.length - inStockItems.length;
                    const total = inStockItems.reduce((sum, i) => sum + parseFloat(i.product.price) * i.quantity, 0);
                    const isExpanded = expandedTemplateId === tmpl.id;

                    return (
                      <div
                        key={tmpl.id}
                        className="rounded-xl border border-border bg-card overflow-hidden transition-all"
                        data-testid={`template-card-${tmpl.id}`}
                      >
                        <div
                          className="flex items-center justify-between gap-2 p-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => setExpandedTemplateId(isExpanded ? null : tmpl.id)}
                          data-testid={`template-header-${tmpl.id}`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <ClipboardList className="h-4 w-4 text-orange-500 shrink-0" />
                            <h3 className="text-sm font-semibold truncate" data-testid={`text-template-name-${tmpl.id}`}>{tmpl.name}</h3>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground">
                              {tmpl.items.length} {t("common", "items")}
                            </span>
                            <span className="text-sm font-bold tabular-nums">{total.toFixed(2)}&euro;</span>
                            {outOfStockCount > 0 && (
                              <Badge variant="outline" className="text-[10px] border-red-200 text-red-500 px-1">
                                {outOfStockCount}
                              </Badge>
                            )}
                            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-2.5 pb-2.5 space-y-2 border-t border-border/50 pt-2">
                            {(() => {
                              const supplierGroups = new Map<string, { name: string; items: typeof tmpl.items }>();
                              for (const item of tmpl.items) {
                                const sid = item.product.supplierId;
                                const sname = item.product.supplier?.companyName || item.product.supplier?.name || "";
                                if (!supplierGroups.has(sid)) supplierGroups.set(sid, { name: sname, items: [] });
                                supplierGroups.get(sid)!.items.push(item);
                              }
                              return Array.from(supplierGroups.entries()).map(([sid, group]) => (
                                <div key={sid}>
                                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{group.name}</p>
                                  <div className="space-y-0.5 mt-0.5">
                                    {group.items.map((item) => {
                                      const oos = item.product.inStock === false;
                                      return (
                                        <div key={item.id} className={`flex items-center gap-2 text-xs ${oos ? "text-muted-foreground/50 line-through" : ""}`} data-testid={`template-item-${item.id}`}>
                                          {item.product.imageUrl ? (
                                            <img src={item.product.imageUrl} alt="" className="h-6 w-6 rounded object-cover shrink-0" />
                                          ) : (
                                            <div className="h-6 w-6 rounded bg-muted flex items-center justify-center shrink-0">
                                              <Package className="h-3 w-3 text-muted-foreground" />
                                            </div>
                                          )}
                                          <span className="truncate flex-1">
                                            <span className="font-medium">{item.quantity}x</span> {item.product.name}
                                          </span>
                                          <span className="shrink-0 ml-2 tabular-nums">{(parseFloat(item.product.price) * item.quantity).toFixed(2)}&euro;</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ));
                            })()}
                            <div className="flex items-center justify-end gap-2 pt-1.5">
                              <Button
                                size="sm"
                                className="text-xs h-7 gap-1"
                                disabled={inStockItems.length === 0}
                                onClick={(e) => { e.stopPropagation(); openTemplateWizard(tmpl); }}
                                data-testid={`button-order-template-${tmpl.id}`}
                              >
                                <ShoppingCart className="h-3 w-3" />
                                {lang === "de" ? "Bestellen" : "Ordina"}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {templates.length > 3 && (
                    <Button variant="outline" className="w-full text-xs h-8" asChild>
                      <Link href="/restaurant/orders?tab=templates" data-testid="link-more-templates">
                        {lang === "de" ? `Alle ${templates.length} Vorlagen anzeigen` : `Mostra tutti ${templates.length} i modelli`}
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Link>
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="flex items-center justify-center h-12 w-12 rounded-full bg-muted/50 mb-3">
                    <ClipboardList className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {lang === "de" ? "Keine Vorlagen" : "Nessun modello"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {lang === "de" ? "Erstellen Sie Vorlagen fuer wiederkehrende Bestellungen" : "Crea modelli per ordini ricorrenti"}
                  </p>
                  <Button variant="outline" size="sm" className="mt-3 text-xs" asChild>
                    <Link href="/restaurant/orders?tab=templates" data-testid="link-create-template">
                      {lang === "de" ? "Vorlage erstellen" : "Crea modello"}
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
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
                  {detailOrder.items?.map((item: any) => (
                    <div key={item.id} className="flex items-center gap-2.5 text-sm p-2 rounded-md bg-muted/50" data-testid={`home-detail-item-${item.id}`}>
                      {item.productImageUrl ? (
                        <img src={item.productImageUrl} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{item.quantity}x</span>{" "}
                        <span>{item.productName}</span>
                        <span className="text-muted-foreground ml-2">@ {item.unitPrice}€</span>
                      </div>
                      <span className="font-medium shrink-0">{item.totalPrice}€</span>
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

      <Dialog open={!!wizardTemplate} onOpenChange={(open) => { if (!open && wizardStep !== 3) setWizardTemplate(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0" data-testid="dialog-template-wizard">
          <DialogHeader className="sr-only">
            <DialogTitle>{wizardTemplate?.name}</DialogTitle>
            <DialogDescription>{lang === "de" ? "Bestellung aus Vorlage" : "Ordine da modello"}</DialogDescription>
          </DialogHeader>

          {wizardStep === 3 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6" data-testid="wizard-step-3">
              <div className="relative mb-6">
                <div className="h-24 w-24 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center animate-wizard-circle">
                  <Check className="h-12 w-12 text-green-600 dark:text-green-400 animate-wizard-check" />
                </div>
                <div className="absolute inset-0 h-24 w-24 rounded-full border-4 border-green-400 animate-wizard-ring" />
              </div>
              <h3 className="text-xl font-bold text-center mb-2 animate-wizard-fade-in">
                {lang === "de" ? "Zum Warenkorb hinzugefuegt!" : "Aggiunto al carrello!"}
              </h3>
              <p className="text-sm text-muted-foreground text-center animate-wizard-fade-in-delay">
                {lang === "de" ? "Sie werden zum Warenkorb weitergeleitet..." : "Verrai reindirizzato al carrello..."}
              </p>
              <div className="mt-6 flex gap-1 animate-wizard-fade-in-delay">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: "200ms" }} />
                <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: "400ms" }} />
              </div>
            </div>
          ) : (
            <>
              <div className="px-5 pt-5 pb-3">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-orange-500/10 shrink-0">
                    <ClipboardList className="h-5 w-5 text-orange-600" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-base truncate" data-testid="wizard-template-name">{wizardTemplate?.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {lang === "de" ? `Schritt ${wizardStep} von 2` : `Passo ${wizardStep} di 2`}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1.5 mb-2">
                  <div className={`h-1 flex-1 rounded-full transition-colors ${wizardStep >= 1 ? "bg-primary" : "bg-muted"}`} />
                  <div className={`h-1 flex-1 rounded-full transition-colors ${wizardStep >= 2 ? "bg-primary" : "bg-muted"}`} />
                </div>
              </div>

              {wizardStep === 1 && wizardTemplate && (
                <div className="px-5 pb-5 space-y-3" data-testid="wizard-step-1">
                  <p className="text-sm font-medium">
                    {lang === "de" ? "Mengen anpassen" : "Regola le quantita"}
                  </p>
                  <div className="space-y-2 max-h-[45vh] overflow-y-auto">
                    {wizardTemplate.items.filter(i => i.product.inStock !== false).map((item) => (
                      <div
                        key={item.productId}
                        className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border bg-card"
                        data-testid={`wizard-item-${item.productId}`}
                      >
                        {item.product.imageUrl ? (
                          <img src={item.product.imageUrl} alt="" className="h-9 w-9 rounded object-cover shrink-0" />
                        ) : (
                          <div className="h-9 w-9 rounded bg-muted flex items-center justify-center shrink-0">
                            <Package className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{item.product.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {item.product.supplier?.companyName || item.product.supplier?.name}
                            <span className="ml-1">{parseFloat(item.product.price).toFixed(2)}€/{item.product.unit}</span>
                          </p>
                        </div>
                        <QuantityInput
                          value={wizardQuantities[item.productId] || 1}
                          onChange={(val) => setWizardQuantities(prev => ({ ...prev, [item.productId]: val }))}
                          min={item.product.minOrderQuantity && item.product.minOrderQuantity > 1 ? item.product.minOrderQuantity : 1}
                          size="sm"
                          testIdPrefix={`wizard-qty-${item.productId}`}
                        />
                      </div>
                    ))}
                    {wizardTemplate.items.filter(i => i.product.inStock === false).length > 0 && (
                      <div className="pt-1">
                        <p className="text-xs text-muted-foreground mb-1">{lang === "de" ? "Nicht verfuegbar:" : "Non disponibile:"}</p>
                        {wizardTemplate.items.filter(i => i.product.inStock === false).map((item) => (
                          <div key={item.productId} className="flex items-center gap-2 text-xs text-muted-foreground/60 line-through py-0.5">
                            {item.product.imageUrl ? (
                              <img src={item.product.imageUrl} alt="" className="h-5 w-5 rounded object-cover shrink-0 opacity-50" />
                            ) : (
                              <div className="h-5 w-5 rounded bg-muted flex items-center justify-center shrink-0">
                                <Package className="h-2.5 w-2.5 text-muted-foreground" />
                              </div>
                            )}
                            <span>{item.quantity}x {item.product.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <div>
                      <span className="text-xs text-muted-foreground">{lang === "de" ? "Geschaetzt" : "Stimato"}: </span>
                      <span className="text-sm font-bold">
                        {Object.entries(wizardQuantities).reduce((sum, [pid, qty]) => {
                          const item = wizardTemplate.items.find(i => i.productId === pid);
                          return sum + (item ? parseFloat(item.product.price) * qty : 0);
                        }, 0).toFixed(2)}€
                      </span>
                    </div>
                    <Button size="sm" onClick={() => setWizardStep(2)} data-testid="wizard-next-step">
                      {lang === "de" ? "Weiter" : "Avanti"}
                      <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="px-5 pb-5 space-y-3" data-testid="wizard-step-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <p className="text-sm font-medium">
                      {lang === "de" ? "Empfohlene Produkte" : "Prodotti consigliati"}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {lang === "de" ? "Moechten Sie noch etwas hinzufuegen?" : "Vuoi aggiungere qualcos'altro?"}
                  </p>
                  {wizardRecommendedProducts.length > 0 ? (
                    <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                      {wizardRecommendedProducts.map((prod) => {
                        const isSelected = wizardSelectedRecommended.has(prod.id);
                        const hasPromo = !!prod.activePromotion;
                        const price = parseFloat(prod.price);
                        const discounted = hasPromo ? price * (1 - prod.activePromotion!.discountPercent / 100) : price;
                        return (
                          <div
                            key={prod.id}
                            className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors cursor-pointer ${
                              isSelected ? "border-green-400 bg-green-50 dark:bg-green-900/20" : "border-border bg-card"
                            }`}
                            onClick={() => {
                              setWizardSelectedRecommended(prev => {
                                const next = new Set(prev);
                                if (next.has(prod.id)) next.delete(prod.id);
                                else next.add(prod.id);
                                return next;
                              });
                              if (!wizardRecommendedQtys[prod.id]) {
                                const minQ = prod.minOrderQuantity && prod.minOrderQuantity > 1 ? prod.minOrderQuantity : 1;
                                setWizardRecommendedQtys(prev => ({ ...prev, [prod.id]: minQ }));
                              }
                            }}
                            data-testid={`wizard-rec-${prod.id}`}
                          >
                            <div className={`flex items-center justify-center h-5 w-5 rounded-full border-2 shrink-0 transition-colors ${
                              isSelected ? "border-green-500 bg-green-500" : "border-muted-foreground/30"
                            }`}>
                              {isSelected && <Check className="h-3 w-3 text-white" />}
                            </div>
                            {prod.imageUrl ? (
                              <img src={prod.imageUrl} alt="" className="h-9 w-9 rounded object-cover shrink-0" />
                            ) : (
                              <div className="h-9 w-9 rounded bg-muted flex items-center justify-center shrink-0">
                                <Package className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-medium truncate">{prod.name}</p>
                                {hasPromo && (
                                  <Badge variant="outline" className="text-[9px] border-green-300 text-green-600 px-1 py-0 shrink-0">
                                    -{prod.activePromotion!.discountPercent}%
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {prod.supplier?.companyName || prod.supplier?.name}
                                <span className="ml-1">
                                  {hasPromo ? (
                                    <><span className="line-through">{price.toFixed(2)}€</span> <span className="text-green-600 font-medium">{discounted.toFixed(2)}€</span></>
                                  ) : (
                                    <>{price.toFixed(2)}€</>
                                  )}
                                  /{prod.unit}
                                </span>
                              </p>
                            </div>
                            {isSelected && (
                              <div onClick={(e) => e.stopPropagation()}>
                                <QuantityInput
                                  value={wizardRecommendedQtys[prod.id] || 1}
                                  onChange={(val) => setWizardRecommendedQtys(prev => ({ ...prev, [prod.id]: val }))}
                                  min={prod.minOrderQuantity && prod.minOrderQuantity > 1 ? prod.minOrderQuantity : 1}
                                  size="sm"
                                  testIdPrefix={`wizard-rec-qty-${prod.id}`}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-6 text-center">
                      <p className="text-sm text-muted-foreground">{lang === "de" ? "Keine weiteren Empfehlungen" : "Nessun altro consiglio"}</p>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <Button variant="outline" size="sm" onClick={() => setWizardStep(1)} data-testid="wizard-back-step">
                      {lang === "de" ? "Zurueck" : "Indietro"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleWizardSubmit}
                      disabled={wizardSubmitting}
                      className="gap-1"
                      data-testid="wizard-submit"
                    >
                      {wizardSubmitting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <ShoppingCart className="h-3.5 w-3.5" />
                          {lang === "de" ? "In den Warenkorb" : "Aggiungi al carrello"}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
