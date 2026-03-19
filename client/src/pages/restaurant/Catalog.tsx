import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Package, ShoppingCart, Store, Filter, Tag, Clock, Check, ArrowLeft, Carrot, Apple, Beef, Fish, Milk, Wine, Wheat, Flame, MoreHorizontal, Sandwich } from "lucide-react";
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
import heroBannerImg from "@assets/6fefa2793fd6b494e2f8aabea0385afc_1773947302051.jpg";

const categoryConfig: Record<string, { de: string; it: string; icon: typeof Package; color: string }> = {
  "Gemuese": { de: "Gemuese", it: "Verdura", icon: Carrot, color: "bg-green-600" },
  "Obst": { de: "Obst", it: "Frutta", icon: Apple, color: "bg-red-500" },
  "Fleisch": { de: "Fleisch", it: "Carne", icon: Beef, color: "bg-rose-700" },
  "Fisch": { de: "Fisch", it: "Pesce", icon: Fish, color: "bg-cyan-600" },
  "Milchprodukte": { de: "Milchprodukte", it: "Latticini", icon: Milk, color: "bg-blue-400" },
  "Getraenke": { de: "Getraenke", it: "Bevande", icon: Wine, color: "bg-purple-600" },
  "Trockenwaren": { de: "Trockenwaren", it: "Prodotti secchi", icon: Wheat, color: "bg-amber-600" },
  "Gewuerze": { de: "Gewuerze", it: "Spezie", icon: Flame, color: "bg-orange-500" },
  "Brot": { de: "Brot", it: "Pane", icon: Sandwich, color: "bg-yellow-700" },
  "Sonstiges": { de: "Sonstiges", it: "Altro", icon: MoreHorizontal, color: "bg-gray-500" },
};

const allCategories = Object.keys(categoryConfig);

