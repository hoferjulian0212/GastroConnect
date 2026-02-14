import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ShoppingCart, Trash2, Plus, Minus, Package, ArrowRight, CalendarDays, Zap, Tag } from "lucide-react";
import type { CartItemWithProduct, DeliverySchedule, Promotion } from "@shared/schema";

type CartItemWithPromotion = CartItemWithProduct & { activePromotion?: Promotion | null };
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { format, addDays, isBefore, startOfDay } from "date-fns";
import { de } from "date-fns/locale";

export default function RestaurantCart() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [orderNotes, setOrderNotes] = useState("");
  const [deliveryOption, setDeliveryOption] = useState<"asap" | "date">("asap");
  const [selectedDeliveryDate, setSelectedDeliveryDate] = useState<string>("");

  const { data: cartItems, isLoading } = useQuery<CartItemWithPromotion[]>({
    queryKey: [`/api/cart?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const updateQuantityMutation = useMutation({
    mutationFn: async ({ cartItemId, quantity }: { cartItemId: string; quantity: number }) => {
      return apiRequest("PATCH", `/api/cart/${cartItemId}`, { quantity });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async (cartItemId: string) => {
      return apiRequest("DELETE", `/api/cart/${cartItemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
      toast({
        title: "Artikel entfernt",
        description: "Der Artikel wurde aus dem Warenkorb entfernt.",
      });
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/orders", {
        restaurantId: currentUser?.id,
        notes: orderNotes,
        requestedDeliveryDate: deliveryOption === "date" && selectedDeliveryDate ? selectedDeliveryDate : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/orders?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/restaurant/stats', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/recent', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/orders/recent'] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
      toast({
        title: "Bestellung aufgegeben",
        description: "Ihre Bestellung wurde erfolgreich aufgegeben.",
      });
      setLocation("/restaurant/orders");
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Die Bestellung konnte nicht aufgegeben werden.",
        variant: "destructive",
      });
    },
  });

  const supplierIds = useMemo(() => {
    if (!cartItems) return [];
    return Array.from(new Set(cartItems.map(item => item.supplierId)));
  }, [cartItems]);

  const supplierScheduleKey = supplierIds.sort().join(",");
  const { data: allDeliverySchedules } = useQuery<Record<string, DeliverySchedule[]>>({
    queryKey: ["/api/delivery-schedules/cart", currentUser?.id, supplierScheduleKey],
    queryFn: async () => {
      if (supplierIds.length === 0) return {};
      const results: Record<string, DeliverySchedule[]> = {};
      await Promise.all(
        supplierIds.map(async (supplierId) => {
          const res = await fetch(`/api/delivery-schedules/restaurant?supplierId=${supplierId}&restaurantId=${currentUser?.id}`);
          if (res.ok) {
            results[supplierId] = await res.json();
          }
        })
      );
      return results;
    },
    enabled: !!currentUser?.id && supplierIds.length > 0,
  });

  const allowedWeekdays = useMemo(() => {
    if (!allDeliverySchedules || supplierIds.length === 0) return [];
    const perSupplierDays = supplierIds.map(id => (allDeliverySchedules[id] || []).map(s => s.dayOfWeek));
    if (perSupplierDays.some(d => d.length === 0)) return [];
    return perSupplierDays.reduce((acc, days) => acc.filter(d => days.includes(d)));
  }, [allDeliverySchedules, supplierIds]);

  const availableDeliveryDates = useMemo(() => {
    if (allowedWeekdays.length === 0) return [];
    const dates: { value: string; label: string }[] = [];
    const today = startOfDay(new Date());
    for (let i = 1; i <= 28; i++) {
      const date = addDays(today, i);
      if (allowedWeekdays.includes(date.getDay())) {
        dates.push({
          value: format(date, "yyyy-MM-dd"),
          label: format(date, "EEEE, dd. MMMM yyyy", { locale: de }),
        });
      }
    }
    return dates;
  }, [allowedWeekdays]);

  const getEffectivePrice = (item: CartItemWithPromotion) => {
    const originalPrice = parseFloat(item.product.price);
    if (item.activePromotion) {
      return originalPrice * (1 - item.activePromotion.discountPercent / 100);
    }
    return originalPrice;
  };

  const groupedBySupplier = cartItems?.reduce((acc, item) => {
    const supplierId = item.supplierId;
    if (!acc[supplierId]) {
      acc[supplierId] = {
        supplier: item.supplier,
        items: [],
      };
    }
    acc[supplierId].items.push(item);
    return acc;
  }, {} as Record<string, { supplier: typeof cartItems[0]["supplier"]; items: CartItemWithPromotion[] }>);

  const calculateTotal = (items: CartItemWithPromotion[]) => {
    return items.reduce((total, item) => total + getEffectivePrice(item) * item.quantity, 0).toFixed(2);
  };

  const grandTotal = cartItems?.reduce(
    (total, item) => total + getEffectivePrice(item) * item.quantity,
    0
  ).toFixed(2) || "0.00";

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">Warenkorb</h1>
        <p className="text-xs md:text-sm text-muted-foreground">Überprüfen Sie Ihre ausgewählten Produkte</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : cartItems && cartItems.length > 0 ? (
        <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-3 md:space-y-4">
            {Object.entries(groupedBySupplier || {}).map(([supplierId, { supplier, items }]) => (
              <Card key={supplierId} data-testid={`cart-supplier-${supplierId}`}>
                <CardHeader className="pb-2 md:pb-3 p-3 md:p-6">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-md bg-secondary/20">
                      <Package className="h-4 w-4 md:h-5 md:w-5 text-secondary" />
                    </div>
                    <div>
                      <CardTitle className="text-base md:text-lg">{supplier.companyName || supplier.name}</CardTitle>
                      <CardDescription className="text-xs md:text-sm">{items.length} Artikel</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
                  <div className="space-y-2 md:space-y-4">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-md bg-muted/50"
                        data-testid={`cart-item-${item.id}`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="flex h-10 w-10 md:h-12 md:w-12 shrink-0 items-center justify-center rounded-md bg-background">
                            <Package className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm md:text-base truncate">{item.product.name}</p>
                            {item.activePromotion ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs md:text-sm text-muted-foreground line-through">
                                  {item.product.price}€
                                </span>
                                <span className="text-xs md:text-sm font-medium text-green-600 dark:text-green-400">
                                  {getEffectivePrice(item).toFixed(2)}€/{item.product.unit}
                                </span>
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 px-1 rounded">
                                  <Tag className="h-2.5 w-2.5" />
                                  -{item.activePromotion.discountPercent}%
                                </span>
                              </div>
                            ) : (
                              <p className="text-xs md:text-sm text-muted-foreground">
                                {item.product.price}€/{item.product.unit}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-2 md:gap-3">
                          <div className="flex items-center border border-border rounded-md">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                if (item.quantity <= 1) {
                                  removeItemMutation.mutate(item.id);
                                } else {
                                  updateQuantityMutation.mutate({
                                    cartItemId: item.id,
                                    quantity: item.quantity - 1,
                                  });
                                }
                              }}
                              disabled={updateQuantityMutation.isPending}
                              data-testid={`button-decrease-${item.id}`}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center text-sm">{item.quantity}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() =>
                                updateQuantityMutation.mutate({
                                  cartItemId: item.id,
                                  quantity: item.quantity + 1,
                                })
                              }
                              disabled={updateQuantityMutation.isPending}
                              data-testid={`button-increase-${item.id}`}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                          <span className="font-medium text-sm md:text-base w-16 md:w-20 text-right">
                            {(getEffectivePrice(item) * item.quantity).toFixed(2)}€
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItemMutation.mutate(item.id)}
                            disabled={removeItemMutation.isPending}
                            data-testid={`button-remove-${item.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
                <CardFooter className="border-t border-border pt-3 md:pt-4 p-3 md:p-6">
                  <div className="flex justify-between w-full text-sm md:text-base">
                    <span className="text-muted-foreground">Zwischensumme</span>
                    <span className="font-medium">{calculateTotal(items)}€</span>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>

          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardHeader className="p-3 md:p-6">
                <CardTitle className="text-base md:text-lg">Bestellübersicht</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 md:space-y-4 p-3 pt-0 md:p-6 md:pt-0">
                <div className="space-y-2">
                  {Object.entries(groupedBySupplier || {}).map(([supplierId, { supplier, items }]) => (
                    <div key={supplierId} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{supplier.companyName || supplier.name}</span>
                      <span>{calculateTotal(items)}€</span>
                    </div>
                  ))}
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-base md:text-lg">
                  <span>Gesamt</span>
                  <span data-testid="text-total-amount">{grandTotal}€</span>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs md:text-sm font-medium flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Gewünschter Liefertermin
                  </Label>
                  <div className="space-y-2">
                    <label
                      className={`flex items-center gap-2.5 p-2.5 rounded-md border cursor-pointer transition-colors ${
                        deliveryOption === "asap" ? "border-primary bg-primary/5" : "border-border"
                      }`}
                      data-testid="radio-delivery-asap"
                    >
                      <input
                        type="radio"
                        name="deliveryOption"
                        checked={deliveryOption === "asap"}
                        onChange={() => { setDeliveryOption("asap"); setSelectedDeliveryDate(""); }}
                        className="accent-primary"
                      />
                      <Zap className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-sm">Sobald wie möglich</span>
                    </label>
                    <label
                      className={`flex items-center gap-2.5 p-2.5 rounded-md border cursor-pointer transition-colors ${
                        deliveryOption === "date" ? "border-primary bg-primary/5" : "border-border"
                      }`}
                      data-testid="radio-delivery-date"
                    >
                      <input
                        type="radio"
                        name="deliveryOption"
                        checked={deliveryOption === "date"}
                        onChange={() => setDeliveryOption("date")}
                        className="accent-primary"
                      />
                      <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm">Liefertag auswählen</span>
                    </label>
                  </div>
                  {deliveryOption === "date" && (
                    <div className="pt-1">
                      {availableDeliveryDates.length > 0 ? (
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {availableDeliveryDates.map(date => (
                            <label
                              key={date.value}
                              className={`flex items-center gap-2.5 p-2 rounded-md border cursor-pointer transition-colors text-sm ${
                                selectedDeliveryDate === date.value
                                  ? "border-primary bg-primary/5"
                                  : "border-border"
                              }`}
                              data-testid={`delivery-date-${date.value}`}
                            >
                              <input
                                type="radio"
                                name="deliveryDate"
                                checked={selectedDeliveryDate === date.value}
                                onChange={() => setSelectedDeliveryDate(date.value)}
                                className="accent-primary"
                              />
                              <span>{date.label}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground py-2">
                          Keine Liefertage hinterlegt. Bitte wählen Sie "Sobald wie möglich".
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-1.5 md:space-y-2">
                  <Label className="text-xs md:text-sm font-medium">Anmerkungen zur Bestellung</Label>
                  <Textarea
                    placeholder="Besondere Wünsche oder Hinweise..."
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    className="resize-none"
                    data-testid="textarea-order-notes"
                  />
                </div>
              </CardContent>
              <CardFooter className="p-3 md:p-6">
                <Button
                  className="w-full gap-2 text-sm md:text-base"
                  size="default"
                  onClick={() => createOrderMutation.mutate()}
                  disabled={createOrderMutation.isPending || (deliveryOption === "date" && !selectedDeliveryDate && availableDeliveryDates.length > 0)}
                  data-testid="button-checkout"
                >
                  Bestellung aufgeben
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ShoppingCart className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h2 className="text-xl font-medium">Ihr Warenkorb ist leer</h2>
            <p className="text-muted-foreground mt-1">
              Fügen Sie Produkte aus dem Katalog hinzu
            </p>
            <Button className="mt-4" asChild>
              <Link href="/restaurant/catalog" data-testid="link-browse-catalog">
                Zum Produktkatalog
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
