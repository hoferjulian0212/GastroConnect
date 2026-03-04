import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, Clock, CheckCircle, ShoppingBag, User as UserIcon } from "lucide-react";
import type { OrderWithDetails } from "@shared/schema";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNow } from "date-fns";
import { de, it } from "date-fns/locale";
import { useLanguage } from "@/context/LanguageContext";
import { useT, getOrderStatus } from "@/lib/translations";

export default function SupplierHome() {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);

  const dateLocale = lang === "de" ? de : it;

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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : recentOrders && recentOrders.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
              {recentOrders.slice(0, 6).map((order) => (
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
  );
}
