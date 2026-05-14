import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { History as HistoryIcon, Clock, RotateCcw, Search, Package } from "lucide-react";
import { formatOrderNumber, type OrderWithDetails } from "@shared/schema";
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
    <div className="space-y-4 md:space-y-6 overflow-x-hidden pb-[var(--mobile-bottom-pad)] md:pb-0">
      <div>
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">Bestellhistorie</h1>
        <p className="text-xs md:text-sm text-muted-foreground">Vergangene Bestellungen und Nachbestellungen</p>
      </div>

      <Card>
        <CardHeader className="pb-2 md:pb-3 p-3 md:p-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
            <Input
              placeholder="Nach Bestellnummer oder Händler suchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 md:pl-9 h-9 md:h-10 text-sm"
              data-testid="input-search-history"
            />
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : filteredOrders && filteredOrders.length > 0 ? (
            <div className="space-y-4">
              {filteredOrders.map((order) => (
                <Card key={order.id} className="hover-elevate overflow-hidden" data-testid={`history-order-${order.id}`}>
                  <CardContent className="p-3 md:p-4">
                    <div className="flex flex-col gap-3 mb-3 md:mb-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 md:h-12 md:w-12 shrink-0 items-center justify-center rounded-md bg-green-100 dark:bg-green-900/30">
                          <HistoryIcon className="h-4 w-4 md:h-5 md:w-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1 md:gap-2">
                            <p className="font-medium text-sm md:text-base">Bestellung #{formatOrderNumber(order)}</p>
                            <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-xs">
                              {getStatusLabel(order.status)}
                            </Badge>
                          </div>
                          <p className="text-xs md:text-sm text-muted-foreground mt-1 truncate">
                            {order.supplier?.companyName || order.supplier?.name}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Clock className="h-3 w-3 shrink-0" />
                            {format(new Date(order.createdAt), "dd.MM.yyyy HH:mm", { locale: de })}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-base md:text-lg font-bold">{order.totalAmount}€</p>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 text-xs md:text-sm"
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
                      <div className="pt-3 md:pt-4 border-t border-border">
                        <div className="space-y-1.5 md:space-y-2">
                          {order.items.map((item) => (
                            <div key={item.id} className="flex justify-between text-xs md:text-sm gap-2">
                              <span className="text-muted-foreground flex items-center gap-1.5 md:gap-2 min-w-0">
                                <Package className="h-3 w-3 shrink-0" />
                                <span className="truncate">{item.quantity}x {item.productName}</span>
                              </span>
                              <span className="shrink-0">{item.totalPrice}€</span>
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