export default function RestaurantCatalog() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const [location] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
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

  const knownCategories = allCategories.filter(c => c !== "Sonstiges");
  const productsByCategory = (cat: string) => {
    if (!products) return [];
    const supplierFiltered = selectedSupplier === "all"
      ? products
      : products.filter(p => p.supplierId === selectedSupplier);
    if (cat === "Sonstiges") {
      return supplierFiltered.filter(p => !p.category || p.category === "Sonstiges" || !knownCategories.includes(p.category));
    }
    return supplierFiltered.filter(p => p.category === cat);
  };

  const categoryProductCount = (cat: string) => productsByCategory(cat).length;

  const categoriesWithProducts = allCategories.filter(cat => categoryProductCount(cat) > 0);

  const categoryFilteredProducts = selectedCategory
    ? productsByCategory(selectedCategory).filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.description?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesAvailability = !onlyAvailable || p.inStock;
        const matchesPromotion = !onlyPromotions || !!p.activePromotion;
        return matchesSearch && matchesAvailability && matchesPromotion;
      })
    : [];

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

  const renderProductCard = (product: ProductWithSupplierAndPromotion) => {
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
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {!selectedCategory ? (
        <>
          <div className="relative w-full h-44 md:h-56 overflow-hidden -mt-2" style={{ maskImage: "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)", WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)" }}>
            <img
              src={heroBannerImg}
              alt=""
              className="w-full h-full object-cover object-center"
            />
          </div>

          <div>
            <h2 className="text-xl md:text-2xl font-bold">
              {lang === "de" ? "Produktkatalog" : "Catalogo prodotti"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {lang === "de"
                ? "Frische Vielfalt - waehlen Sie eine Kategorie um die Produkte zu sehen."
                : "Varieta fresca - seleziona una categoria per vedere i prodotti."}
            </p>
          </div>

          {supplierCards.length > 1 && (
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

          {productsLoading ? (
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <Skeleton key={i} className="h-36 rounded-xl" />
              ))}
            </div>
          ) : categoriesWithProducts.length > 0 ? (
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {categoriesWithProducts.map(cat => {
                const conf = categoryConfig[cat];
                const CatIcon = conf.icon;
                const count = categoryProductCount(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => { setSelectedCategory(cat); setSearchQuery(""); }}
                    className="flex flex-col items-center gap-3 p-5 md:p-6 rounded-xl border border-border bg-background hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group"
                    data-testid={`category-button-${cat}`}
                  >
                    <div className={`flex items-center justify-center h-16 w-16 md:h-20 md:w-20 rounded-full ${conf.color} text-white shadow-lg group-hover:scale-105 transition-transform`}>
                      <CatIcon className="h-8 w-8 md:h-10 md:w-10" />
                    </div>
                    <span className="text-sm md:text-base font-semibold text-center leading-tight">
                      {lang === "it" ? conf.it : conf.de}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {count} {count === 1 ? (lang === "de" ? "Produkt" : "prodotto") : (lang === "de" ? "Produkte" : "prodotti")}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <Package className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">{t("common", "noProductsFound")}</p>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setSelectedCategory(null); setSearchQuery(""); }}
              className="flex items-center justify-center h-8 w-8 rounded-lg border border-border bg-background hover:bg-muted transition-colors shrink-0"
              data-testid="button-back-to-categories"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {(() => {
                const conf = categoryConfig[selectedCategory];
                const CatIcon = conf?.icon || Package;
                return (
                  <>
                    <div className={`flex items-center justify-center h-8 w-8 rounded-full ${conf?.color || "bg-gray-500"} text-white shrink-0`}>
                      <CatIcon className="h-4 w-4" />
                    </div>
                    <h2 className="text-lg md:text-xl font-bold truncate">
                      {lang === "it" ? conf?.it : conf?.de}
                    </h2>
                  </>
                );
              })()}
            </div>
          </div>

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

          {supplierCards.length > 1 && (
            <div className="flex gap-2 md:gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
              <button
                onClick={() => { setSelectedSupplier("all"); }}
                className={`flex flex-col items-center gap-1 p-2 rounded-md border-2 transition-all shrink-0 min-w-[64px] ${
                  selectedSupplier === "all"
                    ? "border-primary bg-primary/10"
                    : "border-transparent bg-muted/50"
                }`}
                data-testid="filter-supplier-all-inner"
              >
                <div className={`flex items-center justify-center h-8 w-8 rounded-full ${
                  selectedSupplier === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  <Store className="h-4 w-4" />
                </div>
                <span className={`text-[10px] font-medium ${selectedSupplier === "all" ? "text-primary" : "text-muted-foreground"}`}>
                  {t("common", "all")}
                </span>
              </button>
              {supplierCards.map(supplier => {
                const isActive = selectedSupplier === supplier.id;
                return (
                  <button
                    key={supplier.id}
                    onClick={() => setSelectedSupplier(supplier.id)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-md border-2 transition-all shrink-0 min-w-[64px] ${
                      isActive ? "border-primary bg-primary/10" : "border-transparent bg-muted/50"
                    }`}
                    data-testid={`filter-supplier-inner-${supplier.id}`}
                  >
                    <Avatar className={`h-8 w-8 ${isActive ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""}`}>
                      <AvatarImage src={supplier.profileImageUrl || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                        {supplier.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className={`text-[10px] font-medium leading-tight text-center line-clamp-1 w-full ${
                      isActive ? "text-primary" : "text-muted-foreground"
                    }`}>
                      {supplier.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {categoryFilteredProducts.length > 0 ? (
            <div className="grid gap-3 md:gap-3 grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {categoryFilteredProducts.map(renderProductCard)}
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
        </>
      )}

      <ProductDetailDialog
        product={detailProduct}
        open={!!detailProduct}
        onOpenChange={(open) => !open && setDetailProduct(null)}
        supplierName={detailProduct?.supplier?.companyName || detailProduct?.supplier?.name}
      />
    </div>
  );
}
