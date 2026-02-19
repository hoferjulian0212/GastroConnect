import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingBag, MessageSquare, Package, Clock, Zap, Truck, User as UserIcon } from "lucide-react";
import type { OrderWithDetails } from "@shared/schema";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { format, formatDistanceToNow } from "date-fns";
import { de, it } from "date-fns/locale";
import { useLanguage } from "@/context/LanguageContext";
import { useT, getOrderStatus } from "@/lib/translations";

export default function RestaurantHome() {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);
  const [detailOrder, setDetailOrder] = useState<OrderWithDetails | null>(null);

  const { data: recentOrders, isLoading: ordersLoading } = useQuery<OrderWithDetails[]>({
    queryKey: ['/api/orders/recent', currentUser?.id],
    queryFn: async () => {
      const res = await fetch(`/api/orders/recent?restaurantId=${currentUser?.id}`);
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json();
    },
    enabled: !!currentUser?.id,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: stats, isLoading: statsLoading } = useQuery<{
    pendingOrders: number;
    unreadMessages: number;
    totalSuppliers: number;
  }>({
    queryKey: ['/api/restaurant/stats', currentUser?.id],
    queryFn: async () => {
      const res = await fetch(`/api/restaurant/stats?userId=${currentUser?.id}`);
      if (!res.ok) throw new Error('Failed to fetch stats');
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

  const dateLocale = lang === "it" ? it : de;

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
          <div>
            <CardTitle className="text-base md:text-lg">{t("common", "quickActions")}</CardTitle>
            <CardDescription className="text-xs md:text-sm">{t("common", "frequentFunctions")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          <div className="grid grid-cols-2 gap-2 md:gap-3">
            <Button variant="outline" className="h-auto flex-col py-3 md:py-4 gap-1.5 md:gap-2 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5" asChild>
              <Link href="/restaurant/catalog" data-testid="link-quick-catalog">
                <Package className="h-4 w-4 md:h-5 md:w-5" />
                <span className="text-xs md:text-sm">{t("common", "catalog")}</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col py-3 md:py-4 gap-1.5 md:gap-2 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5" asChild>
              <Link href="/restaurant/cart" data-testid="link-quick-cart">
                <ShoppingBag className="h-4 w-4 md:h-5 md:w-5" />
                <span className="text-xs md:text-sm">{t("common", "cart")}</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col py-3 md:py-4 gap-1.5 md:gap-2 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5" asChild>
              <Link href="/restaurant/inbox" data-testid="link-quick-inbox">
                <MessageSquare className="h-4 w-4 md:h-5 md:w-5" />
                <span className="text-xs md:text-sm">{t("common", "messages")}</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Link href="/restaurant/orders" data-testid="link-stat-orders">
          <Card className="cursor-pointer h-full transition-all duration-200 hover:shadow-md hover:-translate-y-px hover:scale-[1.003]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 gap-2 p-3 md:p-6">
              <CardTitle className="text-xs md:text-sm font-medium">{t("restaurantHome", "openOrders")}</CardTitle>
              <ShoppingBag className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
              {statsLoading ? (
                <Skeleton className="h-6 md:h-8 w-12 md:w-16" />
              ) : (
                <div className="text-xl md:text-2xl font-bold" data-testid="text-pending-orders">
                  {stats?.pendingOrders || 0}
                </div>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link href="/restaurant/inbox" data-testid="link-stat-messages">
          <Card className="cursor-pointer h-full transition-all duration-200 hover:shadow-md hover:-translate-y-px hover:scale-[1.003]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 gap-2 p-3 md:p-6">
              <CardTitle className="text-xs md:text-sm font-medium">{t("common", "messages")}</CardTitle>
              <MessageSquare className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
              {statsLoading ? (
                <Skeleton className="h-6 md:h-8 w-12 md:w-16" />
              ) : (
                <div className="text-xl md:text-2xl font-bold" data-testid="text-unread-messages">
                  {stats?.unreadMessages || 0}
                </div>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link href="/restaurant/suppliers">
          <Card className="transition-all duration-200 hover:shadow-md hover:-translate-y-px hover:scale-[1.003] cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 gap-2 p-3 md:p-6">
              <CardTitle className="text-xs md:text-sm font-medium">{t("restaurantHome", "activeSuppliers")}</CardTitle>
              <Package className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
              {statsLoading ? (
                <Skeleton className="h-6 md:h-8 w-12 md:w-16" />
              ) : (
                <div className="text-xl md:text-2xl font-bold" data-testid="text-total-suppliers">
                  {stats?.totalSuppliers || 0}
                </div>
              )}
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 gap-2 p-3 md:p-6">
            <CardTitle className="text-xs md:text-sm font-medium">{t("restaurantHome", "actions")}</CardTitle>
            <Zap className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-xs md:text-sm text-muted-foreground" data-testid="text-actions-placeholder">
              {t("common", "comingSoon")}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 md:p-6">
          <div>
            <CardTitle className="text-base md:text-lg">{t("common", "recentOrders")}</CardTitle>
            <CardDescription className="text-xs md:text-sm">{t("common", "yourLatestOrders")}</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="text-xs md:text-sm" asChild>
            <Link href="/restaurant/orders" data-testid="link-view-all-orders">{t("common", "all")}</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          {ordersLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : recentOrders && recentOrders.length > 0 ? (
            <div className="space-y-2 md:space-y-3">
              {recentOrders.slice(0, 5).map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between p-2.5 md:p-3 rounded-md bg-muted/50 cursor-pointer transition-all duration-200 hover:shadow-md hover:bg-muted"
                  onClick={() => setDetailOrder(order)}
                  data-testid={`order-item-${order.id}`}
                >
                  <div className="flex items-center gap-2.5 md:gap-3 min-w-0 flex-1">
                    <div className="hidden md:flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 shrink-0">
                      <ShoppingBag className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-xs md:text-sm font-medium">#{order.id.slice(0, 8)}</p>
                        <Badge className={`${getStatusColor(order.status)} text-[10px] md:text-xs px-1.5`} variant="outline">
                          {getOrderStatus(order.status, lang)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <UserIcon className="h-2.5 w-2.5 md:h-3 md:w-3 text-muted-foreground shrink-0" />
                        <p className="text-[10px] md:text-xs text-muted-foreground truncate">
                          {order.supplier?.companyName || order.supplier?.name || t("common", "unknown")}
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
                      {order.items?.length || 0} {t("common", "items")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <ShoppingBag className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">{t("common", "noOrders")}</p>
              <Button variant="outline" size="sm" className="mt-3" asChild>
                <Link href="/restaurant/catalog" data-testid="link-browse-catalog">{t("common", "browseCatalog")}</Link>
              </Button>
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
