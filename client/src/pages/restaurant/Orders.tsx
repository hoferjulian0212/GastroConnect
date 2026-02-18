import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ShoppingBag, Clock, Package, Truck, CheckCircle, XCircle, Store, X, Pencil, Minus, Plus, Trash2, MessageSquareText, Loader2, CalendarDays, Zap, Search, PackagePlus } from "lucide-react";
import type { OrderWithDetails, Product, DeliverySchedule } from "@shared/schema";
import { format, addDays, startOfDay } from "date-fns";
import { de, it } from "date-fns/locale";
import { Link, useSearch } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/context/LanguageContext";
import { useT, getOrderStatus } from "@/lib/translations";

interface EditableItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
}

export default function RestaurantOrders() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const t = useT(lang);
  const dateLocale = lang === "it" ? it : de;
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const highlightOrderId = searchParams.get("orderId");
  const highlightRef = useRef<HTMLDivElement>(null);

  const [filterSupplier, setFilterSupplier] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [detailOrder, setDetailOrder] = useState<OrderWithDetails | null>(null);
  const [editingOrder, setEditingOrder] = useState<OrderWithDetails | null>(null);
  const [editItems, setEditItems] = useState<EditableItem[]>([]);
  const [editProductSearch, setEditProductSearch] = useState("");
  const [editDeliveryOption, setEditDeliveryOption] = useState<"asap" | "date">("asap");
  const [editSelectedDeliveryDate, setEditSelectedDeliveryDate] = useState<string>("");
  const [changeRequestOrder, setChangeRequestOrder] = useState<OrderWithDetails | null>(null);
  const [changeRequestReason, setChangeRequestReason] = useState("");

  const { data: orders, isLoading } = useQuery<OrderWithDetails[]>({
    queryKey: [`/api/orders?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const editSupplierId = editingOrder?.supplierId;

  const { data: supplierProducts } = useQuery<Product[]>({
    queryKey: [`/api/products?supplierId=${editSupplierId}`],
    enabled: !!editSupplierId,
  });

  const { data: editDeliverySchedules } = useQuery<DeliverySchedule[]>({
    queryKey: [`/api/delivery-schedules/restaurant?supplierId=${editSupplierId}&restaurantId=${currentUser?.id}`],
    enabled: !!editSupplierId && !!currentUser?.id,
  });

  const editAllowedWeekdays = useMemo(() => {
    if (!editDeliverySchedules || editDeliverySchedules.length === 0) return [];
    return editDeliverySchedules.map(s => s.dayOfWeek);
  }, [editDeliverySchedules]);

  const editAvailableDeliveryDates = useMemo(() => {
    if (editAllowedWeekdays.length === 0) return [];
    const dates: { value: string; label: string }[] = [];
    const today = startOfDay(new Date());
    for (let i = 1; i <= 28; i++) {
      const date = addDays(today, i);
      if (editAllowedWeekdays.includes(date.getDay())) {
        dates.push({
          value: format(date, "yyyy-MM-dd"),
          label: format(date, "EEEE, dd. MMMM yyyy", { locale: dateLocale }),
        });
      }
    }
    return dates;
  }, [editAllowedWeekdays, dateLocale]);

  const addableProducts = useMemo(() => {
    if (!supplierProducts) return [];
    const existingProductIds = new Set(editItems.map(i => i.productId));
    return supplierProducts.filter(p => !existingProductIds.has(p.id) && p.inStock !== false);
  }, [supplierProducts, editItems]);

  const filteredAddableProducts = useMemo(() => {
    if (!editProductSearch.trim()) return addableProducts;
    const search = editProductSearch.toLowerCase();
    return addableProducts.filter(p => p.name.toLowerCase().includes(search));
  }, [addableProducts, editProductSearch]);

  const addProductToEdit = (product: Product) => {
    setEditItems(prev => [...prev, {
      id: `new-${product.id}`,
      productId: product.id,
      productName: product.name,
      quantity: 1,
      unitPrice: product.price,
      totalPrice: product.price,
    }]);
    setEditProductSearch("");
  };

  const updateOrderItemsMutation = useMutation({
    mutationFn: async ({ orderId, items, requestedDeliveryDate }: { orderId: string; items: EditableItem[]; requestedDeliveryDate?: string | null }) => {
      return await apiRequest("PATCH", `/api/orders/${orderId}/items`, {
        restaurantId: currentUser?.id,
        items: items.map(i => ({
          productId: i.productId,
          productName: i.productName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        requestedDeliveryDate,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ['/api/restaurant/stats', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/recent', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: [`/api/supplier/orders?supplierId=${editingOrder?.supplierId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/orders/recent'] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setEditingOrder(null);
      toast({ title: t("orders", "orderUpdated"), description: t("orders", "orderUpdatedDesc") });
    },
    onError: () => {
      toast({ title: t("common", "error"), description: t("orders", "orderUpdateError"), variant: "destructive" });
    },
  });

  const changeRequestMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      return await apiRequest("POST", `/api/orders/${orderId}/change-request`, {
        restaurantId: currentUser?.id,
        reason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders?restaurantId=${currentUser?.id}`] });
      setChangeRequestOrder(null);
      setChangeRequestReason("");
      toast({ title: t("orders", "changeRequestSent"), description: t("orders", "changeRequestSentDesc") });
    },
    onError: () => {
      toast({ title: t("common", "error"), description: t("orders", "changeRequestError"), variant: "destructive" });
    },
  });

  const uniqueSuppliers = useMemo(() => {
    if (!orders) return [];
    const map = new Map<string, string>();
    orders.forEach(o => {
      if (o.supplier?.id) {
        map.set(o.supplier.id, o.supplier.companyName || o.supplier.name || t("common", "unknown"));
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [orders]);

  const hasActiveFilters = filterSupplier !== "all" || filterDateFrom || filterDateTo;

  const clearFilters = () => {
    setFilterSupplier("all");
    setFilterDateFrom("");
    setFilterDateTo("");
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

  const getStatusLabel = (status: string) => getOrderStatus(status, lang);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending": return <Clock className="h-4 w-4" />;
      case "confirmed": return <Package className="h-4 w-4" />;
      case "in_delivery": return <Truck className="h-4 w-4" />;
      case "delivered": return <CheckCircle className="h-4 w-4" />;
      case "cancelled": return <XCircle className="h-4 w-4" />;
      default: return <ShoppingBag className="h-4 w-4" />;
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
      if (filterSupplier !== "all" && order.supplier?.id !== filterSupplier) return false;
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

  const openEditDialog = (order: OrderWithDetails) => {
    setEditItems(order.items.map(i => ({
      id: i.id,
      productId: i.productId,
      productName: i.productName,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      totalPrice: i.totalPrice,
    })));
    if (order.requestedDeliveryDate) {
      setEditDeliveryOption("date");
      setEditSelectedDeliveryDate(order.requestedDeliveryDate);
    } else {
      setEditDeliveryOption("asap");
      setEditSelectedDeliveryDate("");
    }
    setEditProductSearch("");
    setEditingOrder(order);
  };

  const updateEditItemQuantity = (index: number, delta: number) => {
    setEditItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const newQty = Math.max(1, item.quantity + delta);
      return { ...item, quantity: newQty, totalPrice: (parseFloat(item.unitPrice) * newQty).toFixed(2) };
    }));
  };

  const removeEditItem = (index: number) => {
    setEditItems(prev => prev.filter((_, i) => i !== index));
  };

  const editTotal = useMemo(() => {
    return editItems.reduce((sum, item) => sum + parseFloat(item.totalPrice), 0).toFixed(2);
  }, [editItems]);

  const canEditOrder = (order: OrderWithDetails) => order.status === "pending";
  const canRequestChange = (order: OrderWithDetails) => order.status === "confirmed";

  const OrderCard = ({ order }: { order: OrderWithDetails }) => {
    const isHighlighted = order.id === highlightOrderId;
    return (
    <div ref={isHighlighted ? highlightRef : undefined}>
    <div className={`overflow-hidden rounded-md cursor-pointer ${isHighlighted ? "ring-2 ring-primary shadow-md" : ""}`} onClick={() => setDetailOrder(order)} data-testid={`order-card-${order.id}`}>
      <Card className={`hover-elevate ${getStatusCardBg(order.status)}`}>
      <CardContent className="p-3 md:p-4">
        <div className="flex items-start justify-between gap-2 md:gap-4">
          <div className="flex items-start gap-2 md:gap-4">
            <div className={`flex h-10 w-10 md:h-12 md:w-12 shrink-0 items-center justify-center rounded-md ${getStatusColor(order.status)}`}>
              {getStatusIcon(order.status)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1 md:gap-2">
                <p className="font-medium text-sm md:text-base">{t("orders", "order")} #{order.id.slice(0, 8)}</p>
                <Badge className={`${getStatusColor(order.status)} text-xs`} variant="outline">
                  {getStatusLabel(order.status)}
                </Badge>
              </div>
              <p className="text-xs md:text-sm text-muted-foreground mt-1 truncate">
                {order.supplier?.companyName || order.supplier?.name || t("orders", "unknownSupplier")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(new Date(order.createdAt), "dd.MM.yyyy HH:mm", { locale: dateLocale })}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-base md:text-lg font-bold">{order.totalAmount}€</p>
            <p className="text-xs text-muted-foreground">
              {order.items?.length || 0} {t("common", "items")}
            </p>
          </div>
        </div>
        {order.items && order.items.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="space-y-2">
              {order.items.slice(0, 3).map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {item.quantity}x {item.productName}
                  </span>
                  <span>{item.totalPrice}€</span>
                </div>
              ))}
              {order.items.length > 3 && (
                <p className="text-xs text-muted-foreground">
                  + {order.items.length - 3} {t("orders", "moreItems")}
                </p>
              )}
            </div>
          </div>
        )}
        {(canEditOrder(order) || canRequestChange(order)) && (
          <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-2">
            {canEditOrder(order) && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); openEditDialog(order); }}
                data-testid={`button-edit-order-${order.id}`}
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                {t("orders", "editOrder")}
              </Button>
            )}
            {canRequestChange(order) && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); setChangeRequestOrder(order); }}
                data-testid={`button-change-request-${order.id}`}
              >
                <MessageSquareText className="h-3.5 w-3.5 mr-1.5" />
                {t("orders", "requestChange")}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
    </div>
    </div>
    );
  };

  const getComplaintCardBg = (status: string) => {
    switch (status) {
      case "open": return "bg-yellow-50/60 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800/40";
      case "in_progress": return "bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/40";
      case "resolved": return "bg-green-50/60 dark:bg-green-950/20 border-green-200 dark:border-green-800/40";
      case "closed": return "bg-muted/30 border-border";
      default: return "";
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">{t("common", "orders")}</h1>
        <p className="text-xs md:text-sm text-muted-foreground">{t("orders", "allOrdersOverview")}</p>
      </div>

      <Card>
        <CardContent className="p-3 md:p-4">
          <div className="flex flex-col sm:flex-row gap-2 md:gap-3 items-end">
            <div className="flex-1 w-full sm:w-auto">
              <label className="text-xs text-muted-foreground mb-1 block">{t("common", "supplier")}</label>
              <Select value={filterSupplier} onValueChange={setFilterSupplier}>
                <SelectTrigger className="h-9 text-xs md:text-sm" data-testid="filter-supplier">
                  <Store className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                  <SelectValue placeholder={t("common", "allSuppliers")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common", "allSuppliers")}</SelectItem>
                  {uniqueSuppliers.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
        </CardContent>
      </Card>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-5 lg:w-auto lg:inline-flex h-auto">
          <TabsTrigger value="all" className="text-xs md:text-sm py-1.5 md:py-2" data-testid="tab-all">{t("common", "all")}</TabsTrigger>
          <TabsTrigger value="pending" className="text-xs md:text-sm py-1.5 md:py-2" data-testid="tab-pending">{getOrderStatus("pending", lang)}</TabsTrigger>
          <TabsTrigger value="confirmed" className="text-xs md:text-sm py-1.5 md:py-2" data-testid="tab-confirmed">{getOrderStatus("confirmed", lang)}</TabsTrigger>
          <TabsTrigger value="in_delivery" className="text-xs md:text-sm py-1.5 md:py-2" data-testid="tab-delivery">{getOrderStatus("in_delivery", lang)}</TabsTrigger>
          <TabsTrigger value="delivered" className="text-xs md:text-sm py-1.5 md:py-2" data-testid="tab-delivered">{getOrderStatus("delivered", lang)}</TabsTrigger>
        </TabsList>

        {["all", "pending", "confirmed", "in_delivery", "delivered"].map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-4 md:mt-6">
            {isLoading ? (
              <div className="space-y-3 md:space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-40 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3 md:space-y-4">
                {filterOrders(tab === "all" ? null : tab).length > 0 ? (
                  filterOrders(tab === "all" ? null : tab).map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <ShoppingBag className="h-12 w-12 text-muted-foreground/50 mb-3" />
                      <p className="text-muted-foreground">{t("orders", "noOrdersFound")}</p>
                      <Button variant="outline" className="mt-4" asChild>
                        <Link href="/restaurant/catalog" data-testid="link-browse-catalog">
                          {t("common", "browseCatalog")}
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={!!detailOrder} onOpenChange={(open) => !open && setDetailOrder(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-order-detail">
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
                  <span className="ml-1">{getStatusLabel(detailOrder.status)}</span>
                </Badge>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("common", "supplier")}</span>
                  <span className="font-medium">{detailOrder.supplier?.companyName || detailOrder.supplier?.name || t("common", "unknown")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("orders", "createdAt")}</span>
                  <span>{format(new Date(detailOrder.createdAt), "dd.MM.yyyy HH:mm", { locale: dateLocale })}</span>
                </div>
                {detailOrder.requestedDeliveryDate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("orders", "requestedDeliveryDate")}</span>
                    <span>{new Date(detailOrder.requestedDeliveryDate + "T00:00:00").toLocaleDateString(lang === "it" ? "it-IT" : "de-DE", { weekday: "short", day: "2-digit", month: "long", year: "numeric" })}</span>
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
                  <p className="text-sm font-medium mb-1">{t("orders", "notes")}</p>
                  <p className="text-sm text-muted-foreground">{detailOrder.notes}</p>
                </div>
              )}

              <div className="border-t border-border pt-3 flex items-center justify-between">
                <span className="text-sm font-medium">{t("common", "total")}</span>
                <span className="text-lg font-bold" data-testid="text-detail-total">{detailOrder.totalAmount}€</span>
              </div>

              {(canEditOrder(detailOrder) || canRequestChange(detailOrder)) && (
                <div className="border-t border-border pt-3 flex flex-wrap gap-2">
                  {canEditOrder(detailOrder) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { const o = detailOrder; setDetailOrder(null); openEditDialog(o); }}
                      data-testid="button-detail-edit-order"
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      {t("orders", "editOrder")}
                    </Button>
                  )}
                  {canRequestChange(detailOrder) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { const o = detailOrder; setDetailOrder(null); setChangeRequestOrder(o); }}
                      data-testid="button-detail-change-request"
                    >
                      <MessageSquareText className="h-3.5 w-3.5 mr-1.5" />
                      {t("orders", "requestChange")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingOrder} onOpenChange={(open) => !open && setEditingOrder(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              {t("orders", "editOrder")}
            </DialogTitle>
            <DialogDescription>
              {t("orders", "order")} #{editingOrder?.id.slice(0, 8)} - {t("orders", "editOrderDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">{t("orders", "orderItems")}</Label>
              <div className="space-y-2">
                {editItems.map((item, index) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/50" data-testid={`edit-item-${item.productId}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">{parseFloat(item.unitPrice).toFixed(2)}€ {t("orders", "perUnit")}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => updateEditItemQuantity(index, -1)}
                        disabled={item.quantity <= 1}
                        data-testid={`button-decrease-${item.productId}`}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-8 text-center text-sm font-medium" data-testid={`text-quantity-${item.productId}`}>{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => updateEditItemQuantity(index, 1)}
                        data-testid={`button-increase-${item.productId}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeEditItem(index)}
                        disabled={editItems.length <= 1}
                        data-testid={`button-remove-${item.productId}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                    <span className="text-sm font-medium w-16 text-right">{item.totalPrice}€</span>
                  </div>
                ))}
              </div>
            </div>

            {addableProducts.length > 0 && (
              <div>
                <Label className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <PackagePlus className="h-3.5 w-3.5" />
                  {t("orders", "addProduct")}
                </Label>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder={t("orders", "searchProductsToAdd")}
                    value={editProductSearch}
                    onChange={(e) => setEditProductSearch(e.target.value)}
                    className="pl-8"
                    data-testid="input-search-add-product"
                  />
                </div>
                {(editProductSearch.trim() ? filteredAddableProducts : addableProducts.slice(0, 5)).length > 0 ? (
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {(editProductSearch.trim() ? filteredAddableProducts : addableProducts.slice(0, 5)).map(product => (
                      <div
                        key={product.id}
                        className="flex items-center justify-between gap-2 p-2 rounded-md hover-elevate cursor-pointer bg-muted/30"
                        onClick={() => addProductToEdit(product)}
                        data-testid={`add-product-${product.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{product.name}</p>
                          <p className="text-xs text-muted-foreground">{parseFloat(product.price).toFixed(2)}€ / {product.unit || t("common", "piece")}</p>
                        </div>
                        <Button variant="ghost" size="icon" data-testid={`button-add-product-${product.id}`}>
                          <Plus className="h-4 w-4 text-primary" />
                        </Button>
                      </div>
                    ))}
                    {!editProductSearch.trim() && addableProducts.length > 5 && (
                      <p className="text-xs text-muted-foreground text-center py-1">
                        {addableProducts.length - 5} {t("orders", "moreProductsAvailable")}
                      </p>
                    )}
                  </div>
                ) : editProductSearch.trim() ? (
                  <p className="text-xs text-muted-foreground py-2">{t("orders", "noMatchingProducts")}</p>
                ) : null}
              </div>
            )}

            <Separator />

            <div>
              <Label className="text-sm font-medium mb-2 flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                {t("orders", "requestedDeliveryDate")}
              </Label>
              <div className="space-y-2">
                <label
                  className={`flex items-center gap-2.5 p-2.5 rounded-md border cursor-pointer transition-colors ${
                    editDeliveryOption === "asap" ? "border-primary bg-primary/5" : "border-border"
                  }`}
                  data-testid="edit-radio-delivery-asap"
                >
                  <input
                    type="radio"
                    name="editDeliveryOption"
                    checked={editDeliveryOption === "asap"}
                    onChange={() => { setEditDeliveryOption("asap"); setEditSelectedDeliveryDate(""); }}
                    className="accent-primary"
                  />
                  <Zap className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm">{t("cart", "asap")}</span>
                </label>
                <label
                  className={`flex items-center gap-2.5 p-2.5 rounded-md border cursor-pointer transition-colors ${
                    editDeliveryOption === "date" ? "border-primary bg-primary/5" : "border-border"
                  }`}
                  data-testid="edit-radio-delivery-date"
                >
                  <input
                    type="radio"
                    name="editDeliveryOption"
                    checked={editDeliveryOption === "date"}
                    onChange={() => setEditDeliveryOption("date")}
                    className="accent-primary"
                  />
                  <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">{t("cart", "selectDeliveryDay")}</span>
                </label>
              </div>
              {editDeliveryOption === "date" && (
                <div className="pt-2">
                  {editAvailableDeliveryDates.length > 0 ? (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {editAvailableDeliveryDates.map(date => (
                        <label
                          key={date.value}
                          className={`flex items-center gap-2.5 p-2 rounded-md border cursor-pointer transition-colors text-sm ${
                            editSelectedDeliveryDate === date.value
                              ? "border-primary bg-primary/5"
                              : "border-border"
                          }`}
                          data-testid={`edit-delivery-date-${date.value}`}
                        >
                          <input
                            type="radio"
                            name="editDeliveryDate"
                            checked={editSelectedDeliveryDate === date.value}
                            onChange={() => setEditSelectedDeliveryDate(date.value)}
                            className="accent-primary"
                          />
                          <span>{date.label}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground py-2">
                      {t("cart", "noDeliveryDays")}
                    </p>
                  )}
                </div>
              )}
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("common", "total")}</span>
              <span className="text-lg font-bold" data-testid="text-edit-total">{editTotal}€</span>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingOrder(null)} data-testid="button-cancel-edit">
              {t("common", "cancel")}
            </Button>
            <Button
              onClick={() => {
                if (!editingOrder) return;
                const deliveryDate = editDeliveryOption === "date" && editSelectedDeliveryDate ? editSelectedDeliveryDate : null;
                updateOrderItemsMutation.mutate({ orderId: editingOrder.id, items: editItems, requestedDeliveryDate: deliveryDate });
              }}
              disabled={editItems.length === 0 || updateOrderItemsMutation.isPending || (editDeliveryOption === "date" && !editSelectedDeliveryDate)}
              data-testid="button-save-edit"
            >
              {updateOrderItemsMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("orders", "saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!changeRequestOrder} onOpenChange={(open) => { if (!open) { setChangeRequestOrder(null); setChangeRequestReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquareText className="h-5 w-5 text-primary" />
              {t("orders", "requestChange")}
            </DialogTitle>
            <DialogDescription>
              {t("orders", "order")} #{changeRequestOrder?.id.slice(0, 8)} {t("orders", "changeRequestDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("orders", "changeRequestReason")}</label>
              <Textarea
                placeholder={t("orders", "changeRequestReasonPlaceholder")}
                value={changeRequestReason}
                onChange={(e) => setChangeRequestReason(e.target.value)}
                className="resize-none"
                rows={3}
                data-testid="input-change-reason"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setChangeRequestOrder(null); setChangeRequestReason(""); }} data-testid="button-cancel-request">
              {t("common", "cancel")}
            </Button>
            <Button
              onClick={() => changeRequestOrder && changeRequestMutation.mutate({ orderId: changeRequestOrder.id, reason: changeRequestReason })}
              disabled={!changeRequestReason.trim() || changeRequestMutation.isPending}
              data-testid="button-send-request"
            >
              {changeRequestMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("orders", "sendRequest")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
