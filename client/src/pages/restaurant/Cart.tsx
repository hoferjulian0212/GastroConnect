import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ShoppingCart, Trash2, Plus, Minus, Package, ArrowRight } from "lucide-react";
import type { CartItemWithProduct } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Link, useLocation } from "wouter";

export default function RestaurantCart() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [orderNotes, setOrderNotes] = useState("");

  const { data: cartItems, isLoading } = useQuery<CartItemWithProduct[]>({
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
  }, {} as Record<string, { supplier: typeof cartItems[0]["supplier"]; items: CartItemWithProduct[] }>);

  const calculateTotal = (items: CartItemWithProduct[]) => {
    return items.reduce((total, item) => total + parseFloat(item.product.price) * item.quantity, 0).toFixed(2);
  };

  const grandTotal = cartItems?.reduce(
    (total, item) => total + parseFloat(item.product.price) * item.quantity,
    0
  ).toFixed(2) || "0.00";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">Warenkorb</h1>
        <p className="text-sm md:text-base text-muted-foreground">Überprüfen Sie Ihre ausgewählten Produkte</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : cartItems && cartItems.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            {Object.entries(groupedBySupplier || {}).map(([supplierId, { supplier, items }]) => (
              <Card key={supplierId} data-testid={`cart-supplier-${supplierId}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary/20">
                      <Package className="h-5 w-5 text-secondary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{supplier.companyName || supplier.name}</CardTitle>
                      <CardDescription>{items.length} Artikel</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
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
                            <p className="text-xs md:text-sm text-muted-foreground">
                              {item.product.price}€/{item.product.unit}
                            </p>
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
                            {(parseFloat(item.product.price) * item.quantity).toFixed(2)}€
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
                <CardFooter className="border-t border-border pt-4">
                  <div className="flex justify-between w-full">
                    <span className="text-muted-foreground">Zwischensumme</span>
                    <span className="font-medium">{calculateTotal(items)}€</span>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>

          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle>Bestellübersicht</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {Object.entries(groupedBySupplier || {}).map(([supplierId, { supplier, items }]) => (
                    <div key={supplierId} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{supplier.companyName || supplier.name}</span>
                      <span>{calculateTotal(items)}€</span>
                    </div>
                  ))}
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Gesamt</span>
                  <span data-testid="text-total-amount">{grandTotal}€</span>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Anmerkungen zur Bestellung</label>
                  <Textarea
                    placeholder="Besondere Wünsche oder Hinweise..."
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    className="resize-none"
                    data-testid="textarea-order-notes"
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full gap-2"
                  size="lg"
                  onClick={() => createOrderMutation.mutate()}
                  disabled={createOrderMutation.isPending}
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
