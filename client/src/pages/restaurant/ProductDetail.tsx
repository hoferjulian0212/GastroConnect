import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { useUser } from "@/context/UserContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Package, ShoppingCart, Check, Clock, Tag, Euro, Layers, Info, Percent, Store } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import QuantityInput from "@/components/QuantityInput";
import { differenceInDays, differenceInHours, format } from "date-fns";
import { de, it } from "date-fns/locale";
import type { ProductWithSupplierAndPromotion, CartItemWithProduct } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";

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

  const handleAddToCart = (p: ProductWithSupplierAndPromotion, qty?: number) => {
    addToCartMutation.mutate({
      productId: p.id,
      supplierId: p.supplierId,
      quantity: qty || quantity,
    });
  };

  const similarProducts = product && products
    ? products
        .filter(p => p.id !== product.id && p.category === product.category && p.inStock)
        .slice(0, 6)
    : [];

  const alsoFromSupplier = product && products
    ? products
        .filter(p => p.id !== product.id && p.supplierId === product.supplierId && p.category !== product.category && p.inStock)
        .slice(0, 6)
    : [];

  const [addedRelated, setAddedRelated] = useState<Set<string>>(new Set());
  const [relatedQuantities, setRelatedQuantities] = useState<Record<string, number>>({});

  const handleAddRelated = (p: ProductWithSupplierAndPromotion) => {
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
            {p.imageUrl ? (
              <div className="w-full aspect-square md:aspect-[4/3] rounded-lg overflow-hidden bg-muted">
                <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-full aspect-square md:aspect-[4/3] rounded-lg bg-muted flex items-center justify-center">
                <Package className="h-8 w-8 text-muted-foreground/30" />
              </div>
            )}
            {hasPromo && (
              <div className="absolute top-1.5 left-1.5 rounded-full bg-green-600 text-white text-[10px] font-bold px-1.5 py-0.5 shadow-sm">
                -{promo.discountPercent}%
              </div>
            )}
          </div>
          <div className="mt-1.5 min-w-0 flex-1 flex flex-col">
            <h3 className="font-medium text-sm truncate">{p.name}</h3>
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
                onClick={(e) => { e.stopPropagation(); handleAddRelated(p); }}
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
          {lang === "de" ? "Zurueck zum Katalog" : "Torna al catalogo"}
        </Button>
      </div>
    );
  }

  const promo = product.activePromotion;
  const hasPromo = !!promo;
  const originalPrice = parseFloat(product.price);
  const discountedPrice = hasPromo ? originalPrice * (1 - promo.discountPercent / 100) : originalPrice;

  return (
    <div className="space-y-6">
      <button
        onClick={() => window.history.back()}
        className="sticky top-0 z-20 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
        data-testid="button-back"
      >
        <ArrowLeft className="h-4 w-4" />
        {lang === "de" ? "Zurueck" : "Indietro"}
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
        <div>
          {product.imageUrl ? (
            <div className="w-full aspect-square rounded-xl overflow-hidden bg-muted">
              <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-full aspect-square rounded-xl bg-muted flex items-center justify-center">
              <Package className="h-20 w-20 text-muted-foreground/20" />
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-product-name">{product.name}</h1>
            <div className="flex items-center gap-2 mt-2">
              <Avatar className="h-5 w-5">
                <AvatarImage src={product.supplier?.profileImageUrl || undefined} />
                <AvatarFallback className="text-[8px] bg-primary/10 text-primary font-semibold">
                  {(product.supplier?.companyName || product.supplier?.name || "").substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-muted-foreground">{product.supplier?.companyName || product.supplier?.name}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {product.inStock ? (
              <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                {lang === "de" ? "Verfuegbar" : "Disponibile"}
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                {lang === "de" ? "Nicht verfuegbar" : "Non disponibile"}
              </Badge>
            )}
            {product.category && <Badge variant="secondary">{product.category}</Badge>}
          </div>

          {hasPromo && promo.endDate && (() => {
            const now = new Date();
            const end = new Date(promo.endDate);
            const daysLeft = differenceInDays(end, now);
            const hoursLeft = differenceInHours(end, now);
            let remainingText = "";
            if (daysLeft <= 0 && hoursLeft > 0) remainingText = t("common", "endsToday");
            else if (daysLeft === 1) remainingText = t("common", "oneDay");
            else if (daysLeft > 1) remainingText = `${t("common", "still")} ${daysLeft} ${t("common", "daysLeft")}`;
            else remainingText = t("common", "endsSoon");
            return (
              <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40">
                <div className="flex items-center gap-2 mb-1">
                  <Percent className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                    {lang === "de" ? `Aktion: -${promo.discountPercent}% Rabatt` : `Promozione: -${promo.discountPercent}% sconto`}
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-muted-foreground line-through text-sm">{originalPrice.toFixed(2)}€</span>
                  <span className="text-xl font-bold text-green-600 dark:text-green-400">{discountedPrice.toFixed(2)}€/{product.unit}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span className="font-medium">{remainingText} — {format(end, "dd.MM.yyyy", { locale: dateLocale })}</span>
                </div>
              </div>
            );
          })()}

          {!hasPromo && (
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold">{originalPrice.toFixed(2)}€</span>
              <span className="text-base text-muted-foreground">/{product.unit}</span>
            </div>
          )}

          <Separator />

          <div className="flex items-center gap-3">
            <QuantityInput
              value={quantity}
              onChange={setQuantity}
              min={getMinOrderQty(product)}
              disabled={!product.inStock}
              size="md"
              testIdPrefix="detail-qty"
            />
            <Button
              className={`flex-1 gap-2 ${
                added
                  ? "bg-green-500 border-green-500 text-white hover:bg-green-500 no-default-hover-elevate no-default-active-elevate"
                  : ""
              }`}
              disabled={!product.inStock || addToCartMutation.isPending}
              onClick={() => handleAddToCart(product)}
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
            <p className="text-xs text-muted-foreground">
              {t("supplierProducts", "belowMinOrder").replace("{min}", String(product.minOrderQuantity)).replace("{unit}", product.unit)}
            </p>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto space-y-6">
        {product.description && (
          <div>
            <h3 className="text-base font-semibold mb-2 flex items-center gap-2">
              <Info className="h-4 w-4" />
              {lang === "de" ? "Beschreibung" : "Descrizione"}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-product-description">
              {product.description}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Euro className="h-3.5 w-3.5" />
              {hasPromo ? (lang === "de" ? "Originalpreis" : "Prezzo originale") : (lang === "de" ? "Preis" : "Prezzo")}
            </div>
            <p className="font-semibold text-lg">{product.price}€/{product.unit}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Layers className="h-3.5 w-3.5" />
              {lang === "de" ? "Einheit" : "Unita"}
            </div>
            <p className="font-semibold text-lg">{product.unit}</p>
          </div>
          {product.category && (
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Tag className="h-3.5 w-3.5" />
                {lang === "de" ? "Kategorie" : "Categoria"}
              </div>
              <p className="font-medium">{product.category}</p>
            </div>
          )}
        </div>

        {similarProducts.length > 0 && (
          <>
            <Separator />
            <div>
              <h3 className="text-lg font-semibold mb-3">
                {lang === "de" ? "Aehnliche Produkte" : "Prodotti simili"}
              </h3>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4">
                {similarProducts.map(renderRelatedCard)}
              </div>
            </div>
          </>
        )}

        {alsoFromSupplier.length > 0 && (
          <>
            <Separator />
            <div>
              <h3 className="text-lg font-semibold mb-3">
                {lang === "de"
                  ? `Mehr von ${product.supplier?.companyName || product.supplier?.name}`
                  : `Altro da ${product.supplier?.companyName || product.supplier?.name}`}
              </h3>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4">
                {alsoFromSupplier.map(renderRelatedCard)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
