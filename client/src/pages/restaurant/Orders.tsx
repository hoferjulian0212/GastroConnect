import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ShoppingBag, Clock, Package, Truck, CheckCircle, XCircle, Store, X, Pencil, Minus, Plus, Trash2, MessageSquareText, Loader2 } from "lucide-react";
import type { OrderWithDetails } from "@shared/schema";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Link, useSearch } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface EditableItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
}

export default function RestaurantOrders() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const highlightOrderId = searchParams.get("orderId");
  const highlightRef = useRef<HTMLDivElement>(null);

  const [filterSupplier, setFilterSupplier] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [detailOrder, setDetailOrder] = useState<OrderWithDetails | null>(null);
  const [editingOrder, setEditingOrder] = useState<OrderWithDetails | null>(null);
  const [editItems, setEditItems] = useState<EditableItem[]>([]);
  const [changeRequestOrder, setChangeRequestOrder] = useState<OrderWithDetails | null>(null);
  const [changeRequestReason, setChangeRequestReason] = useState("");

  const { data: orders, isLoading } = useQuery<OrderWithDetails[]>({
    queryKey: [`/api/orders?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const updateOrderItemsMutation = useMutation({
    mutationFn: async ({ orderId, items }: { orderId: string; items: EditableItem[] }) => {
      return await apiRequest("PATCH", `/api/orders/${orderId}/items`, {
        restaurantId: currentUser?.id,
        items: items.map(i => ({
          productId: i.productId,
          productName: i.productName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders?restaurantId=${currentUser?.id}`] });
      setEditingOrder(null);
      toast({ title: "Bestellung aktualisiert", description: "Die Bestellung wurde erfolgreich angepasst." });
    },
    onError: () => {
      toast({ title: "Fehler", description: "Die Bestellung konnte nicht aktualisiert werden.", variant: "destructive" });
    },
  });

  const changeRequestMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      return await apiRequest("POST", `/api/orders/${orderId}/change-request`, {
        restaurantId: currentUser?.id,
        reason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders?restaurantId=${currentUser?.id}`] });
      setChangeRequestOrder(null);
      setChangeRequestReason("");
      toast({ title: "Anfrage gesendet", description: "Die Änderungsanfrage wurde an den Lieferanten gesendet." });
    },
    onError: () => {
      toast({ title: "Fehler", description: "Die Anfrage konnte nicht gesendet werden.", variant: "destructive" });
    },
  });

  const uniqueSuppliers = useMemo(() => {
    if (!orders) return [];
    const map = new Map<string, string>();
    orders.forEach(o => {
      if (o.supplier?.id) {
        map.set(o.supplier.id, o.supplier.companyName || o.supplier.name || "Unbekannt");
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [orders]);

  const hasActiveFilters = filterSupplier !== "all" || filterDateFrom || filterDateTo;

  const clearFilters = () => {
    setFilterSupplier("all");
    setFilterDateFrom("");
    setFilterDateTo("");
  };

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

  const getStatusAccent = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-400 dark:bg-yellow-500";
      case "confirmed": return "bg-blue-400 dark:bg-blue-500";
      case "in_delivery": return "bg-purple-400 dark:bg-purple-500";
      case "delivered": return "bg-green-400 dark:bg-green-500";
      case "cancelled": return "bg-red-400 dark:bg-red-500";
      default: return "bg-muted-foreground";
    }
  };

  const getStatusCardBg = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-50/60 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800/40";
      case "confirmed": return "bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/40";
      case "in_delivery": return "bg-purple-50/60 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800/40";
      case "delivered": return "bg-green-50/60 dark:bg-green-950/20 border-green-200 dark:border-green-800/40";
      case "cancelled": return "bg-red-50/40 dark:bg-red-950/15 border-red-200 dark:border-red-800/40";
      default: return "";
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

  useEffect(() => {
    if (highlightOrderId && highlightRef.current && !isLoading) {
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    }
  }, [highlightOrderId, isLoading]);

  useEffect(() => {
    if (highlightOrderId && orders) {
      const order = orders.find(o => o.id === highlightOrderId);
      if (order) setDetailOrder(order);
    }
  }, [highlightOrderId, orders]);

  const filterOrders = (status: string | null) => {
    if (!orders) return [];
    return orders.filter(order => {
      if (status && order.status !== status) return false;
      if (filterSupplier !== "all" && order.supplier?.id !== filterSupplier) return false;
      if (filterDateFrom) {
        const from = new Date(filterDateFrom);
        from.setHours(0, 0, 0, 0);
        if (new Date(order.createdAt) < from) return false;
      }
      if (filterDateTo) {
        const to = new Date(filterDateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(order.createdAt) > to) return false;
      }
      return true;
    });
  };

  const openEditDialog = (order: OrderWithDetails) => {
    setEditItems(order.items.map(i => ({
      id: i.id,
      productId: i.productId,
      productName: i.productName,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      totalPrice: i.totalPrice,
    })));
    setEditingOrder(order);
  };

  const updateEditItemQuantity = (index: number, delta: number) => {
    setEditItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const newQty = Math.max(1, item.quantity + delta);
      return { ...item, quantity: newQty, totalPrice: (parseFloat(item.unitPrice) * newQty).toFixed(2) };
    }));
  };

  const removeEditItem = (index: number) => {
    setEditItems(prev => prev.filter((_, i) => i !== index));
  };

  const editTotal = useMemo(() => {
    return editItems.reduce((sum, item) => sum + parseFloat(item.totalPrice), 0).toFixed(2);
  }, [editItems]);

  const canEditOrder = (order: OrderWithDetails) => order.status === "pending";
  const canRequestChange = (order: OrderWithDetails) => order.status === "confirmed" || order.status === "in_delivery";

  const OrderCard = ({ order }: { order: OrderWithDetails }) => {
    const isHighlighted = order.id === highlightOrderId;
    return (
    <div ref={isHighlighted ? highlightRef : undefined}>
    <div className={`overflow-hidden rounded-md cursor-pointer ${isHighlighted ? "ring-2 ring-primary shadow-md" : ""}`} onClick={() => setDetailOrder(order)} data-testid={`order-card-${order.id}`}>
      <Card className={`hover-elevate ${getStatusCardBg(order.status)}`}>
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
        {(canEditOrder(order) || canRequestChange(order)) && (
          <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-2">
            {canEditOrder(order) && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); openEditDialog(order); }}
                data-testid={`button-edit-order-${order.id}`}
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Bestellung anpassen
              </Button>
            )}
            {canRequestChange(order) && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); setChangeRequestOrder(order); }}
                data-testid={`button-change-request-${order.id}`}
              >
                <MessageSquareText className="h-3.5 w-3.5 mr-1.5" />
                Änderung anfragen
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
    </div>
    </div>
    );
  };

  const getComplaintCardBg = (status: string) => {
    switch (status) {
      case "open": return "bg-yellow-50/60 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800/40";
      case "in_progress": return "bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/40";
      case "resolved": return "bg-green-50/60 dark:bg-green-950/20 border-green-200 dark:border-green-800/40";
      case "closed": return "bg-muted/30 border-border";
      default: return "";
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">Bestellungen</h1>
        <p className="text-xs md:text-sm text-muted-foreground">Alle Ihre Bestellungen im Überblick</p>
      </div>

      <Card>
        <CardContent className="p-3 md:p-4">
          <div className="flex flex-col sm:flex-row gap-2 md:gap-3 items-end">
            <div className="flex-1 w-full sm:w-auto">
              <label className="text-xs text-muted-foreground mb-1 block">Lieferant</label>
              <Select value={filterSupplier} onValueChange={setFilterSupplier}>
                <SelectTrigger className="h-9 text-xs md:text-sm" data-testid="filter-supplier">
                  <Store className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                  <SelectValue placeholder="Alle Lieferanten" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Lieferanten</SelectItem>
                  {uniqueSuppliers.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-auto">
              <label className="text-xs text-muted-foreground mb-1 block">Von</label>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={e => setFilterDateFrom(e.target.value)}
                className="h-9 text-xs md:text-sm w-full sm:w-[150px]"
                data-testid="filter-date-from"
              />
            </div>
            <div className="w-full sm:w-auto">
              <label className="text-xs text-muted-foreground mb-1 block">Bis</label>
              <Input
                type="date"
                value={filterDateTo}
                onChange={e => setFilterDateTo(e.target.value)}
                className="h-9 text-xs md:text-sm w-full sm:w-[150px]"
                data-testid="filter-date-to"
              />
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="shrink-0" data-testid="button-clear-filters">
                <X className="h-3.5 w-3.5 mr-1" />
                Zurücksetzen
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-5 lg:w-auto lg:inline-flex h-auto">
          <TabsTrigger value="all" className="text-xs md:text-sm py-1.5 md:py-2" data-testid="tab-all">Alle</TabsTrigger>
          <TabsTrigger value="pending" className="text-xs md:text-sm py-1.5 md:py-2" data-testid="tab-pending">Ausstehend</TabsTrigger>
          <TabsTrigger value="confirmed" className="text-xs md:text-sm py-1.5 md:py-2" data-testid="tab-confirmed">Bestätigt</TabsTrigger>
          <TabsTrigger value="in_delivery" className="text-xs md:text-sm py-1.5 md:py-2" data-testid="tab-delivery">In Lieferung</TabsTrigger>
          <TabsTrigger value="delivered" className="text-xs md:text-sm py-1.5 md:py-2" data-testid="tab-delivered">Geliefert</TabsTrigger>
        </TabsList>

        {["all", "pending", "confirmed", "in_delivery", "delivered"].map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-4 md:mt-6">
            {isLoading ? (
              <div className="space-y-3 md:space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-40 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3 md:space-y-4">
                {filterOrders(tab === "all" ? null : tab).length > 0 ? (
                  filterOrders(tab === "all" ? null : tab).map((order) => (
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

      <Dialog open={!!detailOrder} onOpenChange={(open) => !open && setDetailOrder(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-order-detail">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailOrder && getStatusIcon(detailOrder.status)}
              Bestellung #{detailOrder?.id.slice(0, 8)}
            </DialogTitle>
            <DialogDescription>
              Bestelldetails und Artikelübersicht
            </DialogDescription>
          </DialogHeader>
          {detailOrder && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={`${getStatusColor(detailOrder.status)}`} variant="outline">
                  {getStatusIcon(detailOrder.status)}
                  <span className="ml-1">{getStatusLabel(detailOrder.status)}</span>
                </Badge>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lieferant</span>
                  <span className="font-medium">{detailOrder.supplier?.companyName || detailOrder.supplier?.name || "Unbekannt"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bestellt am</span>
                  <span>{format(new Date(detailOrder.createdAt), "dd.MM.yyyy HH:mm", { locale: de })}</span>
                </div>
                {detailOrder.requestedDeliveryDate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gewünschter Liefertermin</span>
                    <span>{new Date(detailOrder.requestedDeliveryDate + "T00:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "long", year: "numeric" })}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-3">
                <p className="text-sm font-medium mb-2">Artikel ({detailOrder.items?.length || 0})</p>
                <div className="space-y-2">
                  {detailOrder.items?.map((item) => (
                    <div key={item.id} className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50" data-testid={`detail-item-${item.id}`}>
                      <div>
                        <span className="font-medium">{item.quantity}x</span>{" "}
                        <span>{item.productName}</span>
                        <span className="text-muted-foreground ml-2">@ {item.unitPrice}€</span>
                      </div>
                      <span className="font-medium">{item.totalPrice}€</span>
                    </div>
                  ))}
                </div>
              </div>

              {detailOrder.notes && (
                <div className="border-t border-border pt-3">
                  <p className="text-sm font-medium mb-1">Anmerkungen</p>
                  <p className="text-sm text-muted-foreground">{detailOrder.notes}</p>
                </div>
              )}

              <div className="border-t border-border pt-3 flex items-center justify-between">
                <span className="text-sm font-medium">Gesamtbetrag</span>
                <span className="text-lg font-bold" data-testid="text-detail-total">{detailOrder.totalAmount}€</span>
              </div>

              {(canEditOrder(detailOrder) || canRequestChange(detailOrder)) && (
                <div className="border-t border-border pt-3 flex flex-wrap gap-2">
                  {canEditOrder(detailOrder) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { const o = detailOrder; setDetailOrder(null); openEditDialog(o); }}
                      data-testid="button-detail-edit-order"
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Bestellung anpassen
                    </Button>
                  )}
                  {canRequestChange(detailOrder) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { const o = detailOrder; setDetailOrder(null); setChangeRequestOrder(o); }}
                      data-testid="button-detail-change-request"
                    >
                      <MessageSquareText className="h-3.5 w-3.5 mr-1.5" />
                      Änderung anfragen
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingOrder} onOpenChange={(open) => !open && setEditingOrder(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              Bestellung anpassen
            </DialogTitle>
            <DialogDescription>
              Bestellung #{editingOrder?.id.slice(0, 8)} - Mengen ändern oder Artikel entfernen
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {editItems.map((item, index) => (
              <div key={item.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50" data-testid={`edit-item-${item.productId}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.productName}</p>
                  <p className="text-xs text-muted-foreground">{item.unitPrice}€ pro Stück</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => updateEditItemQuantity(index, -1)}
                    disabled={item.quantity <= 1}
                    data-testid={`button-decrease-${item.productId}`}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-8 text-center text-sm font-medium" data-testid={`text-quantity-${item.productId}`}>{item.quantity}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => updateEditItemQuantity(index, 1)}
                    data-testid={`button-increase-${item.productId}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeEditItem(index)}
                    disabled={editItems.length <= 1}
                    data-testid={`button-remove-${item.productId}`}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
                <span className="text-sm font-medium w-16 text-right">{item.totalPrice}€</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <span className="text-sm font-medium">Gesamtbetrag</span>
            <span className="text-lg font-bold" data-testid="text-edit-total">{editTotal}€</span>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingOrder(null)} data-testid="button-cancel-edit">
              Abbrechen
            </Button>
            <Button
              onClick={() => editingOrder && updateOrderItemsMutation.mutate({ orderId: editingOrder.id, items: editItems })}
              disabled={editItems.length === 0 || updateOrderItemsMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateOrderItemsMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Änderungen speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!changeRequestOrder} onOpenChange={(open) => { if (!open) { setChangeRequestOrder(null); setChangeRequestReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquareText className="h-5 w-5 text-primary" />
              Änderung anfragen
            </DialogTitle>
            <DialogDescription>
              Bestellung #{changeRequestOrder?.id.slice(0, 8)} ist bereits bestätigt. Senden Sie eine Anfrage an den Lieferanten, um die Bestellung erneut zur Bearbeitung zu öffnen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Grund der Änderung</label>
              <Textarea
                placeholder="Beschreiben Sie, was Sie ändern möchten..."
                value={changeRequestReason}
                onChange={(e) => setChangeRequestReason(e.target.value)}
                className="resize-none"
                rows={3}
                data-testid="input-change-reason"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setChangeRequestOrder(null); setChangeRequestReason(""); }} data-testid="button-cancel-request">
              Abbrechen
            </Button>
            <Button
              onClick={() => changeRequestOrder && changeRequestMutation.mutate({ orderId: changeRequestOrder.id, reason: changeRequestReason })}
              disabled={!changeRequestReason.trim() || changeRequestMutation.isPending}
              data-testid="button-send-request"
            >
              {changeRequestMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Anfrage senden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
