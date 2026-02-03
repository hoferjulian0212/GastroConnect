import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingBag, MessageSquare, Package, Clock } from "lucide-react";
import type { Order, Conversation } from "@shared/schema";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

export default function RestaurantHome() {
  const { currentUser } = useUser();

  const { data: recentOrders, isLoading: ordersLoading } = useQuery<Order[]>({
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

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending": return "Ausstehend";
      case "confirmed": return "Bestätigt";
      case "in_delivery": return "In Lieferung";
      case "delivered": return "Geliefert";
      case "cancelled": return "Storniert";
      default: return status;
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground" data-testid="text-page-title">
          Willkommen zurück{currentUser?.companyName ? `, ${currentUser.companyName}` : ""}!
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          Hier ist Ihre Übersicht für heute
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 md:p-6">
          <div>
            <CardTitle className="text-base md:text-lg">Schnellaktionen</CardTitle>
            <CardDescription className="text-xs md:text-sm">Häufig verwendete Funktionen</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          <div className="grid grid-cols-2 gap-2 md:gap-3">
            <Button variant="outline" className="h-auto flex-col py-3 md:py-4 gap-1.5 md:gap-2" asChild>
              <Link href="/restaurant/catalog" data-testid="link-quick-catalog">
                <Package className="h-4 w-4 md:h-5 md:w-5" />
                <span className="text-xs md:text-sm">Katalog</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col py-3 md:py-4 gap-1.5 md:gap-2" asChild>
              <Link href="/restaurant/cart" data-testid="link-quick-cart">
                <ShoppingBag className="h-4 w-4 md:h-5 md:w-5" />
                <span className="text-xs md:text-sm">Warenkorb</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col py-3 md:py-4 gap-1.5 md:gap-2" asChild>
              <Link href="/restaurant/inbox" data-testid="link-quick-inbox">
                <MessageSquare className="h-4 w-4 md:h-5 md:w-5" />
                <span className="text-xs md:text-sm">Nachrichten</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col py-3 md:py-4 gap-1.5 md:gap-2" asChild>
              <Link href="/restaurant/history" data-testid="link-quick-history">
                <Clock className="h-4 w-4 md:h-5 md:w-5" />
                <span className="text-xs md:text-sm">Historie</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 gap-2 p-3 md:p-6">
            <CardTitle className="text-xs md:text-sm font-medium">Offene Bestellungen</CardTitle>
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 gap-2 p-3 md:p-6">
            <CardTitle className="text-xs md:text-sm font-medium">Nachrichten</CardTitle>
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 gap-2 p-3 md:p-6">
            <CardTitle className="text-xs md:text-sm font-medium">Aktive Lieferanten</CardTitle>
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
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 md:p-6">
          <div>
            <CardTitle className="text-base md:text-lg">Aktuelle Bestellungen</CardTitle>
            <CardDescription className="text-xs md:text-sm">Ihre neuesten Bestellungen</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="text-xs md:text-sm" asChild>
            <Link href="/restaurant/orders" data-testid="link-view-all-orders">Alle</Link>
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
                  className="flex items-center justify-between p-2 md:p-3 rounded-md bg-muted/50"
                  data-testid={`order-item-${order.id}`}
                >
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="hidden md:flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                      <ShoppingBag className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs md:text-sm font-medium">#{order.id.slice(0, 8)}</p>
                      <p className="text-[10px] md:text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5 md:h-3 md:w-3" />
                        {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true, locale: de })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 md:gap-2">
                    <span className="text-xs md:text-sm font-medium">{order.totalAmount}€</span>
                    <Badge className={`${getStatusColor(order.status)} text-[10px] md:text-xs px-1.5 md:px-2`} variant="outline">
                      {getStatusLabel(order.status)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <ShoppingBag className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">Noch keine Bestellungen</p>
              <Button variant="outline" size="sm" className="mt-3" asChild>
                <Link href="/restaurant/catalog" data-testid="link-browse-catalog">Produktkatalog durchsuchen</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
