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
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">Bestellübersicht</h1>
        <p className="text-sm md:text-base text-muted-foreground">Historie und Statistiken</p>
      </div>

      <div className="grid gap-3 grid-cols-2 md:gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 gap-2 p-3 md:p-6">
            <CardTitle className="text-xs md:text-sm font-medium">Umsatz</CardTitle>
            <Euro className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-xl md:text-2xl font-bold" data-testid="text-total-revenue">{totalRevenue}€</div>
            <p className="text-[10px] md:text-xs text-muted-foreground">{totalOrders} Bestellungen</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 gap-2 p-3 md:p-6">
            <CardTitle className="text-xs md:text-sm font-medium">Bestellungen</CardTitle>
            <HistoryIcon className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-xl md:text-2xl font-bold" data-testid="text-total-orders">{totalOrders}</div>
            <p className="text-[10px] md:text-xs text-muted-foreground">ausgewählter Zeitraum</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 md:pb-3 p-3 md:p-6">
          <div className="flex flex-col gap-2 md:gap-4 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-sm"
                data-testid="input-search-history"
              />
            </div>
            <Select value={selectedRestaurant} onValueChange={setSelectedRestaurant}>
              <SelectTrigger className="w-full md:w-[200px] text-sm" data-testid="select-restaurant">
                <Filter className="h-3.5 w-3.5 md:h-4 md:w-4 mr-2" />
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
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          {isLoading ? (
            <div className="space-y-3 md:space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 md:h-32" />
              ))}
            </div>
          ) : filteredOrders && filteredOrders.length > 0 ? (
            <div className="space-y-3 md:space-y-4">
              {filteredOrders.map((order) => (
                <Card key={order.id} className="hover-elevate" data-testid={`history-order-${order.id}`}>
                  <CardContent className="p-3 md:p-4">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 md:gap-4">
                      <div className="flex items-start gap-2 md:gap-4">
                        <div className={`flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-md shrink-0 ${getStatusColor(order.status)}`}>
                          <HistoryIcon className="h-4 w-4 md:h-5 md:w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                            <p className="font-medium text-sm md:text-base">#{order.id.slice(0, 8)}</p>
                            <Badge className={`${getStatusColor(order.status)} text-[10px] md:text-xs`} variant="outline">
                              {getStatusLabel(order.status)}
                            </Badge>
                          </div>
                          <p className="text-xs md:text-sm text-muted-foreground mt-0.5 md:mt-1 flex items-center gap-1 truncate">
                            <Building2 className="h-2.5 w-2.5 md:h-3 md:w-3 shrink-0" />
                            <span className="truncate">{order.restaurant?.companyName || order.restaurant?.name}</span>
                          </p>
                          <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5 md:h-3 md:w-3" />
                            {format(new Date(order.createdAt), "dd.MM.yy HH:mm", { locale: de })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex items-center justify-between md:block border-t md:border-t-0 pt-2 md:pt-0 mt-1 md:mt-0">
                        <p className="text-base md:text-lg font-bold">{order.totalAmount}€</p>
                        <p className="text-[10px] md:text-xs text-muted-foreground">
                          {order.items?.length || 0} Artikel
                        </p>
                      </div>
                    </div>
                    {order.items && order.items.length > 0 && (
                      <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-border">
                        <div className="grid gap-1.5 md:gap-2 sm:grid-cols-2">
                          {order.items.map((item) => (
                            <div key={item.id} className="flex justify-between text-xs md:text-sm">
                              <span className="text-muted-foreground flex items-center gap-1.5 md:gap-2">
                                <Package className="h-2.5 w-2.5 md:h-3 md:w-3" />
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
            <div className="flex flex-col items-center justify-center py-8 md:py-12">
              <HistoryIcon className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground/50 mb-2 md:mb-3" />
              <p className="text-sm md:text-base text-muted-foreground">Keine Bestellungen</p>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">
                Andere Filter versuchen
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
