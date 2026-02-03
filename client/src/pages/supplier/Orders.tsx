import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, Clock, Package, Truck, CheckCircle, XCircle, Building2 } from "lucide-react";
import type { OrderWithDetails } from "@shared/schema";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function SupplierOrders() {
  const { currentUser } = useUser();
  const { toast } = useToast();

  const { data: orders, isLoading } = useQuery<OrderWithDetails[]>({
    queryKey: [`/api/supplier/orders?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      return apiRequest("PATCH", `/api/orders/${orderId}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/supplier/orders?supplierId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/supplier/stats?userId=${currentUser?.id}`] });
      toast({
        title: "Status aktualisiert",
        description: "Der Bestellstatus wurde erfolgreich aktualisiert.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Der Status konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    },
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
      case "pending": return "Neu";
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
      default: return <ClipboardList className="h-4 w-4" />;
    }
  };

  const filterOrdersByStatus = (status: string | null) => {
    if (!orders) return [];
    if (!status) return orders;
    return orders.filter(order => order.status === status);
  };

  const OrderCard = ({ order }: { order: OrderWithDetails }) => (
    <Card className="hover-elevate" data-testid={`order-card-${order.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-md ${getStatusColor(order.status)}`}>
              {getStatusIcon(order.status)}
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
                {order.restaurant?.companyName || order.restaurant?.name || "Unbekanntes Restaurant"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(new Date(order.createdAt), "dd.MM.yyyy HH:mm", { locale: de })}
              </p>
            </div>
          </div>
          <div className="text-right space-y-2">
            <p className="text-lg font-bold">{order.totalAmount}€</p>
            {order.status !== "delivered" && order.status !== "cancelled" && (
              <Select
                value={order.status}
                onValueChange={(value) => updateStatusMutation.mutate({ orderId: order.id, status: value })}
              >
                <SelectTrigger className="w-[140px]" data-testid={`select-status-${order.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Neu</SelectItem>
                  <SelectItem value="confirmed">Bestätigt</SelectItem>
                  <SelectItem value="in_delivery">In Lieferung</SelectItem>
                  <SelectItem value="delivered">Geliefert</SelectItem>
                  <SelectItem value="cancelled">Storniert</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        {order.items && order.items.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
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
        {order.notes && (
          <div className="mt-4 p-3 rounded-md bg-muted/50">
            <p className="text-xs font-medium text-muted-foreground mb-1">Anmerkungen:</p>
            <p className="text-sm">{order.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Aufträge</h1>
        <p className="text-muted-foreground">Verwalten Sie eingehende Bestellungen</p>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-flex">
          <TabsTrigger value="pending" data-testid="tab-pending">
            Neu
            {filterOrdersByStatus("pending").length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {filterOrdersByStatus("pending").length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="confirmed" data-testid="tab-confirmed">Bestätigt</TabsTrigger>
          <TabsTrigger value="in_delivery" data-testid="tab-delivery">In Lieferung</TabsTrigger>
          <TabsTrigger value="delivered" data-testid="tab-delivered">Geliefert</TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all">Alle</TabsTrigger>
        </TabsList>

        {["pending", "confirmed", "in_delivery", "delivered", "all"].map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-6">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-48" />
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
                      <ClipboardList className="h-12 w-12 text-muted-foreground/50 mb-3" />
                      <p className="text-muted-foreground">Keine Bestellungen gefunden</p>
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
