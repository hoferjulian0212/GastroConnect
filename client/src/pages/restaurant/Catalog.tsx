import { useState, useEffect, useMemo } from "react";
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
import { Search, Package, ShoppingCart, Store, Filter, Eye, Tag, Percent, Clock, Check } from "lucide-react";
import QuantityInput from "@/components/QuantityInput";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { differenceInDays, differenceInHours, format } from "date-fns";
import { de, it } from "date-fns/locale";
import type { User, ProductWithSupplierAndPromotion, CartItemWithProduct } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ProductDetailDialog from "@/components/ProductDetailDialog";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";

export default function RestaurantCatalog() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const [location] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [onlyPromotions, setOnlyPromotions] = useState(false);
  const [detailProduct, setDetailProduct] = useState<ProductWithSupplierAndPromotion | null>(null);
  const [addedProductIds, setAddedProductIds] = useState<Set<string>>(new Set());
  const [addedTimers, setAddedTimers] = useState<Record<string, ReturnType<typeof setTimeout>>>({});
  const { lang } = useLanguage();
  const t = useT(lang);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const supplierParam = params.get("supplier");
    if (supplierParam) {
      setSelectedSupplier(supplierParam);
    }
    const promotionsParam = params.get("promotions");
    setOnlyPromotions(promotionsParam === "true");
  }, [location]);

  const { data: suppliers, isLoading: suppliersLoading } = useQuery<User[]>({
    queryKey: ["/api/suppliers"],
  });

  const { data: products, isLoading: productsLoading } = useQuery<ProductWithSupplierAndPromotion[]>({
    queryKey: [`/api/products?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: cartItems } = useQuery<CartItemWithProduct[]>({
    queryKey: [`/api/cart?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  useEffect(() => {
    if (cartItems && cartItems.length > 0) {
      setQuantities(prev => {
        const next = { ...prev };
        cartItems.forEach(ci => {
          if (!(ci.productId in next)) {
            next[ci.productId] = ci.quantity;
          }
        });
        return next;
      });
    }
  }, [cartItems]);

  const addToCartMutation = useMutation({
    mutationFn: async ({ productId, supplierId, quantity, mode }: { productId: string; supplierId: string; quantity: number; mode?: "set" }) => {
      return apiRequest("POST", "/api/cart", {
        restaurantId: currentUser?.id,
        productId,
        supplierId,
        quantity,
        mode: mode || undefined,
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
      setAddedProductIds(prev => new Set(prev).add(variables.productId));
      if (addedTimers[variables.productId]) clearTimeout(addedTimers[variables.productId]);
      const timer = setTimeout(() => {
        setAddedProductIds(prev => {
          const next = new Set(prev);
          next.delete(variables.productId);
          return next;
        });
      }, 2000);
      setAddedTimers(prev => ({ ...prev, [variables.productId]: timer }));
    },
    onError: () => {
      toast({
        title: t("common", "error"),
        description: t("common", "productAddError"),
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

  const supplierCards = useMemo(() => {
    if (!suppliers || !products) return [];
    return suppliers.map(s => ({
      id: s.id,
      name: s.companyName || s.name || "",
      profileImageUrl: s.profileImageUrl || null,
      productCount: products.filter(p => p.supplierId === s.id).length,
    })).filter(s => s.productCount > 0);
  }, [suppliers, products]);

  const getMinOrderQty = (product: ProductWithSupplierAndPromotion) => {
    return product.minOrderQuantity && product.minOrderQuantity > 1 ? product.minOrderQuantity : 1;
  };

  const updateQuantity = (productId: string, delta: number, minQty: number = 1, product?: ProductWithSupplierAndPromotion) => {
    const newQty = Math.max(minQty, (quantities[productId] || minQty) + delta);
    setQuantities(prev => ({
      ...prev,
      [productId]: newQty,
    }));
    if (addedProductIds.has(productId) && product) {
      addToCartMutation.mutate({
        productId: product.id,
        supplierId: product.supplierId,
        quantity: newQty,
        mode: "set",
      });
    }
  };

  const handleAddToCart = (product: ProductWithSupplierAndPromotion) => {
    const minQty = getMinOrderQty(product);
    const quantity = quantities[product.id] || minQty;
    addToCartMutation.mutate({
      productId: product.id,
      supplierId: product.supplierId,
      quantity,
      mode: "set",
    });
  };

  const dateLocale = lang === "it" ? it : de;

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">{t("common", "productCatalog")}</h1>
        <p className="text-xs md:text-sm text-muted-foreground">{t("common", "browseAllSuppliers")}</p>
      </div>

      {supplierCards.length > 0 && (
        <div className="flex gap-2 md:gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          <button
            onClick={() => setSelectedSupplier("all")}
            className={`flex flex-col items-center gap-1.5 p-2.5 md:p-3 rounded-md border-2 transition-all shrink-0 min-w-[72px] md:min-w-[88px] ${
              selectedSupplier === "all"
                ? "border-primary bg-primary/10 dark:bg-primary/20"
                : "border-transparent bg-muted/50 dark:bg-muted/30"
            }`}
            data-testid="filter-supplier-all"
          >
            <div className={`flex items-center justify-center h-10 w-10 md:h-12 md:w-12 rounded-full ${
              selectedSupplier === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}>
              <Store className="h-5 w-5 md:h-6 md:w-6" />
            </div>
            <span className={`text-[10px] md:text-xs font-medium leading-tight text-center line-clamp-1 ${
              selectedSupplier === "all" ? "text-primary" : "text-muted-foreground"
            }`}>
              {t("common", "all")}
            </span>
            <span className={`text-xs md:text-sm font-bold leading-none ${
              selectedSupplier === "all" ? "text-primary" : "text-foreground"
            }`}>
              {products?.length || 0}
            </span>
          </button>
          {supplierCards.map(supplier => {
            const isActive = selectedSupplier === supplier.id;
            return (
              <button
                key={supplier.id}
                onClick={() => setSelectedSupplier(supplier.id)}
                className={`flex flex-col items-center gap-1.5 p-2.5 md:p-3 rounded-md border-2 transition-all shrink-0 min-w-[72px] md:min-w-[88px] ${
                  isActive
                    ? "border-primary bg-primary/10 dark:bg-primary/20"
                    : "border-transparent bg-muted/50 dark:bg-muted/30"
                }`}
                data-testid={`filter-supplier-${supplier.id}`}
              >
                <Avatar className={`h-10 w-10 md:h-12 md:w-12 ${isActive ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}>
                  <AvatarImage src={supplier.profileImageUrl || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-sm md:text-base font-semibold">
                    {supplier.name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className={`text-[10px] md:text-xs font-medium leading-tight text-center line-clamp-1 w-full ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}>
                  {supplier.name}
                </span>
                <span className={`text-xs md:text-sm font-bold leading-none ${
                  isActive ? "text-primary" : "text-foreground"
                }`}>
                  {supplier.productCount}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2 md:pb-3 p-3 md:p-6">
          <div className="flex flex-col sm:flex-row gap-2 md:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
              <Input
                placeholder={t("common", "searchProducts")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 md:pl-9 h-9 md:h-10 text-sm"
                data-testid="input-search-products"
              />
            </div>
            <div className="flex flex-row gap-2 flex-wrap">
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full sm:w-[150px] md:w-[180px] h-9 md:h-10 text-xs md:text-sm" data-testid="select-category">
                  <Filter className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2 shrink-0" />
                  <SelectValue placeholder={t("common", "category")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common", "allCategories")}</SelectItem>
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
                {t("common", "onlyAvailable")}
              </Button>
              <Button
                variant={onlyPromotions ? "default" : "outline"}
                onClick={() => setOnlyPromotions(!onlyPromotions)}
                className="text-xs md:text-sm toggle-elevate"
                data-testid="toggle-promotions-only"
              >
                <Tag className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5" />
                {t("common", "promotions")}
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
            <div className="grid gap-3 md:gap-3 grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {filteredProducts.map((product) => {
                const promo = product.activePromotion;
                const hasPromo = !!promo;
                const originalPrice = parseFloat(product.price);
                const discountedPrice = hasPromo ? originalPrice * (1 - promo.discountPercent / 100) : originalPrice;

                return (
                  <Card
                    key={product.id}
                    className={`cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-px hover:scale-[1.003] ${hasPromo ? "ring-1 ring-green-400/50 dark:ring-green-500/30" : ""}`}
                    data-testid={`product-card-${product.id}`}
                    onClick={() => setDetailProduct(product)}
                  >
                    <CardContent className="p-2.5 md:p-3 flex flex-col overflow-hidden">
                      <div className="relative">
                        {product.imageUrl ? (
                          <div className="w-full aspect-square md:aspect-[4/3] rounded-lg overflow-hidden bg-muted">
                            <img 
                              src={product.imageUrl} 
                              alt={product.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-full aspect-square md:aspect-[4/3] rounded-lg bg-muted flex items-center justify-center">
                            <Package className="h-8 w-8 text-muted-foreground/30" />
                          </div>
                        )}
                        {hasPromo && (
                          <div className="absolute top-1.5 left-1.5 flex items-center justify-center rounded-full bg-green-600 text-white text-[10px] font-bold px-1.5 py-0.5 shadow-sm" data-testid={`badge-discount-${product.id}`}>
                            -{promo.discountPercent}%
                          </div>
                        )}
                        {hasPromo && (
                          <Badge variant="outline" className="absolute top-1.5 right-1.5 bg-green-50/90 text-green-700 border-green-200 dark:bg-green-900/80 dark:text-green-400 dark:border-green-800 text-[10px] px-1 py-0" data-testid={`badge-promo-${product.id}`}>
                            {t("common", "action")}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1.5 min-w-0 flex-1 flex flex-col">
                        {product.inStock ? (
                          <span className="text-[11px] font-medium text-green-700 dark:text-green-400" data-testid={`text-stock-${product.id}`}>
                            {t("common", "available")}
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-red-600 dark:text-red-400" data-testid={`text-stock-${product.id}`}>
                            {t("common", "unavailable")}
                          </span>
                        )}
                        <h3 className="font-medium text-sm truncate">{product.name}</h3>
                        <p className="text-xs text-muted-foreground truncate">
                          {product.supplier?.companyName || product.supplier?.name}
                        </p>
                        <div className="flex items-baseline gap-1 mt-1 flex-wrap">
                          {hasPromo ? (
                            <>
                              <span className="text-[11px] text-muted-foreground line-through" data-testid={`text-original-price-${product.id}`}>{originalPrice.toFixed(2)}€</span>
                              <span className="font-bold text-base text-green-600 dark:text-green-400" data-testid={`text-discounted-price-${product.id}`}>{discountedPrice.toFixed(2)}€</span>
                            </>
                          ) : (
                            <span className="font-bold text-base">{originalPrice.toFixed(2)}€</span>
                          )}
                          <span className="text-xs text-muted-foreground">/{product.unit}</span>
                        </div>
                        {hasPromo && promo.endDate && (() => {
                          const now = new Date();
                          const end = new Date(promo.endDate);
                          const daysLeft = differenceInDays(end, now);
                          const hoursLeft = differenceInHours(end, now);
                          let remainingText = "";
                          if (daysLeft <= 0 && hoursLeft > 0) {
                            remainingText = t("common", "endsToday");
                          } else if (daysLeft === 1) {
                            remainingText = t("common", "oneDay");
                          } else if (daysLeft > 1) {
                            remainingText = `${t("common", "still")} ${daysLeft} ${t("common", "daysLeft")}`;
                          } else {
                            remainingText = t("common", "endsSoon");
                          }
                          return (
                            <div className="flex items-center gap-1 mt-0.5" data-testid={`text-promo-remaining-${product.id}`}>
                              <Clock className="h-3 w-3 text-green-600 dark:text-green-400 shrink-0" />
                              <span className="text-[10px] text-green-600 dark:text-green-400 font-medium truncate">
                                {remainingText} — {format(end, "dd.MM.yyyy", { locale: dateLocale })}
                              </span>
                            </div>
                          );
                        })()}
                        {product.minOrderQuantity && product.minOrderQuantity > 1 && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate" data-testid={`text-moq-${product.id}`}>
                            {t("supplierProducts", "belowMinOrder").replace("{min}", String(product.minOrderQuantity)).replace("{unit}", product.unit)}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 mt-auto pt-2">
                          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                            <QuantityInput
                              value={quantities[product.id] || getMinOrderQty(product)}
                              onChange={(val) => {
                                setQuantities(prev => ({ ...prev, [product.id]: val }));
                              }}
                              min={getMinOrderQty(product)}
                              disabled={!product.inStock}
                              size="md"
                              testIdPrefix={`qty-${product.id}`}
                            />
                          </div>
                          <Button
                            variant={addedProductIds.has(product.id) ? "default" : "outline"}
                            size="sm"
                            className={`gap-1.5 text-xs min-w-0 px-2.5 ${
                              addedProductIds.has(product.id) 
                                ? "bg-green-500 border-green-500 text-white hover:bg-green-500 no-default-hover-elevate no-default-active-elevate animate-cart-added" 
                                : "transition-all duration-200"
                            }`}
                            disabled={!product.inStock || addToCartMutation.isPending}
                            onClick={(e) => { e.stopPropagation(); handleAddToCart(product); }}
                            data-testid={`button-add-to-cart-${product.id}`}
                          >
                            {addedProductIds.has(product.id) ? (
                              <Check className="h-3.5 w-3.5 shrink-0 animate-cart-check" />
                            ) : (
                              <>
                                <ShoppingCart className="h-3.5 w-3.5 shrink-0" />
                                <span className="hidden lg:inline truncate">{t("common", "add")}</span>
                              </>
                            )}
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
              <p className="text-muted-foreground">{t("common", "noProductsFound")}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {t("common", "tryDifferentSearch")}
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
