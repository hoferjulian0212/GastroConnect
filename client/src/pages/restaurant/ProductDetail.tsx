import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { useUser } from "@/context/UserContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Package, ShoppingCart, Check, Clock, Tag, Euro, Layers, Info, Percent, Store } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import QuantityInput from "@/components/QuantityInput";
import { differenceInDays, differenceInHours, format } from "date-fns";
import { de, it } from "date-fns/locale";
import type { ProductWithSupplierAndPromotion, CartItemWithProduct } from "@shared/schema";
import { productMatchKey, normalizeName } from "@shared/productMatch";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { useFlyToCart } from "@/hooks/use-fly-to-cart";
import { ProductImage } from "@/components/ProductImage";
import { HeroPortal } from "@/context/HeroContext";

export default function ProductDetail() {
  const [, params] = useRoute("/restaurant/product/:id");
  const productId = params?.id;
  const [, setLocation] = useLocation();
  const { currentUser } = useUser();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const t = useT(lang);
  const dateLocale = lang === "it" ? it : de;
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const { triggerFly } = useFlyToCart();

  const { data: products, isLoading } = useQuery<ProductWithSupplierAndPromotion[]>({
    queryKey: [`/api/products?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: cartItems } = useQuery<CartItemWithProduct[]>({
    queryKey: [`/api/cart?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const product = products?.find(p => p.id === productId);

  const getMinOrderQty = (p: ProductWithSupplierAndPromotion) =>
    p.minOrderQuantity && p.minOrderQuantity > 1 ? p.minOrderQuantity : 1;

  useEffect(() => {
    if (product) {
      const cartItem = cartItems?.find(ci => ci.productId === product.id);
      setQuantity(cartItem?.quantity || getMinOrderQty(product));
    }
  }, [product, cartItems]);

  const addToCartMutation = useMutation({
    mutationFn: async ({ productId, supplierId, quantity }: { productId: string; supplierId: string; quantity: number }) => {
      return apiRequest("POST", "/api/cart", {
        restaurantId: currentUser?.id,
        productId,
        supplierId,
        quantity,
        mode: "set",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    },
    onError: () => {
      toast({ title: t("common", "error"), description: t("common", "productAddError"), variant: "destructive" });
    },
  });

  const handleAddToCart = (p: ProductWithSupplierAndPromotion, qty?: number, sourceEvent?: React.MouseEvent) => {
    const btn = sourceEvent?.currentTarget as HTMLElement | undefined;
    if (btn) {
      triggerFly(btn, p.imageUrl);
    }
    addToCartMutation.mutate({
      productId: p.id,
      supplierId: p.supplierId,
      quantity: qty || quantity,
    });
  };

  const outOfStockAlternatives = product && products && !product.inStock
    ? (() => {
        // When a product is out of stock, the strongest substitute is the SAME
        // product offered by a different supplier (matched by barcode, else by
        // a normalized name+unit key). After exact matches we fall back to the
        // same category / similar name, breaking ties by price closeness.
        const targetKey = productMatchKey({ name: product.name, unit: product.unit, gtin: product.gtin });
        const nameWords = normalizeName(product.name).split(/\s+/).filter(w => w.length > 2);
        const targetPrice = parseFloat(product.price);

        const candidates = products
          .filter(p => p.id !== product.id && p.inStock)
          .map(p => {
            const isExactMatch = productMatchKey({ name: p.name, unit: p.unit, gtin: p.gtin }) === targetKey;
            const isSameSupplier = p.supplierId === product.supplierId;
            const isSameCategory = !!(product.category && p.category && p.category === product.category);
            const pNameNorm = normalizeName(p.name);
            const nameMatchCount = nameWords.filter(w => pNameNorm.includes(w)).length;
            const nameMatchRatio = nameWords.length > 0 ? nameMatchCount / nameWords.length : 0;
            const unitMatch = p.unit === product.unit;
            const priceDelta = Number.isFinite(targetPrice) ? Math.abs(parseFloat(p.price) - targetPrice) : 0;

            if (!isExactMatch && !isSameCategory && nameMatchRatio === 0) return null;

            return {
              product: p,
              isExactMatch,
              isSameSupplier,
              isSameCategory,
              nameMatchRatio,
              unitMatch,
              priceDelta,
            };
          })
          .filter((a): a is NonNullable<typeof a> => a !== null)
          .sort((a, b) => {
            if (a.isExactMatch !== b.isExactMatch) return a.isExactMatch ? -1 : 1;
            if (a.isSameCategory !== b.isSameCategory) return a.isSameCategory ? -1 : 1;
            if (a.nameMatchRatio !== b.nameMatchRatio) return b.nameMatchRatio - a.nameMatchRatio;
            if (a.unitMatch !== b.unitMatch) return a.unitMatch ? -1 : 1;
            if (a.isSameSupplier !== b.isSameSupplier) return a.isSameSupplier ? -1 : 1;
            return a.priceDelta - b.priceDelta;
          })
          .slice(0, 6);

        return candidates;
      })()
    : [];


  const alsoFromSupplier = product && products
    ? products
        .filter(p => p.id !== product.id && p.supplierId === product.supplierId && p.category !== product.category && p.inStock)
        .slice(0, 6)
    : [];

  const [addedRelated, setAddedRelated] = useState<Set<string>>(new Set());
  const [relatedQuantities, setRelatedQuantities] = useState<Record<string, number>>({});

  const handleAddRelated = (p: ProductWithSupplierAndPromotion, sourceEvent?: React.MouseEvent) => {
    const btn = sourceEvent?.currentTarget as HTMLElement | undefined;
    if (btn) triggerFly(btn, p.imageUrl);
    const qty = relatedQuantities[p.id] || getMinOrderQty(p);
    addToCartMutation.mutate({ productId: p.id, supplierId: p.supplierId, quantity: qty }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
        queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
        setAddedRelated(prev => new Set(prev).add(p.id));
        setTimeout(() => setAddedRelated(prev => { const n = new Set(prev); n.delete(p.id); return n; }), 2000);
      },
    });
  };

  const renderRelatedCard = (p: ProductWithSupplierAndPromotion) => {
    const promo = p.activePromotion;
    const hasPromo = !!promo;
    const originalPrice = parseFloat(p.price);
    const discountedPrice = hasPromo ? originalPrice * (1 - promo.discountPercent / 100) : originalPrice;
    const isAdded = addedRelated.has(p.id);

    return (
      <Card
        key={p.id}
        className="cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-px hover:scale-[1.003]"
        data-testid={`related-product-card-${p.id}`}
        onClick={() => setLocation(`/restaurant/product/${p.id}`)}
      >
        <CardContent className="p-2.5 md:p-3 flex flex-col overflow-hidden">
          <div className="relative">
            <ProductImage src={p.imageUrl} alt={p.name} className="w-full aspect-square md:aspect-[4/3] rounded-lg" iconClassName="h-8 w-8" fallbackIconColor="text-muted-foreground/30" />
            {hasPromo && (
              <div className="absolute top-1.5 left-1.5 rounded-full bg-green-600 text-white text-[10px] font-bold px-1.5 py-0.5 shadow-sm">
                -{promo.discountPercent}%
              </div>
            )}
          </div>
          <div className="mt-1.5 min-w-0 flex-1 flex flex-col">
            <h3 className="font-medium text-sm truncate">{p.name}</h3>
            {product && p.supplierId !== product.supplierId && (p.supplier?.companyName || p.supplier?.name) && (
              <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground truncate" data-testid={`text-related-supplier-${p.id}`}>
                <Store className="h-3 w-3 shrink-0" />
                <span className="truncate">{p.supplier?.companyName || p.supplier?.name}</span>
              </div>
            )}
            <div className="flex items-baseline gap-1 mt-0.5">
              {hasPromo ? (
                <>
                  <span className="text-[11px] text-muted-foreground line-through">{originalPrice.toFixed(2)}</span>
                  <span className="font-bold text-sm text-green-600 dark:text-green-400">{discountedPrice.toFixed(2)}€</span>
                </>
              ) : (
                <span className="font-bold text-sm">{originalPrice.toFixed(2)}€</span>
              )}
              <span className="text-xs text-muted-foreground">/{p.unit}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-auto pt-2">
              <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                <QuantityInput
                  value={relatedQuantities[p.id] || getMinOrderQty(p)}
                  onChange={(val) => setRelatedQuantities(prev => ({ ...prev, [p.id]: val }))}
                  min={getMinOrderQty(p)}
                  disabled={!p.inStock}
                  size="sm"
                  testIdPrefix={`related-qty-${p.id}`}
                />
              </div>
              <Button
                variant={isAdded ? "default" : "outline"}
                size="sm"
                className={`gap-1 text-xs min-w-0 px-2 ${
                  isAdded
                    ? "bg-green-500 border-green-500 text-white hover:bg-green-500 no-default-hover-elevate no-default-active-elevate animate-cart-added"
                    : "transition-all duration-200"
                }`}
                disabled={!p.inStock || addToCartMutation.isPending}
                onClick={(e) => { e.stopPropagation(); handleAddRelated(p, e); }}
                data-testid={`button-add-related-${p.id}`}
              >
                {isAdded ? <Check className="h-3.5 w-3.5 shrink-0 animate-cart-check" /> : <ShoppingCart className="h-3.5 w-3.5 shrink-0" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Package className="h-12 w-12 text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground">{lang === "de" ? "Produkt nicht gefunden" : "Prodotto non trovato"}</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation("/restaurant/catalog")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {lang === "de" ? "Zurück zum Katalog" : "Torna al catalogo"}
        </Button>
      </div>
    );
  }

  const promo = product.activePromotion;
  const hasPromo = !!promo;
  const originalPrice = parseFloat(product.price);
  const discountedPrice = hasPromo ? originalPrice * (1 - promo.discountPercent / 100) : originalPrice;

  const remainingPromoText = (() => {
    if (!hasPromo || !promo.endDate) return null;
    const now = new Date();
    const end = new Date(promo.endDate);
    const daysLeft = differenceInDays(end, now);
    const hoursLeft = differenceInHours(end, now);
    let remainingText = "";
    if (daysLeft <= 0 && hoursLeft > 0) remainingText = t("common", "endsToday");
    else if (daysLeft === 1) remainingText = t("common", "oneDay");
    else if (daysLeft > 1) remainingText = `${t("common", "still")} ${daysLeft} ${t("common", "daysLeft")}`;
    else remainingText = t("common", "endsSoon");
    return `${remainingText} — ${format(end, "dd.MM.yyyy", { locale: dateLocale })}`;
  })();

  return (
    <div>
      <HeroPortal mobileWrapperClassName="!mx-2">
        <div className="px-3 md:px-6 pt-2 md:pt-1 pb-5 md:pb-6" data-testid="product-detail-hero">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1.5 text-sm font-medium text-white/60 hover:text-white transition-colors mb-3 md:mb-4 -ml-1"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
            {lang === "de" ? "Zurück" : "Indietro"}
          </button>

          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-8">
            <div className="flex items-start gap-3 md:gap-5 min-w-0">
              <div className="shrink-0">
                <ProductImage
                  src={product.imageUrl}
                  alt={product.name}
                  className="w-20 h-20 md:w-28 md:h-28 rounded-2xl ring-1 ring-white/10"
                  iconClassName="h-8 w-8 md:h-10 md:w-10"
                  fallbackIconColor="text-white/20"
                />
              </div>
              <div className="min-w-0 space-y-2.5 pt-0.5">
                <div className="space-y-1">
                  <h1 className="text-xl md:text-3xl font-bold text-white leading-tight" data-testid="text-product-name">{product.name}</h1>
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar className="h-4 w-4 shrink-0">
                      <AvatarImage src={product.supplier?.profileImageUrl || undefined} />
                      <AvatarFallback className="text-[8px] bg-white/10 text-white/70 font-semibold">
                        {(product.supplier?.companyName || product.supplier?.name || "").substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs md:text-sm text-white/60 truncate">{product.supplier?.companyName || product.supplier?.name}</span>
                    {product.articleNumber && (
                      <span className="text-[10px] font-mono tabular-nums text-white/40 shrink-0" data-testid="text-product-article-number">
                        · {product.articleNumber}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {product.inStock ? (
                    <Badge variant="outline" className="bg-green-500/15 text-green-300 border-green-500/30">
                      {lang === "de" ? "Verfügbar" : "Disponibile"}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-red-500/15 text-red-300 border-red-500/30">
                      {lang === "de" ? "Nicht verfügbar" : "Non disponibile"}
                    </Badge>
                  )}
                  {product.category && (
                    <Badge variant="outline" className="bg-white/10 text-white/80 border-white/15">{product.category}</Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="md:shrink-0 md:min-w-[260px] md:max-w-[320px] space-y-3 md:text-right">
              {hasPromo ? (
                <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/25 md:text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <Percent className="h-4 w-4 text-green-400" />
                    <span className="text-sm font-semibold text-green-300">
                      {lang === "de" ? `Aktion: -${promo.discountPercent}% Rabatt` : `Promozione: -${promo.discountPercent}% sconto`}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-white/50 line-through text-sm">{originalPrice.toFixed(2)}€</span>
                    <span className="text-xl font-bold text-green-300">{discountedPrice.toFixed(2)}€/{product.unit}</span>
                  </div>
                  {remainingPromoText && (
                    <div className="flex items-center gap-1.5 text-xs text-green-400/90">
                      <Clock className="h-3 w-3 shrink-0" />
                      <span className="font-medium">{remainingPromoText}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-baseline gap-1.5 md:justify-end">
                  <span className="text-2xl md:text-3xl font-bold text-white">{originalPrice.toFixed(2)}€</span>
                  <span className="text-sm md:text-base text-white/50">/{product.unit}</span>
                </div>
              )}

              <div className="flex items-center gap-3 md:justify-end">
                <div className="rounded-md bg-white/[0.06] ring-1 ring-white/15">
                  <QuantityInput
                    value={quantity}
                    onChange={setQuantity}
                    min={getMinOrderQty(product)}
                    disabled={!product.inStock}
                    size="md"
                    testIdPrefix="detail-qty"
                  />
                </div>
                <Button
                  className={`flex-1 md:flex-none gap-2 ${
                    added
                      ? "bg-green-500 border-green-500 text-white hover:bg-green-500 no-default-hover-elevate no-default-active-elevate"
                      : ""
                  }`}
                  disabled={!product.inStock || addToCartMutation.isPending}
                  onClick={(e) => handleAddToCart(product, undefined, e)}
                  data-testid="button-add-to-cart"
                >
                  {added ? (
                    <>
                      <Check className="h-4 w-4" />
                      {lang === "de" ? "Hinzugefuegt" : "Aggiunto"}
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="h-4 w-4" />
                      {lang === "de" ? "In den Warenkorb" : "Aggiungi al carrello"}
                    </>
                  )}
                </Button>
              </div>

              {product.minOrderQuantity && product.minOrderQuantity > 1 && (
                <p className="text-xs text-white/50 md:text-right">
                  {t("supplierProducts", "belowMinOrder").replace("{min}", String(product.minOrderQuantity)).replace("{unit}", product.unit)}
                </p>
              )}
            </div>
          </div>

          {!product.inStock && outOfStockAlternatives.length > 0 && (
            <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-amber-400" />
                <span className="text-sm font-semibold text-amber-300">
                  {lang === "de"
                    ? `${outOfStockAlternatives.length} verfügbare Alternative${outOfStockAlternatives.length !== 1 ? "n" : ""} gefunden`
                    : `${outOfStockAlternatives.length} alternativ${outOfStockAlternatives.length !== 1 ? "e" : "a"} disponibil${outOfStockAlternatives.length !== 1 ? "i" : "e"}`}
                </span>
              </div>
              <p className="text-xs text-amber-300/70 mt-1">
                {lang === "de" ? "Siehe unten für Details" : "Vedi sotto per i dettagli"}
              </p>
            </div>
          )}
        </div>
      </HeroPortal>

      <div className="space-y-4 md:space-y-6 px-3 md:px-6 pt-3 md:pt-4 pb-[var(--mobile-bottom-pad)] md:pb-6">
        <div className="max-w-3xl mx-auto space-y-4 md:space-y-6">
        {product.description && (
          <div>
            <h3 className="text-sm md:text-base font-semibold mb-1.5 flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              {lang === "de" ? "Beschreibung" : "Descrizione"}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-product-description">
              {product.description}
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 md:gap-3">
          <div className="p-2.5 md:p-3 rounded-xl bg-muted/40">
            <div className="flex items-center gap-1 text-[10px] md:text-xs text-muted-foreground mb-0.5">
              <Euro className="h-3 w-3 md:h-3.5 md:w-3.5 shrink-0" />
              <span className="truncate">{hasPromo ? (lang === "de" ? "Original" : "Originale") : (lang === "de" ? "Preis" : "Prezzo")}</span>
            </div>
            <p className="font-semibold text-sm md:text-lg truncate">{product.price}€/{product.unit}</p>
          </div>
          <div className="p-2.5 md:p-3 rounded-xl bg-muted/40">
            <div className="flex items-center gap-1 text-[10px] md:text-xs text-muted-foreground mb-0.5">
              <Layers className="h-3 w-3 md:h-3.5 md:w-3.5 shrink-0" />
              <span className="truncate">{lang === "de" ? "Einheit" : "Unita"}</span>
            </div>
            <p className="font-semibold text-sm md:text-lg">{product.unit}</p>
          </div>
          {product.category && (
            <div className="p-2.5 md:p-3 rounded-xl bg-muted/40">
              <div className="flex items-center gap-1 text-[10px] md:text-xs text-muted-foreground mb-0.5">
                <Tag className="h-3 w-3 md:h-3.5 md:w-3.5 shrink-0" />
                <span className="truncate">{lang === "de" ? "Kategorie" : "Categoria"}</span>
              </div>
              <p className="font-medium text-sm md:text-base truncate">{product.category}</p>
            </div>
          )}
        </div>

        {!product.inStock && outOfStockAlternatives.length > 0 && (
          <div>
            <h3 className="text-base md:text-lg font-semibold mb-2.5 flex items-center gap-2">
              <Package className="h-5 w-5 text-amber-500" />
              {lang === "de" ? "Verfügbare Alternativen" : "Alternative disponibili"}
            </h3>
            <div className="grid gap-2.5 md:gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4">
              {outOfStockAlternatives.map(alt => renderRelatedCard(alt.product))}
            </div>
          </div>
        )}


        {alsoFromSupplier.length > 0 && (
          <div>
            <h3 className="text-base md:text-lg font-semibold mb-2.5">
              {lang === "de"
                ? `Mehr von ${product.supplier?.companyName || product.supplier?.name}`
                : `Altro da ${product.supplier?.companyName || product.supplier?.name}`}
            </h3>
            <div className="grid gap-2.5 md:gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4">
              {alsoFromSupplier.map(renderRelatedCard)}
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
