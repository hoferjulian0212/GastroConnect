import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingBag, Clock, ChevronRight, Package, Truck, CheckCircle, XCircle } from "lucide-react";
import type { OrderWithDetails } from "@shared/schema";
import { formatDistanceToNow, format } from "date-fns";
import { de } from "date-fns/locale";
import { Link } from "wouter";

export default function RestaurantOrders() {
  const { currentUser } = useUser();

  const { data: orders, isLoading } = useQuery<OrderWithDetails[]>({
    queryKey: [`/api/orders?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
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

  const filterOrdersByStatus = (status: string | null) => {
    if (!orders) return [];
    if (!status) return orders;
    return orders.filter(order => order.status === status);
  };

  const OrderCard = ({ order }: { order: OrderWithDetails }) => (
    <Card className="hover-elevate" data-testid={`order-card-${order.id}`}>
      <CardContent className="p-3 md:p-4">
        <div className="flex items-start justify-between gap-2 md:gap-4">
          <div className="flex items-start gap-2 md:gap-4">
            <div className={`flex h-10 w-10 md:h-12 md:w-12 shrink-0 items-center justify-center rounded-md ${getStatusColor(order.status)}`}>
              {getStatusIcon(order.status)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1 md:gap-2">
                <p className="font-medium text-sm md:text-base">Bestellung #{order.id.slice(0, 8)}</p>
                <Badge className={`${getStatusColor(order.status)} text-xs`} variant="outline">
                  {getStatusLabel(order.status)}
                </Badge>
              </div>
              <p className="text-xs md:text-sm text-muted-foreground mt-1 truncate">
                {order.supplier?.companyName || order.supplier?.name || "Unbekannter Lieferant"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(new Date(order.createdAt), "dd.MM.yyyy HH:mm", { locale: de })}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-base md:text-lg font-bold">{order.totalAmount}€</p>
            <p className="text-xs text-muted-foreground">
              {order.items?.length || 0} Artikel
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
                  + {order.items.length - 3} weitere Artikel
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">Bestellungen</h1>
        <p className="text-sm md:text-base text-muted-foreground">Alle Ihre Bestellungen im Überblick</p>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-5 lg:w-auto lg:inline-flex">
          <TabsTrigger value="all" data-testid="tab-all">Alle</TabsTrigger>
          <TabsTrigger value="pending" data-testid="tab-pending">Ausstehend</TabsTrigger>
          <TabsTrigger value="confirmed" data-testid="tab-confirmed">Bestätigt</TabsTrigger>
          <TabsTrigger value="in_delivery" data-testid="tab-delivery">In Lieferung</TabsTrigger>
          <TabsTrigger value="delivered" data-testid="tab-delivered">Geliefert</TabsTrigger>
        </TabsList>

        {["all", "pending", "confirmed", "in_delivery", "delivered"].map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-6">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-40 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {filterOrdersByStatus(tab === "all" ? null : tab).length > 0 ? (
                  filterOrdersByStatus(tab === "all" ? null : tab).map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <ShoppingBag className="h-12 w-12 text-muted-foreground/50 mb-3" />
                      <p className="text-muted-foreground">Keine Bestellungen gefunden</p>
                      <Button variant="outline" className="mt-4" asChild>
                        <Link href="/restaurant/catalog" data-testid="link-browse-catalog">
                          Produktkatalog durchsuchen
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
    </div>
  );
}
