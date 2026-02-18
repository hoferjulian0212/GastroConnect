import { useState, useEffect, useCallback } from "react";
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
import { Search, Package, ShoppingCart, Plus, Minus, Store, Filter, Eye, Tag, Percent, Clock, Check } from "lucide-react";
import { differenceInDays, differenceInHours, format } from "date-fns";
import { de, it } from "date-fns/locale";
import type { User, ProductWithSupplierAndPromotion } from "@shared/schema";
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
  const [detailProduct, setDetailProduct] = useState<ProductWithSupplierAndPromotion | null>(null);
  const [addedProductIds, setAddedProductIds] = useState<Set<string>>(new Set());
  const [addedTimers, setAddedTimers] = useState<Record<string, ReturnType<typeof setTimeout>>>({});
  const { lang } = useLanguage();
  const t = useT(lang);

  useEffect(() => {
    return () => {
      Object.values(addedTimers).forEach(clearTimeout);
    };
  }, [addedTimers]);

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
    queryKey: [`/api/products?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
      setAddedProductIds(prev => new Set(prev).add(variables.productId));
      const timer = setTimeout(() => {
        setAddedProductIds(prev => {
          const next = new Set(prev);
          next.delete(variables.productId);
          return next;
        });
        setAddedTimers(prev => {
          const next = { ...prev };
          delete next[variables.productId];
          return next;
        });
      }, 1500);
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

  const getMinOrderQty = (product: ProductWithSupplierAndPromotion) => {
    return product.minOrderQuantity && product.minOrderQuantity > 1 ? product.minOrderQuantity : 1;
  };

  const updateQuantity = (productId: string, delta: number, minQty: number = 1) => {
    setQuantities(prev => ({
      ...prev,
      [productId]: Math.max(minQty, (prev[productId] || minQty) + delta),
    }));
  };

  const handleAddToCart = (product: ProductWithSupplierAndPromotion) => {
    const minQty = getMinOrderQty(product);
    const quantity = quantities[product.id] || minQty;
    addToCartMutation.mutate({
      productId: product.id,
      supplierId: product.supplierId,
      quantity,
    });
  };

  const dateLocale = lang === "it" ? it : de;

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">{t("common", "productCatalog")}</h1>
        <p className="text-xs md:text-sm text-muted-foreground">{t("common", "browseAllSuppliers")}</p>
      </div>

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
              <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                <SelectTrigger className="w-full sm:w-[150px] md:w-[180px] h-9 md:h-10 text-xs md:text-sm" data-testid="select-supplier">
                  <Store className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2 shrink-0" />
                  <SelectValue placeholder={t("common", "supplier")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common", "allSuppliers")}</SelectItem>
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
                                {t("common", "action")}
                              </Badge>
                            )}
                            {product.inStock ? (
                              <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-[10px] md:text-xs px-1 md:px-1.5 py-0">
                                {t("common", "available")}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-[10px] md:text-xs px-1 md:px-1.5 py-0">
                                {t("common", "unavailable")}
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
                            remainingText = t("common", "endsToday");
                          } else if (daysLeft === 1) {
                            remainingText = t("common", "oneDay");
                          } else if (daysLeft > 1) {
                            remainingText = `${t("common", "still")} ${daysLeft} ${t("common", "daysLeft")}`;
                          } else {
                            remainingText = t("common", "endsSoon");
                          }
                          return (
                            <div className="flex items-center gap-1 mt-1" data-testid={`text-promo-remaining-${product.id}`}>
                              <Clock className="h-3 w-3 text-green-600 dark:text-green-400 shrink-0" />
                              <span className="text-[10px] md:text-xs text-green-600 dark:text-green-400 font-medium">
                                {remainingText} — {t("common", "until")} {format(end, "dd.MM.yyyy", { locale: dateLocale })}
                              </span>
                            </div>
                          );
                        })()}
                        {product.minOrderQuantity && product.minOrderQuantity > 1 && (
                          <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5" data-testid={`text-moq-${product.id}`}>
                            {t("supplierProducts", "belowMinOrder").replace("{min}", String(product.minOrderQuantity)).replace("{unit}", product.unit)}
                          </p>
                        )}
                        <div className="flex items-center gap-1 md:gap-2 mt-2 justify-end flex-wrap">
                          <div className="flex items-center border border-border rounded-md" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => updateQuantity(product.id, -1, getMinOrderQty(product))}
                              disabled={!product.inStock || (quantities[product.id] || getMinOrderQty(product)) <= getMinOrderQty(product)}
                              data-testid={`button-decrease-${product.id}`}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-6 text-center text-sm" data-testid={`quantity-${product.id}`}>
                              {quantities[product.id] || getMinOrderQty(product)}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => updateQuantity(product.id, 1, getMinOrderQty(product))}
                              disabled={!product.inStock}
                              data-testid={`button-increase-${product.id}`}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                          <Button
                            variant={addedProductIds.has(product.id) ? "default" : "outline"}
                            size="sm"
                            className={`gap-1 text-xs md:text-sm transition-all duration-300 ${
                              addedProductIds.has(product.id) 
                                ? "bg-green-600 border-green-600 text-white no-default-hover-elevate no-default-active-elevate" 
                                : ""
                            }`}
                            disabled={!product.inStock || addToCartMutation.isPending}
                            onClick={(e) => { e.stopPropagation(); handleAddToCart(product); }}
                            data-testid={`button-add-to-cart-${product.id}`}
                          >
                            {addedProductIds.has(product.id) ? (
                              <>
                                <Check className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">{t("common", "addedToCart")}</span>
                              </>
                            ) : (
                              <>
                                <ShoppingCart className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">{t("common", "add")}</span>
                                <span className="sm:hidden">+</span>
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
