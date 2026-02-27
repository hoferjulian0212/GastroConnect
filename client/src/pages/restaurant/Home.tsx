import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingBag, Package, Clock, Truck, User as UserIcon, Calendar } from "lucide-react";
import type { OrderWithDetails } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Link } from "wouter";
import { format, isToday, isTomorrow } from "date-fns";
import { de, it } from "date-fns/locale";
import { useLanguage } from "@/context/LanguageContext";
import { useT, getOrderStatus } from "@/lib/translations";

export default function RestaurantHome() {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);
  const [detailOrder, setDetailOrder] = useState<OrderWithDetails | null>(null);
  const dateLocale = lang === "it" ? it : de;

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

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground" data-testid="text-page-title">
          {t("common", "welcomeBack")}{currentUser?.companyName ? `, ${currentUser.companyName}` : ""}!
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          {t("common", "overviewToday")}
        </p>
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
