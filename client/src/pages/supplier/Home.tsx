import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, MessageSquare, Package, Euro, Clock, CheckCircle, AlertTriangle } from "lucide-react";
import type { Order, Product } from "@shared/schema";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { de, it } from "date-fns/locale";
import { useLanguage } from "@/context/LanguageContext";
import { useT, getOrderStatus } from "@/lib/translations";

export default function SupplierHome() {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);

  const { data: recentOrders, isLoading: ordersLoading } = useQuery<Order[]>({
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

  const { data: stats, isLoading: statsLoading } = useQuery<{
    newOrders: number;
    unreadMessages: number;
    totalProducts: number;
    monthlyRevenue: number;
  }>({
    queryKey: ['/api/supplier/stats', currentUser?.id],
    queryFn: async () => {
      const res = await fetch(`/api/supplier/stats?userId=${currentUser?.id}`);
      if (!res.ok) throw new Error('Failed to fetch stats');
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
              <Link href="/supplier/products" data-testid="link-quick-products">
                <Package className="h-4 w-4 md:h-5 md:w-5" />
                <span className="text-xs md:text-sm">{t("common", "products")}</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col py-3 md:py-4 gap-1.5 md:gap-2 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5" asChild>
              <Link href="/supplier/orders" data-testid="link-quick-orders">
                <ClipboardList className="h-4 w-4 md:h-5 md:w-5" />
                <span className="text-xs md:text-sm">{t("supplierHome", "tasks")}</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col py-3 md:py-4 gap-1.5 md:gap-2 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5" asChild>
              <Link href="/supplier/inbox" data-testid="link-quick-inbox">
                <MessageSquare className="h-4 w-4 md:h-5 md:w-5" />
                <span className="text-xs md:text-sm">{t("common", "messages")}</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col py-3 md:py-4 gap-1.5 md:gap-2 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5" asChild>
              <Link href="/supplier/orders" data-testid="link-quick-orders-all">
                <Clock className="h-4 w-4 md:h-5 md:w-5" />
                <span className="text-xs md:text-sm">{t("common", "orders")}</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Link href="/supplier/orders" data-testid="link-stat-orders">
          <Card className="cursor-pointer h-full transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 hover:scale-[1.01]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 gap-2 p-3 md:p-6">
              <CardTitle className="text-xs md:text-sm font-medium">{t("supplierHome", "newOrders")}</CardTitle>
              <ClipboardList className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
              {statsLoading ? (
                <Skeleton className="h-6 md:h-8 w-12 md:w-16" />
              ) : (
                <div className="text-xl md:text-2xl font-bold" data-testid="text-new-orders">
                  {stats?.newOrders || 0}
                </div>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link href="/supplier/inbox" data-testid="link-stat-messages">
          <Card className="cursor-pointer h-full transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 hover:scale-[1.01]">
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

        <Link href="/supplier/products" data-testid="link-stat-products">
          <Card className="cursor-pointer h-full transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 hover:scale-[1.01]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 gap-2 p-3 md:p-6">
              <CardTitle className="text-xs md:text-sm font-medium">{t("common", "products")}</CardTitle>
              <Package className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
              {statsLoading ? (
                <Skeleton className="h-6 md:h-8 w-12 md:w-16" />
              ) : (
                <div className="text-xl md:text-2xl font-bold" data-testid="text-total-products">
                  {stats?.totalProducts || 0}
                </div>
              )}
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 gap-2 p-3 md:p-6">
            <CardTitle className="text-xs md:text-sm font-medium">{t("supplierHome", "monthlyRevenue")}</CardTitle>
            <Euro className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            {statsLoading ? (
              <Skeleton className="h-6 md:h-8 w-12 md:w-16" />
            ) : (
              <div className="text-xl md:text-2xl font-bold" data-testid="text-monthly-revenue">
                {stats?.monthlyRevenue?.toFixed(2) || "0.00"}€
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {lowStockProducts && lowStockProducts.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 md:p-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 md:h-5 md:w-5 text-orange-500" />
              <div>
                <CardTitle className="text-base md:text-lg">{t("supplierHome", "lowStockAlerts")}</CardTitle>
                <CardDescription className="text-xs md:text-sm">{t("supplierHome", "lowStockAlertsDesc")}</CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" className="text-xs md:text-sm" asChild>
              <Link href="/supplier/products" data-testid="link-manage-stock">{t("common", "products")}</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="space-y-2 md:space-y-3">
              {lowStockProducts.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between p-2 md:p-3 rounded-md bg-orange-50 dark:bg-orange-950/20"
                  data-testid={`low-stock-item-${product.id}`}
                >
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="hidden md:flex h-9 w-9 items-center justify-center rounded-md bg-orange-100 dark:bg-orange-900/30">
                      <AlertTriangle className="h-4 w-4 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-xs md:text-sm font-medium">{product.name}</p>
                      <p className="text-[10px] md:text-xs text-muted-foreground">
                        {t("supplierHome", "threshold")}: {product.lowStockThreshold} {product.unit}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 text-[10px] md:text-xs">
                    {product.stockQuantity ?? 0} {product.unit} {t("supplierHome", "stockLeft")}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 md:p-6">
          <div>
            <CardTitle className="text-base md:text-lg">{t("supplierHome", "newOrders")}</CardTitle>
            <CardDescription className="text-xs md:text-sm">{t("supplierHome", "waitingForProcessing")}</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="text-xs md:text-sm" asChild>
            <Link href="/supplier/orders" data-testid="link-view-all-orders">{t("common", "all")}</Link>
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
                  className="flex items-center justify-between p-2 md:p-3 rounded-md bg-muted/50 cursor-pointer transition-all duration-200 hover:shadow-md hover:bg-muted"
                  data-testid={`order-item-${order.id}`}
                >
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="hidden md:flex h-9 w-9 items-center justify-center rounded-md bg-secondary/10">
                      <ClipboardList className="h-4 w-4 text-secondary" />
                    </div>
                    <div>
                      <p className="text-xs md:text-sm font-medium">#{order.id.slice(0, 8)}</p>
                      <p className="text-[10px] md:text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5 md:h-3 md:w-3" />
                        {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true, locale: lang === "de" ? de : it })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 md:gap-2">
                    <span className="text-xs md:text-sm font-medium">{order.totalAmount}€</span>
                    <Badge className={`${getStatusColor(order.status)} text-[10px] md:text-xs px-1.5 md:px-2`} variant="outline">
                      {getOrderStatus(order.status, lang, true)}
                    </Badge>
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
    </div>
  );
}
