import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Package, ShoppingCart, Plus, Minus, Store, Filter, Eye, Tag, Percent, Clock } from "lucide-react";
import { differenceInDays, differenceInHours, format } from "date-fns";
import { de } from "date-fns/locale";
import type { User, ProductWithSupplierAndPromotion } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ProductDetailDialog from "@/components/ProductDetailDialog";

export default function RestaurantCatalog() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const [location] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [detailProduct, setDetailProduct] = useState<ProductWithSupplierAndPromotion | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const supplierParam = params.get("supplier");
    if (supplierParam) {
      setSelectedSupplier(supplierParam);
    }
  }, [location]);

  const { data: suppliers, isLoading: suppliersLoading } = useQuery<User[]>({
    queryKey: ["/api/suppliers"],
  });

  const [onlyPromotions, setOnlyPromotions] = useState(false);

  const { data: products, isLoading: productsLoading } = useQuery<ProductWithSupplierAndPromotion[]>({
    queryKey: ["/api/products"],
  });

  const addToCartMutation = useMutation({
    mutationFn: async ({ productId, supplierId, quantity }: { productId: string; supplierId: string; quantity: number }) => {
      return apiRequest("POST", "/api/cart", {
        restaurantId: currentUser?.id,
        productId,
        supplierId,
        quantity,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
      toast({
        title: "Zum Warenkorb hinzugefügt",
        description: "Das Produkt wurde erfolgreich hinzugefügt.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Das Produkt konnte nicht hinzugefügt werden.",
        variant: "destructive",
      });
    },
  });

  const filteredProducts = products?.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSupplier = selectedSupplier === "all" || product.supplierId === selectedSupplier;
    const matchesCategory = selectedCategory === "all" || product.category === selectedCategory;
    const matchesAvailability = !onlyAvailable || product.inStock;
    const matchesPromotion = !onlyPromotions || !!product.activePromotion;
    return matchesSearch && matchesSupplier && matchesCategory && matchesAvailability && matchesPromotion;
  });

  const categories = Array.from(new Set(products?.map(p => p.category).filter(Boolean) || []));

  const updateQuantity = (productId: string, delta: number) => {
    setQuantities(prev => ({
      ...prev,
      [productId]: Math.max(1, (prev[productId] || 1) + delta),
    }));
  };

  const handleAddToCart = (product: ProductWithSupplierAndPromotion) => {
    const quantity = quantities[product.id] || 1;
    addToCartMutation.mutate({
      productId: product.id,
      supplierId: product.supplierId,
      quantity,
    });
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">Produktkatalog</h1>
        <p className="text-xs md:text-sm text-muted-foreground">Durchsuchen Sie Produkte von allen Lieferanten</p>
      </div>

      <Card>
        <CardHeader className="pb-2 md:pb-3 p-3 md:p-6">
          <div className="flex flex-col sm:flex-row gap-2 md:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
              <Input
                placeholder="Produkte suchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 md:pl-9 h-9 md:h-10 text-sm"
                data-testid="input-search-products"
              />
            </div>
            <div className="flex flex-row gap-2 flex-wrap">
              <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                <SelectTrigger className="w-full sm:w-[150px] md:w-[180px] h-9 md:h-10 text-xs md:text-sm" data-testid="select-supplier">
                  <Store className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2 shrink-0" />
                  <SelectValue placeholder="Lieferant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Lieferanten</SelectItem>
                  {suppliers?.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.companyName || supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full sm:w-[150px] md:w-[180px] h-9 md:h-10 text-xs md:text-sm" data-testid="select-category">
                  <Filter className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2 shrink-0" />
                  <SelectValue placeholder="Kategorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Kategorien</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category!}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant={onlyAvailable ? "default" : "outline"}
                onClick={() => setOnlyAvailable(!onlyAvailable)}
                className="text-xs md:text-sm toggle-elevate"
                data-testid="toggle-available-only"
              >
                <Package className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5" />
                Nur verfügbar
              </Button>
              <Button
                variant={onlyPromotions ? "default" : "outline"}
                onClick={() => setOnlyPromotions(!onlyPromotions)}
                className="text-xs md:text-sm toggle-elevate"
                data-testid="toggle-promotions-only"
              >
                <Tag className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5" />
                Aktionen
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          {productsLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          ) : filteredProducts && filteredProducts.length > 0 ? (
            <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProducts.map((product) => {
                const promo = product.activePromotion;
                const hasPromo = !!promo;
                const originalPrice = parseFloat(product.price);
                const discountedPrice = hasPromo ? originalPrice * (1 - promo.discountPercent / 100) : originalPrice;

                return (
                  <Card
                    key={product.id}
                    className={`cursor-pointer transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 hover:scale-[1.01] ${hasPromo ? "ring-1 ring-green-400/50 dark:ring-green-500/30" : ""}`}
                    data-testid={`product-card-${product.id}`}
                    onClick={() => setDetailProduct(product)}
                  >
                    <CardContent className="p-3 flex gap-3">
                      <div className="relative">
                        {product.imageUrl ? (
                          <div className="w-20 h-20 md:w-28 md:h-28 shrink-0 rounded-lg overflow-hidden bg-muted">
                            <img 
                              src={product.imageUrl} 
                              alt={product.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-20 h-20 md:w-28 md:h-28 shrink-0 rounded-lg bg-muted flex items-center justify-center">
                            <Package className="h-8 w-8 md:h-10 md:w-10 text-muted-foreground/30" />
                          </div>
                        )}
                        {hasPromo && (
                          <div className="absolute -top-1.5 -left-1.5 flex items-center justify-center rounded-full bg-green-600 text-white text-[9px] md:text-[10px] font-bold px-1.5 py-0.5 shadow-sm" data-testid={`badge-discount-${product.id}`}>
                            -{promo.discountPercent}%
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1">
                          <h3 className="font-medium text-sm md:text-base line-clamp-1">{product.name}</h3>
                          <div className="flex items-center gap-1 shrink-0">
                            {hasPromo && (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 text-[10px] md:text-xs px-1 md:px-1.5 py-0" data-testid={`badge-promo-${product.id}`}>
                                Aktion
                              </Badge>
                            )}
                            {product.inStock ? (
                              <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-[10px] md:text-xs px-1 md:px-1.5 py-0">
                                Verfügbar
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-[10px] md:text-xs px-1 md:px-1.5 py-0">
                                Nicht vorrätig
                              </Badge>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {product.supplier?.companyName || product.supplier?.name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1">
                          {hasPromo ? (
                            <>
                              <span className="text-xs text-muted-foreground line-through" data-testid={`text-original-price-${product.id}`}>{originalPrice.toFixed(2)}€</span>
                              <span className="font-bold text-sm md:text-base text-green-600 dark:text-green-400" data-testid={`text-discounted-price-${product.id}`}>{discountedPrice.toFixed(2)}€</span>
                              <span className="text-xs text-muted-foreground">/{product.unit}</span>
                            </>
                          ) : (
                            <>
                              <span className="font-bold text-sm md:text-base">{originalPrice.toFixed(2)}€</span>
                              <span className="text-xs text-muted-foreground">/{product.unit}</span>
                            </>
                          )}
                        </div>
                        {hasPromo && promo.endDate && (() => {
                          const now = new Date();
                          const end = new Date(promo.endDate);
                          const daysLeft = differenceInDays(end, now);
                          const hoursLeft = differenceInHours(end, now);
                          let remainingText = "";
                          if (daysLeft <= 0 && hoursLeft > 0) {
                            remainingText = `Endet heute`;
                          } else if (daysLeft === 1) {
                            remainingText = `Noch 1 Tag`;
                          } else if (daysLeft > 1) {
                            remainingText = `Noch ${daysLeft} Tage`;
                          } else {
                            remainingText = "Endet bald";
                          }
                          return (
                            <div className="flex items-center gap-1 mt-1" data-testid={`text-promo-remaining-${product.id}`}>
                              <Clock className="h-3 w-3 text-green-600 dark:text-green-400 shrink-0" />
                              <span className="text-[10px] md:text-xs text-green-600 dark:text-green-400 font-medium">
                                {remainingText} — bis {format(end, "dd.MM.yyyy", { locale: de })}
                              </span>
                            </div>
                          );
                        })()}
                        <div className="flex items-center gap-1 md:gap-2 mt-2 justify-end flex-wrap">
                          <div className="flex items-center border border-border rounded-md" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => updateQuantity(product.id, -1)}
                              disabled={!product.inStock}
                              data-testid={`button-decrease-${product.id}`}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-6 text-center text-sm" data-testid={`quantity-${product.id}`}>
                              {quantities[product.id] || 1}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => updateQuantity(product.id, 1)}
                              disabled={!product.inStock}
                              data-testid={`button-increase-${product.id}`}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 text-xs md:text-sm"
                            disabled={!product.inStock || addToCartMutation.isPending}
                            onClick={(e) => { e.stopPropagation(); handleAddToCart(product); }}
                            data-testid={`button-add-to-cart-${product.id}`}
                          >
                            <ShoppingCart className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Hinzufügen</span>
                            <span className="sm:hidden">+</span>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <Package className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">Keine Produkte gefunden</p>
              <p className="text-sm text-muted-foreground mt-1">
                Versuchen Sie es mit anderen Suchbegriffen
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <ProductDetailDialog
        product={detailProduct}
        open={!!detailProduct}
        onOpenChange={(open) => !open && setDetailProduct(null)}
        supplierName={detailProduct?.supplier?.companyName || detailProduct?.supplier?.name}
      />
    </div>
  );
}
