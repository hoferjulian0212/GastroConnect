import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ClipboardList, Clock, Package, Truck, CheckCircle, XCircle, Building2, FileText, Loader2, X, ShoppingBag, CalendarDays, Timer, Send, MessageSquare, Store } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import type { OrderWithDetails } from "@shared/schema";
import { format, formatDistanceToNow } from "date-fns";
import { de, it } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useSearch } from "wouter";
import { useLanguage } from "@/context/LanguageContext";
import { useT, getOrderStatus } from "@/lib/translations";

export default function SupplierOrders() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const t = useT(lang);
  const dateFnsLocale = lang === "de" ? de : it;
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const highlightOrderId = searchParams.get("orderId");
  const highlightRef = useRef<HTMLDivElement>(null);

  const [detailOrder, setDetailOrder] = useState<OrderWithDetails | null>(null);
  const [filterRestaurant, setFilterRestaurant] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [showMessageInput, setShowMessageInput] = useState(false);
  const [orderMessage, setOrderMessage] = useState("");

  const { data: orders, isLoading } = useQuery<OrderWithDetails[]>({
    queryKey: [`/api/supplier/orders?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const uniqueRestaurants = useMemo(() => {
    if (!orders) return [];
    const map = new Map<string, { id: string; name: string; profileImageUrl: string | null; orderCount: number }>();
    orders.forEach(o => {
      if (o.restaurant?.id) {
        const existing = map.get(o.restaurant.id);
        if (existing) {
          existing.orderCount++;
        } else {
          map.set(o.restaurant.id, {
            id: o.restaurant.id,
            name: o.restaurant.companyName || o.restaurant.name || t("common", "unknown"),
            profileImageUrl: o.restaurant.profileImageUrl || null,
            orderCount: 1,
          });
        }
      }
    });
    return Array.from(map.values());
  }, [orders, t]);

  const hasActiveFilters = filterRestaurant !== "all" || filterDateFrom || filterDateTo;

  const clearFilters = () => {
    setFilterRestaurant("all");
    setFilterDateFrom("");
    setFilterDateTo("");
  };

  const deliveryNoteMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiRequest("POST", `/api/orders/${orderId}/delivery-note`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/supplier/orders?supplierId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents", currentUser?.id, "supplier"] });
      toast({
        title: t("supplierOrders", "deliveryNoteCreated"),
        description: lang === "de" ? "Der Lieferschein wurde erfolgreich generiert und im Chat gesendet." : "La bolla di consegna è stata generata con successo e inviata in chat.",
      });
    },
    onError: (error: any) => {
      const msg = error?.message?.includes("already exists") 
        ? (lang === "de" ? "Ein Lieferschein existiert bereits für diese Bestellung." : "Una bolla di consegna esiste già per questo ordine.")
        : t("supplierOrders", "deliveryNoteError");
      toast({
        title: t("common", "error"),
        description: msg,
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      return apiRequest("PATCH", `/api/orders/${orderId}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/supplier/orders?supplierId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/stats', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/orders/recent', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/restaurant/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/recent'] });
      toast({
        title: t("supplierComplaints", "statusUpdated"),
        description: lang === "de" ? "Der Bestellstatus wurde erfolgreich aktualisiert." : "Lo stato dell'ordine è stato aggiornato con successo.",
      });
    },
    onError: () => {
      toast({
        title: t("common", "error"),
        description: t("supplierOrders", "statusUpdateError"),
        variant: "destructive",
      });
    },
  });

  const sendOrderMessageMutation = useMutation({
    mutationFn: async ({ order, message }: { order: OrderWithDetails; message: string }) => {
      const restaurantName = order.restaurant?.companyName || order.restaurant?.name || "";
      const refLabel = `${lang === "de" ? "Bestellung" : "Ordine"} #${order.id.substring(0, 8)} - ${restaurantName}`;
      return await apiRequest("POST", "/api/send-referenced-message", {
        senderId: currentUser?.id,
        restaurantId: order.restaurantId,
        supplierId: order.supplierId,
        message,
        referenceType: "order",
        referenceId: order.id,
        referenceLabel: refLabel,
      });
    },
    onSuccess: () => {
      toast({ title: lang === "de" ? "Nachricht gesendet" : "Messaggio inviato" });
      setOrderMessage("");
      setShowMessageInput(false);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
    },
    onError: () => {
      toast({ title: t("common", "error"), variant: "destructive" });
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

  const getStatusAccent = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-400 dark:bg-yellow-500";
      case "confirmed": return "bg-blue-400 dark:bg-blue-500";
      case "in_delivery": return "bg-purple-400 dark:bg-purple-500";
      case "delivered": return "bg-green-400 dark:bg-green-500";
      case "cancelled": return "bg-red-400 dark:bg-red-500";
      default: return "bg-muted-foreground";
    }
  };

  const getStatusCardBg = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-50/60 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800/40";
      case "confirmed": return "bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/40";
      case "in_delivery": return "bg-purple-50/60 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800/40";
      case "delivered": return "bg-green-50/60 dark:bg-green-950/20 border-green-200 dark:border-green-800/40";
      case "cancelled": return "bg-red-50/40 dark:bg-red-950/15 border-red-200 dark:border-red-800/40";
      default: return "";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending": return <Clock className="h-4 w-4" />;
      case "confirmed": return <Package className="h-4 w-4" />;
      case "in_delivery": return <Truck className="h-4 w-4" />;
      case "delivered": return <CheckCircle className="h-4 w-4" />;
      case "cancelled": return <XCircle className="h-4 w-4" />;
      default: return <ClipboardList className="h-4 w-4" />;
    }
  };

  useEffect(() => {
    if (highlightOrderId && highlightRef.current && !isLoading) {
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    }
  }, [highlightOrderId, isLoading]);

  useEffect(() => {
    if (highlightOrderId && orders) {
      const order = orders.find(o => o.id === highlightOrderId);
      if (order) setDetailOrder(order);
    }
  }, [highlightOrderId, orders]);

  const filterOrders = (status: string | null) => {
    if (!orders) return [];
    return orders.filter(order => {
      if (status && order.status !== status) return false;
      if (filterRestaurant !== "all" && order.restaurant?.id !== filterRestaurant) return false;
      if (filterDateFrom) {
        const from = new Date(filterDateFrom);
        from.setHours(0, 0, 0, 0);
        if (new Date(order.createdAt) < from) return false;
      }
      if (filterDateTo) {
        const to = new Date(filterDateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(order.createdAt) > to) return false;
      }
      return true;
    });
  };

  const statusSteps = ["pending", "confirmed", "in_delivery", "delivered"];

  const getStepIndex = (status: string) => {
    if (status === "cancelled") return -1;
    return statusSteps.indexOf(status);
  };

  const OrderCard = ({ order }: { order: OrderWithDetails }) => {
    const isHighlighted = order.id === highlightOrderId;
    const currentStep = getStepIndex(order.status);
    const isCancelled = order.status === "cancelled";
    const restaurantName = order.restaurant?.companyName || order.restaurant?.name || t("common", "unknown");
    const lastUpdate = order.updatedAt || order.createdAt;

    return (
    <div ref={isHighlighted ? highlightRef : undefined}>
    <div className={`overflow-hidden rounded-md cursor-pointer ${isHighlighted ? "ring-2 ring-primary shadow-md" : ""}`} onClick={() => setDetailOrder(order)} data-testid={`order-card-${order.id}`}>
      <Card className={`hover-elevate ${getStatusCardBg(order.status)}`}>
      <CardContent className="p-3 md:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm md:text-base" data-testid={`text-restaurant-${order.id}`}>
                {restaurantName}
              </p>
              <Badge className={`${getStatusColor(order.status)} text-[10px] md:text-xs`} variant="outline">
                {getStatusIcon(order.status)}
                <span className="ml-1">{getOrderStatus(order.status, lang, true)}</span>
              </Badge>
            </div>
            <div className="flex items-center gap-3 mt-1 text-[11px] md:text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <ShoppingBag className="h-3 w-3" />
                #{order.id.slice(0, 8)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(new Date(order.createdAt), "dd.MM.yy", { locale: dateFnsLocale })}
              </span>
              <span>
                {order.items?.length || 0} {lang === "de" ? "Artikel" : "articoli"}
              </span>
            </div>
          </div>
          <div className="text-right shrink-0" onClick={(e) => e.stopPropagation()}>
            <p className="text-base md:text-lg font-bold" data-testid={`text-total-${order.id}`}>{order.totalAmount}€</p>
            {order.status !== "delivered" && order.status !== "cancelled" && (
              <div className="flex flex-wrap gap-1.5">
                {order.status === "pending" && (
                  <Button size="sm" onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: "confirmed" })} disabled={updateStatusMutation.isPending} data-testid={`button-status-confirmed-${order.id}`}>
                    <CheckCircle className="h-3.5 w-3.5 mr-1" />
                    {lang === "de" ? "Bestätigen" : "Confermare"}
                  </Button>
                )}
                {order.status === "confirmed" && (
                  <Button size="sm" onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: "in_delivery" })} disabled={updateStatusMutation.isPending} data-testid={`button-status-in_delivery-${order.id}`}>
                    <Truck className="h-3.5 w-3.5 mr-1" />
                    {lang === "de" ? "In Lieferung" : "In consegna"}
                  </Button>
                )}
                {order.status === "in_delivery" && (
                  <Button size="sm" onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: "delivered" })} disabled={updateStatusMutation.isPending} data-testid={`button-status-delivered-${order.id}`}>
                    <Package className="h-3.5 w-3.5 mr-1" />
                    {lang === "de" ? "Geliefert" : "Consegnato"}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: "cancelled" })} disabled={updateStatusMutation.isPending} data-testid={`button-status-cancelled-${order.id}`}>
                  <XCircle className="h-3.5 w-3.5 mr-1 text-destructive" />
                  {lang === "de" ? "Stornieren" : "Annullare"}
                </Button>
              </div>
            )}
          </div>
        </div>

        {order.items && order.items.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border/30">
            <div className="space-y-1">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-xs md:text-sm" data-testid={`card-item-${item.id}`}>
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">{item.quantity}x</span> {item.productName}
                  </span>
                  <span className="text-muted-foreground shrink-0 ml-2">{item.totalPrice}€</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isCancelled && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center gap-0">
              {statusSteps.map((step, i) => {
                const isActive = i <= currentStep;
                const isCurrent = i === currentStep;
                return (
                  <div key={step} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center" data-testid={`status-step-${step}-${order.id}`}>
                      <div className={`flex items-center justify-center h-6 w-6 md:h-7 md:w-7 rounded-full border-2 transition-colors ${
                        isCurrent
                          ? `${getStatusAccent(step)} border-transparent`
                          : isActive
                            ? `${getStatusAccent(step)} border-transparent opacity-60`
                            : "bg-muted/50 border-border"
                      }`}>
                        {i === 0 && <Clock className={`h-3 w-3 ${isActive ? "text-white" : "text-muted-foreground"}`} />}
                        {i === 1 && <Package className={`h-3 w-3 ${isActive ? "text-white" : "text-muted-foreground"}`} />}
                        {i === 2 && <Truck className={`h-3 w-3 ${isActive ? "text-white" : "text-muted-foreground"}`} />}
                        {i === 3 && <CheckCircle className={`h-3 w-3 ${isActive ? "text-white" : "text-muted-foreground"}`} />}
                      </div>
                      <span className={`text-[9px] md:text-[10px] mt-0.5 text-center leading-tight ${isCurrent ? "font-semibold text-foreground" : isActive ? "text-muted-foreground" : "text-muted-foreground/50"}`}>
                        {getOrderStatus(step, lang, true)}
                      </span>
                    </div>
                    {i < statusSteps.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-1 rounded-full ${i < currentStep ? getStatusAccent(statusSteps[i + 1]) + " opacity-40" : "bg-border"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3 text-[11px] md:text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1" data-testid={`text-last-update-${order.id}`}>
              <CalendarDays className="h-3 w-3" />
              {lang === "de" ? "Aktualisiert" : "Aggiornato"}: {formatDistanceToNow(new Date(lastUpdate), { addSuffix: true, locale: dateFnsLocale })}
            </span>
            {order.requestedDeliveryDate && (
              <span className="flex items-center gap-1 text-primary font-medium" data-testid={`text-delivery-date-${order.id}`}>
                <Truck className="h-3 w-3" />
                {new Date(order.requestedDeliveryDate + "T00:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { day: "2-digit", month: "2-digit" })}
              </span>
            )}
            {order.notes && (
              <span className="text-[10px] md:text-xs italic truncate max-w-[200px]">
                "{order.notes}"
              </span>
            )}
          </div>
          {order.status === "in_delivery" && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); deliveryNoteMutation.mutate(order.id); }}
              disabled={deliveryNoteMutation.isPending}
              data-testid={`button-delivery-note-${order.id}`}
            >
              {deliveryNoteMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5 mr-1" />
              )}
              {t("supplierOrders", "createDeliveryNote")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
    </div>
    </div>
    );
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">{lang === "de" ? "Aufträge" : "Ordini"}</h1>
        <p className="text-sm md:text-base text-muted-foreground">{t("supplierOrders", "incomingOrders")}</p>
      </div>

      {uniqueRestaurants.length > 0 && (
        <div className="flex gap-2 md:gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          <button
            onClick={() => setFilterRestaurant("all")}
            className={`flex flex-col items-center gap-1.5 p-2.5 md:p-3 rounded-md border-2 transition-all shrink-0 min-w-[72px] md:min-w-[88px] ${
              filterRestaurant === "all"
                ? "border-primary bg-primary/10 dark:bg-primary/20"
                : "border-transparent bg-muted/50 dark:bg-muted/30"
            }`}
            data-testid="filter-restaurant-all"
          >
            <div className={`flex items-center justify-center h-10 w-10 md:h-12 md:w-12 rounded-full ${
              filterRestaurant === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}>
              <Store className="h-5 w-5 md:h-6 md:w-6" />
            </div>
            <span className={`text-[10px] md:text-xs font-medium leading-tight text-center line-clamp-1 ${
              filterRestaurant === "all" ? "text-primary" : "text-muted-foreground"
            }`}>
              {t("common", "all")}
            </span>
            <span className={`text-xs md:text-sm font-bold leading-none ${
              filterRestaurant === "all" ? "text-primary" : "text-foreground"
            }`}>
              {orders?.length || 0}
            </span>
          </button>
          {uniqueRestaurants.map(restaurant => {
            const isActive = filterRestaurant === restaurant.id;
            return (
              <button
                key={restaurant.id}
                onClick={() => setFilterRestaurant(restaurant.id)}
                className={`flex flex-col items-center gap-1.5 p-2.5 md:p-3 rounded-md border-2 transition-all shrink-0 min-w-[72px] md:min-w-[88px] ${
                  isActive
                    ? "border-primary bg-primary/10 dark:bg-primary/20"
                    : "border-transparent bg-muted/50 dark:bg-muted/30"
                }`}
                data-testid={`filter-restaurant-${restaurant.id}`}
              >
                <Avatar className={`h-10 w-10 md:h-12 md:w-12 ${isActive ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}>
                  <AvatarImage src={restaurant.profileImageUrl || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-sm md:text-base font-semibold">
                    {restaurant.name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className={`text-[10px] md:text-xs font-medium leading-tight text-center line-clamp-1 max-w-[64px] md:max-w-[80px] ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}>
                  {restaurant.name}
                </span>
                <span className={`text-xs md:text-sm font-bold leading-none ${
                  isActive ? "text-primary" : "text-foreground"
                }`}>
                  {restaurant.orderCount}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-row gap-2 md:gap-3 items-end">
        <div className="w-full sm:w-auto">
          <label className="text-xs text-muted-foreground mb-1 block">{t("common", "from")}</label>
          <Input
            type="date"
            value={filterDateFrom}
            onChange={e => setFilterDateFrom(e.target.value)}
            className="h-9 text-xs md:text-sm w-full sm:w-[150px]"
            data-testid="filter-date-from"
          />
        </div>
        <div className="w-full sm:w-auto">
          <label className="text-xs text-muted-foreground mb-1 block">{t("common", "to")}</label>
          <Input
            type="date"
            value={filterDateTo}
            onChange={e => setFilterDateTo(e.target.value)}
            className="h-9 text-xs md:text-sm w-full sm:w-[150px]"
            data-testid="filter-date-to"
          />
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="shrink-0" data-testid="button-clear-filters">
            <X className="h-3.5 w-3.5 mr-1" />
            {t("common", "reset")}
          </Button>
        )}
      </div>

      <Tabs defaultValue={highlightOrderId ? "all" : "pending"} className="w-full">
        <TabsList className="w-full overflow-x-auto flex md:grid md:grid-cols-6 lg:w-auto lg:inline-flex">
          <TabsTrigger value="pending" className="text-xs md:text-sm px-2 md:px-3" data-testid="tab-pending">
            {getOrderStatus("pending", lang, true)}
            {filterOrders("pending").length > 0 && (
              <Badge variant="secondary" className="ml-1 md:ml-2 text-[10px] md:text-xs px-1.5">
                {filterOrders("pending").length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="confirmed" className="text-xs md:text-sm px-2 md:px-3" data-testid="tab-confirmed">{getOrderStatus("confirmed", lang, true)}</TabsTrigger>
          <TabsTrigger value="in_delivery" className="text-xs md:text-sm px-2 md:px-3 whitespace-nowrap" data-testid="tab-delivery">{lang === "de" ? "Lieferung" : "Consegna"}</TabsTrigger>
          <TabsTrigger value="delivered" className="text-xs md:text-sm px-2 md:px-3" data-testid="tab-delivered">{getOrderStatus("delivered", lang, true)}</TabsTrigger>
          <TabsTrigger value="cancelled" className="text-xs md:text-sm px-2 md:px-3" data-testid="tab-cancelled">{getOrderStatus("cancelled", lang, true)}</TabsTrigger>
          <TabsTrigger value="all" className="text-xs md:text-sm px-2 md:px-3" data-testid="tab-all">{t("common", "all")}</TabsTrigger>
        </TabsList>

        {["pending", "confirmed", "in_delivery", "delivered", "cancelled", "all"].map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-4 md:mt-6">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-48" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {filterOrders(tab === "all" ? null : tab).length > 0 ? (
                  filterOrders(tab === "all" ? null : tab).map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <ClipboardList className="h-12 w-12 text-muted-foreground/50 mb-3" />
                      <p className="text-muted-foreground">{lang === "de" ? "Keine Bestellungen gefunden" : "Nessun ordine trovato"}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={!!detailOrder} onOpenChange={(open) => { if (!open) { setDetailOrder(null); setShowMessageInput(false); setOrderMessage(""); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-order-detail">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailOrder && getStatusIcon(detailOrder.status)}
              {lang === "de" ? "Auftrag" : "Ordine"} #{detailOrder?.id.slice(0, 8)}
            </DialogTitle>
            <DialogDescription>
              {lang === "de" ? "Auftragsdetails und Artikelübersicht" : "Dettagli ordine e panoramica articoli"}
            </DialogDescription>
          </DialogHeader>
          {detailOrder && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge className={`${getStatusColor(detailOrder.status)}`} variant="outline">
                  {getStatusIcon(detailOrder.status)}
                  <span className="ml-1">{getOrderStatus(detailOrder.status, lang, true)}</span>
                </Badge>
                {detailOrder.status !== "delivered" && detailOrder.status !== "cancelled" && (
                  <div className="flex flex-wrap gap-1.5">
                    {detailOrder.status === "pending" && (
                      <Button size="sm" onClick={() => { updateStatusMutation.mutate({ orderId: detailOrder.id, status: "confirmed" }); setDetailOrder({ ...detailOrder, status: "confirmed" }); }} disabled={updateStatusMutation.isPending} data-testid="button-status-confirmed">
                        <CheckCircle className="h-3.5 w-3.5 mr-1" />
                        {lang === "de" ? "Bestätigen" : "Confermare"}
                      </Button>
                    )}
                    {detailOrder.status === "confirmed" && (
                      <Button size="sm" onClick={() => { updateStatusMutation.mutate({ orderId: detailOrder.id, status: "in_delivery" }); setDetailOrder({ ...detailOrder, status: "in_delivery" }); }} disabled={updateStatusMutation.isPending} data-testid="button-status-in_delivery">
                        <Truck className="h-3.5 w-3.5 mr-1" />
                        {lang === "de" ? "In Lieferung" : "In consegna"}
                      </Button>
                    )}
                    {detailOrder.status === "in_delivery" && (
                      <Button size="sm" onClick={() => { updateStatusMutation.mutate({ orderId: detailOrder.id, status: "delivered" }); setDetailOrder({ ...detailOrder, status: "delivered" }); }} disabled={updateStatusMutation.isPending} data-testid="button-status-delivered">
                        <Package className="h-3.5 w-3.5 mr-1" />
                        {lang === "de" ? "Geliefert" : "Consegnato"}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => { updateStatusMutation.mutate({ orderId: detailOrder.id, status: "cancelled" }); setDetailOrder({ ...detailOrder, status: "cancelled" }); }} disabled={updateStatusMutation.isPending} data-testid="button-status-cancelled">
                      <XCircle className="h-3.5 w-3.5 mr-1 text-destructive" />
                      {lang === "de" ? "Stornieren" : "Annullare"}
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("common", "restaurant")}</span>
                  <span className="font-medium">{detailOrder.restaurant?.companyName || detailOrder.restaurant?.name || t("common", "unknown")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{lang === "de" ? "Bestellt am" : "Ordinato il"}</span>
                  <span>{format(new Date(detailOrder.createdAt), "dd.MM.yyyy HH:mm", { locale: dateFnsLocale })}</span>
                </div>
                {detailOrder.requestedDeliveryDate ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{lang === "de" ? "Gewünschter Liefertermin" : "Data consegna richiesta"}</span>
                    <span>{new Date(detailOrder.requestedDeliveryDate + "T00:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { weekday: "short", day: "2-digit", month: "long", year: "numeric" })}</span>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{lang === "de" ? "Gewünschter Liefertermin" : "Data consegna richiesta"}</span>
                    <span className="text-muted-foreground">{lang === "de" ? "Sobald wie möglich" : "Il prima possibile"}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-3">
                <p className="text-sm font-medium mb-2">{t("common", "items")} ({detailOrder.items?.length || 0})</p>
                <div className="space-y-2">
                  {detailOrder.items?.map((item) => (
                    <div key={item.id} className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50" data-testid={`detail-item-${item.id}`}>
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
                  <p className="text-sm font-medium mb-1">{lang === "de" ? "Anmerkungen" : "Note"}</p>
                  <p className="text-sm text-muted-foreground">{detailOrder.notes}</p>
                </div>
              )}

              <div className="border-t border-border pt-3 flex items-center justify-between">
                <span className="text-sm font-medium">{t("common", "total")}</span>
                <span className="text-lg font-bold" data-testid="text-detail-total">{detailOrder.totalAmount}€</span>
              </div>

              {detailOrder.status === "in_delivery" && (
                <div className="border-t border-border pt-3">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => deliveryNoteMutation.mutate(detailOrder.id)}
                    disabled={deliveryNoteMutation.isPending}
                    data-testid="button-detail-delivery-note"
                  >
                    {deliveryNoteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4 mr-2" />
                    )}
                    {deliveryNoteMutation.isPending ? (lang === "de" ? "Wird erstellt..." : "Creazione...") : t("supplierOrders", "createDeliveryNote")}
                  </Button>
                </div>
              )}

              <div className="border-t border-border pt-3">
                {!showMessageInput ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowMessageInput(true)}
                    data-testid="button-order-write-message"
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
                        data-testid="input-order-message"
                      />
                      <div className="flex flex-col gap-1">
                        <Button
                          size="icon"
                          onClick={() => detailOrder && sendOrderMessageMutation.mutate({ order: detailOrder, message: orderMessage.trim() })}
                          disabled={!orderMessage.trim() || sendOrderMessageMutation.isPending}
                          data-testid="button-send-order-message"
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
    </div>
  );
}
