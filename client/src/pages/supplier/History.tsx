import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History as HistoryIcon, Clock, Search, Package, Building2, Filter, Euro } from "lucide-react";
import type { OrderWithDetails, User } from "@shared/schema";
import { format } from "date-fns";
import { de } from "date-fns/locale";

export default function SupplierHistory() {
  const { currentUser } = useUser();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRestaurant, setSelectedRestaurant] = useState<string>("all");

  const { data: orders, isLoading } = useQuery<OrderWithDetails[]>({
    queryKey: [`/api/supplier/orders/history?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: restaurants } = useQuery<User[]>({
    queryKey: [`/api/supplier/restaurants?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending": return "Neu";
      case "confirmed": return "Bestätigt";
      case "in_delivery": return "In Lieferung";
      case "delivered": return "Geliefert";
      case "cancelled": return "Storniert";
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "delivered": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "cancelled": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const filteredOrders = orders?.filter(order => {
    const matchesSearch = 
      order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.restaurant?.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.restaurant?.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRestaurant = selectedRestaurant === "all" || order.restaurantId === selectedRestaurant;
    return matchesSearch && matchesRestaurant;
  });

  const totalRevenue = filteredOrders?.reduce(
    (sum, order) => sum + parseFloat(order.totalAmount), 
    0
  ).toFixed(2) || "0.00";

  const totalOrders = filteredOrders?.length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Bestellübersicht</h1>
        <p className="text-muted-foreground">Historie und Statistiken Ihrer Bestellungen</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Gesamtumsatz</CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-revenue">{totalRevenue}€</div>
            <p className="text-xs text-muted-foreground">basierend auf {totalOrders} Bestellungen</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Bestellungen</CardTitle>
            <HistoryIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-orders">{totalOrders}</div>
            <p className="text-xs text-muted-foreground">im ausgewählten Zeitraum</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Nach Bestellnummer oder Restaurant suchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-history"
              />
            </div>
            <Select value={selectedRestaurant} onValueChange={setSelectedRestaurant}>
              <SelectTrigger className="w-[200px]" data-testid="select-restaurant">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Restaurant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Restaurants</SelectItem>
                {restaurants?.map((restaurant) => (
                  <SelectItem key={restaurant.id} value={restaurant.id}>
                    {restaurant.companyName || restaurant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : filteredOrders && filteredOrders.length > 0 ? (
            <div className="space-y-4">
              {filteredOrders.map((order) => (
                <Card key={order.id} className="hover-elevate" data-testid={`history-order-${order.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-md ${getStatusColor(order.status)}`}>
                          <HistoryIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium">Bestellung #{order.id.slice(0, 8)}</p>
                            <Badge className={getStatusColor(order.status)} variant="outline">
                              {getStatusLabel(order.status)}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {order.restaurant?.companyName || order.restaurant?.name}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(order.createdAt), "dd.MM.yyyy HH:mm", { locale: de })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold">{order.totalAmount}€</p>
                        <p className="text-xs text-muted-foreground">
                          {order.items?.length || 0} Artikel
                        </p>
                      </div>
                    </div>
                    {order.items && order.items.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-border">
                        <div className="grid gap-2 sm:grid-cols-2">
                          {order.items.map((item) => (
                            <div key={item.id} className="flex justify-between text-sm">
                              <span className="text-muted-foreground flex items-center gap-2">
                                <Package className="h-3 w-3" />
                                {item.quantity}x {item.productName}
                              </span>
                              <span>{item.totalPrice}€</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <HistoryIcon className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">Keine Bestellungen gefunden</p>
              <p className="text-sm text-muted-foreground mt-1">
                Versuchen Sie es mit anderen Filteroptionen
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
