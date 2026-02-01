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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">
          Willkommen zurück{currentUser?.companyName ? `, ${currentUser.companyName}` : ""}!
        </h1>
        <p className="text-muted-foreground mt-1">
          Hier ist Ihre Übersicht für heute
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Offene Bestellungen</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-pending-orders">
                {stats?.pendingOrders || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Ungelesene Nachrichten</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-unread-messages">
                {stats?.unreadMessages || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Aktive Lieferanten</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-total-suppliers">
                {stats?.totalSuppliers || 0}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Aktuelle Bestellungen</CardTitle>
              <CardDescription>Ihre neuesten Bestellungen</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/restaurant/orders" data-testid="link-view-all-orders">Alle anzeigen</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {ordersLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : recentOrders && recentOrders.length > 0 ? (
              <div className="space-y-3">
                {recentOrders.slice(0, 5).map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between p-3 rounded-md bg-muted/50"
                    data-testid={`order-item-${order.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                        <ShoppingBag className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Bestellung #{order.id.slice(0, 8)}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true, locale: de })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{order.totalAmount}€</span>
                      <Badge className={getStatusColor(order.status)} variant="outline">
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Schnellaktionen</CardTitle>
              <CardDescription>Häufig verwendete Funktionen</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="h-auto flex-col py-4 gap-2" asChild>
                <Link href="/restaurant/catalog" data-testid="link-quick-catalog">
                  <Package className="h-5 w-5" />
                  <span className="text-sm">Katalog</span>
                </Link>
              </Button>
              <Button variant="outline" className="h-auto flex-col py-4 gap-2" asChild>
                <Link href="/restaurant/cart" data-testid="link-quick-cart">
                  <ShoppingBag className="h-5 w-5" />
                  <span className="text-sm">Warenkorb</span>
                </Link>
              </Button>
              <Button variant="outline" className="h-auto flex-col py-4 gap-2" asChild>
                <Link href="/restaurant/inbox" data-testid="link-quick-inbox">
                  <MessageSquare className="h-5 w-5" />
                  <span className="text-sm">Nachrichten</span>
                </Link>
              </Button>
              <Button variant="outline" className="h-auto flex-col py-4 gap-2" asChild>
                <Link href="/restaurant/history" data-testid="link-quick-history">
                  <Clock className="h-5 w-5" />
                  <span className="text-sm">Historie</span>
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
