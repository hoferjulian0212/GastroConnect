import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { History as HistoryIcon, Clock, RotateCcw, Search, Package } from "lucide-react";
import type { OrderWithDetails } from "@shared/schema";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export default function RestaurantHistory() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: orders, isLoading } = useQuery<OrderWithDetails[]>({
    queryKey: [`/api/orders/history?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest("POST", `/api/orders/${orderId}/reorder`, {
        restaurantId: currentUser?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
      toast({
        title: "Zum Warenkorb hinzugefügt",
        description: "Die Artikel wurden zum Warenkorb hinzugefügt.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Die Artikel konnten nicht hinzugefügt werden.",
        variant: "destructive",
      });
    },
  });

  const deliveredOrders = orders?.filter(o => o.status === "delivered");

  const filteredOrders = deliveredOrders?.filter(order => {
    const searchLower = searchQuery.toLowerCase();
    return (
      order.id.toLowerCase().includes(searchLower) ||
      order.supplier?.companyName?.toLowerCase().includes(searchLower) ||
      order.supplier?.name.toLowerCase().includes(searchLower)
    );
  });

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
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">Bestellhistorie</h1>
        <p className="text-sm md:text-base text-muted-foreground">Vergangene Bestellungen und Nachbestellungen</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Nach Bestellnummer oder Lieferant suchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-history"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : filteredOrders && filteredOrders.length > 0 ? (
            <div className="space-y-4">
              {filteredOrders.map((order) => (
                <Card key={order.id} className="hover-elevate" data-testid={`history-order-${order.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-green-100 dark:bg-green-900/30">
                          <HistoryIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">Bestellung #{order.id.slice(0, 8)}</p>
                            <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                              {getStatusLabel(order.status)}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {order.supplier?.companyName || order.supplier?.name}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(order.createdAt), "dd.MM.yyyy HH:mm", { locale: de })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold">{order.totalAmount}€</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 gap-1"
                          onClick={() => reorderMutation.mutate(order.id)}
                          disabled={reorderMutation.isPending}
                          data-testid={`button-reorder-${order.id}`}
                        >
                          <RotateCcw className="h-3 w-3" />
                          Nachbestellen
                        </Button>
                      </div>
                    </div>
                    {order.items && order.items.length > 0 && (
                      <div className="pt-4 border-t border-border">
                        <div className="space-y-2">
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
              <p className="text-muted-foreground">Keine Bestellhistorie vorhanden</p>
              <p className="text-sm text-muted-foreground mt-1">
                Abgeschlossene Bestellungen werden hier angezeigt
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
