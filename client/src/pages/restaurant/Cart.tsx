import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ShoppingCart, Trash2, Package, ArrowRight, CalendarDays, Truck, Tag, CheckCircle2, ShoppingBag, ClipboardList, Send, Loader2, Clock, StickyNote } from "lucide-react";
import QuantityInput from "@/components/QuantityInput";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CartItemWithProduct, DeliverySchedule, Promotion } from "@shared/schema";

type CartItemWithPromotion = CartItemWithProduct & { activePromotion?: Promotion | null };
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
import { Link } from "wouter";
import { format, addDays, startOfDay, parse } from "date-fns";
import { de, it } from "date-fns/locale";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";

export default function RestaurantCart() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const [orderNotes, setOrderNotes] = useState<Record<string, string>>({});
  const [deliveryOptions, setDeliveryOptions] = useState<Record<string, "asap" | "date">>({});
  const [selectedDeliveryDates, setSelectedDeliveryDates] = useState<Record<string, string>>({});
  const [calendarOpen, setCalendarOpen] = useState<Record<string, boolean>>({});
  const [orderConfirmation, setOrderConfirmation] = useState<{
    orderId: string;
    total: string;
    itemCount: number;
    suppliers: string[];
    deliveryDate: string | null;
    notes: string;
    createdAt: string;
  } | null>(null);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [sendingSupplier, setSendingSupplier] = useState<string | null>(null);
  const { lang } = useLanguage();
  const t = useT(lang);

  const { data: cartItems, isLoading } = useQuery<CartItemWithPromotion[]>({
    queryKey: [`/api/cart?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: movData } = useQuery<Record<string, { minimumValue: string; zone: string | null }>>({
    queryKey: [`/api/minimum-order-values/for-restaurant?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const updateQuantityMutation = useMutation({
    mutationFn: async ({ cartItemId, quantity }: { cartItemId: string; quantity: number }) => {
      return apiRequest("PATCH", `/api/cart/${cartItemId}`, { quantity });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async (cartItemId: string) => {
      return apiRequest("DELETE", `/api/cart/${cartItemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
      toast({
        title: t("cart", "itemRemoved"),
        description: t("cart", "itemRemovedDesc"),
      });
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const perSupplierDates: Record<string, string | null> = {};
      for (const sid of supplierIds) {
        perSupplierDates[sid] = deliveryOptions[sid] === "date" && selectedDeliveryDates[sid] ? selectedDeliveryDates[sid] : null;
      }
      const res = await apiRequest("POST", "/api/orders", {
        restaurantId: currentUser?.id,
        perSupplierNotes: orderNotes,
        deliveryDates: perSupplierDates,
        createdByUserId: currentUser?.id,
      });
      return res.json();
    },
    onSuccess: (data) => {
      const supplierNames = Object.values(groupedBySupplier || {}).map(g => g.supplier.companyName || g.supplier.name);
      const itemCount = cartItems?.length || 0;
      const orders = Array.isArray(data) ? data : [data];
      const orderId = orders.length === 1 ? orders[0]?.id?.slice(0, 8) : orders.map(o => o?.id?.slice(0, 8)).join(", ");
      const firstDeliveryDate = Object.values(selectedDeliveryDates).find(d => d) || null;
      const allNotes = Object.values(orderNotes).filter(n => n.trim()).join("; ");
      setOrderConfirmation({
        orderId: orderId || "",
        total: grandTotal,
        itemCount,
        suppliers: supplierNames,
        deliveryDate: firstDeliveryDate,
        notes: allNotes,
        createdAt: new Date().toISOString(),
      });
      setTimeout(() => setConfirmationVisible(true), 50);
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/orders?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/restaurant/stats', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/recent', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/orders/recent'] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
    },
    onError: () => {
      toast({
        title: t("common", "error"),
        description: t("cart", "orderError"),
        variant: "destructive",
      });
    },
  });

  const createSupplierOrderMutation = useMutation({
    mutationFn: async (supplierId: string) => {
      setSendingSupplier(supplierId);
      const deliveryDate = deliveryOptions[supplierId] === "date" && selectedDeliveryDates[supplierId] ? selectedDeliveryDates[supplierId] : null;
      const res = await apiRequest("POST", "/api/orders", {
        restaurantId: currentUser?.id,
        supplierId,
        notes: orderNotes[supplierId] || "",
        requestedDeliveryDate: deliveryDate,
        createdByUserId: currentUser?.id,
      });
      return res.json();
    },
    onSuccess: (data, supplierId) => {
      setSendingSupplier(null);
      const supplierGroup = groupedBySupplier?.[supplierId];
      const supplierName = supplierGroup?.supplier.companyName || supplierGroup?.supplier.name || "";
      toast({
        title: t("cart", "orderSentTitle"),
        description: `${supplierName}`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/orders?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/restaurant/stats', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/recent', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
    },
    onError: () => {
      setSendingSupplier(null);
      toast({
        title: t("common", "error"),
        description: t("cart", "orderError"),
        variant: "destructive",
      });
    },
  });

  const supplierIds = useMemo(() => {
    if (!cartItems) return [];
    return Array.from(new Set(cartItems.map(item => item.supplierId)));
  }, [cartItems]);

  const supplierScheduleKey = supplierIds.sort().join(",");
  const { data: allDeliverySchedules } = useQuery<Record<string, DeliverySchedule[]>>({
    queryKey: ["/api/delivery-schedules/cart", currentUser?.id, supplierScheduleKey],
    queryFn: async () => {
      if (supplierIds.length === 0) return {};
      const results: Record<string, DeliverySchedule[]> = {};
      await Promise.all(
        supplierIds.map(async (supplierId) => {
          const res = await fetch(`/api/delivery-schedules/restaurant?supplierId=${supplierId}&restaurantId=${currentUser?.id}`);
          if (res.ok) {
            results[supplierId] = await res.json();
          }
        })
      );
      return results;
    },
    enabled: !!currentUser?.id && supplierIds.length > 0,
  });

  const dateLocale = lang === "it" ? it : de;

  const perSupplierDeliveryDates = useMemo(() => {
    if (!allDeliverySchedules) return {};
    const result: Record<string, { value: string; label: string }[]> = {};
    for (const sid of supplierIds) {
      const schedules = allDeliverySchedules[sid] || [];
      const weekdays = schedules.map(s => s.dayOfWeek);
      if (weekdays.length === 0) {
        result[sid] = [];
        continue;
      }
      const timeByDay: Record<number, { from: string; to: string }> = {};
      for (const s of schedules) {
        if (s.deliveryTimeFrom && s.deliveryTimeTo) {
          timeByDay[s.dayOfWeek] = { from: s.deliveryTimeFrom, to: s.deliveryTimeTo };
        }
      }
      const dates: { value: string; label: string }[] = [];
      const today = startOfDay(new Date());
      for (let i = 1; i <= 28; i++) {
        const date = addDays(today, i);
        if (weekdays.includes(date.getDay())) {
          let label = format(date, "EEEE, dd. MMMM yyyy", { locale: dateLocale });
          const tw = timeByDay[date.getDay()];
          if (tw) {
            label += ` (${tw.from} - ${tw.to})`;
          }
          dates.push({ value: format(date, "yyyy-MM-dd"), label });
        }
      }
      result[sid] = dates;
    }
    return result;
  }, [allDeliverySchedules, supplierIds, dateLocale]);

  const perSupplierAllowedWeekdays = useMemo(() => {
    if (!allDeliverySchedules) return {};
    const result: Record<string, number[]> = {};
    for (const sid of supplierIds) {
      const schedules = allDeliverySchedules[sid] || [];
      result[sid] = schedules.map(s => s.dayOfWeek);
    }
    return result;
  }, [allDeliverySchedules, supplierIds]);

  const getEffectivePrice = (item: CartItemWithPromotion) => {
    const originalPrice = parseFloat(item.product.price);
    if (item.activePromotion) {
      return originalPrice * (1 - item.activePromotion.discountPercent / 100);
    }
    return originalPrice;
  };

  const groupedBySupplier = useMemo(() => {
    if (!cartItems) return undefined;
    const sorted = [...cartItems].sort((a, b) => a.id.localeCompare(b.id));
    const groups: Record<string, { supplier: typeof cartItems[0]["supplier"]; items: CartItemWithPromotion[] }> = {};
    for (const item of sorted) {
      if (!groups[item.supplierId]) {
        groups[item.supplierId] = { supplier: item.supplier, items: [] };
      }
      groups[item.supplierId].items.push(item);
    }
    return groups;
  }, [cartItems]);

  const calculateTotal = (items: CartItemWithPromotion[]) => {
    return items.reduce((total, item) => total + getEffectivePrice(item) * item.quantity, 0).toFixed(2);
  };

  const getSupplierMov = (supplierId: string): number => {
    if (!movData || !movData[supplierId]) return 0;
    return parseFloat(movData[supplierId].minimumValue) || 0;
  };

  const isBelowMov = (supplierId: string, items: CartItemWithPromotion[]): boolean => {
    const mov = getSupplierMov(supplierId);
    if (mov <= 0) return false;
    const total = items.reduce((sum, item) => sum + getEffectivePrice(item) * item.quantity, 0);
    return total < mov;
  };

  const grandTotal = cartItems?.reduce(
    (total, item) => total + getEffectivePrice(item) * item.quantity,
    0
  ).toFixed(2) || "0.00";

  const dateLocaleObj = lang === "it" ? it : de;

  if (orderConfirmation) {
    return (
      <div className={`flex items-center justify-center min-h-[60vh] transition-all duration-500 ${confirmationVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <div className="w-full max-w-md mx-auto text-center space-y-6">
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 mx-auto transition-all duration-700 ${confirmationVisible ? "scale-100" : "scale-0"}`}>
            <CheckCircle2 className={`h-10 w-10 text-green-600 dark:text-green-400 transition-all duration-500 delay-300 ${confirmationVisible ? "scale-100 opacity-100" : "scale-0 opacity-0"}`} />
          </div>

          <div className={`space-y-2 transition-all duration-500 delay-200 ${confirmationVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            <h1 className="text-2xl font-bold" data-testid="text-order-sent-title">{t("cart", "orderSentTitle")}</h1>
            <p className="text-muted-foreground text-sm">{t("cart", "orderSentDesc")}</p>
          </div>

          <Card className={`text-left transition-all duration-500 delay-400 ${confirmationVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-center gap-3 py-1">
                <span className="text-sm text-muted-foreground shrink-0">{t("cart", "orderNumber")}</span>
                <span className="text-sm font-mono font-medium truncate" data-testid="text-order-id">#{orderConfirmation.orderId}</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center gap-3 py-1">
                <span className="text-sm text-muted-foreground shrink-0">{t("cart", "orderDate")}</span>
                <span className="text-sm font-medium shrink-0">{format(new Date(orderConfirmation.createdAt), "dd. MMM yyyy, HH:mm", { locale: dateLocaleObj })}</span>
              </div>
              <Separator />
              <div className="flex justify-between items-start gap-4 py-1">
                <span className="text-sm text-muted-foreground shrink-0">{t("common", "suppliers")}</span>
                <div className="flex flex-col items-end gap-0.5">
                  {orderConfirmation.suppliers.map((name, i) => (
                    <span key={i} className="text-sm font-medium">{name}</span>
                  ))}
                </div>
              </div>
              <Separator />
              <div className="flex justify-between items-center gap-3 py-1">
                <span className="text-sm text-muted-foreground shrink-0">{t("common", "items")}</span>
                <span className="text-sm font-medium">{orderConfirmation.itemCount}</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center gap-3 py-1">
                <span className="text-sm text-muted-foreground shrink-0">{t("cart", "deliveryDateLabel")}</span>
                <span className="text-sm font-medium text-right truncate">
                  {orderConfirmation.deliveryDate
                    ? format(new Date(orderConfirmation.deliveryDate), "dd. MMM yyyy", { locale: dateLocaleObj })
                    : t("cart", "asapDelivery")}
                </span>
              </div>
              {orderConfirmation.notes && (
                <>
                  <Separator />
                  <div className="flex justify-between items-start gap-4 py-1">
                    <span className="text-sm text-muted-foreground shrink-0">{t("cart", "notesLabel")}</span>
                    <span className="text-sm text-right">{orderConfirmation.notes}</span>
                  </div>
                </>
              )}
              <Separator />
              <div className="flex justify-between items-center gap-3 py-1">
                <span className="text-sm font-medium shrink-0">{t("common", "total")}</span>
                <span className="text-lg font-bold shrink-0" data-testid="text-order-total">{orderConfirmation.total}€</span>
              </div>
            </CardContent>
          </Card>

          <div className={`flex flex-col sm:flex-row gap-3 transition-all duration-500 delay-500 ${confirmationVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            <Button className="flex-1 gap-2" asChild>
              <Link href="/restaurant/orders" data-testid="link-view-orders">
                <ClipboardList className="h-4 w-4" />
                {t("cart", "viewOrders")}
              </Link>
            </Button>
            <Button variant="outline" className="flex-1 gap-2" asChild>
              <Link href="/restaurant/catalog" data-testid="link-continue-shopping">
                <ShoppingBag className="h-4 w-4" />
                {t("cart", "continueShopping")}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : cartItems && cartItems.length > 0 ? (
        <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-3 md:space-y-4">
            {Object.entries(groupedBySupplier || {}).map(([supplierId, { supplier, items }]) => (
              <Card key={supplierId} data-testid={`cart-supplier-${supplierId}`}>
                <CardHeader className="pb-2 md:pb-3 p-3 md:p-6">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-md bg-secondary/20">
                      <Package className="h-4 w-4 md:h-5 md:w-5 text-secondary" />
                    </div>
                    <div>
                      <CardTitle className="text-base md:text-lg">{supplier.companyName || supplier.name}</CardTitle>
                      <CardDescription className="text-xs md:text-sm">{items.length} {t("common", "items")}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
                  <div className="space-y-2 md:space-y-4">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-md bg-muted/50"
                        data-testid={`cart-item-${item.id}`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {item.product.imageUrl ? (
                            <img src={item.product.imageUrl} alt={item.product.name} className="h-10 w-10 md:h-12 md:w-12 rounded-md object-cover shrink-0" />
                          ) : (
                            <div className="flex h-10 w-10 md:h-12 md:w-12 shrink-0 items-center justify-center rounded-md bg-muted">
                              <Package className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm md:text-base truncate">{item.product.name}</p>
                            {item.activePromotion ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs md:text-sm text-muted-foreground line-through">
                                  {item.product.price}€
                                </span>
                                <span className="text-xs md:text-sm font-medium text-green-600 dark:text-green-400">
                                  {getEffectivePrice(item).toFixed(2)}€/{item.product.unit}
                                </span>
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 px-1 rounded">
                                  <Tag className="h-2.5 w-2.5" />
                                  -{item.activePromotion.discountPercent}%
                                </span>
                              </div>
                            ) : (
                              <p className="text-xs md:text-sm text-muted-foreground">
                                {item.product.price}€/{item.product.unit}
                              </p>
                            )}
                            {item.product?.minOrderQuantity && item.product.minOrderQuantity > 1 && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {t("supplierProducts", "minOrderQuantityShort")} {item.product.minOrderQuantity} {item.product.unit}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-2 md:gap-3">
                          <QuantityInput
                            value={item.quantity}
                            onChange={(val) => updateQuantityMutation.mutate({ cartItemId: item.id, quantity: val })}
                            min={item.product?.minOrderQuantity || 1}
                            disabled={updateQuantityMutation.isPending}
                            size="md"
                            testIdPrefix={`qty-${item.id}`}
                          />
                          <span className="font-medium text-sm md:text-base w-16 md:w-20 text-right">
                            {(getEffectivePrice(item) * item.quantity).toFixed(2)}€
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItemMutation.mutate(item.id)}
                            disabled={removeItemMutation.isPending}
                            data-testid={`button-remove-${item.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
                <div className="border-t border-border px-3 md:px-6 py-3 md:py-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
                      <CalendarDays className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <Label className="text-xs md:text-sm font-semibold">
                      {t("cart", "deliveryDate")}
                    </Label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                        (deliveryOptions[supplierId] || "asap") === "asap"
                          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 shadow-sm"
                          : "border-border hover:border-muted-foreground/30"
                      }`}
                      onClick={() => {
                        setDeliveryOptions(prev => ({ ...prev, [supplierId]: "asap" }));
                        setSelectedDeliveryDates(prev => ({ ...prev, [supplierId]: "" }));
                      }}
                      data-testid={`radio-delivery-asap-${supplierId}`}
                    >
                      <div className={`flex items-center justify-center h-8 w-8 rounded-full transition-colors ${
                        (deliveryOptions[supplierId] || "asap") === "asap"
                          ? "bg-indigo-100 dark:bg-indigo-800/30"
                          : "bg-muted"
                      }`}>
                        <Clock className={`h-4 w-4 ${
                          (deliveryOptions[supplierId] || "asap") === "asap"
                            ? "text-indigo-600 dark:text-indigo-400"
                            : "text-muted-foreground"
                        }`} />
                      </div>
                      <span className={`text-xs font-medium ${
                        (deliveryOptions[supplierId] || "asap") === "asap"
                          ? "text-indigo-700 dark:text-indigo-300"
                          : "text-muted-foreground"
                      }`}>{t("cart", "asap")}</span>
                    </button>
                    <Popover
                      open={calendarOpen[supplierId] || false}
                      onOpenChange={(open) => {
                        setCalendarOpen(prev => ({ ...prev, [supplierId]: open }));
                        if (open) setDeliveryOptions(prev => ({ ...prev, [supplierId]: "date" }));
                      }}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                            deliveryOptions[supplierId] === "date"
                              ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 shadow-sm"
                              : "border-border hover:border-muted-foreground/30"
                          }`}
                          data-testid={`radio-delivery-date-${supplierId}`}
                        >
                          <div className={`flex items-center justify-center h-8 w-8 rounded-full transition-colors ${
                            deliveryOptions[supplierId] === "date"
                              ? "bg-indigo-100 dark:bg-indigo-800/30"
                              : "bg-muted"
                          }`}>
                            <Truck className={`h-4 w-4 ${
                              deliveryOptions[supplierId] === "date"
                                ? "text-indigo-600 dark:text-indigo-400"
                                : "text-muted-foreground"
                            }`} />
                          </div>
                          <span className={`text-xs font-medium ${
                            deliveryOptions[supplierId] === "date"
                              ? "text-indigo-700 dark:text-indigo-300"
                              : "text-muted-foreground"
                          }`}>{t("cart", "selectDeliveryDay")}</span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="center" sideOffset={8}>
                        {(perSupplierAllowedWeekdays[supplierId] || []).length > 0 ? (
                          <Calendar
                            mode="single"
                            selected={selectedDeliveryDates[supplierId] ? parse(selectedDeliveryDates[supplierId], "yyyy-MM-dd", new Date()) : undefined}
                            onSelect={(date) => {
                              if (date) {
                                setSelectedDeliveryDates(prev => ({ ...prev, [supplierId]: format(date, "yyyy-MM-dd") }));
                                setCalendarOpen(prev => ({ ...prev, [supplierId]: false }));
                              }
                            }}
                            disabled={(date) => {
                              const today = startOfDay(new Date());
                              if (date <= today) return true;
                              const maxDate = addDays(today, 28);
                              if (date > maxDate) return true;
                              const allowedDays = perSupplierAllowedWeekdays[supplierId] || [];
                              return !allowedDays.includes(date.getDay());
                            }}
                            locale={dateLocale}
                            fromDate={addDays(new Date(), 1)}
                            toDate={addDays(new Date(), 28)}
                            data-testid={`calendar-${supplierId}`}
                          />
                        ) : (
                          <div className="p-4 text-center">
                            <p className="text-xs text-muted-foreground">
                              {t("cart", "noDeliveryDays")}
                            </p>
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                  </div>
                  {deliveryOptions[supplierId] === "date" && selectedDeliveryDates[supplierId] && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800" data-testid={`selected-date-${supplierId}`}>
                      <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                      <span className="text-sm font-medium text-green-800 dark:text-green-300">
                        {format(parse(selectedDeliveryDates[supplierId], "yyyy-MM-dd", new Date()), "EEEE, dd. MMMM yyyy", { locale: dateLocale })}
                      </span>
                    </div>
                  )}
                  <div className="relative mt-4 pt-3 border-t border-border/50">
                    <StickyNote className="absolute left-2.5 top-[calc(0.75rem+10px)] h-3.5 w-3.5 text-amber-500/60 dark:text-amber-400/60 pointer-events-none" />
                    <Textarea
                      placeholder={t("cart", "orderNotesPlaceholder")}
                      value={orderNotes[supplierId] || ""}
                      onChange={(e) => setOrderNotes(prev => ({ ...prev, [supplierId]: e.target.value }))}
                      className="resize-none text-xs min-h-0 pl-8"
                      rows={2}
                      data-testid={`textarea-order-notes-${supplierId}`}
                    />
                  </div>
                </div>
                {isBelowMov(supplierId, items) && (
                  <div className="border-t border-red-200 bg-red-50 dark:bg-red-900/10 px-3 md:px-6 py-2">
                    <p className="text-xs text-red-600 dark:text-red-400 font-medium" data-testid={`mov-warning-${supplierId}`}>
                      {t("cart", "belowMinOrderValue").replace("{min}", getSupplierMov(supplierId).toFixed(2))}
                    </p>
                  </div>
                )}
                {getSupplierMov(supplierId) > 0 && !isBelowMov(supplierId, items) && (
                  <div className="border-t border-border px-3 md:px-6 py-1.5">
                    <p className="text-[10px] text-muted-foreground">
                      {t("cart", "minimumOrderValue")}: {getSupplierMov(supplierId).toFixed(2)} EUR
                    </p>
                  </div>
                )}
                <CardFooter className="border-t border-border pt-3 md:pt-4 p-3 md:p-6">
                  <div className="flex items-center justify-between w-full gap-3">
                    <div className="flex items-center gap-2 text-sm md:text-base">
                      <span className="text-muted-foreground">{t("common", "subtotal")}</span>
                      <span className="font-medium">{calculateTotal(items)}€</span>
                    </div>
                    {Object.keys(groupedBySupplier || {}).length > 1 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs md:text-sm shrink-0"
                        onClick={() => createSupplierOrderMutation.mutate(supplierId)}
                        disabled={createSupplierOrderMutation.isPending || createOrderMutation.isPending || isBelowMov(supplierId, items) || (deliveryOptions[supplierId] === "date" && !selectedDeliveryDates[supplierId] && (perSupplierDeliveryDates[supplierId] || []).length > 0)}
                        data-testid={`button-send-supplier-${supplierId}`}
                      >
                        {sendingSupplier === supplierId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        <span className="hidden sm:inline">{t("cart", "sendToSupplier")}</span>
                      </Button>
                    )}
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>

          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardHeader className="p-3 md:p-6">
                <CardTitle className="text-base md:text-lg">{t("cart", "orderSummary")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 md:space-y-4 p-3 pt-0 md:p-6 md:pt-0">
                <div className="space-y-2">
                  {Object.entries(groupedBySupplier || {}).map(([supplierId, { supplier, items }]) => (
                    <div key={supplierId} className="flex justify-between gap-3 text-sm">
                      <span className="text-muted-foreground truncate min-w-0">{supplier.companyName || supplier.name}</span>
                      <span className="shrink-0">{calculateTotal(items)}€</span>
                    </div>
                  ))}
                </div>
                <Separator />
                <div className="flex justify-between gap-3 font-bold text-base md:text-lg">
                  <span className="shrink-0">{t("common", "total")}</span>
                  <span className="shrink-0" data-testid="text-total-amount">{grandTotal}€</span>
                </div>
              </CardContent>
              <CardFooter className="p-3 md:p-6">
                <Button
                  className="w-full gap-2 text-sm md:text-base"
                  size="default"
                  onClick={() => createOrderMutation.mutate()}
                  disabled={createOrderMutation.isPending || createSupplierOrderMutation.isPending || supplierIds.some(sid => isBelowMov(sid, (groupedBySupplier || {})[sid]?.items || [])) || supplierIds.some(sid => deliveryOptions[sid] === "date" && !selectedDeliveryDates[sid] && (perSupplierDeliveryDates[sid] || []).length > 0)}
                  data-testid="button-checkout"
                >
                  {Object.keys(groupedBySupplier || {}).length > 1 ? t("cart", "placeAllOrders") : t("cart", "placeOrder")}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ShoppingCart className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h2 className="text-xl font-medium">{t("cart", "emptyCart")}</h2>
            <p className="text-muted-foreground mt-1">
              {t("cart", "addFromCatalog")}
            </p>
            <Button className="mt-4" asChild>
              <Link href="/restaurant/catalog" data-testid="link-browse-catalog">
                {t("cart", "goToCatalog")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
